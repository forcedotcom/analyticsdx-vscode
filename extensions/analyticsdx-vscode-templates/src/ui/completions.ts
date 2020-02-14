/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';
import { TemplateDirEditing } from '../templateEditing';
import { JsonAttributeCompletionItemProviderDelegate, newCompletionItem } from '../util/completions';
import { jsonPathToString } from '../util/jsoncUtils';
import { isValidRelpath } from '../util/utils';
import { isUriUnder, uriBasename, uriRelPath } from '../util/vscodeUtils';

/** Get variable names for the variable name in the pages in ui.json. */
export class UiVariableCompletionItemProviderDelegate implements JsonAttributeCompletionItemProviderDelegate {
  constructor(private readonly templateEditing: TemplateDirEditing) {}

  public supported(
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): boolean {
    return (
      // make sure it's in the uiDefinition file for the template
      isUriUnder(this.templateEditing.dir, document.uri) &&
      !!this.templateEditing.uiDefinitionPath &&
      isValidRelpath(this.templateEditing.uiDefinitionPath) &&
      document.uri.path.endsWith(`/${this.templateEditing.uiDefinitionPath}`) &&
      // and that the template has a variableDefinition
      !!this.templateEditing.variablesDefinitionPath &&
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      // and that it's in a variable name field
      location.matches(['pages', '*', 'variables', '*', 'name'])
    );
  }

  public async items(
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    // pull the variables names from the variables file
    const varUri = uriRelPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
    const doc = await vscode.workspace.openTextDocument(varUri);
    const tree = parseTree(doc.getText());
    const items: vscode.CompletionItem[] = [];
    if (tree.type === 'object') {
      tree.children?.forEach(child => {
        if (
          child.type === 'property' &&
          child.children?.[0]?.type === 'string' &&
          typeof child.children[0].value === 'string' &&
          child.children[0].value
        ) {
          const item = newCompletionItem(child.children[0].value, range, vscode.CompletionItemKind.Variable);
          // try to pull the variable type, label and description to add to the completion item
          if (child.children?.[1]?.type === 'object') {
            // put '(type) label' in the detail
            const typeNode = findNodeAtLocation(child.children[1], ['variableType', 'type']);
            let type =
              typeNode?.type === 'string' && typeof typeNode.value && typeNode.value ? typeNode.value : 'StringType';
            if (type === 'ArrayType') {
              // try to unwrap to the array item type
              const itemsType = findNodeAtLocation(child.children[1], ['variableType', 'itemsType', 'type']);
              if (itemsType?.type === 'string' && typeof itemsType.value === 'string' && itemsType.value) {
                type = `${itemsType.value}[]`;
              }
            }
            item.detail = `(${type})`;
            const label = findNodeAtLocation(child.children[1], ['label']);
            if (label?.type === 'string' && typeof label.value === 'string' && label.value) {
              item.detail += ' ' + label.value;
            }

            // put the description in the documentation
            const desc = findNodeAtLocation(child.children[1], ['description']);
            if (desc?.type === 'string' && typeof desc.value === 'string' && desc.value) {
              item.documentation = desc.value;
            }
          }
          // send telemetry when someone accepts the completion item
          item.command = {
            command: 'analyticsdx.telemetry.send',
            title: 'Sending telemetry',
            arguments: [
              'codeCompletionUsed',
              EXTENSION_NAME,
              {
                label: item.label,
                type: 'variable',
                jsonPath: jsonPathToString(location.path),
                fileName: uriBasename(document.uri)
              }
            ]
          };
          items.push(item);
        }
      });
    }
    return items;
  }
}
