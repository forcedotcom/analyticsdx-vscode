/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, Location, Node as JsonNode, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { codeCompletionUsedTelemetryCommand } from '../telemetry';
import { TemplateDirEditing } from '../templateEditing';
import { JsonCompletionItemProviderDelegate, newCompletionItem } from '../util/completions';
import { isValidVariableName } from '../util/templateUtils';
import { uriRelPath } from '../util/vscodeUtils';

export const NEW_VARIABLE_SNIPPETS = Object.freeze([
  { label: 'New array variable', type: 'ArrayType' },
  { label: 'New boolean variable', type: 'BooleanType' },
  { label: 'New number variable', type: 'NumberType' },
  { label: 'New string variable', type: 'StringType' },
  { label: 'New variable', type: '' }
]);

/** Provider completion items to add new variable definitions to the variableDefinition file. */
export class NewVariableCompletionItemProviderDelegate implements JsonCompletionItemProviderDelegate {
  constructor(private readonly templateEditing: TemplateDirEditing) {}

  public isSupportedDocument(document: vscode.TextDocument) {
    return this.templateEditing.isVariablesDefinitionFile(document.uri);
  }

  public isSupportedLocation(location: Location) {
    return (
      // make sure it's in the empty part of the variables.json {}
      location.isAtPropertyKey && location.matches(['*']) && location.path.length === 1
    );
  }

  public getItems(
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument
  ): vscode.CompletionItem[] | undefined {
    // if the range will be non-empty if the cursor is in an existing "varname", in which case we don't want to give
    // any completions
    if (range?.isEmpty) {
      return NEW_VARIABLE_SNIPPETS.map(({ label, type }) => {
        // tabs and newlines in the snippet text will get appropriately replaced in the editor
        const snippet = new vscode.SnippetString()
          .appendText('"')
          .appendTabstop()
          .appendText('": {\n\t"variableType": {\n\t\t"type": "')
          .appendPlaceholder(type)
          .appendText('"');
        if (type === 'ArrayType') {
          snippet
            .appendText(',\n\t\t"itemsType": {\n\t\t\t"type": "')
            .appendTabstop()
            .appendText('"\n\t\t}');
        }
        snippet.appendText('\n\t}\n}').appendTabstop(0);
        // REVIEWME: calculate if this needs a trailing comma? typescript doesn't seem to in array/object literals,
        // but it would be nice

        const item = newCompletionItem(label, range, vscode.CompletionItemKind.Variable, undefined, snippet);
        item.command = codeCompletionUsedTelemetryCommand(item.label, 'new-variable', location.path, document.uri, {
          vartype: type
        });
        return item;
      });
    }
  }
}
/** Get variable completions for variable ref fields in files. */
export abstract class VariableRefCompletionItemProviderDelegate implements JsonCompletionItemProviderDelegate {
  constructor(protected readonly templateEditing: TemplateDirEditing) {}

  public abstract isSupportedDocument(document: vscode.TextDocument): boolean;

  public abstract isSupportedLocation(location: Location, context: vscode.CompletionContext): boolean;

  protected createVariableCompletionItem(
    range: vscode.Range | undefined,
    document: vscode.TextDocument,
    varname: string,
    varDefNode: JsonNode | undefined
  ): vscode.CompletionItem {
    const item = newCompletionItem(varname, range, vscode.CompletionItemKind.Variable);
    // try to pull the variable type, label and description to add to the completion item
    if (varDefNode?.type === 'object') {
      // put '(type) label' in the detail
      const typeNode = findNodeAtLocation(varDefNode, ['variableType', 'type']);
      let type =
        typeNode?.type === 'string' && typeof typeNode.value === 'string' && typeNode.value
          ? typeNode.value
          : 'StringType';
      if (type === 'ArrayType') {
        // try to unwrap to the array item type
        const itemsType = findNodeAtLocation(varDefNode, ['variableType', 'itemsType', 'type']);
        if (itemsType?.type === 'string' && typeof itemsType.value === 'string' && itemsType.value) {
          type = `${itemsType.value}[]`;
        }
      }
      item.detail = `(${type})`;
      const label = findNodeAtLocation(varDefNode, ['label']);
      if (label?.type === 'string' && typeof label.value === 'string' && label.value) {
        item.detail += ' ' + label.value;
      }

      // put the description in the documentation
      const desc = findNodeAtLocation(varDefNode, ['description']);
      if (desc?.type === 'string' && typeof desc.value === 'string' && desc.value) {
        item.documentation = desc.value;
      }
    }
    return item;
  }

  public async getItems(
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument
  ): Promise<vscode.CompletionItem[]> {
    // pull the variables names from the variables file
    const varUri = uriRelPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
    const doc = await vscode.workspace.openTextDocument(varUri);
    const tree = parseTree(doc.getText());
    const items: vscode.CompletionItem[] = [];
    if (tree?.type === 'object') {
      tree.children?.forEach(child => {
        if (
          child.type === 'property' &&
          child.children?.[0]?.type === 'string' &&
          typeof child.children[0].value === 'string' &&
          child.children[0].value &&
          isValidVariableName(child.children[0].value)
        ) {
          const item = this.createVariableCompletionItem(range, document, child.children[0].value, child.children[1]);
          // send telemetry when someone accepts the completion item
          item.command = codeCompletionUsedTelemetryCommand(item.label, 'variable', location.path, document.uri);
          items.push(item);
        }
      });
    }
    return items;
  }
}
