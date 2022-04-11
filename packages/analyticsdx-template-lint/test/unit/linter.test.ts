/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { getNodePath, Node as JsonNode } from 'jsonc-parser';
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

function stringifyDiagnostics(diagnostics: Diagnostic[] | undefined): string {
  return JSON.stringify(
    diagnostics?.map(d => ({
      uri: d.doc.uri,
      mesg: d.mesg,
      code: d.code,
      nodePath: d.location && getNodePath(d.location),
      severity: TemplateLinterDiagnosticSeverity[d.severity],
      args: d.args,
      relatedInformation: d.relatedInformation
    })),
    undefined,
    2
  );
}

class TestLinter extends TemplateLinter<string, StringDocument, Diagnostic> {
  private readonly relatedFiles: StringDocument[];
  constructor(templateDir: string, templateInfo: string | object, ...relatedFiles: StringDocument[]) {
    super(new StringDocument(path.join(templateDir, 'template-info.json'), templateInfo), templateDir);
    this.relatedFiles = relatedFiles;
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

  describe('template-info.json', () => {
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
        new StringDocument(path.join(dir, 'recipe.json'), {})
      );
      await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
        d => d.code === ERRORS.TMPL_RECIPES_MIN_ASSET_VERSION
      );
      if (diagnostics?.length !== 1) {
        expect.fail('Expected 1 recipe asset version diagnostic, got: ' + stringifyDiagnostics(diagnostics));
      }
      expect(diagnostics?.[0].relatedInformation?.length, '# of relatedInformation').to.equal(1);
    });
  });

  describe('ui.json', () => {
    [
      { templateType: 'data', numErrors: 0, type: 'DatasetAnyFieldType', isArray: false },
      { templateType: 'data', numErrors: 0, type: 'DatasetAnyFieldType', isArray: true },
      { templateType: 'app', numErrors: 1, type: 'DatasetAnyFieldType', isArray: false },
      { templateType: 'app', numErrors: 1, type: 'DatasetAnyFieldType', isArray: true },
      { templateType: 'app', numErrors: 1, type: 'ObjectType', isArray: false },
      { templateType: 'app', numErrors: 1, type: 'ObjectType', isArray: true },
      { templateType: 'app', numErrors: 1, type: 'DateTimeType', isArray: false },
      { templateType: 'app', numErrors: 1, type: 'DateTimeType', isArray: true }
    ].forEach(({ templateType, numErrors, type, isArray }) => {
      it(`validates ${type}${isArray ? '[]' : ''} variable for ${templateType} template`, async () => {
        const dir = type;
        const variableType = isArray ? { type: 'ArrayType', itemsType: { type } } : { type };
        linter = new TestLinter(
          dir,
          {
            templateType,
            uiDefinition: 'ui.json',
            variableDefinition: 'variables.json'
          },
          new StringDocument(path.join(dir, 'variables.json'), {
            var: { variableType }
          }),
          new StringDocument(path.join(dir, 'ui.json'), {
            pages: [
              {
                title: 'title',
                variables: [{ name: 'var' }]
              }
            ]
          })
        );
        await linter.lint();
        const diagnostics =
          getDiagnosticsForPath(linter.diagnostics, path.join(linter.dir, 'ui.json'))?.filter(
            d => d.code === ERRORS.UI_PAGE_UNSUPPORTED_VARIABLE
          ) || [];
        if (diagnostics.length !== numErrors) {
          expect.fail(
            `Expected ${numErrors} ${ERRORS.UI_PAGE_UNSUPPORTED_VARIABLE} diagnostics, got: ` +
              stringifyDiagnostics(diagnostics)
          );
        }
      });
    });

    it('validates vfPages in data templates', async () => {
      const dir = 'vfPageInDataTemplate';
      linter = new TestLinter(
        dir,
        {
          templateType: 'data',
          uiDefinition: 'ui.json',
          variableDefinition: 'variables.json'
        },
        new StringDocument(path.join(dir, 'ui.json'), {
          pages: [
            {
              title: 'title',
              vfPage: {
                name: 'name',
                namespace: 'ns'
              }
            }
          ]
        })
      );
      await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, path.join(linter.dir, 'ui.json'))?.filter(
        d => d.code === ERRORS.UI_PAGE_VFPAGE_UNSUPPORTED
      );
      if (diagnostics?.length !== 1) {
        expect.fail(
          `Expected 1 ${ERRORS.UI_PAGE_VFPAGE_UNSUPPORTED} diagnostics, got: ` + stringifyDiagnostics(diagnostics)
        );
      }
    });
  });
});
