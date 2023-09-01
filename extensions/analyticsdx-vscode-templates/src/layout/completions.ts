/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { matchJsonNodeAtPattern } from '@salesforce/analyticsdx-template-lint';
import { JSONPath, Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { codeCompletionUsedTelemetryCommand } from '../telemetry';
import { TemplateDirEditing } from '../templateEditing';
import { JsonCompletionItemProviderDelegate, newCompletionItem } from '../util/completions';
import { isValidVariableName } from '../util/templateUtils';
import { isValidRelpath } from '../util/utils';
import { VariableRefCompletionItemProviderDelegate } from '../variables';
import { matchesLayoutItem } from './utils';

/** Get variable names for the variable name in the pages in ui.json. */
export class LayoutVariableCompletionItemProviderDelegate extends VariableRefCompletionItemProviderDelegate {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public override isSupportedDocument(document: vscode.TextDocument): boolean {
    return (
      // make sure that the template has a variableDefinition
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      // and that it's in the layoutDefinition file for the template
      this.templateEditing.isLayoutDefinitionFile(document.uri)
    );
  }

  public override isSupportedLocation(location: Location, context: vscode.CompletionContext): boolean {
    // make sure that it's in a variable name value
    return !location.isAtPropertyKey && matchesLayoutItem(location, 'name');
  }
}

/** Get the enumValues for the tiles keys in a Variable layout item. */
export class LayoutVariableTileCompletionItemProviderDelegate implements JsonCompletionItemProviderDelegate {
  constructor(private readonly templateEditing: TemplateDirEditing) {}

  public isSupportedDocument(document: vscode.TextDocument, context: vscode.CompletionContext) {
    return (
      // make sure that the template has a variableDefinition
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      // and that it's in the layoutDefinition file for the template
      this.templateEditing.isLayoutDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location, context: vscode.CompletionContext) {
    return (
      // make sure it's directly in the keys of the "tiles" field
      location.isAtPropertyKey &&
      matchesLayoutItem(location, 'tiles') &&
      // when it's directly in the keys of 'tiles', then the path will be like [..., 'tiles', ''] or
      // [..., 'tiles', 'enumValue'], so only trigger then (to avoid triggering when down the tree in the
      // tile def objects). also, check the path length to avoid triggering when a tile enumValue is
      // literally "tiles"
      ((location.path.length === 8 && location.path[6] === 'tiles') ||
        (location.path.length === 10 && location.path[8] === 'tiles'))
    );
  }

  public async getItems(range: vscode.Range | undefined, location: Location, document: vscode.TextDocument) {
    // get the variable name for this layout item
    const variableName = this.getVariableName(document, location.path);
    if (variableName && isValidVariableName(variableName)) {
      // find the enums for that variable in the variable.json
      const varUri = vscode.Uri.joinPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
      const doc = await vscode.workspace.openTextDocument(varUri);
      const tree = parseTree(doc.getText());
      const items: vscode.CompletionItem[] = [];
      if (tree?.type === 'object') {
        const enumsNode = matchJsonNodeAtPattern(tree, [variableName, 'variableType', 'enums']);
        if (enumsNode?.type === 'array' && Array.isArray(enumsNode.children)) {
          // convert any number or string enum values to completion items
          return enumsNode.children
            .map(enumNode => {
              if (enumNode.type === 'string' || enumNode.type === 'number') {
                const item = newCompletionItem(String(enumNode.value), range, vscode.CompletionItemKind.EnumMember);
                // send telemetry when someone accepts the completion item
                item.command = codeCompletionUsedTelemetryCommand(item.label, 'tile', location.path, document.uri);
                return item;
              }
            })
            .filter((i): i is vscode.CompletionItem => !!i);
        }
      }
      return items;
    }
  }

  // find the "name" in the item above the passed in "tiles" location, if the item type="Variable"
  private getVariableName(document: vscode.TextDocument, tilesPath: JSONPath): string | undefined {
    const tree = parseTree(document.getText());
    // go up one from the tiles to the item
    const item =
      tree?.type === 'object' ? matchJsonNodeAtPattern(tree, tilesPath.slice(0, tilesPath.length - 2)) : undefined;
    if (item) {
      const typeNode = matchJsonNodeAtPattern(item, ['type']);
      if (typeNode?.value === 'Variable') {
        const nameNode = matchJsonNodeAtPattern(item, ['name']);
        return typeof nameNode?.value === 'string' ? nameNode.value : undefined;
      }
    }
  }
}
