/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { getNodePath, Node as JsonNode } from 'jsonc-parser';
import * as path from 'path';
import {
  ERRORS,
  jsonPathToString,
  LINTER_MAX_EXTERNAL_FILE_SIZE,
  TemplateLinter,
  TemplateLinterDiagnosticSeverity,
  TemplateLinterDocument
} from '../../src';
import { getDiagnosticsForPath } from '../testutils';

class StringDocument implements TemplateLinterDocument<string> {
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

interface Diagnostic {
  doc: StringDocument;
  mesg: string;
  code: string;
  jsonpath: string | undefined;
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
      jsonpath: d.jsonpath,
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

    ['data', 'app', undefined].forEach(templateType => {
      it(`validates layoutDefinition for ${templateType} templateType`, async () => {
        const dir = 'layoutDefinition';
        linter = new TestLinter(
          dir,
          {
            templateType,
            layoutDefinition: 'layout.json'
          },
          new StringDocument(path.join(dir, 'layout.json'), {})
        );
        await linter.lint();
        let diagnostics =
          getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
            d => d.code === ERRORS.TMPL_LAYOUT_UNSUPPORTED
          ) || [];
        // should get an error for non-data template
        if (templateType !== 'data' && diagnostics.length !== 1) {
          expect.fail('Expected 1 layout definition diagnostic, got: ' + stringifyDiagnostics(diagnostics));
        } else if (templateType === 'data' && diagnostics.length !== 0) {
          expect.fail('Expected no layout definition diagnostic, got: ' + stringifyDiagnostics(diagnostics));
        }
        // and there shouldn't be an error about the file not existing
        diagnostics =
          getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
            d => d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST
          ) || [];
        if (diagnostics.length !== 0) {
          expect.fail('Expected no file not found diagnostics, got ' + stringifyDiagnostics(diagnostics));
        }
      });
    });

    it('validates CSV size', async () => {
      const dir = 'csvSize';
      linter = new TestLinter(
        dir,
        {
          externalFiles: [
            {
              file: 'good.csv',
              name: 'good',
              type: 'CSV'
            },
            {
              file: 'bad.csv',
              name: 'bad',
              type: 'CSV'
            },
            {
              file: 'small.csv',
              name: 'small',
              type: 'CSV'
            }
          ]
        },
        new StringDocument(path.join(dir, 'good.csv'), '', { sizeOverride: LINTER_MAX_EXTERNAL_FILE_SIZE }),
        new StringDocument(path.join(dir, 'bad.csv'), '', { sizeOverride: LINTER_MAX_EXTERNAL_FILE_SIZE + 1 }),
        new StringDocument(path.join(dir, 'small.csv'), '', { sizeOverride: 100 })
      );
      await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
        d => d.code === ERRORS.TMPL_EXTERNAL_FILE_TOO_BIG
      );
      if (diagnostics?.length !== 1) {
        expect.fail('Expected 1 file size diagnostic, got: ' + stringifyDiagnostics(diagnostics));
      }
      expect(diagnostics[0].jsonpath).to.equal('externalFiles[1].file');
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

  describe('layout.json', () => {
    it('validates variables exist', async () => {
      const dir = 'layoutVariables';
      const layoutPath = path.join(dir, 'layout.json');
      linter = new TestLinter(
        dir,
        {
          templateType: 'data',
          layoutDefinition: 'layout.json',
          variableDefinition: 'variables.json'
        },
        new StringDocument(path.join(dir, 'variables.json'), {
          foo: { variableType: { type: 'StringType' } }
        }),
        new StringDocument(layoutPath, {
          pages: [
            {
              title: '',
              layout: {
                type: 'SingleColumn',
                center: {
                  items: [
                    { type: 'Variable', name: 'foo' },
                    { type: 'Variable', name: 'food' }
                  ]
                }
              }
            },
            {
              title: '',
              layout: {
                type: 'TwoColumn',
                left: {
                  items: [{ type: 'Variable', name: 'bar' }]
                },
                right: {
                  items: [
                    { type: 'Variable', name: 'foo' },
                    { type: 'Text', text: '...' }
                  ]
                }
              }
            }
          ]
        })
      );

      const errors = await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
      if (diagnostics.length !== 2) {
        expect.fail('Expected 2 unknown variable errors, got' + stringifyDiagnostics(diagnostics));
      }

      let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[1].name');
      expect(diagnostic, 'food variable error').to.not.be.undefined;
      expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
      expect(diagnostic!.args).to.deep.equal({ name: 'food', match: 'foo' });

      diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].layout.left.items[0].name');
      expect(diagnostic, 'bar variable error').to.not.be.undefined;
      expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
      expect(diagnostic!.args).to.deep.equal({ name: 'bar' });
    });

    it('validates variable types', async () => {
      const dir = 'layoutVariables';
      const layoutPath = path.join(dir, 'layout.json');
      linter = new TestLinter(
        dir,
        {
          templateType: 'data',
          layoutDefinition: 'layout.json',
          variableDefinition: 'variables.json'
        },
        new StringDocument(path.join(dir, 'variables.json'), {
          obj: { variableType: { type: 'ObjectType' } },
          datetime: { variableType: { type: 'DateTimeType' } },
          foo: { variableType: { type: 'StringType' } }
        }),
        new StringDocument(layoutPath, {
          pages: [
            {
              title: '',
              layout: {
                type: 'SingleColumn',
                center: {
                  items: [
                    { type: 'Variable', name: 'obj' },
                    { type: 'Variable', name: 'datetime' },
                    { type: 'Variable', name: 'foo' }
                  ]
                }
              }
            }
          ]
        })
      );

      const errors = await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
      if (diagnostics.length !== 2) {
        expect.fail('Expected 2 unsupported variable errors, got' + stringifyDiagnostics(diagnostics));
      }

      let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[0].name');
      expect(diagnostic, 'obj variable error').to.not.be.undefined;
      expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNSUPPORTED_VARIABLE);

      diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[1].name');
      expect(diagnostic, 'datetime variable error').to.not.be.undefined;
      expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNSUPPORTED_VARIABLE);
    });
  });
});
