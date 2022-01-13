/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { TemplateLinter, TemplateLinterDiagnosticSeverity } from 'analyticsdx-template-lint';
import { getNodePath, Node as JsonNode } from 'jsonc-parser';
import * as vscode from 'vscode';
import { LINTER_SOURCE_ID } from './constants';
import { Disposable } from './util/disposable';
import { jsonPathToString } from './util/jsoncUtils';
import { Logger } from './util/logger';
import { findTemplateInfoFileFor } from './util/templateUtils';
import {
  AdxDiagnostic,
  clearDiagnosticsUnder,
  isUriAtOrUnder,
  rangeForNode,
  uriBasename,
  uriDirname,
  UriExistsDiagnosticCollection,
  uriStat
} from './util/vscodeUtils';

export class VscodeTemplateLinter extends TemplateLinter<vscode.Uri, vscode.TextDocument, AdxDiagnostic> {
  protected override uriDirname(uri: vscode.Uri): vscode.Uri {
    return uriDirname(uri);
  }

  protected override uriBasename(uri: vscode.Uri): string {
    return uriBasename(uri);
  }

  protected override uriRelPath(dir: vscode.Uri, relpath: string): vscode.Uri {
    return vscode.Uri.joinPath(dir, relpath);
  }

  protected override async uriIsFile(uri: vscode.Uri): Promise<boolean | undefined> {
    const stat = await uriStat(uri);
    if (!stat) {
      return undefined;
    } else {
      return (stat.type & vscode.FileType.File) === vscode.FileType.File;
    }
  }

  protected override async getDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(uri);
  }

  private mapSeverity(severity: TemplateLinterDiagnosticSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
      case TemplateLinterDiagnosticSeverity.Error:
        return vscode.DiagnosticSeverity.Error;
      case TemplateLinterDiagnosticSeverity.Information:
        return vscode.DiagnosticSeverity.Information;
      case TemplateLinterDiagnosticSeverity.Hint:
        return vscode.DiagnosticSeverity.Hint;
      case TemplateLinterDiagnosticSeverity.Warning:
      default:
        return vscode.DiagnosticSeverity.Warning;
    }
  }

  protected override createDiagnotic(
    doc: vscode.TextDocument,
    mesg: string,
    code: string,
    location: JsonNode | undefined,
    severity: TemplateLinterDiagnosticSeverity,
    args: Record<string, any> | undefined,
    relatedInformation: Array<{ node: JsonNode | undefined; doc: vscode.TextDocument; mesg: string }> | undefined
  ): AdxDiagnostic {
    // for nodes for string values, the node offset & length will include the outer double-quotes, so take those
    // off
    const rangeMod = location && location.type === 'string' ? 1 : 0;
    const range = location
      ? new vscode.Range(
          doc.positionAt(location.offset + rangeMod),
          doc.positionAt(location.offset + location.length - rangeMod)
        )
      : new vscode.Range(0, 0, 0, 0);
    const diagnostic = new AdxDiagnostic(range, mesg, this.mapSeverity(severity));
    diagnostic.source = LINTER_SOURCE_ID;
    diagnostic.code = code;
    // if a property node is sent in, we need to use its first child (the property name) to calculate the
    // json-path for the diagnostics
    if (location && location.type === 'property' && location.children && location.children[0].type === 'string') {
      diagnostic.jsonpath = jsonPathToString(getNodePath(location.children[0]));
    } else {
      diagnostic.jsonpath = location ? jsonPathToString(getNodePath(location)) : '';
    }
    diagnostic.args = args;

    if (relatedInformation) {
      diagnostic.relatedInformation = relatedInformation
        .map(
          ({ doc, node, mesg }) =>
            new vscode.DiagnosticRelatedInformation(
              new vscode.Location(doc.uri, node ? rangeForNode(node, doc) : new vscode.Position(0, 0)),
              mesg
            )
        )
        .sort((d1, d2) => d1.location.range.start.line - d2.location.range.start.line);
    }
    return diagnostic;
  }
}

export class TemplateLinterManager extends Disposable {
  // https://www.humanbenchmark.com/tests/reactiontime/statistics,
  // plus the linting on vscode extension package.json's is using 300ms
  // (https://github.com/microsoft/vscode/blob/main/extensions/extension-editing/src/extensionLinter.ts)
  public static readonly LINT_DEBOUNCE_MS = 300;

  private diagnosticCollection = new UriExistsDiagnosticCollection(
    vscode.languages.createDiagnosticCollection('analyticsdx-templates')
  );

  private timer: NodeJS.Timer | undefined;
  private _isLinting = false;
  private templateInfoQueue = new Set<vscode.TextDocument>();

  private readonly logger: Logger;

  /** Constructor.
   * @param onParsedTemplateInfo callback for when we just parsed a template-info.js and are about to lint it.
   */
  constructor(
    private readonly onParsedTemplateInfo?: (doc: vscode.TextDocument, tree: JsonNode | undefined) => any,
    output?: vscode.OutputChannel
  ) {
    super();
    this.disposables.push(this.diagnosticCollection);
    this.logger = Logger.from(output);
  }

  public start(): this {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.checkDocForQueuing(doc)),
      vscode.workspace.onDidChangeTextDocument(event => this.checkDocForQueuing(event.document)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc))
    );
    // if a file in a template folder is added/deleted, relint the template
    const watcher = vscode.workspace.createFileSystemWatcher('**', false, true, false);
    watcher.onDidCreate(uri => this.uriCreated(uri));
    watcher.onDidDelete(uri => this.uriDeleted(uri));
    // TODO: do we need to listen to behind-the-scenes file edits, too?
    // Probably, since that would presumably be how we would catch if, say, a git pull brought in fixes to open templates
    this.disposables.push(watcher);

    vscode.workspace.textDocuments.forEach(doc => this.checkDocForQueuing(doc));
    return this;
  }

  /** Are we actively linting templates? */
  public get isLinting() {
    return this._isLinting;
  }

  /** Is this not actively linting and not planning to lint soon? */
  public get isQuiet() {
    return !this.isLinting && this.templateInfoQueue.size <= 0;
  }

  public dispose() {
    super.dispose();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = undefined;
    this.templateInfoQueue.forEach(doc => this.clearDoc(doc));
  }

  private async checkDocForQueuing(doc: vscode.TextDocument) {
    // if it's a template-info.json in the workspace, add to the lint queue
    if (uriBasename(doc.uri) === 'template-info.json' && vscode.workspace.getWorkspaceFolder(doc.uri)) {
      this.queueTemplateInfo(doc);
    } else {
      // if it's in or under a template folder, open that template-info.json and queue it up
      const templateInfoUri = await findTemplateInfoFileFor(doc.uri);
      if (templateInfoUri) {
        this.queueTemplateInfo(await vscode.workspace.openTextDocument(templateInfoUri));
      }
    }
  }

  private async uriCreated(uri: vscode.Uri) {
    const templateInfoUri = await findTemplateInfoFileFor(uri);
    if (templateInfoUri) {
      // REVIEWME: only relint if the template is already open?
      this.queueTemplateInfo(await vscode.workspace.openTextDocument(templateInfoUri));
    }
  }

  private async uriDeleted(uri: vscode.Uri) {
    // if a template-info.json was deleted, clear all of the diagnostics for it and all related files
    if (uriBasename(uri) === 'template-info.json' && vscode.workspace.getWorkspaceFolder(uri)) {
      this.unqueueTemplateInfo(uri);
      this.setAllTemplateDiagnostics(uriDirname(uri));
    } else {
      // if a file under a template folder was deleted, relint the template
      const templateInfoUri = await findTemplateInfoFileFor(uri);
      if (templateInfoUri) {
        // REVIEWME: only relint if the template is already open?
        this.queueTemplateInfo(await vscode.workspace.openTextDocument(templateInfoUri));
      } else {
        // otherwise, it could be that the parent of a template folder (or higher) was deleted, so clear all the
        // diagnostics of any file under the delete uri
        this.unqueueTemplateInfosUnder(uri);
        clearDiagnosticsUnder(this.diagnosticCollection, uri);
      }
    }
  }

  private queueTemplateInfo(doc: vscode.TextDocument) {
    this.templateInfoQueue.add(doc);
    this.startTimer();
  }

  private unqueueTemplateInfo(uri: vscode.Uri) {
    this.templateInfoQueue.forEach(doc => {
      if (uri.toString() === doc.uri.toString()) {
        this.templateInfoQueue.delete(doc);
      }
    });
  }

  private unqueueTemplateInfosUnder(uri: vscode.Uri) {
    this.templateInfoQueue.forEach(doc => {
      if (isUriAtOrUnder(uri, doc.uri)) {
        this.templateInfoQueue.delete(doc);
      }
    });
  }

  private closed(doc: vscode.TextDocument) {
    this.clearDoc(doc);
  }

  private clearDoc(doc: vscode.TextDocument) {
    // TODO: we need to figure a better way to show/add diagnostics, tied to when the editor is shown/closed
    this.diagnosticCollection.delete(doc.uri);
    this.templateInfoQueue.delete(doc);
  }

  /** Update (or clear) all diagnostics for all files in a template directory.
   */
  private setAllTemplateDiagnostics(dir: vscode.Uri, diagnostics?: Map<vscode.TextDocument, vscode.Diagnostic[]>) {
    // REVIEWME: do an immediate set here instead if we have diagnostics for that file in the map?
    // go through the current diagnostics and clear any diagnostics under that dir
    clearDiagnosticsUnder(this.diagnosticCollection, dir);

    if (diagnostics) {
      diagnostics.forEach((diagnostics, file) => {
        this.diagnosticCollection.set(file.uri, diagnostics);
      });
    }
  }

  private startTimer() {
    // debounce -- this will make it so linting runs after the user stops typing
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      // TODO: need to queue up another startTimer() until this.lint()'s return promise is finished, toa avoid
      // starting another lint while this line is running.
      this.timer = undefined;
      this.lint().catch(console.error);
    }, TemplateLinterManager.LINT_DEBOUNCE_MS);
  }

  /** Run against the current queue of template-info documents awaiting linting. */
  private lint() {
    this._isLinting = true;
    try {
      let all = Promise.resolve();
      this.templateInfoQueue.forEach(doc => {
        this.templateInfoQueue.delete(doc);
        try {
          const hrstart = process.hrtime();
          const result = this.lintTemplateInfo(doc);
          if (!result) {
            // delete any diagnostics for any files under that templateInfo dir
            this.setAllTemplateDiagnostics(uriDirname(doc.uri));
          } else {
            const p = result
              .then(linter => this.setAllTemplateDiagnostics(linter.dir, linter.diagnostics))
              .catch(console.error)
              .finally(() => {
                const hrend = process.hrtime(hrstart);
                this.logger.log(`Finished lint of ${doc.uri.toString()} in ${hrend[0]}s. ${hrend[1] / 1000000}ms.`);
              });
            all = all.then(() => p);
          }
        } catch (e) {
          console.debug('Failed to lint ' + doc.uri.toString(), e);
          this.setAllTemplateDiagnostics(doc.uri);
        }
      });
      // reset isLinting when all the linting is done
      return all.finally(() => (this._isLinting = false));
    } catch (e) {
      // if we get an error here (which we shouldn't), then the promise didn't get the .finally() to reset isLinting,
      // so just do it now
      this._isLinting = false;
      throw e;
    }
  }

  private lintTemplateInfo(doc: vscode.TextDocument): undefined | Promise<VscodeTemplateLinter> {
    if (doc.isClosed) {
      if (this.onParsedTemplateInfo) {
        this.onParsedTemplateInfo(doc, undefined);
      }
      return undefined;
    }
    const linter = new VscodeTemplateLinter(doc);
    if (this.onParsedTemplateInfo) {
      linter.onParsedTemplateInfo(this.onParsedTemplateInfo);
    }
    return linter.lint();
  }
}
