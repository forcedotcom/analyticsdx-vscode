/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, getNodePath, JSONPath, Node as JsonNode, parseTree, Segment } from 'jsonc-parser';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { TEMPLATE_INFO } from './constants';
import { Disposable } from './util/disposable';
import { jsonPathToString, matchJsonNodeAtPattern, matchJsonNodesAtPattern } from './util/jsoncUtils';
import { Logger } from './util/logger';
import { findTemplateInfoFileFor } from './util/templateUtils';
import { fuzzySearcher, isValidRelpath } from './util/utils';
import {
  clearDiagnosticsUnder,
  isUriAtOrUnder,
  rangeForNode,
  uriBasename,
  uriDirname,
  UriExistsDiagnosticCollection,
  uriRelPath,
  uriStat
} from './util/vscodeUtils';

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

type JsonCacheValue = { readonly doc: vscode.TextDocument | undefined; readonly json: JsonNode | undefined };

/** An object that can lint a template folder.
 * This currently does full lint only (no incremental) -- a second call to lint() will clear out any saved state
 * and rerun a lint.
 */
export class TemplateLinter {
  private static readonly VALID_REGEX_OPTIONS = /^[gimsuy]+$/;

  /** This will be called after each json parse of a template-info.json file, but before any linting takes place. */
  public onParsedTemplateInfo: ((doc: vscode.TextDocument, tree: JsonNode | undefined) => any) | undefined;

  /** The set of diagnostics found from the last call to lint() */
  public readonly diagnostics = new Map<vscode.TextDocument, vscode.Diagnostic[]>();

  // cache parsed json keyed on relative path, per call to lint().
  private readonly jsonCache = new Map<string, JsonCacheValue>();

  constructor(
    public readonly templateInfoDoc: vscode.TextDocument,
    public readonly dir: vscode.Uri = uriDirname(templateInfoDoc.uri)
  ) {}

  private getTemplateRelFilePath(dir: vscode.Uri, templateInfo: JsonNode, jsonpathOrNode: JSONPath | JsonNode) {
    const n = Array.isArray(jsonpathOrNode) ? findNodeAtLocation(templateInfo, jsonpathOrNode) : jsonpathOrNode;
    if (n && n.type === 'string') {
      const relpath = n.value as string;
      if (isValidRelpath(relpath)) {
        return relpath;
      }
    }
    return undefined;
  }

  /** Open the text document for the value of the specified field and parse it, with caching.
   */
  private async loadTemplateRelPathJson(
    templateInfo: JsonNode,
    jsonpathOrNode: JSONPath | JsonNode
  ): Promise<JsonCacheValue> {
    const relpath = this.getTemplateRelFilePath(this.dir, templateInfo, jsonpathOrNode);
    if (relpath) {
      let cacheValue = this.jsonCache.get(relpath);
      if (!cacheValue) {
        let doc: vscode.TextDocument | undefined;
        let json: JsonNode | undefined;
        const uri = uriRelPath(this.dir, relpath);
        try {
          doc = await vscode.workspace.openTextDocument(uri);
          if (doc) {
            json = parseTree(doc.getText());
          }
        } catch (e) {
          // this can happen if the file doesn't exist or can't be opened, but lintRelFilePath should warn on that alraedy
        }
        cacheValue = { doc, json };
        this.jsonCache.set(relpath, cacheValue);
      }
      return cacheValue;
    }
    return { doc: undefined, json: undefined };
  }

  private addDiagnostic(
    doc: vscode.TextDocument,
    mesg: string,
    location?: JsonNode,
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

    const diagnostics = this.diagnostics.get(doc);
    if (diagnostics) {
      diagnostics.push(diagnostic);
    } else {
      this.diagnostics.set(doc, [diagnostic]);
    }
    return diagnostic;
  }

  /** Finds if non-unique values are found amongst the string values for a jsonpath.
   * @param doc the document
   * @param tree the json structure of the document
   * @param jsonpath the path to the value nodes in the json
   * @param message the message for a diagnostic for each duplicate value node, can be a string or function
   * @param relatedMessage if specified, relatedInformation for each other found value will be added to the diagnostics,
   *        with this message
   */
  private lintUniqueValues(
    doc: vscode.TextDocument,
    tree: JsonNode,
    jsonpath: JSONPath,
    message: string | ((value: string) => string),
    relatedMessage?: string | ((value: string) => string)
  ) {
    // value -> list of nodes w/ that value
    const values = matchJsonNodesAtPattern(tree, jsonpath).reduce((values, node) => {
      if (node.type === 'string' && typeof node.value === 'string' && node.value) {
        const nodes = values.get(node.value) || [];
        nodes.push(node);
        values.set(node.value, nodes);
      }
      return values;
    }, new Map<string, JsonNode[]>());

    values.forEach((nodes, value) => {
      if (nodes.length > 1) {
        nodes.forEach(node => {
          const diagnostic = this.addDiagnostic(doc, typeof message === 'string' ? message : message(value), node);
          // create related information for the other locations
          if (relatedMessage) {
            diagnostic.relatedInformation = nodes
              .filter(other => other !== node)
              .map(
                other =>
                  new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(doc.uri, rangeForNode(other, doc)),
                    typeof relatedMessage === 'string' ? relatedMessage : relatedMessage(value)
                  )
              );
          }
        });
      }
    });
  }

  // TODO: figure out how to do incremental linting (or if we even should)
  // Currently, this and #opened() always starts with the template-info.json at-or-above the modified file, and then
  // does a full lint of the whole template folder, which ends up parsing the template-info and every related file to
  // run the validations against.
  // We could probably look at the file(s) actually modified and calculate what other files are potentially affected
  // by that file, and then only parse those and validate those things.
  /** Run a lint, saving the results in this object. */
  public async lint(): Promise<this> {
    this.diagnostics.clear();
    this.jsonCache.clear();

    const tree = parseTree(this.templateInfoDoc.getText());
    if (this.onParsedTemplateInfo) {
      try {
        this.onParsedTemplateInfo(this.templateInfoDoc, tree);
      } catch (e) {
        console.error('TemplateLinter.onParsedTemplateInfo() callback failed', e);
      }
    }

    if (tree) {
      await Promise.all([
        this.lintTemplateInfo(this.templateInfoDoc, tree),
        this.lintVariables(tree),
        this.lintUi(tree),
        this.lintRules(tree)
      ]);
    }
    return this;
  }

  private async lintTemplateInfo(doc: vscode.TextDocument, tree: JsonNode): Promise<void> {
    // TODO: consider doing this via a visit down the tree, rather than searching mulitple times
    await Promise.all([
      this.lintTemplateInfoMinimumObjects(this.templateInfoDoc, tree),
      // make sure each place that can have a relative path to a file has a valid one
      // TODO: warn if they put the same relPath in twice in 2 different fields?
      ...TEMPLATE_INFO.allRelFilePathLocationPatterns.map(path =>
        this.lintRelFilePath(this.templateInfoDoc, tree, path)
      )
    ]);
  }

  private lintTemplateInfoMinimumObjects(doc: vscode.TextDocument, tree: JsonNode) {
    const [templateType, templateTypeNode] = findJsonPrimitiveAttributeValue(tree, 'templateType');
    // do the check if templateType is not specified or is a string; if it's anythigng else, the json-schema should
    // show a warning
    if (!templateTypeNode || (templateType && typeof templateType === 'string')) {
      switch (templateType ? templateType.toLocaleLowerCase() : 'app') {
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
            const diagnostic = this.addDiagnostic(
              doc,
              'App templates must have at least 1 dashboard, dataflow, or dataset specified',
              // put the warning on the "templateType": "app" property
              templateTypeNode && templateTypeNode.parent
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
            this.addDiagnostic(
              doc,
              'Dashboard templates must have exactly 1 dashboard specified',
              // put it on the "dashboards" array, or the "templateType": "..." property, if either available
              dashboards || (templateTypeNode && templateTypeNode.parent)
            );
          }
          break;
        }
        // REVIEWME: do Lens templates require anything?
      }
    }
  }

  private lintRelFilePath(doc: vscode.TextDocument, tree: JsonNode, patterns: Segment[]): Promise<void> {
    const nodes = matchJsonNodesAtPattern(tree, patterns);
    let all = Promise.resolve();
    nodes.forEach(n => {
      // the json schema should handle if the node is not a string value
      if (n && n.type === 'string') {
        const relPath = (n.value as string) || '';
        if (!relPath || relPath.startsWith('/') || relPath.startsWith('../')) {
          this.addDiagnostic(doc, 'Value should be a path relative to this file', n);
        } else if (relPath.includes('/../') || relPath.endsWith('/..')) {
          this.addDiagnostic(doc, "Path should not contain '..' parts", n);
        } else {
          const uri = doc.uri.with({ path: path.join(path.dirname(doc.uri.path), relPath) });
          const p = uriStat(uri)
            .then(stat => {
              if (!stat) {
                this.addDiagnostic(doc, 'Specified file does not exist in workspace', n);
              } else if ((stat.type & vscode.FileType.File) === 0) {
                this.addDiagnostic(doc, 'Specified path is not a file', n);
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

  private async lintVariables(templateInfo: JsonNode): Promise<void> {
    const { doc, json: variables } = await this.loadTemplateRelPathJson(templateInfo, ['variableDefinition']);
    if (doc && variables) {
      this.lintVariablesExcludes(doc, variables);
      // TODO: other lints on variables
    }
  }

  private lintVariablesExcludes(variablesDoc: vscode.TextDocument, tree: JsonNode) {
    // In a variable.excludes, you can have any number of string literals and/or a max of one '/regex/[options]'
    // string. At runtime in the Studio UI, the regex string is extracted directly (no way to quote forward-slash) and
    // passed into `new RegExp(regex, options)`. The options are optional.
    // this can ignore any fields in the json that aren't the right type -- the schema validation should report that
    matchJsonNodesAtPattern(tree, ['*', 'excludes']).forEach(excludesNode => {
      if (excludesNode.type === 'array' && excludesNode.children && excludesNode.children.length > 0) {
        // keep track of how many regex excludes we find in this variable
        const regexes = [] as JsonNode[];
        excludesNode.children.forEach(excludeNode => {
          if (excludeNode.type === 'string') {
            const str = excludeNode.value as string;
            // it's a regex, so verify it
            if (str && str.startsWith('/')) {
              regexes.push(excludeNode);
              if (str.length === 1) {
                // if it's just a /, then it's missing a closing / and it's an empty regex
                this.addDiagnostic(variablesDoc, 'Missing closing / for regular expression', excludeNode);
              } else {
                const lastIndex = str.lastIndexOf('/');
                let pattern: string | undefined;
                let options: string | undefined;
                // this means there's no closing /
                if (lastIndex < 1) {
                  this.addDiagnostic(variablesDoc, 'Missing closing / for regular expression', excludeNode);
                  // still try to parse the regex text that's there
                  pattern = str.substring(1);
                } else {
                  // otherwise, it's a valid /pattern/[options] string
                  pattern = str.substring(1, lastIndex);
                  options = lastIndex + 1 < str.length ? str.substring(lastIndex + 1) : undefined;
                }

                // check the options
                if (options && options.length) {
                  if (!TemplateLinter.VALID_REGEX_OPTIONS.test(options)) {
                    this.addDiagnostic(variablesDoc, 'Invalid regular expression options', excludeNode);
                    // clear it out to still test the regex text
                    options = undefined;
                  } else if (/(.).*\1/.test(options)) {
                    this.addDiagnostic(variablesDoc, 'Duplicate option in regular expression options', excludeNode);
                    // clear it out to still test the regex text
                    options = undefined;
                  }
                }

                // check the regex pattern text
                try {
                  // tslint:disable-next-line: no-unused-expression
                  new RegExp(pattern, options);
                } catch (e) {
                  // Electron tends to throw SyntaxErrors w/ a message of 'Invalid regular expresion:...', so be sure
                  // to nicely handle that to avoid double-text in the diagnostic
                  let mesg: string = 'Invalid regular expression';
                  // pull an error message from the error
                  const errorMesg = e instanceof Error ? e.message : typeof e === 'string' ? e : undefined;
                  if (errorMesg && errorMesg.length > 0) {
                    // if the error message already starts with our default message, just use the error message
                    if (errorMesg.toLocaleLowerCase().startsWith(mesg.toLocaleLowerCase())) {
                      mesg = errorMesg;
                    } else {
                      // otherwise, append the error message
                      mesg += ': ' + errorMesg;
                    }
                  }
                  this.addDiagnostic(variablesDoc, mesg, excludeNode);
                }
              }
            }
          }
        });
        if (regexes.length > 1) {
          const diagnostic = this.addDiagnostic(
            variablesDoc,
            'Multiple regular expression excludes found, only the first will be used',
            // try to put the warning on the "excludes" part of the whole exclude property, otherwise just put it on
            // the excludes array
            (excludesNode.parent &&
              excludesNode.parent.type === 'property' &&
              excludesNode.parent.children &&
              excludesNode.parent.children[0]) ||
              excludesNode
          );
          // add DiagnosticRelatedInformation's for the excludeNode's that have regex's
          diagnostic.relatedInformation = regexes
            .map(
              node =>
                new vscode.DiagnosticRelatedInformation(
                  new vscode.Location(variablesDoc.uri, rangeForNode(node, variablesDoc, false)),
                  'Regular expression exclude'
                )
            )
            .sort((d1, d2) => d1.location.range.start.line - d2.location.range.start.line);
        }
      }
    });
  }

  private async lintUi(templateInfo: JsonNode) {
    const { doc, json: ui } = await this.loadTemplateRelPathJson(templateInfo, ['uiDefinition']);
    if (doc && ui) {
      this.lintUiVariablesSpecifiedForPages(doc, ui);
      await this.lintUiVariablesExistInVariables(templateInfo, doc, ui);
      // TODO: other lints on uiDefinition
    }
  }

  private lintUiVariablesSpecifiedForPages(doc: vscode.TextDocument, ui: JsonNode) {
    findNodeAtLocation(ui, ['pages'])?.children?.forEach(page => {
      // if it's not a vfPage
      if (!findNodeAtLocation(page, ['vfPage'])) {
        const variables = findNodeAtLocation(page, ['variables']);
        if (!variables) {
          this.addDiagnostic(doc, 'Either variables or vfPage must be specified', page);
        } else if (variables.type === 'array' && (!variables.children || variables.children.length <= 0)) {
          this.addDiagnostic(doc, 'At least 1 variable or vfPage must be specified', variables);
        }
        // if variables is defined as something other than an array, the json schema should warn on that
      }
    });
  }

  private async lintUiVariablesExistInVariables(templateInfo: JsonNode, doc: vscode.TextDocument, ui: JsonNode) {
    // find all the variable names in the variables file
    const { json: varJson } = await this.loadTemplateRelPathJson(templateInfo, ['variableDefinition']);
    const variableNames = new Set<string>();
    if (varJson && varJson.type === 'object' && varJson.children && varJson.children.length > 0) {
      varJson.children.forEach(prop => {
        if (
          prop.type === 'property' &&
          prop.children &&
          prop.children[0] &&
          prop.children[0].type === 'string' &&
          prop.children[0].value
        ) {
          variableNames.add(prop.children[0].value as string);
        }
      });
    }
    const pages = findNodeAtLocation(ui, ['pages']);
    if (pages && pages.type === 'array' && pages.children && pages.children.length > 0) {
      const fuzzySearch = fuzzySearcher(variableNames);
      // find all the variable objects
      matchJsonNodesAtPattern(pages.children, ['variables', '*', 'name']).forEach(nameNode => {
        if (nameNode && nameNode.type === 'string' && nameNode.value) {
          const name = nameNode.value as string;
          if (!variableNames.has(name)) {
            let mesg = `Cannot find variable '${name}'`;
            // see if there's a variable w/ a similar name
            const [match] = fuzzySearch(name);
            if (match && match.length > 0) {
              mesg += `, did you mean '${match}'?`;
            }
            this.addDiagnostic(doc, mesg, nameNode);
          }
        }
      });
    }
  }

  private async lintRules(templateInfo: JsonNode): Promise<void> {
    // find all the json nodes that point to rel-path rules files
    const nodes = matchJsonNodesAtPattern(templateInfo, ['rules', '*', 'file']).filter(n => n.type === 'string');
    const ruleDef = findNodeAtLocation(templateInfo, ['ruleDefinition']);
    if (ruleDef?.type === 'string') {
      nodes.push(ruleDef);
    }
    let all: Promise<void> = Promise.resolve(undefined);
    nodes.forEach(node => {
      const p = this.loadTemplateRelPathJson(templateInfo, node)
        .then(({ doc, json: rules }) => {
          if (doc && rules) {
            return this.lintRulesFile(doc, rules);
          } else {
            // the rel-path lint should already warn about bad/missing file
            return Promise.resolve();
          }
        })
        .catch(er => {
          console.error(er);
          // don't stop the whole lint on this
          return Promise.resolve();
        });
      all = all.then(v => p);
    });
    return all;
  }

  private lintRulesFile(doc: vscode.TextDocument, rules: JsonNode) {
    // make sure the constants' names are unique
    this.lintUniqueValues(
      doc,
      rules,
      ['constants', '*', 'name'],
      name => `Duplicate constant '${name}'`,
      'Other usage'
    );
    // make sure the rules' names are unique
    this.lintUniqueValues(doc, rules, ['rules', '*', 'name'], name => `Duplicate rule name '${name}'`, 'Other usage');
  }
}

export class TemplateLinterManager extends Disposable {
  // https://www.humanbenchmark.com/tests/reactiontime/statistics,
  // plus the linting on vscode extension package.json's is using 300ms
  // (https://github.com/microsoft/vscode/blob/master/extensions/extension-editing/src/extensionLinter.ts)
  private static readonly LINT_DEBOUNCE_MS = 300;

  private diagnosticCollection = new UriExistsDiagnosticCollection(
    vscode.languages.createDiagnosticCollection('analyticsdx-templates')
  );

  private timer: NodeJS.Timer | undefined;
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

  public dispose() {
    super.dispose();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = undefined;
    this.templateInfoQueue.forEach(doc => this.clearDoc(doc));
  }

  private async checkDocForQueuing(doc: vscode.TextDocument) {
    const basename = uriBasename(doc.uri);
    // if it's a template-info.json, add to the lint queue
    if (basename === 'template-info.json') {
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
    const templateInfoUri = uriBasename(uri) === 'template-info.json' ? uri : await findTemplateInfoFileFor(uri);
    if (templateInfoUri) {
      // REVIEWME: only relint if the template is already open?
      this.queueTemplateInfo(await vscode.workspace.openTextDocument(templateInfoUri));
    }
  }

  private async uriDeleted(uri: vscode.Uri) {
    // if a template-info.json was deleted, clear all of the diagnostics for it and all related files
    if (uriBasename(uri) === 'template-info.json') {
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
  private async lint() {
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
          all = all.then(v => p);
        }
      } catch (e) {
        console.debug('Failed to lint ' + doc.uri.toString(), e);
        this.setAllTemplateDiagnostics(doc.uri);
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
