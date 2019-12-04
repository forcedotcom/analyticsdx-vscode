/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getNodePath, JSONPath, Node as JsonNode, parseTree, Segment } from 'jsonc-parser';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { TEMPLATE_INFO } from './constants';
import { findTemplateInfoFileFor } from './templateEditing';
import { Disposable } from './util/disposable';
import { jsonPathToString, matchJsonNodeAtPattern, matchJsonNodesAtPattern } from './util/jsoncUtils';
import { isUriUnder, rangeForNode, uriBasename, uriDirname, uriStat } from './util/vscodeUtils';

/** Find the value for the first attribute found at the pattern.
 * @returns the value (string, boolean, number, or null), or undefined if not found or found node's value is not
 *          a primitive (e.g. an array or object); and the attribute node.
 */
function findJsonPrimitiveAttributeValue(tree: JsonNode, ...pattern: JSONPath): [any, JsonNode | undefined] {
  const node = matchJsonNodeAtPattern(tree, pattern);
  return node && (node.type === 'string' || node.type === 'boolean' || node.type === 'number' || node.type === 'null')
    ? [node.value, node]
    : [undefined, node];
}

/** Find an array attribute at the specified pattern and returns the array nodes.
 * @return the array nodes, or undefined if not found or found node value is not an array; and the attribute node.
 */
function findJsonArrayAttributeValue(
  tree: JsonNode,
  ...pattern: JSONPath
): [JsonNode[] | undefined, JsonNode | undefined] {
  const node = matchJsonNodeAtPattern(tree, pattern);
  return [node && node.type === 'array' ? node.children : undefined, node];
}

/** Find an array attribute at the specified pattern and return its the length of the array value.
 * @return the length  of the array, or -1 if not found or found node value is not an array; and the attribute node.
 */
function lengthJsonArrayAttributeValue(tree: JsonNode, ...pattern: JSONPath): [number, JsonNode | undefined] {
  const [nodes, node] = findJsonArrayAttributeValue(tree, ...pattern);
  return [nodes ? nodes.length : -1, node];
}

/** An object that can lint a template folder.
 * This currently does full lint only (no incremental) -- a second call to lint() will clear out any saved state
 * and rerun a lint.
 */
export class TemplateLinter {
  /** This will be called after each json parse of a template-info.json file, but before any linting takes place. */
  public onParsedTemplateInfo: ((doc: vscode.TextDocument, tree: JsonNode | undefined) => any) | undefined;

  /** The set of diagnostics found from the last call to lint() */
  public readonly diagnostics = new Map<vscode.TextDocument, vscode.Diagnostic[]>();

  constructor(
    public readonly templateInfoDoc: vscode.TextDocument,
    public readonly dir: vscode.Uri = uriDirname(templateInfoDoc.uri)
  ) {}

  // TODO: figure out how to do incremental linting (or if we even should)
  // Currently, this and #opened() always starts with the template-info.json at-or-above the modified file, and then
  // does a full lint of the whole template folder, which ends up parsing the template-info and every related file to
  // run the validations against.
  // We could probably look at the file(s) actually modified and calculate what other files are potentially affected
  // by that file, and then only parse those and validate those things.
  /** Run a lint, saving the results in this object. */
  public async lint(): Promise<this> {
    this.diagnostics.clear();
    const tree = parseTree(this.templateInfoDoc.getText());
    if (this.onParsedTemplateInfo) {
      try {
        this.onParsedTemplateInfo(this.templateInfoDoc, tree);
      } catch (e) {
        console.error('TemplateLinter.onParsedTemplateInfo() callback failed', e);
      }
    }

    if (tree) {
      await this.lintTemplateInfo(this.templateInfoDoc, tree);
    }
    return this;
  }

  private async lintTemplateInfo(doc: vscode.TextDocument, tree: JsonNode): Promise<void> {
    const diagnostics: vscode.Diagnostic[] = [];
    this.diagnostics.set(this.templateInfoDoc, diagnostics);
    // TODO: consider doing this via a visit down the tree, rather than searching mulitple times
    await Promise.all([
      this.lintTemplateInfoMinimumObjects(this.templateInfoDoc, diagnostics, tree),
      // make sure each place that can have a relative path to a file has a valid one
      // TODO: warn if they put the same relPath in twice in 2 different fields?
      ...TEMPLATE_INFO.allRelFilePathLocationPatterns.map(path =>
        this.lintRelFilePath(this.templateInfoDoc, diagnostics, tree, path)
      )
    ]);
  }

  private lintTemplateInfoMinimumObjects(doc: vscode.TextDocument, diagnostics: vscode.Diagnostic[], tree: JsonNode) {
    const [templateType, templateTypeNode] = findJsonPrimitiveAttributeValue(tree, 'templateType');
    // the json-schema should report the error if templateType is missing or not a string or not a valid value
    if (templateType && typeof templateType === 'string') {
      switch (templateType.toLocaleLowerCase()) {
        case 'app':
        case 'embeddedapp': {
          // for app templates, it needs to have at least 1 dashboard, dataset, or dataflow specified,
          // so accumulate the total of each (handling the -1 meaning no node) and the property nodes for each
          // empty array field
          const { count, nodes } = [
            { data: lengthJsonArrayAttributeValue(tree, 'dashboards'), name: 'dashboards' },
            { data: lengthJsonArrayAttributeValue(tree, 'datasetFiles'), name: 'datasets' },
            { data: lengthJsonArrayAttributeValue(tree, 'eltDataflows'), name: 'dataflows' }
          ].reduce(
            (all, { data, name }) => {
              if (data[0] > 0) {
                all.count += data[0];
              }
              // node.parent should be the property node, (e.g. '"dashboards": []')
              if (data[1] && data[1].parent) {
                all.nodes.push([data[1].parent, name]);
              }
              return all;
            },
            { count: 0, nodes: [] as Array<[JsonNode, string]> }
          );
          if (count <= 0) {
            const diagnostic = this.createDiagnostic(
              doc,
              'App templates must have at least 1 dashboard, dataflow, or dataset specified',
              // put the warning on the "templateType": "app" property
              templateTypeNode && templateTypeNode.parent,
              diagnostics
            );
            // add a related warning on each empty array property node
            if (nodes.length > 0) {
              diagnostic.relatedInformation = nodes
                .map(
                  ([node, name]) =>
                    new vscode.DiagnosticRelatedInformation(
                      new vscode.Location(doc.uri, rangeForNode(node, doc, false)),
                      `Empty ${name} array`
                    )
                )
                .sort((d1, d2) => d1.location.range.start.line - d2.location.range.start.line);
            }
          }
          break;
        }
        case 'dashboard': {
          // for dashboard templates, there needs to exactly 1 dashboard specified
          const [len, dashboards] = lengthJsonArrayAttributeValue(tree, 'dashboards');
          if (len !== 1) {
            this.createDiagnostic(
              doc,
              'Dashboard templates must have exactly 1 dashboard specified',
              // put it on the "dashboards" array, or the "templateType": "..." property, if either available
              dashboards || (templateTypeNode && templateTypeNode.parent),
              diagnostics
            );
          }
          break;
        }
        // REVIEWME: do Lens templates require anything?
      }
    }
  }

  private async lintRelFilePath(
    doc: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[],
    tree: JsonNode,
    patterns: Segment[]
  ): Promise<void> {
    const nodes = matchJsonNodesAtPattern(tree, patterns);
    let all = Promise.resolve();
    nodes.forEach(n => {
      // the json schema should handle if the node is not a string value
      if (n && n.type === 'string') {
        const relPath = (n.value as string) || '';
        if (!relPath || (relPath.startsWith('/') || relPath.startsWith('../'))) {
          this.createDiagnostic(doc, 'Value should be a path relative to this file', n, diagnostics);
        } else if (relPath.includes('/../') || relPath.endsWith('/..')) {
          this.createDiagnostic(doc, "Path should not contain '..' parts", n, diagnostics);
        } else {
          const uri = doc.uri.with({ path: path.join(path.dirname(doc.uri.path), relPath) });
          const p = uriStat(uri)
            .then(stat => {
              if (!stat) {
                this.createDiagnostic(doc, 'Specified file does not exist in workspace', n, diagnostics);
              } else if ((stat.type & vscode.FileType.File) === 0) {
                this.createDiagnostic(doc, 'Specified path is not a file', n, diagnostics);
              }
            })
            .catch(er => {
              console.error(er);
              // don't stop the whole lint if the check errors
              return Promise.resolve();
            });
          all = all.then(v => p);
        }
      }
    });
    return all;
  }

  private createDiagnostic(
    doc: vscode.TextDocument,
    mesg: string,
    location?: JsonNode,
    diagnostics?: vscode.Diagnostic[],
    severity = vscode.DiagnosticSeverity.Warning
  ) {
    // for nodes for string values, the node offset & length will include the outer double-quotes, so take those
    // off
    const rangeMod = location && location.type === 'string' ? 1 : 0;
    const range = location
      ? new vscode.Range(
          doc.positionAt(location.offset + rangeMod),
          doc.positionAt(location.offset + location.length - rangeMod)
        )
      : new vscode.Range(0, 0, 0, 0);
    const diagnostic = new vscode.Diagnostic(range, mesg, severity);
    // if a property node is sent in, we need to use its first child (the property name) to calculate the
    // json-path for the diagnostics
    if (location && location.type === 'property' && location.children && location.children[0].type === 'string') {
      diagnostic.code = jsonPathToString(getNodePath(location.children[0]));
    } else {
      diagnostic.code = location ? jsonPathToString(getNodePath(location)) : '';
    }
    if (diagnostics) {
      diagnostics.push(diagnostic);
    }
    return diagnostic;
  }
}
export class TemplateLinterManager extends Disposable {
  // https://www.humanbenchmark.com/tests/reactiontime/statistics,
  // plus the linting on vscode extension package.json's is using 300ms
  // (https://github.com/microsoft/vscode/blob/master/extensions/extension-editing/src/extensionLinter.ts)
  private static readonly LINT_DEBOUNCE_MS = 300;

  private diagnosticsCollection = vscode.languages.createDiagnosticCollection('analyticsdx-templates');

  private timer: NodeJS.Timer | undefined;
  private templateInfoQueue = new Set<vscode.TextDocument>();

  /** Constructor.
   * @param onParsedTemplateInfo callback for when we just parsed a template-info.js and are about to lint it.
   */
  constructor(private readonly onParsedTemplateInfo?: (doc: vscode.TextDocument, tree: JsonNode | undefined) => any) {
    super();
    this.disposables.push(this.diagnosticsCollection);
  }

  public start(): TemplateLinterManager {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.opened(doc)),
      vscode.workspace.onDidChangeTextDocument(event => this.queue(event.document)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc))
    );
    // TODO: if a file in a template folder is added/deleted, relint the template
    vscode.workspace.textDocuments.forEach(doc => this.opened(doc));
    return this;
  }

  public dispose() {
    super.dispose();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = undefined;
    this.templateInfoQueue.forEach(doc => this.clearDoc(doc));
  }

  private async opened(doc: vscode.TextDocument) {
    const basename = uriBasename(doc.uri);
    if (basename === 'template-info.json') {
      this.queue(doc);
    } else {
      const templateInfoUri = await findTemplateInfoFileFor(doc.uri);
      if (templateInfoUri) {
        // this should trigger our listener above to call opened() to queue up the template-info.json
        await vscode.workspace.openTextDocument(templateInfoUri);
      }
    }
  }

  private queue(doc: vscode.TextDocument) {
    if (uriBasename(doc.uri) === 'template-info.json') {
      this.templateInfoQueue.add(doc);
      this.startTimer();
    }
  }

  private closed(doc: vscode.TextDocument) {
    this.clearDoc(doc);
  }

  private clearDoc(doc: vscode.TextDocument) {
    // TODO: we need to figure a better way to show/add diagnostics, tied to when the editor is shown/closed
    this.diagnosticsCollection.delete(doc.uri);
    this.templateInfoQueue.delete(doc);
  }

  /** Update (or clear) all diagnostics for all files in a template directory.
   */
  private setAllTemplateDiagnostics(dir: vscode.Uri, diagnostics?: Map<vscode.TextDocument, vscode.Diagnostic[]>) {
    // REVIEWME: do an immediate set here instead if we have diagnostics for that file in the map?
    // go through the current diagnostics and clear any diagnostics under that dir
    this.diagnosticsCollection.forEach(file => {
      if (isUriUnder(dir, file)) {
        this.diagnosticsCollection.delete(file);
      }
    });
    if (diagnostics) {
      diagnostics.forEach((diagnostics, file) => {
        this.diagnosticsCollection.set(file.uri, diagnostics);
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
  private async lint() {
    let all = Promise.resolve();
    this.templateInfoQueue.forEach(doc => {
      this.templateInfoQueue.delete(doc);
      try {
        const result = this.lintTemplateInfo(doc);
        if (!result) {
          // delete any diagnostics for any files under that templateInfo dir
          this.setAllTemplateDiagnostics(uriDirname(doc.uri));
        } else {
          const p = result
            .then(linter => this.setAllTemplateDiagnostics(linter.dir, linter.diagnostics))
            .catch(console.error);
          all = all.then(v => p);
        }
      } catch (e) {
        console.debug('Failed to lint ' + doc.uri.toString(), e);
        this.diagnosticsCollection.delete(doc.uri);
      }
    });
    return all;
  }

  private lintTemplateInfo(doc: vscode.TextDocument): undefined | Promise<TemplateLinter> {
    if (doc.isClosed) {
      if (this.onParsedTemplateInfo) {
        this.onParsedTemplateInfo(doc, undefined);
      }
      return undefined;
    }
    const linter = new TemplateLinter(doc);
    linter.onParsedTemplateInfo = this.onParsedTemplateInfo;
    return linter.lint();
  }
}
