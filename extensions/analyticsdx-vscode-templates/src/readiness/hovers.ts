/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { locationMatches } from '../util/jsoncUtils';
import { VariableRefHoverProvider } from '../variables';

/** Get hover text for a variable name in the values of a readiness.json. */
export class ReadinessVariableHoverProvider extends VariableRefHoverProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  protected isSupportedDocument(document: vscode.TextDocument) {
    return this.templateEditing.isReadinessDefinitionFile(document.uri);
  }

  protected isSupportedLocation(location: Location) {
    return (
      location.isAtPropertyKey &&
      location.previousNode?.type === 'property' &&
      locationMatches(location, ['values', '*'])
    );
  }
}
