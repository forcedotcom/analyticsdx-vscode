/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { isValidRelpath } from '../util/utils';
import { VariableRefDefinitionProvider } from '../variables';
import { matchesLayoutItem } from './utils';

/** Handle CMD+Click from a variable name in layout.json to the variable in variables.json. */
export class LayoutVariableDefinitionProvider extends VariableRefDefinitionProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public isSupportedDocument(document: vscode.TextDocument) {
    // make sure that the template has a variableDefinition and it's in the layoutDefinition file for the template
    return (
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      this.templateEditing.isLayoutDefinitionFile(document.uri)
    );
  }

  public isSupportedLocation(location: Location): boolean {
    return (
      // make sure it's in a non-empty string value
      !location.isAtPropertyKey &&
      location.previousNode?.type === 'string' &&
      location.previousNode.value &&
      // and that it's in a variable name field
      matchesLayoutItem(location, 'name')
    );
  }
}
