/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { expect } from 'chai';
import * as path from 'path';
import { ERRORS, LINTER_MAX_EXTERNAL_FILE_SIZE } from '../../../src';
import { getDiagnosticsForPath, set } from '../../testutils';
import { StringDocument, stringifyDiagnostics, TestLinter } from './testlinter';

// tslint:disable: no-unused-expression
describe('TemplateLinter template-info.json', () => {
  let linter: TestLinter | undefined;

  afterEach(() => {
    linter?.reset();
    linter = undefined;
  });

  [
    'components',
    'datasetFiles',
    'dashboards',
    'eltDataflows',
    'dataTransforms',
    'externalFiles',
    'lenses',
    'recipes',
    'extendedTypes.discoveryStories',
    'extendedTypes.predictiveScoring'
  ].forEach(fieldName => {
    it(`validates app template minimum assets with ${fieldName}`, async () => {
      const dir = 'minassets';
      const json: Record<string, unknown> = {
        templateType: 'app'
      };
      set(json, fieldName, [{ file: 'file.json', label: 'label', name: 'name' }]);
      linter = new TestLinter(dir, json, new StringDocument(path.join(dir, 'file.json'), {}));
      await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri);
      expect(diagnostics).to.be.undefined;
    });
  });

  it('validates app template with no assets', async () => {
    const dir = 'minassets';
    linter = new TestLinter(dir, { templateType: 'app' });
    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
      d => d.code === ERRORS.TMPL_APP_MISSING_OBJECTS
    );
    expect(diagnostics?.length).to.equal(1);
  });

  ['datasetFiles', 'externalFiles', 'recipes'].forEach(fieldName => {
    it(`validates data template minimum assets with ${fieldName}`, async () => {
      const dir = 'minassets';
      linter = new TestLinter(
        dir,
        {
          templateType: 'app',
          [fieldName]: [
            {
              file: 'file.json',
              label: 'label',
              name: 'name'
            }
          ]
        },
        new StringDocument(path.join(dir, 'file.json'), {})
      );
      await linter.lint();
      const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri);
      expect(diagnostics).to.be.undefined;
    });
  });

  it('validates data template with no assets', async () => {
    const dir = 'minassets';
    linter = new TestLinter(dir, { templateType: 'data' });
    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, linter.templateInfoDoc.uri)?.filter(
      d => d.code === ERRORS.TMPL_DATA_MISSING_OBJECTS
    );
    expect(diagnostics?.length).to.equal(1);
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

  [
    { templateType: 'data', errorExpected: false },
    { templateType: 'app', errorExpected: false },
    { templateType: 'embeddedapp', errorExpected: false },
    { templateType: 'dashboard', errorExpected: true },
    { templateType: 'lens', errorExpected: true }
  ].forEach(({ templateType, errorExpected }) => {
    it(`validates autoInstallDefinition for ${templateType} type template`, async () => {
      const dir = 'autoInstall';
      const autoInstallPath = path.join(dir, 'auto-install.json');
      linter = new TestLinter(
        dir,
        {
          templateType,
          autoInstallDefinition: 'auto-install.json'
        },
        new StringDocument(autoInstallPath, {
          hooks: [{ type: 'PackageInstall' }],
          configuration: {
            appConfiguration: {
              values: {}
            }
          }
        })
      );
      await linter.lint();
      const diagnostics =
        getDiagnosticsForPath(linter.diagnostics, path.join(linter.dir, 'template-info.json'))?.filter(
          d => d.code === ERRORS.TMPL_NON_APP_WITH_AUTO_INSTALL
        ) || [];
      if (!errorExpected) {
        expect(diagnostics.length === 0);
      } else {
        expect(diagnostics[0].code, 'diagnostics[0].code').to.equal(ERRORS.TMPL_NON_APP_WITH_AUTO_INSTALL);
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
