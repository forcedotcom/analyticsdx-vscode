/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { isValidVariableName } from '@salesforce/analyticsdx-template-lint';
import { Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { JsonAttributeDefinitionProvider } from '../util/definitions';
import { matchJsonNodeAtPattern } from '../util/jsoncUtils';
import { isValidRelpath } from '../util/utils';
import { rangeForNode } from '../util/vscodeUtils';
import { VariableRefDefinitionProvider } from '../variables';
import {
  getLayoutItemVariableName,
  isInComponentLayoutVariableName,
  isInTilesEnumKey,
  matchesLayoutItem
} from './utils';

/** Handle CMD+Click from a variable name in layout.json to the variable in variables.json. */
export class LayoutVariableDefinitionProvider extends VariableRefDefinitionProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public isSupportedDocument(document: vscode.TextDocument) {
    // make sure that the template has a variableDefinition and it's in the layoutDefinition file for the template
    return (
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      this.templateEditing.isLayoutDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location): boolean {
    return (
      // make sure it's in a non-empty string value
      !location.isAtPropertyKey &&
      location.previousNode?.type === 'string' &&
      location.previousNode.value &&
      // and that it's in a variable name field
      (isInComponentLayoutVariableName(location) || matchesLayoutItem(location, 'name'))
    );
  }
}

/** Handle navigation from a variable item tile key to the enum value in the variable definition. */
export class LayoutVariableTileDefinitionProvider extends JsonAttributeDefinitionProvider {
  constructor(private readonly templateEditing: TemplateDirEditing) {
    super();
  }

  public isSupportedDocument(document: vscode.TextDocument) {
    // make sure that the template has a variableDefinition and it's in the layoutDefinition file for the template
    return (
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      this.templateEditing.isLayoutDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location) {
    // make sure it's in an enum key
    return isInTilesEnumKey(location) && location.previousNode?.type === 'property' && location.previousNode.value;
  }

  public async provideAttributeDefinition(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ) {
    // isSupportedLocation checks that location.previousNode is set and has a string value, which should be the
    // enum key
    const enumValue: string = location.previousNode!.value;
    if (enumValue) {
      // find that variable name, then the variable definition
      const variableName = getLayoutItemVariableName(document, location.path.slice(0, location.path.length - 2));
      if (variableName && isValidVariableName(variableName)) {
        // find the enums for that variable in the variable.json
        const varUri = vscode.Uri.joinPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
        const varDoc = await vscode.workspace.openTextDocument(varUri);
        const tree = parseTree(varDoc.getText());
        if (tree?.type === 'object') {
          const enumsNode = matchJsonNodeAtPattern(tree, [variableName, 'variableType', 'enums']);
          if (enumsNode?.type === 'array' && Array.isArray(enumsNode.children)) {
            const enumNode = enumsNode.children.find(
              node =>
                (node.type === 'string' || node.type === 'number') && node.value && String(node.value) === enumValue
            );
            if (enumNode) {
              return new vscode.Location(varUri, rangeForNode(enumNode, varDoc));
            }
          }
        }
      }
    }
  }
}
