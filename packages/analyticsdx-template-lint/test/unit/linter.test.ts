/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { Node as JsonNode } from 'jsonc-parser';
import * as path from 'path';
import { ERRORS, TemplateLinter, TemplateLinterDiagnosticSeverity, TemplateLinterDocument } from '../../src';
import { getDiagnosticsForPath } from '../testutils';

class StringDocument implements TemplateLinterDocument<string> {
  private readonly text: string;
  constructor(public readonly uri: string, text: string | any[] | object) {
    this.text = typeof text === 'string' ? text : JSON.stringify(text, undefined, 2);
  }

  getText(): string {
    return this.text;
  }
}

interface Diagnostic {
  doc: StringDocument;
  mesg: string;
  code: string;
  location: JsonNode | undefined;
  severity: TemplateLinterDiagnosticSeverity;
  args: Record<string, any> | undefined;
  relatedInformation: Array<{ node: JsonNode | undefined; doc: StringDocument; mesg: string }> | undefined;
}

class TestLinter extends TemplateLinter<string, StringDocument, Diagnostic> {
  constructor(
    templateDir: string,
    templateInfo: string | object,
    private readonly relatedFiles: StringDocument[] = []
  ) {
    super(new StringDocument(path.join(templateDir, 'template-info.json'), templateInfo), templateDir);
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
      const doc = await this.getDocument(uri);
      return !!doc;
    } catch (e) {
      return false;
    }
  }

  protected getDocument(uri: string): Promise<StringDocument> {
    const doc =
      (uri === this.templateInfoDoc.uri ? this.templateInfoDoc : undefined) ||
      this.relatedFiles.find(doc => doc.uri === uri);
    return doc ? Promise.resolve(doc) : Promise.reject(new Error(`Unable to find ${uri}`));
  }

  protected createDiagnotic(
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
      location,
      severity,
      args,
      relatedInformation
    };
  }
}

// tslint:disable: no-unused-expression
describe('TemplateLinter', () => {
  let linter: TestLinter | undefined;

  afterEach(() => {
    linter?.reset();
    linter = undefined;
  });

  it('validates recipe assetVersion', async () => {
    const dir = 'recipeAssetVersion';
    linter = new TestLinter(
      dir,
      {
        assetVersion: 46.0,
        recipes: [
          {
            name: 'recipe',
            file: 'recipe.json'
          }
        ]
      },
      [new StringDocument(path.join(dir, 'recipe.json'), {})]
    );
    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
      d => d.code === ERRORS.TMPL_RECIPES_MIN_ASSET_VERSION
    );
    if (diagnostics?.length !== 1) {
      expect.fail('Expected 1 recipe asset version diagnostic, got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics?.[0].relatedInformation?.length, '# of relatedInformation').to.equal(1);
  });
});
