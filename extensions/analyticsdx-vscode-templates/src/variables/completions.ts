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
          snippet.appendText(',\n\t\t"itemsType": {\n\t\t\t"type": "').appendTabstop().appendText('"\n\t\t}');
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

function zeropad(n: number, len = 2) {
  let s = n.toFixed(0); // we can ignore negatives & decimals since this is for date values
  const need = len - s.length;
  for (let i = 0; i < need; i++) {
    s = '0' + s;
  }
  return s;
}

// convert a date.getTimezoneOffset to an ISO8601 numeric tz
function toTzStr(offset: number) {
  // Date.getTimezoneOffset() is a neg offset, so use the opposite sign in the is08601 string
  const sign = offset < 0 ? '+' : '-';
  offset = Math.abs(offset);
  const hours = Math.floor(offset / 60);
  const mins = offset % 60;
  return sign + zeropad(hours) + zeropad(mins);
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

  /** Append a default value assignment to a snippet string, for inserting a default value for a variable.
   * @param insertText the snippet string to add to
   * @param varDefNode the json node of the variable
   * @return the passed in insertText snippet.
   */
  protected appendDefaultValue(
    insertText: vscode.SnippetString,
    varDefNode: JsonNode | undefined
  ): vscode.SnippetString {
    if (varDefNode?.type === 'object') {
      const typeNode = findNodeAtLocation(varDefNode, ['variableType', 'type']);
      const type = typeNode?.type === 'string' && typeof typeNode.value === 'string' ? typeNode.value : undefined;
      if (type === 'ArrayType') {
        insertText.appendText('[').appendTabstop().appendText(']');
      } else if (type === 'BooleanType') {
        insertText.appendChoice(['true', 'false']);
      } else if (type === 'DatasetAnyFieldType' || type === 'DatasetDimensionType' || type === 'DatasetMeasureType') {
        insertText
          .appendText('{\n\t"datasetId": "')
          .appendTabstop()
          .appendText('",\n\t"fieldName": "')
          .appendTabstop()
          .appendText('"\n}');
      } else if (type === 'DatasetDateType') {
        insertText
          .appendText('{\n\t"datasetId": "')
          .appendTabstop()
          .appendText('",\n\t"dateAlias": "')
          .appendTabstop()
          .appendText('"\n}');
      } else if (type === 'DatasetType') {
        insertText.appendText('{\n\t"datasetId": "').appendTabstop().appendText('"\n}');
      } else if (type === 'NumberType') {
        insertText.appendPlaceholder('0');
      } else if (type === 'ObjectType') {
        insertText.appendText('{').appendTabstop().appendText('}');
      } else if (type === 'SobjectType') {
        insertText.appendText('{\n\t"sobjectName": "').appendTabstop().appendText('"\n}');
      } else if (type === 'SobjectFieldType') {
        insertText
          .appendText('{\n\t"sobjectName": "')
          .appendTabstop()
          .appendText('",\n\t"fieldName": "')
          .appendTabstop()
          .appendText('"\n}');
      } else if (type === 'DataLakeObjectType' || type === 'DataModelObjectType' || type === 'CalculatedInsightType') {
        insertText.appendText('{\n\t"objectName": "').appendTabstop().appendText('"\n}');
      } else if (
        type === 'DataLakeObjectFieldType' ||
        type === 'DataModelObjectFieldType' ||
        type === 'CalculatedInsightFieldType'
      ) {
        insertText
          .appendText('{\n\t"objectName": "')
          .appendTabstop()
          .appendText('",\n\t"fieldName": "')
          .appendTabstop()
          .appendText('"\n}');
      } else if (type === 'DateTimeType') {
        const now = new Date();
        // value needs to be in "yyyy-MM-ddTHH:mm:ssz" format (or a number for UTC secs)
        insertText
          .appendText('"')
          .appendPlaceholder(zeropad(now.getFullYear(), 4))
          .appendText('-')
          .appendPlaceholder(zeropad(now.getMonth() + 1))
          .appendText('-')
          .appendPlaceholder(zeropad(now.getDate()))
          .appendText('T')
          .appendPlaceholder(zeropad(now.getHours()))
          .appendText(':')
          .appendPlaceholder(zeropad(now.getMinutes()))
          .appendText(':')
          .appendPlaceholder(zeropad(now.getSeconds()))
          .appendPlaceholder(toTzStr(now.getTimezoneOffset()))
          .appendText('"');
      } else {
        // for no type in var def or anything else, assume a string value -- this covers StringType and ConnectorType
        // and no type specified (which is StringType);
        // it also means unknown/invalid types get a string value, which matches what we do for the hover -- they'll have an
        // error in their variables json file
        insertText.appendText('"').appendTabstop().appendText('"');
      }
    }
    // REVIEWME: calculate out if we should add a trailing-comma? Typescript doesn't (like in array and object literals)
    // but would be nice
    return insertText.appendTabstop(0);
  }

  public async getItems(
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument
  ): Promise<vscode.CompletionItem[]> {
    // pull the variables names from the variables file
    const varUri = vscode.Uri.joinPath(this.templateEditing.dir, this.templateEditing.variablesDefinitionPath!);
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
