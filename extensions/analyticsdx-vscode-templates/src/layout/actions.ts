/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { ERRORS, LINTER_SOURCE_ID } from '../constants';
import { quickFixUsedTelemetryCommand } from '../telemetry';
import { TemplateDirEditing } from '../templateEditing';
import { argsFrom } from '../util/vscodeUtils';
import { VariableRefCodeActionProvider } from '../variables';

/** Provides quick fixes for unrecognized variable name errors in layout.json's. */
export class LayoutVariableCodeActionProvider extends VariableRefCodeActionProvider {
  constructor(template: TemplateDirEditing) {
    super(template);
  }

  protected override isSupportedDocument(document: vscode.TextDocument) {
    return this.template.isLayoutDefinitionFile(document.uri);
  }

  protected override isSupportedDiagnostic(d: vscode.Diagnostic) {
    if (d.source === LINTER_SOURCE_ID && d.code === ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE) {
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

/** Provide quick fixes for unrecognized variable tile keys in layout.json's. */
export class LayoutVariableTileCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private readonly templateEditing: TemplateDirEditing) {}

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ) {
    if (this.templateEditing.isLayoutDefinitionFile(document.uri)) {
      // convert invalid tile diagnostics into quick fixes that will replace the bad tile key with the suggested text
      // from the linter
      return context.diagnostics
        .map(diagnostic => {
          if (diagnostic.source === LINTER_SOURCE_ID && diagnostic.code === ERRORS.LAYOUT_INVALID_TILE_NAME) {
            const args = argsFrom(diagnostic);
            if (typeof args?.match === 'string') {
              const fix = new vscode.CodeAction(
                `Switch to '${args.match}'`,
                LayoutVariableTileCodeActionProvider.providedCodeActionKinds[0]
              );
              fix.command = quickFixUsedTelemetryCommand(fix.title, diagnostic, document.uri, diagnostic.code, {
                match: args.match
              });
              fix.isPreferred = true;
              fix.edit = new vscode.WorkspaceEdit();
              fix.edit.replace(document.uri, diagnostic.range, args.match);
              return fix;
            }
          }
        })
        .filter((fix): fix is vscode.CodeAction => !!fix);
    }
  }
}
