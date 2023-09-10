/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import { JSONPath, Node as JsonNode } from 'jsonc-parser';
import * as path from 'path';
import {
  Diagnostic,
  DiagnosticSeverity,
  getLanguageService,
  JSONSchema,
  LanguageService,
  Range,
  TextDocument
} from 'vscode-json-languageservice';
import { DiagnosticRelatedInformation, Location } from 'vscode-languageserver-types';
import { JSON_SCHEMA_SOURCE_ID, JSON_SOURCE_ID, LINTER_SOURCE_ID } from './constants';
import { TemplateLinter, TemplateLinterDiagnosticSeverity } from './linter';
import { schemas } from './schemas';
import { matchJsonNodesAtPattern, pathIsFile } from './utils';

async function schemaValidate(
  jsonSvc: LanguageService,
  linter: FileTemplateValidator,
  doc: TextDocument,
  schema: JSONSchema
): Promise<void> {
  const jsonDoc = jsonSvc.parseJSONDocument(doc);
  const diagnostics = await jsonSvc.doValidation(doc, jsonDoc, {}, schema);
  if (diagnostics.length > 0) {
    // vscode-json-languageservice doesn't seem to set the source, so do it here to differentiate json issues from
    // linting issues
    diagnostics.forEach(d => {
      if (!d.source) {
        // code seems to be undefined if it's a json schema issues, otherwise it's a json format issue (and
        // code should be one of the values in ErrorCode)
        d.source = d.code === undefined ? JSON_SCHEMA_SOURCE_ID : JSON_SOURCE_ID;
      }
    });
    const current = linter.diagnostics.get(doc);
    if (current) {
      current.push(...diagnostics);
    } else {
      linter.diagnostics.set(doc, diagnostics);
    }
  }
}

/** Lint and json schema validate templates on the fileystem.
 */
export class FileTemplateValidator extends TemplateLinter<string, TextDocument, Diagnostic> {
  /** Create a text document for this from a filesystem path.
   * This will reject with an Error if it cannot read the file from the path.
   */
  public static async createTextDocument(path: string): Promise<TextDocument> {
    return TextDocument.create(path, LINTER_SOURCE_ID, 1, await fs.promises.readFile(path, { encoding: 'utf-8' }));
  }

  private static async templateSchemaValidate(
    templateInfoDoc: TextDocument,
    templateInfo: JsonNode | undefined,
    linter: FileTemplateValidator
  ): Promise<void> {
    const jsonSvc = getLanguageService({});
    // all template json files allow comments
    jsonSvc.configure({ validate: true, allowComments: true });

    let all = schemaValidate(jsonSvc, linter, templateInfoDoc, schemas.templateInfo);

    if (templateInfo) {
      // TODO: if a relpath is used in 2+ definition fields, make sure we don't validate it twice (or at least
      // that we don't show duplicate diagnostics)
      // validate the definition files
      [
        { schema: schemas.autoInstall, jsonpath: ['autoInstallDefinition'] as JSONPath },
        { schema: schemas.folder, jsonpath: ['folderDefinition'] },
        { schema: schemas.ui, jsonpath: ['uiDefinition'] },
        { schema: schemas.layout, jsonpath: ['layoutDefinition'] },
        { schema: schemas.readiness, jsonpath: ['readinessDefinition'] },
        { schema: schemas.rules, jsonpath: ['ruleDefinition'] },
        { schema: schemas.variables, jsonpath: ['variableDefinition'] }
      ].forEach(({ schema, jsonpath }) => {
        const p = FileTemplateValidator.schemaValidateRelPath(jsonSvc, linter, templateInfo, schema, jsonpath);
        all = all.then(v => p);
      });

      matchJsonNodesAtPattern(templateInfo, ['rules', '*', 'file']).forEach(file => {
        const p = FileTemplateValidator.schemaValidateRelPath(jsonSvc, linter, templateInfo, schemas.rules, file);
        all = all.then(v => p);
      });

      // validate any asset files against the base schema (this mostly just catches that they're valid json)
      [
        ['dashboards', '*', 'file'] as JSONPath,
        ['components', '*', 'file'],
        ['lenses', '*', 'file'],
        ['eltDataflows', '*', 'file'],
        ['storedQueries', '*', 'file'],
        ['extendedTypes', '*', '*', 'file'],
        ['recipes', '*', 'file'],
        ['externalFiles', '*', 'schema'],
        ['externalFiles', '*', 'userXmd'],
        ['datasetFiles', '*', 'userXmd'],
        ['datasetFiles', '*', 'conversionMetadata']
      ].forEach(jsonpath => {
        matchJsonNodesAtPattern(templateInfo, jsonpath).forEach(file => {
          const p = FileTemplateValidator.schemaValidateRelPath(jsonSvc, linter, templateInfo, schemas.base, file);
          all = all.then(v => p);
        });
      });
    }

    await all;
  }

  // this needs to be a static method so it can access the protected loadTemplateRelPathJson() method
  private static async schemaValidateRelPath(
    jsonSvc: LanguageService,
    linter: FileTemplateValidator,
    templateInfo: JsonNode,
    schema: JSONSchema,
    jsonpath: JSONPath | JsonNode
  ): Promise<void> {
    const { doc } = await linter.loadTemplateRelPathJson(templateInfo, jsonpath);
    if (doc) {
      return schemaValidate(jsonSvc, linter, doc, schema);
    }
  }

  private readonly documentCache = new Map<string, TextDocument>();

  /** Constructor, use `await FileTemplateValidator.createTextDocument()` to create the Document from the
   * template-info.json filesystem path.
   */
  constructor(
    templateInfoDoc: TextDocument,
    { validateSchemas = true, dir }: { validateSchemas?: boolean; dir?: string } = {}
  ) {
    super(templateInfoDoc, dir);
    if (validateSchemas) {
      this.onParsedTemplateInfo(FileTemplateValidator.templateSchemaValidate);
    }
  }

  public override reset() {
    super.reset();
    this.documentCache.clear();
  }

  protected override uriDirname(uri: string): string {
    return path.dirname(uri);
  }

  protected override uriBasename(uri: string): string {
    return path.basename(uri);
  }

  protected override uriRelPath(dir: string, relpath: string): string {
    return path.join(dir, relpath);
  }

  protected override uriIsFile(uri: string): Promise<boolean | undefined> {
    return pathIsFile(uri);
  }

  protected override async uriStat(uri: string): Promise<{ ctime: number; mtime: number; size: number } | undefined> {
    try {
      const stat = await fs.promises.stat(uri);
      return { ctime: stat.ctimeMs, mtime: stat.mtimeMs, size: stat.size };
    } catch (error) {
      if (typeof error === 'object' && (error as any).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  protected override async getDocument(uri: string): Promise<TextDocument> {
    let doc = this.documentCache.get(uri);
    if (!doc) {
      if (!(await this.uriIsFile(uri))) {
        throw new Error(`Unable to open ${doc} as a file`);
      }
      doc = await FileTemplateValidator.createTextDocument(uri);
      this.documentCache.set(uri, doc);
    }
    return doc;
  }

  protected override createDiagnotic(
    doc: TextDocument,
    mesg: string,
    code: string,
    location: JsonNode | undefined,
    severity: TemplateLinterDiagnosticSeverity,
    args: Record<string, any> | undefined,
    relatedInformation: Array<{ node: JsonNode | undefined; doc: TextDocument; mesg: string }> | undefined
  ): Diagnostic {
    // for nodes for string values, the node offset & length will include the outer double-quotes, so take those
    // off
    const rangeMod = location && location.type === 'string' ? 1 : 0;
    const range = location
      ? Range.create(
          doc.positionAt(location.offset + rangeMod),
          doc.positionAt(location.offset + location.length - rangeMod)
        )
      : Range.create(0, 0, 0, 0);
    return Diagnostic.create(
      range,
      mesg,
      this.mapSeverity(severity),
      code,
      LINTER_SOURCE_ID,
      relatedInformation
        ?.map(({ doc, node, mesg }) =>
          DiagnosticRelatedInformation.create(
            Location.create(
              doc.uri,
              node
                ? Range.create(doc.positionAt(node.offset), doc.positionAt(node.offset + node.length))
                : Range.create(0, 0, 0, 0)
            ),
            mesg
          )
        )
        .sort((d1, d2) => d1.location.range.start.line - d2.location.range.start.line)
    );
  }

  private mapSeverity(severity: TemplateLinterDiagnosticSeverity): DiagnosticSeverity {
    switch (severity) {
      case TemplateLinterDiagnosticSeverity.Error:
        return DiagnosticSeverity.Error;
      case TemplateLinterDiagnosticSeverity.Information:
        return DiagnosticSeverity.Information;
      case TemplateLinterDiagnosticSeverity.Hint:
        return DiagnosticSeverity.Hint;
      case TemplateLinterDiagnosticSeverity.Warning:
      default:
        return DiagnosticSeverity.Warning;
    }
  }
}
