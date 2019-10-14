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
import { rangeForNode, uriStat } from './util/vscodeUtils';

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

export class TemplateLinter extends Disposable {
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

  public start(): TemplateLinter {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.opened(doc)),
      vscode.workspace.onDidChangeTextDocument(event => this.queue(event.document)),
      vscode.workspace.onDidCloseTextDocument(doc => this.closed(doc))
    );
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
    const basename = path.basename(doc.uri.path);
    if (basename === 'template-info.json') {
      this.queue(doc);
    } else {
      const templateInfoUri = await findTemplateInfoFileFor(doc.uri);
      if (templateInfoUri) {
        // this should trigger our listener above to call opened() to queue up the template-info.json
        await vscode.workspace.openTextDocument(templateInfoUri);
        // TODO: hookup linting for the file actually passed in
      }
    }
  }

  private queue(doc: vscode.TextDocument) {
    if (path.basename(doc.uri.path) === 'template-info.json') {
      this.templateInfoQueue.add(doc);
      this.startTimer();
    }
  }

  private closed(doc: vscode.TextDocument) {
    this.clearDoc(doc);
  }

  private clearDoc(doc: vscode.TextDocument) {
    this.diagnosticsCollection.delete(doc.uri);
    this.templateInfoQueue.delete(doc);
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
    }, TemplateLinter.LINT_DEBOUNCE_MS);
  }

  /** Run against the current queue of documents awaiting linting. */
  private async lint() {
    await this.lintTemplateInfoQueue();
  }

  private lintTemplateInfoQueue() {
    let all = Promise.resolve();
    this.templateInfoQueue.forEach(doc => {
      this.templateInfoQueue.delete(doc);
      try {
        const result = this.lintTemplateInfo(doc);
        if (!result) {
          this.diagnosticsCollection.delete(doc.uri);
        } else {
          const p = result
            .then(diagnostics => this.diagnosticsCollection.set(doc.uri, diagnostics))
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

  private lintTemplateInfo(doc: vscode.TextDocument): undefined | Promise<vscode.Diagnostic[] | undefined> {
    if (doc.isClosed) {
      if (this.onParsedTemplateInfo) {
        this.onParsedTemplateInfo(doc, undefined);
      }
      return undefined;
    }

    const tree = parseTree(doc.getText());
    if (this.onParsedTemplateInfo) {
      this.onParsedTemplateInfo(doc, tree);
    }
    if (!tree) {
      // empty or completely bad file, json-schema will report errors
      return undefined;
    }
    const diagnostics: vscode.Diagnostic[] = [];
    // TODO: consider doing this via a visit down the tree, rather than searching mulitple times
    return Promise.all([
      this.lintTemplateInfoMinimumObjects(doc, diagnostics, tree),
      // make sure each place that can have a relative path to a file has a valid one
      // TODO: warn if they put the same relPath in twice in 2 different fields?
      ...TEMPLATE_INFO.allRelFilePathLocationPatterns.map(path => this.lintRelFilePath(doc, diagnostics, tree, path))
    ]).then(v => diagnostics);
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
