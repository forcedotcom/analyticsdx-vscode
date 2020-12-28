/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import { Node as JsonNode } from 'jsonc-parser';
import * as path from 'path';
import { TemplateLinter, TemplateLinterDiagnosticSeverity, TemplateLinterDocument } from './linter';

class FileDocument implements TemplateLinterDocument<string> {
  constructor(private readonly filepath: string) {}

  get uri(): string {
    return this.filepath;
  }

  getText(): Promise<string> {
    return fs.promises.readFile(this.filepath, { encoding: 'utf-8' });
  }
}

/** Base class for linting templates on the filesystem, using filesystem paths and `fs.readFile()`.
 */
export default abstract class FileTemplateLinter<Diagnostic> extends TemplateLinter<string, FileDocument, Diagnostic> {
  private readonly documentCache = new Map<string, FileDocument>();

  public reset() {
    super.reset();
    this.documentCache.clear();
  }

  protected uriDirname(uri: string): string {
    return path.dirname(uri);
  }

  protected uriBasename(uri: string): string {
    return path.basename(uri);
  }

  protected uriRelPath(dir: string, relpath: string): string {
    return path.join(dir, relpath);
  }

  protected async uriIsFile(uri: string): Promise<boolean | undefined> {
    try {
      const stat = await fs.promises.stat(uri);
      return stat.isFile();
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  protected async getDocument(uri: string): Promise<FileDocument> {
    let doc = this.documentCache.get(uri);
    if (!doc) {
      if (!(await this.uriIsFile(uri))) {
        throw new Error(`Unable to open ${doc} as a file`);
      }
      doc = new FileDocument(uri);
      this.documentCache.set(uri, doc);
    }
    return doc;
  }

  protected abstract createDiagnotic(
    doc: FileDocument,
    mesg: string,
    code: string,
    location: JsonNode | undefined,
    severity: TemplateLinterDiagnosticSeverity,
    args: Record<string, any> | undefined,
    relatedInformation: Array<{ node: JsonNode | undefined; doc: FileDocument; mesg: string }> | undefined
  ): Diagnostic;
}
