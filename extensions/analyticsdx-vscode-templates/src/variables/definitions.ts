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
import { rangeForNode, uriRelPath } from '../util/vscodeUtils';

/** Base class for providing definition (cmd+click) support on variables references. */
export abstract class VariableRefDefinitionProvider extends JsonAttributeDefinitionProvider {
  constructor(protected readonly templateEditing: TemplateDirEditing) {
    super();
  }

  public async provideAttributeDefinition(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | undefined> {
    const varname = typeof location.previousNode?.value === 'string' && location.previousNode.value;
    if (varname) {
      const varUri = uriRelPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
      const doc = await vscode.workspace.openTextDocument(varUri);
      const tree = parseTree(doc.getText());
      const nameNode = tree && findNodeAtLocation(tree, [varname]);
      if (nameNode) {
        return new vscode.Location(varUri, rangeForNode(nameNode.parent ?? nameNode, doc));
      }
    }
  }

  /** Tell if this provider supports the spcified document. */
  public abstract isSupportedDocument(document: vscode.TextDocument): boolean;

  /** Tell if the this provider supports the specified location in the document. */
  public abstract isSupportedLocation(location: Location): boolean;
}
