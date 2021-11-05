/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  findNodeAtLocation,
  findNodeAtOffset,
  getLocation,
  getNodePath,
  Location,
  Node as JsonNode,
  parseTree
} from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { rangeForNode } from '../util/vscodeUtils';

/** Generate hover markdown text for a variable definition. */
export function hoverMarkdownForVariable(
  varname: string,
  varNode: JsonNode | undefined
): vscode.MarkdownString | undefined {
  if (varNode?.type === 'object') {
    const typeNode = findNodeAtLocation(varNode, ['variableType', 'type']);
    let type =
      typeNode?.type === 'string' && typeof typeNode.value === 'string' && typeNode.value
        ? typeNode.value
        : 'StringType';
    if (type === 'ArrayType') {
      // try to unwrap to the array item type
      const itemsType = findNodeAtLocation(varNode, ['variableType', 'itemsType', 'type']);
      if (itemsType?.type === 'string' && typeof itemsType.value === 'string' && itemsType.value) {
        type = `${itemsType.value}[]`;
      }
    }

    const txt = new vscode.MarkdownString();
    txt.appendMarkdown(`\`(${type})\` \`${varname}\``);
    const label = findNodeAtLocation(varNode, ['label']);
    if (label?.type === 'string' && typeof label.value === 'string' && label.value) {
      txt.appendText(`: ${label.value}`);
    }

    const desc = findNodeAtLocation(varNode, ['description']);
    if (desc?.type === 'string' && typeof desc.value === 'string' && desc.value) {
      txt.appendMarkdown('\n\n').appendText(desc.value);
    }
    return txt;
  }
}

/** Get hover text for a variable name in a variables.json file. */
export class VariableHoverProvider implements vscode.HoverProvider {
  constructor(private readonly templateEditing: TemplateDirEditing) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Hover | undefined {
    if (this.templateEditing.isVariablesDefinitionFile(document.uri)) {
      // note: we can't use getLocation() since that doesn't return a full node structure,
      // so we can't get to the variable definition object from it and we need to do a real
      // full parse
      const tree = parseTree(document.getText());
      const node = tree && findNodeAtOffset(tree, document.offsetAt(position));
      // if they're hovering the string-key part of a top-level property def (e.g. "here": {})
      if (
        node?.type === 'string' &&
        typeof node.value === 'string' &&
        node.value &&
        node.parent &&
        node.parent.type === 'property' &&
        node.parent.children &&
        node.parent.children[0] === node &&
        getNodePath(node).length === 1
      ) {
        const txt = hoverMarkdownForVariable(node.value, node.parent.children[1]);
        if (txt) {
          return new vscode.Hover(txt, rangeForNode(node, document));
        }
      }
    }
  }
}

/** Base class for providing hovers on variables references in other files. */
export abstract class VariableRefHoverProvider implements vscode.HoverProvider {
  constructor(protected readonly templateEditing: TemplateDirEditing) {}

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    if (this.isSupportedDocument(document)) {
      const location = getLocation(document.getText(), document.offsetAt(position));
      if (this.isSupportedLocation(location) && typeof location.previousNode?.value === 'string') {
        const varname = location.previousNode.value;
        const varUri = vscode.Uri.joinPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
        const varDoc = await vscode.workspace.openTextDocument(varUri);
        const tree = parseTree(varDoc.getText());
        const txt = hoverMarkdownForVariable(varname, tree && findNodeAtLocation(tree, [varname]));
        if (txt) {
          return new vscode.Hover(txt, rangeForNode(location.previousNode, varDoc));
        }
      }
    }
  }

  /** Tell if this provider supports the specified document. */
  protected abstract isSupportedDocument(document: vscode.TextDocument): boolean;

  /** Tell if this provider supports the specified location in the document. */
  protected abstract isSupportedLocation(location: Location): boolean;
}
