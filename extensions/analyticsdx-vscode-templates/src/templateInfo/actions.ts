/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { ERRORS, imageFileFilter, jsonFileFilter, LINTER_SOURCE_ID } from '../constants';
import { quickFixUsedTelemetryCommand } from '../telemetry';
import { isValidRelpath } from '../util/utils';
import { argsFrom, uriDirname, uriRelPath } from '../util/vscodeUtils';

/** Quick fix for creating missing relative-path files for template-info.json fields. */
export class CreateRelPathFileCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  public async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[] | undefined> {
    const actions: vscode.CodeAction[] = [];
    for (const d of context.diagnostics) {
      if (d.source === LINTER_SOURCE_ID && d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST) {
        const args = argsFrom(d);
        // don't offer to create empty image files, as that won't be a valid image file
        if (args?.relPath && isValidRelpath(args.relPath) && !imageFileFilter(args.relPath)) {
          const fix = new vscode.CodeAction(`Create ${args.relPath}`, vscode.CodeActionKind.QuickFix);
          fix.diagnostics = [d];
          fix.edit = new vscode.WorkspaceEdit();
          const relUri = uriRelPath(uriDirname(document.uri), args.relPath);
          fix.edit.createFile(relUri);
          if (jsonFileFilter(args.relPath)) {
            fix.edit.insert(relUri, new vscode.Position(0, 0), '{}');
          }
          fix.command = quickFixUsedTelemetryCommand(fix.title, d, document.uri);
          actions.push(fix);
        }
      }
    }
    return actions;
  }
}
