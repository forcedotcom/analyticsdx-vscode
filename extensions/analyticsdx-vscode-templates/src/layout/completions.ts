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
import { VariableRefCompletionItemProviderDelegate } from '../variables';

/** Get variable names for the variable name in the pages in ui.json. */
export class LayoutVariableCompletionItemProviderDelegate extends VariableRefCompletionItemProviderDelegate {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  public override isSupportedDocument(document: vscode.TextDocument): boolean {
    return (
      // make sure that the template has a variableDefinition
      isValidRelpath(this.templateEditing.variablesDefinitionPath) &&
      // and that it's in the layoutDefinition file for the template
      this.templateEditing.isLayoutDefinitionFile(document.uri)
    );
  }

  public override isSupportedLocation(location: Location, context: vscode.CompletionContext): boolean {
    return (
      // make sure that it's in a variable name value
      !location.isAtPropertyKey &&
      // TODO: make these more specific to the layout type (e.g. only 'center' if SingleColumn)
      (location.matches(['pages', '*', 'layout', 'center', 'items', '*', 'name']) ||
        location.matches(['pages', '*', 'layout', 'right', 'items', '*', 'name']) ||
        location.matches(['pages', '*', 'layout', 'left', 'items', '*', 'name']) ||
        location.matches(['pages', '*', 'layout', 'center', 'items', '*', 'items', '*', 'name']) ||
        location.matches(['pages', '*', 'layout', 'right', 'items', '*', 'items', '*', 'name']) ||
        location.matches(['pages', '*', 'layout', 'left', 'items', '*', 'items', '*', 'name']))
    );
  }
}
