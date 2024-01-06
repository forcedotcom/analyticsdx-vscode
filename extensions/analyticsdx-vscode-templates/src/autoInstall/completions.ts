/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location, Node as JsonNode } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { locationMatches } from '../util/jsoncUtils';
import { isValidRelpath } from '../util/utils';
import { VariableRefCompletionItemProviderDelegate } from '../variables';

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
      // makes sure the completion only show in prop names directly under "values" (and not in prop names in object
      // values under "values")
      location.isAtPropertyKey && locationMatches(location, ['configuration', 'appConfiguration', 'values', '*'])
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
}
