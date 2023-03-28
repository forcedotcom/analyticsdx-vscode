/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { ERRORS, LINTER_SOURCE_ID } from '../constants';
import { TemplateDirEditing } from '../templateEditing';
import { argsFrom } from '../util/vscodeUtils';
import { VariableRefCodeActionProvider } from '../variables';

/** Provides quick fixes for unrecognized variable name errors in readiness.json's. */
export class ReadinessVariableCodeActionProvider extends VariableRefCodeActionProvider {
  constructor(template: TemplateDirEditing) {
    super(template);
  }

  protected isSupportedDocument(document: vscode.TextDocument) {
    return this.template.isReadinessDefinitionFile(document.uri);
  }

  protected isSupportedDiagnostic(d: vscode.Diagnostic) {
    if (d.source === LINTER_SOURCE_ID && d.code === ERRORS.READINESS_UNKNOWN_VARIABLE) {
      const args = argsFrom(d);
      if (args) {
        return {
          name: typeof args.name === 'string' ? args.name : undefined,
          match: typeof args.match === 'string' ? args.match : undefined
        };
      }
    }
    return undefined;
  }
}
