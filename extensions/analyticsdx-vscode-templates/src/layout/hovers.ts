/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TemplateDirEditing } from '../templateEditing';
import { VariableRefHoverProvider } from '../variables';
import { matchesLayoutItem } from './utils';

/** Get hover text for a variable from the name in a page in a layout.json file. */
export class LayoutVariableHoverProvider extends VariableRefHoverProvider {
  constructor(templateEditing: TemplateDirEditing) {
    super(templateEditing);
  }

  protected override isSupportedDocument(document: vscode.TextDocument) {
    return this.templateEditing.isLayoutDefinitionFile(document.uri);
  }

  protected override isSupportedLocation(location: Location) {
    return !location.isAtPropertyKey && location.previousNode?.type === 'string' && matchesLayoutItem(location, 'name');
  }
}
