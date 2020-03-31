/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, getLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { rangeForNode, uriRelPath } from '../util/vscodeUtils';
import { hoverMarkdownForVariable } from '../variables';

/** Get hover text for a variable from the name in a page in a ui.json file. */
export class UiVariableHoverProvider implements vscode.HoverProvider {
  constructor(private readonly templateEditing: TemplateDirEditing) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    if (this.templateEditing.isUiDefinitionFile(document.uri)) {
      const location = getLocation(document.getText(), document.offsetAt(position));
      if (
        location &&
        location.matches(['pages', '*', 'variables', '*', 'name']) &&
        location.previousNode?.type === 'string' &&
        typeof location.previousNode.value === 'string'
      ) {
        const varname = location.previousNode.value as string;
        const varUri = uriRelPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
        const doc = await vscode.workspace.openTextDocument(varUri);
        const tree = parseTree(doc.getText());
        const txt = hoverMarkdownForVariable(varname, findNodeAtLocation(tree, [varname]));
        if (txt) {
          return new vscode.Hover(txt, rangeForNode(location.previousNode, document));
        }
      }
    }
  }
}
