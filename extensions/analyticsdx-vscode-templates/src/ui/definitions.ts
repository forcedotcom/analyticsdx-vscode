/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { locationMatches } from '../util/jsoncUtils';
import { isValidRelpath } from '../util/utils';
import { VariableRefDefinitionProvider } from '../variables';

/** Handle CMD+Click from a variable name in ui.json to the variable in variables.json. */
export class UiVariableDefinitionProvider extends VariableRefDefinitionProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public isSupportedDocument(document: vscode.TextDocument) {
    // make sure that the template has a variableDefinition and it's in the uiDefinition file for the template
    return (
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      this.templateEditing.isUiDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location): boolean {
    return (
      // make sure it's in a non-empty string value
      !location.isAtPropertyKey &&
      location.previousNode?.type === 'string' &&
      location.previousNode.value &&
      // and that it's in a variable name field
      locationMatches(location, ['pages', '*', 'variables', '*', 'name'])
    );
  }
}
