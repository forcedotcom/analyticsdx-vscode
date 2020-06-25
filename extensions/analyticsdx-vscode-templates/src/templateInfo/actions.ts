/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { modify as jsonModify } from 'jsonc-parser';
import * as vscode from 'vscode';
import { ERRORS, imageFileFilter, jsonFileFilter, LINTER_SOURCE_ID } from '../constants';
import { quickFixUsedTelemetryCommand } from '../telemetry';
import { jsonStringifyWithOptions } from '../util/jsoncUtils';
import { isValidRelpath } from '../util/utils';
import {
  argsFrom,
  findEditorForDocument,
  getFormattingOptionsForEditor,
  jsonEditsToWorkspaceEdit,
  uriBasename,
  uriDirname,
  uriRelPath,
  uriStat
} from '../util/vscodeUtils';

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

const DEFAULT_SHARE_JSON = Object.freeze({
  accessType: 'View',
  shareType: 'Organization'
});

/** Quick fix for creating a  */
export class CreateFolderShareCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  public async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[] | undefined> {
    const actions: vscode.CodeAction[] = [];
    for (const d of context.diagnostics) {
      if (d.source === LINTER_SOURCE_ID && d.code === ERRORS.TMPL_EMBEDDED_APP_NO_SHARES) {
        const args = argsFrom(d);
        // we should get a folderDefinitionUri if the folderDefinition field is set to a valid path (even if it
        // doesn't exist)
        if (args?.folderDefinitionUri && args.folderDefinitionUri instanceof vscode.Uri) {
          try {
            const fix = await this.createSharesCodeAction(document, args.folderDefinitionUri, d);
            if (fix) {
              actions.push(fix);
            }
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
    return actions;
  }

  private async createSharesCodeAction(
    templateInfoDoc: vscode.TextDocument,
    folderDefinitionUri: vscode.Uri,
    d: vscode.Diagnostic
  ): Promise<vscode.CodeAction | undefined> {
    const stat = await uriStat(folderDefinitionUri);
    // if the folderDefinition exists but isn't a file, skip it
    if (stat && (stat.type & vscode.FileType.File) === 0) {
      return undefined;
    }

    const fix = new vscode.CodeAction(
      'Add default share to ' + uriBasename(folderDefinitionUri),
      vscode.CodeActionKind.QuickFix
    );
    fix.diagnostics = [d];
    fix.edit = new vscode.WorkspaceEdit();
    // file exists
    if (stat) {
      const folderDoc = await vscode.workspace.openTextDocument(folderDefinitionUri);
      const folderText = folderDoc.getText();
      const formattingOptions = getFormattingOptionsForEditor(
        findEditorForDocument(folderDoc) || findEditorForDocument(templateInfoDoc)
      );
      // if the file is empty, just put the json in there
      if (folderText.trim().length <= 0) {
        fix.edit.insert(
          folderDefinitionUri,
          new vscode.Position(0, 0),
          jsonStringifyWithOptions({ shares: [DEFAULT_SHARE_JSON] }, formattingOptions)
        );
      } else {
        // -1 means add to the end of the "shares" array (which should be the first item since it should be missing or
        // empty)
        const edits = jsonModify(folderText, ['shares', -1], DEFAULT_SHARE_JSON, { formattingOptions });
        // no actual edits, so no need for a quick fix
        if (edits.length <= 0) {
          return undefined;
        }
        jsonEditsToWorkspaceEdit(edits, folderDoc, fix.edit);
      }
    } else {
      // file doesn't exist, just create it with the right json
      fix.edit.createFile(folderDefinitionUri);
      fix.edit.insert(
        folderDefinitionUri,
        new vscode.Position(0, 0),
        jsonStringifyWithOptions(
          { shares: [DEFAULT_SHARE_JSON] },
          getFormattingOptionsForEditor(findEditorForDocument(templateInfoDoc))
        )
      );
    }

    fix.command = quickFixUsedTelemetryCommand(fix.title, d, templateInfoDoc.uri);
    return fix;
  }
}
