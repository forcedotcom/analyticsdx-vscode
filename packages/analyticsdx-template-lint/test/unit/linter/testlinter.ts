/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getNodePath, Node as JsonNode } from 'jsonc-parser';
import * as path from 'path';
import {
  jsonPathToString,
  TemplateLinter,
  TemplateLinterDiagnosticSeverity,
  TemplateLinterDocument
} from '../../../src';

/** An in-memory text document for linter testing. */
export class StringDocument implements TemplateLinterDocument<string> {
  private readonly text: string;
  public readonly sizeOverride?: number;

  constructor(
    public readonly uri: string,
    text: string | any[] | object,
    { sizeOverride }: { sizeOverride?: number } = {}
  ) {
    this.text = typeof text === 'string' ? text : JSON.stringify(text, undefined, 2);
    this.sizeOverride = sizeOverride;
  }

  getText(): string {
    return this.text;
  }
}

export interface Diagnostic {
  doc: StringDocument;
  mesg: string;
  code: string;
  jsonpath: string | undefined;
  severity: TemplateLinterDiagnosticSeverity;
  args: Record<string, any> | undefined;
  relatedInformation: Array<{ node: JsonNode | undefined; doc: StringDocument; mesg: string }> | undefined;
}

export function stringifyDiagnostics(diagnostics: Diagnostic[] | undefined): string {
  return JSON.stringify(
    diagnostics?.map(d => ({
      uri: d.doc.uri,
      mesg: d.mesg,
      code: d.code,
      jsonpath: d.jsonpath,
      severity: TemplateLinterDiagnosticSeverity[d.severity],
      args: d.args,
      relatedInformation: d.relatedInformation
    })),
    undefined,
    2
  );
}

/** An in-memory linter implementation for unit testing. */
export class TestLinter extends TemplateLinter<string, StringDocument, Diagnostic> {
  private readonly relatedFiles: StringDocument[];
  constructor(templateDir: string, templateInfo: string | object, ...relatedFiles: StringDocument[]) {
    super(new StringDocument(path.join(templateDir, 'template-info.json'), templateInfo), templateDir);
    this.relatedFiles = relatedFiles;
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

  protected override async uriIsFile(uri: string): Promise<boolean | undefined> {
    try {
      const doc = await this.getDocument(uri);
      return !!doc;
    } catch (e) {
      return false;
    }
  }

  protected override async uriStat(uri: string): Promise<{ ctime: number; mtime: number; size: number } | undefined> {
    try {
      const doc = await this.getDocument(uri);
      return { ctime: 0, mtime: 0, size: doc.sizeOverride || doc.getText().length };
    } catch (e) {
      return undefined;
    }
  }

  protected override getDocument(uri: string): Promise<StringDocument> {
    const doc =
      (uri === this.templateInfoDoc.uri ? this.templateInfoDoc : undefined) ||
      this.relatedFiles.find(doc => doc.uri === uri);
    return doc ? Promise.resolve(doc) : Promise.reject(new Error(`Unable to find ${uri}`));
  }

  protected override createDiagnotic(
    doc: StringDocument,
    mesg: string,
    code: string,
    location: JsonNode | undefined,
    severity: TemplateLinterDiagnosticSeverity,
    args: Record<string, any> | undefined,
    relatedInformation: Array<{ node: JsonNode | undefined; doc: StringDocument; mesg: string }> | undefined
  ): Diagnostic {
    return {
      doc,
      mesg,
      code,
      jsonpath: location && jsonPathToString(getNodePath(location)),
      severity,
      args,
      relatedInformation
    };
  }
}
