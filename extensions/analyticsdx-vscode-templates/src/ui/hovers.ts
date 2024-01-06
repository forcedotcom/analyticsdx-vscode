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
import { VariableRefHoverProvider } from '../variables';

/** Get hover text for a variable from the name in a page in a ui.json file. */
export class UiVariableHoverProvider extends VariableRefHoverProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  protected isSupportedDocument(document: vscode.TextDocument) {
    return this.templateEditing.isUiDefinitionFile(document.uri);
  }

  protected isSupportedLocation(location: Location) {
    return (
      !location.isAtPropertyKey &&
      location.previousNode?.type === 'string' &&
      locationMatches(location, ['pages', '*', 'variables', '*', 'name'])
    );
  }
}
