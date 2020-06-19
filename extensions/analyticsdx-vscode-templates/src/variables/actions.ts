/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { modify as jsonModify } from 'jsonc-parser';
import * as vscode from 'vscode';
import { quickFixUsedTelemetryCommand } from '../telemetry';
import { TemplateDirEditing } from '../templateEditing';
import { jsonStringifyWithOptions } from '../util/jsoncUtils';
import { isValidVariableName } from '../util/templateUtils';
import { isValidRelpath } from '../util/utils';
import {
  findEditorForDocument,
  getFormattingOptionsForEditor,
  jsonEditsToWorkspaceEdit,
  uriRelPath,
  uriStat
} from '../util/vscodeUtils';

/** The default body for a new variable. */
const DEFAULT_VARIABLE_JSON = Object.freeze({
  variableType: {
    type: 'StringType'
  }
});

/** Base class for providing quick fixes for unrecognized variable name errors. */
export abstract class VariableRefCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(protected readonly template: TemplateDirEditing) {}

  public async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[] | undefined> {
    if (this.isSupportedDocument(document)) {
      const actions: vscode.CodeAction[] = [];
      for (const d of context.diagnostics) {
        const info = this.isSupportedDiagnostic(d);
        if (info) {
          // quick fix to create a new variable in the templates variables.json
          if (info.name && isValidVariableName(info.name) && isValidRelpath(this.template.variablesDefinitionPath)) {
            try {
              const fix = await this.newCreateVarAction(info.name, document, d);
              if (fix) {
                actions.push(fix);
              }
            } catch (e) {
              console.error(e);
            }
          }

          // quick fix to update the variable name in the diagnostic's range
          if (info?.match && isValidVariableName(info.match)) {
            actions.push(this.newUpdateVarAction(info.match, document, d));
          }
        }
      }
      return actions;
    }
  }

  /** Tell if this provider supports the specified document. */
  protected abstract isSupportedDocument(document: vscode.TextDocument): boolean;

  /** Tell if this provider supports the specified diagnostic.
   * @returns the (unrecognized) varname entered and/or the best matching varname, or undefined if not supported
   *          diagnostic.
   */
  protected abstract isSupportedDiagnostic(
    diagnostic: vscode.Diagnostic
  ): { name?: string; match?: string } | undefined;

  private async newCreateVarAction(name: string, document: vscode.TextDocument, diagnostic: vscode.Diagnostic) {
    // caller is checking variablesDefinitionPath is defined
    const varUri = uriRelPath(this.template.dir, this.template.variablesDefinitionPath!);
    const stat = await uriStat(varUri);
    // if variablesDefinitionPath exists but is not a file, skip out
    if (stat && (stat.type & vscode.FileType.File) === 0) {
      return undefined;
    }

    const fix = this.newBaseAction(`Create variable '${name}'`, document.uri, diagnostic);
    fix.edit = new vscode.WorkspaceEdit();
    if (!stat) {
      // variablesDefinitionPath doesn't exist, so just create the file with the full text
      fix.edit.createFile(varUri);
      const variablesJson: any = {};
      variablesJson[name] = DEFAULT_VARIABLE_JSON;
      fix.edit.insert(
        varUri,
        new vscode.Position(0, 0),
        jsonStringifyWithOptions(variablesJson, getFormattingOptionsForEditor(findEditorForDocument(document)))
      );
      return fix;
    } else {
      // variables file exists, read it
      const varDoc = await vscode.workspace.openTextDocument(varUri);
      const currentText = varDoc.getText();
      const formattingOptions = getFormattingOptionsForEditor(
        findEditorForDocument(varDoc) || findEditorForDocument(document)
      );
      if (currentText.trim().length === 0) {
        // if the file is empty text, just set it directly
        const variablesJson: any = {};
        variablesJson[name] = DEFAULT_VARIABLE_JSON;
        fix.edit.insert(varUri, new vscode.Position(0, 0), jsonStringifyWithOptions(variablesJson, formattingOptions));
        return fix;
      } else {
        // otherwise, try to squish the variable into the variables file
        // jsonModify should throw an Error if the current variables file cannot be edited to include the new var
        // (i.e. it's not a top-level {})
        const edits = jsonModify(currentText, [name], DEFAULT_VARIABLE_JSON, { formattingOptions });
        if (edits.length <= 0) {
          // nothing to do
          return undefined;
        }
        jsonEditsToWorkspaceEdit(edits, varDoc, fix.edit);
        return fix;
      }
    }
  }

  private newUpdateVarAction(newName: string, document: vscode.TextDocument, diagnostic: vscode.Diagnostic) {
    const fix = this.newBaseAction(`Switch to '${newName}'`, document.uri, diagnostic, newName);
    fix.isPreferred = true;
    fix.edit = new vscode.WorkspaceEdit();
    // always use the diagnostic's range, since the passed in range might a sub/super set of that
    fix.edit.replace(document.uri, diagnostic.range, newName);
    return fix;
  }

  private newBaseAction(
    title: string,
    uri: vscode.Uri,
    diagnostic: vscode.Diagnostic,
    match?: string
  ): vscode.CodeAction {
    const fix = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    fix.diagnostics = [diagnostic];
    fix.command = quickFixUsedTelemetryCommand(
      fix.title,
      diagnostic,
      uri,
      diagnostic.code,
      match ? { match } : undefined
    );
    return fix;
  }
}
