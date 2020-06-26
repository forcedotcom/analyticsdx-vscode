/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { isValidRelpath } from '../util/utils';
import { VariableRefCompletionItemProviderDelegate } from '../variables';

/** Get variable names for the variable name in the pages in ui.json. */
export class UiVariableCompletionItemProviderDelegate extends VariableRefCompletionItemProviderDelegate {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public isSupportedDocument(document: vscode.TextDocument): boolean {
    return (
      // make sure that the template has a variableDefinition
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      // and that it's in the uiDefinition file for the template
      this.templateEditing.isUiDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location, context: vscode.CompletionContext): boolean {
    return (
      // make that it's in a variable name value
      !location.isAtPropertyKey && location.matches(['pages', '*', 'variables', '*', 'name'])
    );
  }
}
