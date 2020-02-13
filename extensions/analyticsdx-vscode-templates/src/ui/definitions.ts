/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { JsonAttributeDefinitionProvider } from '../util/definitions';
import { isValidRelpath } from '../util/utils';
import { isUriUnder, rangeForNode, uriRelPath } from '../util/vscodeUtils';

/** Handle CMD+Click from a variable name in ui.json to the variable in variables.json. */
export class UiVariableDefinitionProvider extends JsonAttributeDefinitionProvider {
  constructor(private readonly templateEditing: TemplateDirEditing) {
    super();
  }

  public async provideAttributeDefinition(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | undefined> {
    const varname = location.previousNode!.value as string;
    if (varname) {
      const varUri = uriRelPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
      const doc = await vscode.workspace.openTextDocument(varUri);
      const tree = parseTree(doc.getText());
      const nameNode = findNodeAtLocation(tree, [varname]);
      if (nameNode) {
        return new vscode.Location(varUri, rangeForNode(nameNode.parent ?? nameNode, doc));
      }
    }
  }

  public isSupportedLocation(
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): boolean {
    return (
      // make sure it's in the uiDefinition file for the template
      isUriUnder(this.templateEditing.dir, document.uri) &&
      this.templateEditing.uiDefinitionPath &&
      isValidRelpath(this.templateEditing.uiDefinitionPath) &&
      document.uri.path.endsWith(`/${this.templateEditing.uiDefinitionPath}`) &&
      // and that the template has a variableDefinition
      this.templateEditing.variablesDefinitionPath &&
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      // and that's it's in a variable name field
      location.matches(['pages', '*', 'variables', '*', 'name']) &&
      // and the attribute value is a non-empty string
      location.previousNode?.type === 'string' &&
      location.previousNode.value
    );
  }
}
