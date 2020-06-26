/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, Location, Node as JsonNode } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { isValidRelpath } from '../util/utils';
import { VariableRefCompletionItemProviderDelegate } from '../variables';

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

/** Provide completions items for variables references in configuration.appConfiguration.values */
export class AutoInstallVariableCompletionItemProviderDelegate extends VariableRefCompletionItemProviderDelegate {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public isSupportedDocument(document: vscode.TextDocument) {
    return (
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      this.templateEditing.isAutoInstallDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location) {
    return (
      location.isAtPropertyKey &&
      location.matches(['configuration', 'appConfiguration', 'values', '*']) &&
      // this makes sure the completion only show in prop names directly under "values" (and not in prop names in object
      // values under "values")
      location.path.length === 4
    );
  }

  protected createVariableCompletionItem(
    range: vscode.Range | undefined,
    document: vscode.TextDocument,
    varname: string,
    varDefNode: JsonNode | undefined
  ): vscode.CompletionItem {
    const item = super.createVariableCompletionItem(range, document, varname, varDefNode);
    // if this isn't replacing an existing property name, add a ': <empty value>' after the varname
    if (!range || range.isEmpty) {
      item.label = `"${item.label}"`;
      item.insertText = this.appendDefaultValue(new vscode.SnippetString(`"${varname}": `), varDefNode);
    }
    return item;
  }

  private appendDefaultValue(insertText: vscode.SnippetString, varDefNode: JsonNode | undefined): vscode.SnippetString {
    if (varDefNode?.type === 'object') {
      const typeNode = findNodeAtLocation(varDefNode, ['variableType', 'type']);
      const type = typeNode?.type === 'string' && typeof typeNode.value === 'string' ? typeNode.value : undefined;
      if (type === 'ArrayType') {
        insertText
          .appendText('[')
          .appendTabstop()
          .appendText(']');
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
        insertText
          .appendText('{\n\t"datasetId": "')
          .appendTabstop()
          .appendText('"\n}');
      } else if (type === 'NumberType') {
        insertText.appendPlaceholder('0');
      } else if (type === 'ObjectType') {
        insertText
          .appendText('{')
          .appendTabstop()
          .appendText('}');
      } else if (type === 'SobjectType') {
        insertText
          .appendText('{\n\t"sobjectName": "')
          .appendTabstop()
          .appendText('"\n}');
      } else if (type === 'SobjectFieldType') {
        insertText
          .appendText('{\n\t"sobjectName": "')
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
        insertText
          .appendText('"')
          .appendTabstop()
          .appendText('"');
      }
    }
    // REVIEWME: calculate out if we should add a trailing-comma? Typescript doesn't (like in array and object literals)
    // but would be nice
    return insertText.appendTabstop(0);
  }
}
