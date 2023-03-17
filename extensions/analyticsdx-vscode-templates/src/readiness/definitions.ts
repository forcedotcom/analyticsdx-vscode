/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { isValidRelpath } from '../util/utils';
import { VariableRefDefinitionProvider } from '../variables';

/** Handle CMD+Click from a variable name in readiness.json's values to the variable in variables.json. */
export class ReadinessVariableDefinitionProvider extends VariableRefDefinitionProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public isSupportedDocument(document: vscode.TextDocument) {
    // make sure that the template has a variableDefinition and that it's in the readinessDefinition file for the template
    return (
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      this.templateEditing.isReadinessDefinitionFile(document.uri)
    );
  }
  public isSupportedLocation(location: Location): boolean {
    return (
      // make sure it's in a non-empty property name field
      location.isAtPropertyKey &&
      location.previousNode?.type === 'property' &&
      location.previousNode.value &&
      // and that it's in a variable name field in values
      location.matches(['values', '*'])
    );
  }
}
