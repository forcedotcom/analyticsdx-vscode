/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { VariableRefHoverProvider } from '../variables';

/** Get hover text for a variable name in the appConfiguration.values of an auto-install.json. */
export class AutoInstallVariableHoverProvider extends VariableRefHoverProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  protected isSupportedDocument(document: vscode.TextDocument) {
    return this.templateEditing.isAutoInstallDefinitionFile(document.uri);
  }

  protected isSupportedLocation(location: Location) {
    return (
      location.isAtPropertyKey &&
      location.previousNode?.type === 'property' &&
      location.matches(['configuration', 'appConfiguration', 'values', '*'])
    );
  }
}
