/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, JSONPath, Node as JsonNode, parseTree } from 'jsonc-parser';
import { ERRORS, TEMPLATE_INFO } from './constants';
import {
  fuzzySearcher,
  isValidRelpath,
  isValidVariableName,
  matchJsonNodeAtPattern,
  matchJsonNodesAtPattern
} from './utils';

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

export type TemplateLinterUri = {
  toString(): string;
};

export type TemplateLinterDocument<Uri extends TemplateLinterUri> = {
  uri: Uri;
  getText(): Promise<string> | string;
};

export enum TemplateLinterDiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

type JsonCacheValue<Uri extends TemplateLinterUri, Document extends TemplateLinterDocument<Uri>> = {
  // uri will be set if the template-info field is set to a valid rel path (which may not exist or be valid json)
  readonly uri: Uri | undefined;
  // doc will set if the field's rel path can be opened
  readonly doc: Document | undefined;
  // json will set if the field rel path file contains json
  readonly json: JsonNode | undefined;
};

/** A base analytics template linter.
 * This currently does full lint only (no incremental) -- a second call to lint() will clear out any saved state
 * and rerun a lint.
 * This abstracts the details of the underlying file asset system to the generic types and the abstract methods.
 * Note: this does not directly do json schema based validation.
 */
export abstract class TemplateLinter<
  Uri extends TemplateLinterUri,
  Document extends TemplateLinterDocument<Uri>,
  Diagnostic
> {
  private static readonly VALID_REGEX_OPTIONS = /^[gimsuy]+$/;

  public readonly dir: Uri;

  /** The set of diagnostics found from the last call to lint() */
  public readonly diagnostics = new Map<Document, Diagnostic[]>();

  // the set of callback functions
  private readonly onParsedTemplateInfoCallbacks = [] as Array<
    (doc: Document, tree: JsonNode | undefined, linter: this) => Promise<void> | any
  >;

  // cache parsed json keyed on relative path, per call to lint().
  private readonly jsonCache = new Map<string, JsonCacheValue<Uri, Document>>();

  /** Cosntructor.
   * @param templateInfoDoc the document that is the template-info.json file of the template.
   * @param dir the template directory, defaults to the parent directory of templateInfoDoc if not specified.
   */
  constructor(public readonly templateInfoDoc: Document, dir?: Uri) {
    this.dir = dir || this.uriDirname(templateInfoDoc.uri);
  }

  /** Get the parent directory of the specified location. */
  protected abstract uriDirname(uri: Uri): Uri;

  /** Get the base file or directory name of the specified location. */
  protected abstract uriBasename(uri: Uri): string;

  /** Add the specified relative path to the directory and return that location. */
  protected abstract uriRelPath(dir: Uri, relpath: string): Uri;

  /** Tell if the specified location exists and is a file.
   * @return true if it's a file, false it's not a file, undefined if it doesn't exist.
   */
  protected abstract uriIsFile(uri: Uri): Promise<boolean | undefined>;

  /** Get the document for the specified location.
   * This should return the same object instance per Uri.
   * This should return a rejected promise if the document is not a file, cannot be opened, is invalid, etc.
   */
  protected abstract getDocument(uri: Uri): Promise<Document>;

  /** Construct a diagnostic object from the specified information. */
  protected abstract createDiagnotic(
    doc: Document,
    mesg: string,
    code: string,
    location: JsonNode | undefined,
    severity: TemplateLinterDiagnosticSeverity,
    args: Record<string, any> | undefined,
    relatedInformation: Array<{ node: JsonNode | undefined; doc: Document; mesg: string }> | undefined
  ): Diagnostic;

  public reset() {
    this.diagnostics.clear();
    this.jsonCache.clear();
  }

  /** Add a callback which will be invoked when `lint()` is called and the template-info.json document is parsed, before
   * any linting happens.
   */
  public onParsedTemplateInfo(c: (doc: Document, tree: JsonNode | undefined, linter: this) => Promise<void> | any) {
    if (this.onParsedTemplateInfoCallbacks.indexOf(c) < 0) {
      this.onParsedTemplateInfoCallbacks.push(c);
    }
    // REVIEWME: do we need to return an function which removes the callback?
    // Not needed for current usages, but maybe in the future
  }

  private async fireOnParsedTemplateInfo(templateInfoDoc: Document, tree: JsonNode | undefined): Promise<void> {
    const promises = [] as Array<Promise<void>>;
    for (const callback of this.onParsedTemplateInfoCallbacks) {
      if (callback) {
        const p = callback(templateInfoDoc, tree, this);
        if (p instanceof Promise) {
          promises.push(p);
        }
      }
    }
    await Promise.all(promises);
  }

  private getTemplateRelFilePath(dir: Uri, templateInfo: JsonNode, jsonpathOrNode: JSONPath | JsonNode) {
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
  protected async loadTemplateRelPathJson(
    templateInfo: JsonNode,
    jsonpathOrNode: JSONPath | JsonNode
  ): Promise<JsonCacheValue<Uri, Document>> {
    const relpath = this.getTemplateRelFilePath(this.dir, templateInfo, jsonpathOrNode);
    if (relpath) {
      let cacheValue = this.jsonCache.get(relpath);
      if (!cacheValue) {
        let doc: Document | undefined;
        let json: JsonNode | undefined;
        const uri = this.uriRelPath(this.dir, relpath);
        try {
          doc = await this.getDocument(uri);
          if (doc) {
            json = parseTree(await doc.getText());
          }
        } catch (e) {
          // this can happen if the file doesn't exist or can't be opened, but lintRelFilePath should warn on that alraedy
        }
        cacheValue = { doc, uri, json };
        this.jsonCache.set(relpath, cacheValue);
      }
      return cacheValue;
    }
    return { doc: undefined, uri: undefined, json: undefined };
  }

  /** Load the variableDefinition file and return a map of variableName -> variableType + isArray, or undefined if
   * variablesDefinition isn't specified or can't be read.
   */
  protected async loadVariableTypesForTemplate(
    templateInfo: JsonNode
  ): Promise<Record<string, { type: string; isArray: boolean }> | undefined> {
    const { json: varJson } = await this.loadTemplateRelPathJson(templateInfo, ['variableDefinition']);
    if (varJson && varJson.type === 'object' && varJson.children && varJson.children.length > 0) {
      const variableTypes: Record<string, { type: string; isArray: boolean }> = {};
      varJson.children.forEach(prop => {
        if (
          prop.type === 'property' &&
          prop.children &&
          // child[0] is the variable name, child[1] is the variable definition
          prop.children[0] &&
          prop.children[0].type === 'string' &&
          prop.children[0].value
        ) {
          const name = prop.children[0].value as string;
          const [type] = findJsonPrimitiveAttributeValue(prop.children[1], 'variableType', 'type');
          if (typeof type === 'string' && type.toLowerCase() === 'arraytype') {
            const [itemsType] = findJsonPrimitiveAttributeValue(prop.children[1], 'variableType', 'itemsType', 'type');
            variableTypes[name] = {
              type: typeof itemsType === 'string' && itemsType ? itemsType : 'StringType',
              isArray: true
            };
          } else {
            variableTypes[name] = { type: typeof type === 'string' && type ? type : 'StringType', isArray: false };
          }
        }
      });
      return variableTypes;
    }
  }

  private addDiagnostic(
    doc: Document,
    mesg: string,
    code: string,
    location?: JsonNode,
    {
      severity = TemplateLinterDiagnosticSeverity.Warning,
      args,
      relatedInformation
    }: {
      severity?: TemplateLinterDiagnosticSeverity;
      args?: Record<string, any>;
      relatedInformation?: Array<{ node: JsonNode | undefined; doc: Document; mesg: string }>;
    } = {}
  ) {
    const diagnostic = this.createDiagnotic(doc, mesg, code, location, severity, args, relatedInformation);

    // TODO: figure out something for equality on doc for non-vscode case
    const diagnostics = this.diagnostics.get(doc);
    if (diagnostics) {
      diagnostics.push(diagnostic);
    } else {
      this.diagnostics.set(doc, [diagnostic]);
    }
    return diagnostic;
  }

  /** Finds if non-unique values are found amongst the string values for a jsonpath(s).
   * @param source the doc + json nodes to search for the jsonpath in
   * @param jsonpathOrPaths the path or paths to the value nodes(s) in the json
   * @param message the message for a diagnostic for each duplicate value node, can be a string or function
   * @param code the error code
   * @param relatedMessage relatedInformation for each other found value will be added to the diagnostics
   *        with this message; defaults to 'Other usage', pass in undefined to not include on diagnostics
   * @param computeValue a function to compute the value from the matched node; can return undefined to
   *        ignore the node, defaults to the string value of the node
   * @param severity the diagnostic severity to use, default to warning
   */
  private lintUniqueValues(
    sources: Array<{ doc: Document; nodes: JsonNode | JsonNode[] }>,
    jsonpathOrPaths: JSONPath | readonly JSONPath[],
    message: string | ((value: string, doc: Document, node: JsonNode) => string),
    code: string,
    {
      relatedMessage = 'Other usage',
      computeValue = node => {
        return node.type === 'string' && typeof node.value === 'string' ? node.value : undefined;
      },
      severity = TemplateLinterDiagnosticSeverity.Warning
    }: {
      relatedMessage?: string | ((value: string, doc: Document, node: JsonNode) => string);
      computeValue?: (node: JsonNode, doc: Document) => string | undefined;
      severity?: TemplateLinterDiagnosticSeverity;
    } = {}
  ) {
    // value -> list of doc+node's w/ that value
    const values = new Map<string, Array<{ doc: Document; node: JsonNode }>>();
    const jsonpaths =
      jsonpathOrPaths.length > 0 && Array.isArray(jsonpathOrPaths[0])
        ? (jsonpathOrPaths as JSONPath[])
        : [jsonpathOrPaths as JSONPath];
    sources.forEach(({ doc, nodes: tree }) => {
      jsonpaths.forEach(jsonpath => {
        matchJsonNodesAtPattern(tree, jsonpath).reduce((values, node) => {
          const value = computeValue(node, doc);
          if (value) {
            const matches = values.get(value) || [];
            matches.push({ doc, node });
            values.set(value, matches);
          }
          return values;
        }, values);
      });
    });

    values.forEach((matches, value) => {
      if (matches.length > 1) {
        matches.forEach(({ doc, node }) => {
          const relatedInformation = relatedMessage
            ? matches
                .filter(other => other.node !== node)
                .map(other => {
                  return {
                    doc: other.doc,
                    node: other.node,
                    mesg:
                      typeof relatedMessage === 'string' ? relatedMessage : relatedMessage(value, other.doc, other.node)
                  };
                })
            : undefined;
          this.addDiagnostic(doc, typeof message === 'string' ? message : message(value, doc, node), code, node, {
            severity,
            relatedInformation
          });
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
    this.reset();
    const tree: JsonNode | undefined = parseTree(await this.templateInfoDoc.getText());
    await this.fireOnParsedTemplateInfo(this.templateInfoDoc, tree);

    if (tree) {
      // REVIEWME: if we ever start to have perf problems linting templates, we could either:
      // 1. separate the async and sync scans in each of these methods, and start all the async ones, do all the sync
      //    ones, and then await the async ones
      // 2. make the scans fully async through worker_threads or similar
      await Promise.all([
        this.lintTemplateInfo(tree),
        this.lintAutoInstall(tree),
        this.lintVariables(tree),
        this.lintUi(tree),
        this.lintRules(tree)
      ]);
    } else {
      // tree will be undefined if the file is 0-length or all whitespace/comments
      this.addDiagnostic(
        this.templateInfoDoc,
        'File does not contain template json',
        ERRORS.TMPL_EMPTY_FILE,
        undefined,
        {
          severity: TemplateLinterDiagnosticSeverity.Error
        }
      );
    }
    return this;
  }

  private async lintTemplateInfo(tree: JsonNode): Promise<void> {
    // TODO: consider doing this via a visit down the tree, rather than searching mulitple times

    // start these up and let them run
    const p = Promise.all([
      // make sure each place that can have a relative path to a file has a valid one
      ...TEMPLATE_INFO.allRelFilePathLocationPatterns.map(path =>
        this.lintRelFilePath(this.templateInfoDoc, tree, path)
      ),
      this.lintTemplateInfoByType(this.templateInfoDoc, tree),
      this.lintTemplateInfoAutoInstallDefinition(this.templateInfoDoc, tree)
    ]);
    // while those are going, do these synchronous ones
    this.listTemplateInfoAssetVersion(this.templateInfoDoc, tree);
    this.lintTemplateInfoDevName(this.templateInfoDoc, tree);
    this.lintTemplateInfoRulesAndRulesDefinition(this.templateInfoDoc, tree);
    this.lintTemplateInfoIcons(this.templateInfoDoc, tree);

    // make sure no 2+ relpath fields point to the same definition file (since that will be mess up our schema associations)
    const templateInfoSource = [{ doc: this.templateInfoDoc, nodes: tree }];
    this.lintUniqueValues(
      templateInfoSource,
      TEMPLATE_INFO.definitionFilePathLocationPatterns,
      relpath => `Duplicate usage of path ${relpath}`,
      ERRORS.TMPL_DUPLICATE_REL_PATH
    );

    // make sure there aren't duplicate names amongst the various related files
    // note: some of these with duplicate names (e.g. dashboards, components, lens) will fail to upload.
    // some of these will upload and work with a duplicate name (e.g. imageFiles), but all-but-the-first asset with
    // same name will end up with a different name (e.g. "name1", "name2") which means other code looking for the asset
    // by name will only find the first one, so we're going to warn on those, too.
    [
      // dashboards and lens are stored in the same place, so they have to have unique names amongst each other
      {
        type: 'dashboard, component, or lens',
        path: [['dashboards', '*', 'name'] as JSONPath, ['components', '*', 'name'], ['lenses', '*', 'name']]
      },
      { type: 'dataflow', path: ['eltDataflows', '*', 'name'] as JSONPath },
      { type: 'recipe', path: ['recipes', '*', 'name'] },
      { type: 'dataset', path: ['datasetFiles', '*', 'name'] },
      { type: 'external file', path: ['externalFiles', '*', 'name'] },
      { type: 'storedQuery', path: ['storedQueries', '*', 'name'] },
      { type: 'discoveryStory', path: ['extendedTypes', 'discoveryStories', '*', 'name'] },
      { type: 'prediction', path: ['extendedTypes', 'predictiveScoring', '*', 'name'] },
      { type: 'image file', path: ['imageFiles', '*', 'name'] }
    ].forEach(({ type, path }) =>
      this.lintUniqueValues(
        templateInfoSource,
        path,
        label => `Duplicate ${type} name '${label}'`,
        ERRORS.TMPL_DUPLICATE_NAME
      )
    );

    // make sure there aren't duplicate labels amongst the various related files that support labels
    // note: these will generally upload just fine, but the various ${App.Dashboard['label...']} expressions and other
    // operations that key on label will only find one of the assets, so we're going to warn on these
    [
      { type: 'dashboard', path: ['dashboards', '*', 'label'] as JSONPath },
      { type: 'components', path: ['components', '*', 'label'] },
      { type: 'lens', path: ['lenses', '*', 'label'] },
      { type: 'dataflow', path: ['eltDataflows', '*', 'label'] },
      { type: 'recipe', path: ['recipes', '*', 'label'] },
      { type: 'dataset', path: ['datasetFiles', '*', 'label'] },
      { type: 'storedQuery', path: ['storedQueries', '*', 'label'] },
      { type: 'discoveryStory', path: ['extendedTypes', 'discoveryStories', '*', 'label'] },
      { type: 'prediction', path: ['extendedTypes', 'predictiveScoring', '*', 'label'] }
    ].forEach(({ type, path }) =>
      this.lintUniqueValues(
        templateInfoSource,
        path,
        label => `Duplicate ${type} label '${label}'`,
        ERRORS.TMPL_DUPLICATE_LABEL
      )
    );

    // wait for the async ones
    await p;
  }

  private listTemplateInfoAssetVersion(doc: Document, tree: JsonNode) {
    const [assetVersion, assertVersionNode] = findJsonPrimitiveAttributeValue(tree, 'assetVersion');
    // recipes requires assetVersion 47.0+; the json schema will handle if assetVersion is missing or NaN or invalid
    if (assertVersionNode && typeof assetVersion === 'number' && assetVersion < 47.0) {
      const [numRecipes, recipesNode] = lengthJsonArrayAttributeValue(tree, 'recipes');
      if (numRecipes > 0) {
        this.addDiagnostic(
          doc,
          'Recipes require an assetVersion of at least 47.0',
          ERRORS.TMPL_RECIPES_MIN_ASSET_VERSION,
          assertVersionNode,
          { relatedInformation: [{ doc, node: recipesNode, mesg: 'Recipes array' }] }
        );
      }
    }
  }

  private async lintTemplateInfoByType(doc: Document, tree: JsonNode): Promise<void> {
    const [templateType, templateTypeNode] = findJsonPrimitiveAttributeValue(tree, 'templateType');
    // do the check if templateType is not specified or is a string; if it's anythigng else, the json-schema should
    // show a warning
    if (!templateTypeNode || (templateType && typeof templateType === 'string')) {
      switch (templateType ? templateType.toLocaleLowerCase() : 'app') {
        case 'app':
        case 'embeddedapp': {
          await this.lintAppTemplateInfo(doc, tree, templateType, templateTypeNode);
          break;
        }
        case 'dashboard': {
          this.lintDashboardTemplateInfo(doc, tree, templateTypeNode);
          break;
        }
        case 'data': {
          this.lintDataTemplateInfo(doc, tree, templateTypeNode);
          break;
        }
        // REVIEWME: do Lens templates require anything?
      }
    }
  }

  private async lintAppTemplateInfo(
    doc: Document,
    tree: JsonNode,
    templateType: 'app' | 'embeddedapp',
    templateTypeNode: JsonNode | undefined
  ): Promise<void> {
    // for app templates, it needs to have at least 1 dashboard, dataflow, externalFile, lens, or recipe specified,
    // so accumulate the total of each (handling the -1 meaning no node) and the property nodes for each
    // empty array field
    const { count, nodes } = [
      { data: lengthJsonArrayAttributeValue(tree, 'dashboards'), name: 'dashboards' },
      { data: lengthJsonArrayAttributeValue(tree, 'eltDataflows'), name: 'dataflows' },
      { data: lengthJsonArrayAttributeValue(tree, 'externalFiles'), name: 'externalFiles' },
      { data: lengthJsonArrayAttributeValue(tree, 'lenses'), name: 'lenses' },
      { data: lengthJsonArrayAttributeValue(tree, 'recipes'), name: 'recipes' }
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
      // add a related warning on each empty array property node
      const relatedInformation =
        nodes.length > 0
          ? nodes.map(([node, name]) => {
              return { doc, node, mesg: `Empty ${name} array` };
            })
          : undefined;
      this.addDiagnostic(
        doc,
        'App templates must have at least 1 dashboard, dataflow, externalFile, lens, or recipe specified',
        ERRORS.TMPL_APP_MISSING_OBJECTS,
        // put the warning on the "templateType": "app" property
        templateTypeNode && templateTypeNode.parent,
        { relatedInformation }
      );
    }

    // there's some more checks for embeddedapp templates
    if (templateType === 'embeddedapp') {
      // make sure there's no ui pages specified
      const uiDefNode = findNodeAtLocation(tree, ['uiDefinition']);
      if (uiDefNode) {
        const { json: uiJson } = await this.loadTemplateRelPathJson(tree, uiDefNode);
        // if the ui.json file is specified and exists and has 1+ pages, add the warning
        if (uiJson && lengthJsonArrayAttributeValue(uiJson, 'pages')[0] >= 1) {
          this.addDiagnostic(
            doc,
            'Templates of type embeddedapp cannot use a uiDefinition file with pages',
            ERRORS.TMPL_EMBEDDED_APP_WITH_UI,
            uiDefNode.parent || uiDefNode
          );
        }
      }

      // make sure there's at least one share in the folder.json
      let hasShare = false;
      const folderDefNode = findNodeAtLocation(tree, ['folderDefinition']);
      let folderDefinitionUri: Uri | undefined;
      if (folderDefNode) {
        const { uri, json: folderJson } = await this.loadTemplateRelPathJson(tree, folderDefNode);
        folderDefinitionUri = uri;
        hasShare = !!folderJson && lengthJsonArrayAttributeValue(folderJson, 'shares')[0] >= 1;
      }
      if (!hasShare) {
        this.addDiagnostic(
          doc,
          'Templates of type embeddedapp must have at least 1 share definition in the folderDefinition file',
          ERRORS.TMPL_EMBEDDED_APP_NO_SHARES,
          folderDefNode?.parent || folderDefNode || templateTypeNode?.parent || templateTypeNode,
          {
            args: {
              folderDefinitionUri
            }
          }
        );
      }
    }
  }

  private lintDashboardTemplateInfo(doc: Document, tree: JsonNode, templateTypeNode: JsonNode | undefined) {
    // for dashboard templates, there needs to exactly 1 dashboard specified
    const [len, dashboards] = lengthJsonArrayAttributeValue(tree, 'dashboards');
    if (len !== 1) {
      this.addDiagnostic(
        doc,
        'Dashboard templates must have exactly 1 dashboard specified',
        ERRORS.TMPL_DASH_ONE_DASHBOARD,
        // put it on the "dashboards" array, or the "templateType": "..." property, if either available
        dashboards || (templateTypeNode && templateTypeNode.parent)
      );
    }

    // TODO: don't allow the others
  }

  private lintDataTemplateInfo(doc: Document, tree: JsonNode, templateTypeNode: JsonNode | undefined) {
    // for data templates, it needs to have at least 1 dataset, externalFile, or recipe specified,
    // so accumulate the total of each (handling the -1 meaning no node) and the property nodes for each
    // empty array field
    const { count, nodes } = [
      { data: lengthJsonArrayAttributeValue(tree, 'datasetFiles'), name: 'datasets' },
      { data: lengthJsonArrayAttributeValue(tree, 'externalFiles'), name: 'externalFiles' },
      { data: lengthJsonArrayAttributeValue(tree, 'recipes'), name: 'recipes' }
    ].reduce(
      (all, { data, name }) => {
        if (data[0] > 0) {
          all.count += data[0];
        }
        // node.parent should be the property node, (e.g. '"recipes": []')
        if (data[1] && data[1].parent) {
          all.nodes.push([data[1].parent, name]);
        }
        return all;
      },
      { count: 0, nodes: [] as Array<[JsonNode, string]> }
    );
    if (count <= 0) {
      // add a related warning on each empty array property node
      const relatedInformation =
        nodes.length > 0
          ? nodes.map(([node, name]) => {
              return { doc, node, mesg: `Empty ${name} array` };
            })
          : undefined;
      this.addDiagnostic(
        doc,
        'Data templates must have at least 1 dataset, externalFile, or recipe specified',
        ERRORS.TMPL_DATA_MISSING_OBJECTS,
        // put the warning on the "templateType": "data" property
        templateTypeNode && templateTypeNode.parent,
        { relatedInformation }
      );
    }

    // make sure it only has datasets, externalFiles's, or recipes
    TEMPLATE_INFO.assetAttrPaths.forEach(attrPath => {
      if (attrPath[0] === 'datasetFiles' || attrPath[0] === 'externalFiles' || attrPath[0] === 'recipes') {
        return;
      }
      const [count, node] = lengthJsonArrayAttributeValue(tree, ...attrPath);
      if (count > 0) {
        this.addDiagnostic(
          doc,
          'Data templates only support datasets, external files, and recipes',
          ERRORS.TMPL_DATA_UNSUPPORTED_OBJECT,
          node?.parent || node
        );
      }
    });
    // and no dependencies currently
    const [depsCount, node] = lengthJsonArrayAttributeValue(tree, 'templateDependencies');
    if (depsCount > 0) {
      this.addDiagnostic(
        doc,
        'Data templates do not support dependencies',
        ERRORS.TMPL_DATA_UNSUPPORTED_OBJECT,
        node?.parent || node
      );
    }
  }

  private lintTemplateInfoDevName(doc: Document, tree: JsonNode) {
    const [name, nameNode] = findJsonPrimitiveAttributeValue(tree, 'name');
    if (name && typeof name === 'string') {
      // name has to match the template's folder name
      const dirname = this.uriBasename(this.uriDirname(doc.uri));
      if (name !== dirname) {
        this.addDiagnostic(
          doc,
          `Template name must match the template folder name '${dirname}'`,
          ERRORS.TMPL_NAME_MATCH_FOLDER_NAME,
          nameNode
        );
      }
    }
  }

  private async lintTemplateInfoAutoInstallDefinition(doc: Document, tree: JsonNode) {
    // if they have autoInstallDefinition specified
    const [autoInstallDef, autoInstallDefNode] = findJsonPrimitiveAttributeValue(tree, 'autoInstallDefinition');
    if (autoInstallDefNode && typeof autoInstallDef === 'string') {
      const [templateType, templateTypeNode] = findJsonPrimitiveAttributeValue(tree, 'templateType');
      // only app and embeddedapp templates can specify an autoInstallDefinition
      if (templateTypeNode && templateType !== 'app' && templateType !== 'embeddedapp') {
        this.addDiagnostic(
          doc,
          "Only 'app' and 'embeddedapp' templates can use an 'autoInstallDefinition'",
          ERRORS.TMPL_NON_APP_WITH_AUTO_INSTALL,
          autoInstallDefNode.parent || autoInstallDefNode,
          { relatedInformation: [{ doc, node: templateTypeNode, mesg: '"templateType" specification' }] }
        );
      } else {
        // it's an app or embedded app w/ autoInstallDefinition, so folder.json needs to have a name in it
        const { doc: folderDoc, json: folderJson } = await this.loadTemplateRelPathJson(tree, ['folderDefinition']);
        let hasName = false;
        if (folderJson) {
          const [name] = findJsonPrimitiveAttributeValue(folderJson, 'name');
          hasName = name && typeof name === 'string';
        }

        if (!hasName) {
          const relatedInformation = folderDoc
            ? [{ doc: folderDoc, node: undefined, mesg: 'folderDefinition file' }]
            : undefined;
          this.addDiagnostic(
            doc,
            "'name' is required in folderDefinition file when using autoInstallDefinition",
            ERRORS.TMPL_AUTO_INSTALL_MISSING_FOLDER_NAME,
            autoInstallDefNode.parent || autoInstallDefNode,
            { relatedInformation }
          );
        }
      }
    }
  }

  private lintTemplateInfoRulesAndRulesDefinition(doc: Document, tree: JsonNode) {
    // if template-info has both 'ruleDefinition' and one or more 'rules' elements, it won't deploy to the server, so
    // show an  error on that
    const ruleDefinition = findNodeAtLocation(tree, ['ruleDefinition']);
    if (ruleDefinition && ruleDefinition.type === 'string') {
      const [count] = lengthJsonArrayAttributeValue(tree, 'rules');
      if (count > 0) {
        this.addDiagnostic(
          doc,
          "Template is combining deprecated 'ruleDefinition' and 'rules'. Please consolidate 'ruleDefinition' into 'rules'",
          ERRORS.TMPL_RULES_AND_RULE_DEFINITION,
          ruleDefinition.parent || ruleDefinition,
          { severity: TemplateLinterDiagnosticSeverity.Error }
        );
      }
    }
  }

  private lintTemplateInfoIcons(doc: Document, tree: JsonNode) {
    // warn if they have both assetIcon and icons.appBadge
    const assetIcon = findNodeAtLocation(tree, ['assetIcon']);
    if (assetIcon) {
      if (findNodeAtLocation(tree, ['icons', 'appBadge'])) {
        this.addDiagnostic(
          doc,
          "Template is combining deprecated 'assetIcon' and 'icons.appBadge'",
          ERRORS.TMPL_ASSETICON_AND_APPBADGE,
          assetIcon.parent || assetIcon
        );
      }
    }
    // warn if they have both templateIcon and icons.templateBadge
    const templateIcon = findNodeAtLocation(tree, ['templateIcon']);
    if (templateIcon) {
      if (findNodeAtLocation(tree, ['icons', 'templateBadge'])) {
        this.addDiagnostic(
          doc,
          "Template is combining deprecated 'templateIcon' and 'icons.templateBadge'",
          ERRORS.TMPL_TEMPLATEICON_AND_TEMPLATEBADGE,
          templateIcon.parent || templateIcon
        );
      }
    }
  }

  private lintRelFilePath(doc: Document, tree: JsonNode, patterns: JSONPath): Promise<void> {
    const nodes = matchJsonNodesAtPattern(tree, patterns);
    let all = Promise.resolve();
    nodes.forEach(n => {
      // the json schema should handle if the node is not a string value
      if (n && n.type === 'string') {
        const relPath = (n.value as string) || '';
        if (!relPath || relPath.startsWith('/') || relPath.startsWith('../')) {
          this.addDiagnostic(doc, 'Value should be a path relative to this file', ERRORS.TMPL_INVALID_REL_PATH, n);
        } else if (relPath.includes('/../') || relPath.endsWith('/..')) {
          this.addDiagnostic(doc, "Path should not contain '..' parts", ERRORS.TMPL_INVALID_REL_PATH, n);
        } else if (relPath === 'template-info.json') {
          this.addDiagnostic(doc, "Path cannot be 'template-info.json'", ERRORS.TMPL_INVALID_REL_PATH, n);
        } else {
          const uri = this.uriRelPath(this.uriDirname(doc.uri), relPath);
          const p = this.uriIsFile(uri)
            .then(isFile => {
              if (isFile === undefined) {
                this.addDiagnostic(
                  doc,
                  'Specified file does not exist in workspace',
                  ERRORS.TMPL_REL_PATH_NOT_EXIST,
                  n,
                  { args: { relPath } }
                );
              } else if (!isFile) {
                this.addDiagnostic(doc, 'Specified path is not a file', ERRORS.TMPL_REL_PATH_NOT_FILE, n);
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

  private async lintAutoInstall(templateInfo: JsonNode): Promise<void> {
    const { doc, json: autoInstall } = await this.loadTemplateRelPathJson(templateInfo, ['autoInstallDefinition']);
    if (doc && autoInstall) {
      await this.lintAutoInstallAppConfigurationValues(templateInfo, doc, autoInstall);
    }
  }

  private async lintAutoInstallAppConfigurationValues(
    templateInfo: JsonNode,
    doc: Document,
    autoInstall: JsonNode
  ): Promise<void> {
    const valuesNode = matchJsonNodeAtPattern(autoInstall, ['configuration', 'appConfiguration', 'values']);
    // if there's values specified, load the variableDefinition file and make sure they line up
    if (valuesNode && valuesNode.children && valuesNode.children.length > 0) {
      const variableTypes = (await this.loadVariableTypesForTemplate(templateInfo)) || {};
      const fuzzySearch = fuzzySearcher({
        // make an Iterable, to lazily call Object.keys() only if fuzzySearch is called
        [Symbol.iterator]: () =>
          Object.keys(variableTypes)
            // also, only include valid variable names in the fuzzy search
            .filter(isValidVariableName)
            [Symbol.iterator]()
      });
      valuesNode.children.forEach(valueNode => {
        const nameNode = valueNode.children?.[0];
        if (nameNode && nameNode.type === 'string' && typeof nameNode.value === 'string') {
          const name = nameNode.value;
          if (!variableTypes[name]) {
            let mesg = `Cannot find variable '${name}'`;
            // see if there's a variable w/ a similar name
            const [match] = fuzzySearch(name);
            const args: Record<string, any> = { name };
            if (match && match.length > 0) {
              args.match = match;
              mesg += `, did you mean '${match}'?`;
            }
            this.addDiagnostic(doc, mesg, ERRORS.AUTO_INSTALL_UNKNOWN_VARIABLE, nameNode, { args });
          }
        }
      });
    }

    // TODO: if variableDefinition has variable w/o a defaultValue and no apexCallback specified, and
    // if that variable isn't specified in the autoInstall values, we should warn on that
  }

  private async lintVariables(templateInfo: JsonNode): Promise<void> {
    const { doc, json: variables } = await this.loadTemplateRelPathJson(templateInfo, ['variableDefinition']);
    if (doc && variables) {
      this.lintVariablesExcludes(doc, variables);
      // TODO: other lints on variables
    }
  }

  private lintVariablesExcludes(variablesDoc: Document, tree: JsonNode) {
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
                this.addDiagnostic(
                  variablesDoc,
                  'Missing closing / for regular expression',
                  ERRORS.VARS_REGEX_MISSING_SLASH,
                  excludeNode
                );
              } else {
                const lastIndex = str.lastIndexOf('/');
                let pattern: string | undefined;
                let options: string | undefined;
                // this means there's no closing /
                if (lastIndex < 1) {
                  this.addDiagnostic(
                    variablesDoc,
                    'Missing closing / for regular expression',
                    ERRORS.VARS_REGEX_MISSING_SLASH,
                    excludeNode
                  );
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
                    this.addDiagnostic(
                      variablesDoc,
                      'Invalid regular expression options',
                      ERRORS.VARS_INVALID_REGEX_OPTIONS,
                      excludeNode
                    );
                    // clear it out to still test the regex text
                    options = undefined;
                  } else if (/(.).*\1/.test(options)) {
                    this.addDiagnostic(
                      variablesDoc,
                      'Duplicate option in regular expression options',
                      ERRORS.VARS_INVALID_REGEX_OPTIONS,
                      excludeNode
                    );
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
                  this.addDiagnostic(variablesDoc, mesg, ERRORS.VARS_INVALID_REGEX, excludeNode);
                }
              }
            }
          }
        });
        if (regexes.length > 1) {
          this.addDiagnostic(
            variablesDoc,
            'Multiple regular expression excludes found, only the first will be used',
            ERRORS.VARS_MULTIPLE_REGEXES,
            // try to put the warning on the "excludes" part of the whole exclude property, otherwise just put it on
            // the excludes array
            (excludesNode.parent &&
              excludesNode.parent.type === 'property' &&
              excludesNode.parent.children &&
              excludesNode.parent.children[0]) ||
              excludesNode,
            // add DiagnosticRelatedInformation's for the excludeNode's that have regex's
            {
              relatedInformation: regexes.map(node => {
                return { doc: variablesDoc, node, mesg: 'Regular expression exclude' };
              })
            }
          );
        }
      }
    });
  }

  private async lintUi(templateInfo: JsonNode) {
    const { doc, json: ui } = await this.loadTemplateRelPathJson(templateInfo, ['uiDefinition']);
    if (doc && ui) {
      // let this one start
      const p = this.lintUiCheckVariables(templateInfo, doc, ui);
      // run this one while that's running
      this.lintUiVariablesSpecifiedForPages(templateInfo, doc, ui);
      return p;
    }
  }

  private lintUiVariablesSpecifiedForPages(templateInfo: JsonNode, doc: Document, ui: JsonNode) {
    findNodeAtLocation(ui, ['pages'])?.children?.forEach(page => {
      // if it's not a vfPage
      const vfPage = findNodeAtLocation(page, ['vfPage']);
      if (!vfPage) {
        const variables = findNodeAtLocation(page, ['variables']);
        if (!variables) {
          this.addDiagnostic(
            doc,
            'Either variables or vfPage must be specified',
            ERRORS.UI_PAGE_MISSING_VARIABLES,
            page
          );
        } else if (variables.type === 'array' && (!variables.children || variables.children.length <= 0)) {
          this.addDiagnostic(
            doc,
            'At least 1 variable or vfPage must be specified',
            ERRORS.UI_PAGE_EMPTY_VARIABLES,
            variables
          );
        }
        // if variables is defined as something other than an array, the json schema should warn on that
      } else {
        // if it's got a vfPage, make sure it's not a data template, which doesn't support vfPages
        const [templateType] = findJsonPrimitiveAttributeValue(templateInfo, 'templateType');
        if (typeof templateType === 'string' && templateType.toLowerCase() === 'data') {
          this.addDiagnostic(
            doc,
            'vfPage is unsupported for data templates',
            ERRORS.UI_PAGE_VFPAGE_UNSUPPORTED,
            // put it on the "vfPage" prop name
            vfPage.parent?.children?.[0] || vfPage.parent || vfPage
          );
        }
      }
    });
  }

  private async lintUiCheckVariables(templateInfo: JsonNode, uiDoc: Document, ui: JsonNode) {
    // find all the variable names & types in the variables file
    const variableTypes = (await this.loadVariableTypesForTemplate(templateInfo)) || {};
    // go through the ui pages
    const pages = findNodeAtLocation(ui, ['pages']);
    if (pages && pages.type === 'array' && pages.children && pages.children.length > 0) {
      const fuzzySearch = fuzzySearcher({
        // make an Iterable, to lazily call Object.keys() only if fuzzySearch is called
        [Symbol.iterator]: () =>
          Object.keys(variableTypes)
            // also, only include valid variable names in the fuzzy search
            .filter(isValidVariableName)
            [Symbol.iterator]()
      });
      const [templateType] = findJsonPrimitiveAttributeValue(templateInfo, 'templateType');
      // find all the variable objects
      matchJsonNodesAtPattern(pages.children, ['variables', '*', 'name']).forEach(nameNode => {
        if (nameNode && nameNode.type === 'string' && nameNode.value) {
          const name = nameNode.value as string;
          // make sure the page variable is in variables.json
          if (!variableTypes[name]) {
            let mesg = `Cannot find variable '${name}'`;
            // see if there's a variable w/ a similar name
            const [match] = fuzzySearch(name);
            const args: Record<string, any> | undefined = { name };
            if (match && match.length > 0) {
              args.match = match;
              mesg += `, did you mean '${match}'?`;
            }
            this.addDiagnostic(uiDoc, mesg, ERRORS.UI_PAGE_UNKNOWN_VARIABLE, nameNode, { args });
          } else {
            // the variable exists, so check that the variable type is supported for the templateType
            const type = variableTypes[name].type;
            if (type === 'ObjectType' || type === 'DateTimeType') {
              this.addDiagnostic(
                uiDoc,
                `${type} variable '${name}' is not supported in ui pages`,
                ERRORS.UI_PAGE_UNSUPPORTED_VARIABLE,
                nameNode
              );
            } else if (
              type === 'DatasetAnyFieldType' &&
              !(typeof templateType === 'string' && templateType.toLowerCase() === 'data')
            ) {
              this.addDiagnostic(
                uiDoc,
                `${type} variable '${name}' is only supported in ui pages in data templates`,
                ERRORS.UI_PAGE_UNSUPPORTED_VARIABLE,
                nameNode
              );
            }
          }
        }
      });
    }
  }

  private async lintRules(templateInfo: JsonNode): Promise<void> {
    // find all the json nodes that point to rel-path rules files, per ruleType
    const templateToAppFiles: JsonNode[] = [];
    const appToTemplateFiles: JsonNode[] = [];
    matchJsonNodesAtPattern(templateInfo, ['rules', '*']).forEach(rule => {
      const file = findNodeAtLocation(rule, ['file']);
      if (file && file.type === 'string') {
        const type = findNodeAtLocation(rule, ['type']);
        if (type?.value === 'appToTemplate') {
          appToTemplateFiles.push(file);
        } else {
          templateToAppFiles.push(file);
        }
      }
    });
    const ruleDef = findNodeAtLocation(templateInfo, ['ruleDefinition']);
    if (ruleDef?.type === 'string') {
      templateToAppFiles.push(ruleDef);
    }

    // now load those documents & json
    const [templateToAppJsons, appToTemplateJsons] = await Promise.all([
      this.loadRulesJsons(templateInfo, templateToAppFiles),
      this.loadRulesJsons(templateInfo, appToTemplateFiles)
    ]);
    this.lintRulesFiles(templateToAppJsons);
    this.lintRulesFiles(appToTemplateJsons);
  }

  private async loadRulesJsons(
    templateInfo: JsonNode,
    pathNodes: JsonNode[]
  ): Promise<Array<{ doc: Document; nodes: JsonNode }>> {
    const all = await Promise.all(pathNodes.map(node => this.loadTemplateRelPathJson(templateInfo, node)));
    const found = [] as Array<{ doc: Document; nodes: JsonNode }>;
    all.forEach(val => {
      if (val?.doc && val.json) {
        found.push({ doc: val.doc, nodes: val.json });
      }
    });
    return found;
  }

  private lintRulesFiles(sources: Array<{ doc: Document; nodes: JsonNode }>) {
    // make sure the constants' names are unique
    this.lintUniqueValues(
      sources,
      ['constants', '*', 'name'],
      name => `Duplicate constant '${name}'`,
      ERRORS.RULES_DUPLICATE_CONSTANT
    );
    // make sure the rules' names are unique
    this.lintUniqueValues(
      sources,
      ['rules', '*', 'name'],
      name => `Duplicate rule name '${name}'`,
      ERRORS.RULES_DUPLICATE_RULE_NAME,
      {
        severity: TemplateLinterDiagnosticSeverity.Hint
      }
    );
    // make sure macro namespace:name is unique
    this.lintUniqueValues(
      sources,
      ['macros', '*', 'definitions', '*', 'name'],
      name => `Duplicate macro '${name}'`,
      ERRORS.RULES_DUPLICATE_MACRO,
      {
        // compute namespace:name from the name value json node
        computeValue: name => {
          // REVIEWME: should we skip name's or namespace's that don't match the schema regex?
          // The server runtime doesn't, although the rules won't validate in the server if the name/ns don't match
          // the regex so the macros wouldn't even be there to run.
          // Let's do this for now, so you get both the dup warning and the regex warnings
          if (name.type === 'string' && typeof name.value === 'string' && name.value) {
            // find the ancestor macro, via the parent chain:
            // "name": <name> -> the definition {} -> the definitions [] ->
            // "definitions": [] -> the macro {}
            const macro = name.parent?.parent?.parent?.parent?.parent;
            if (macro) {
              const ns = findNodeAtLocation(macro, ['namespace']);
              if (ns && ns.type === 'string' && typeof ns.value === 'string' && ns.value) {
                return ns.value + ':' + name.value;
              }
            }
          }
          return undefined;
        }
      }
    );

    sources.map(({ doc, nodes }) => {
      this.lintMacrosHaveReturnsOrActions(doc, nodes);
    });
  }

  private lintMacrosHaveReturnsOrActions(doc: Document, rules: JsonNode) {
    matchJsonNodesAtPattern(rules, ['macros', '*', 'definitions', '*']).forEach(definition => {
      const returns = findNodeAtLocation(definition, ['returns']);
      if (!returns) {
        const [count, actions] = lengthJsonArrayAttributeValue(definition, 'actions');
        // add diagnostic on either attribute missing or is an empty array; if it's a non-array, there should be
        // schema warning about that already
        if (!actions || count === 0) {
          this.addDiagnostic(
            doc,
            "Macro should have a 'return' or at least one action",
            ERRORS.RULES_NOOP_MACRO,
            actions ?? definition,
            { severity: TemplateLinterDiagnosticSeverity.Information }
          );
        }
      }
    });
  }
}
