/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { matchJsonNodeAtPattern } from '@salesforce/analyticsdx-template-lint';
import { Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { codeCompletionUsedTelemetryCommand } from '../telemetry';
import { TemplateDirEditing } from '../templateEditing';
import { JsonCompletionItemProviderDelegate, newCompletionItem } from '../util/completions';
import { isValidVariableName } from '../util/templateUtils';
import { isValidRelpath } from '../util/utils';
import { VariableRefCompletionItemProviderDelegate } from '../variables';
import { getLayoutItemVariableName, isInTilesEnumKey, matchesLayoutItem } from './utils';

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
    return isInTilesEnumKey(location);
  }

  public async getItems(range: vscode.Range | undefined, location: Location, document: vscode.TextDocument) {
    // find that variable name, then the variable definition
    const variableName = getLayoutItemVariableName(document, location.path.slice(0, location.path.length - 2));
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
}
