/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as path from 'path';
import { DiagnosticSeverity } from 'vscode-json-languageservice';
import { ERRORS, JSON_SCHEMA_SOURCE_ID, LINTER_SOURCE_ID } from '../../src/constants';
import { FileTemplateValidator } from '../../src/validator';
import { getDiagnosticsByPath, getDiagnosticsForPath, sfdxTestTemplatesPath } from '../testutils';

// tslint:disable: no-unused-expression
describe('FileTemplateValidator', () => {
  it('validates template-info/invalid/empty-no-text.json', async () => {
    const templateInfoPath = path.join(
      __dirname,
      'schemas',
      'testfiles',
      'template-info',
      'invalid',
      'empty-no-text.json'
    );
    const validator = new FileTemplateValidator(await FileTemplateValidator.createTextDocument(templateInfoPath));
    await validator.lint();
    const srcDiagnostics = getDiagnosticsForPath(validator.diagnostics, templateInfoPath);
    expect(srcDiagnostics, 'diagnostics').to.not.be.undefined;
    const diagnostics = JSON.parse(JSON.stringify(srcDiagnostics));
    const expectedDiagnostics = [
      {
        range: {
          start: {
            line: 0,
            character: 0
          },
          end: {
            line: 0,
            character: 0
          }
        },
        message: 'File does not contain template json',
        code: ERRORS.TMPL_EMPTY_FILE,
        severity: DiagnosticSeverity.Error,
        source: LINTER_SOURCE_ID
      }
    ];
    expect(diagnostics, 'diagnostics').to.have.deep.members(expectedDiagnostics);
    if (validator.diagnostics.size > 1) {
      expect.fail(
        `Expected diagnostics only for ${templateInfoPath}, got diagnostics for: ` +
          Array.from(validator.diagnostics.keys())
            .map(doc => doc.uri)
            .filter(filepath => filepath !== templateInfoPath)
            .join(', ')
      );
    }
  });

  // run validation on the semantically empty template-info testfiles
  [
    {
      filename: 'empty.json',
      missingField: 'releaseInfo',
      lintWarning: {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: 'App templates must have at least 1 dashboard, dataflow, externaFile, lens, or recipe specified',
        code: ERRORS.TMPL_APP_MISSING_OBJECTS
      }
    },
    {
      filename: 'empty-app.json',
      missingField: 'releaseInfo',
      lintWarning: {
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 23 } },
        message: 'App templates must have at least 1 dashboard, dataflow, externaFile, lens, or recipe specified',
        code: ERRORS.TMPL_APP_MISSING_OBJECTS
      }
    },
    {
      filename: 'empty-dashboard.json',
      missingField: 'dashboards',
      lintWarning: {
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 29 } },
        message: 'Dashboard templates must have exactly 1 dashboard specified',
        code: ERRORS.TMPL_DASH_ONE_DASHBOARD
      }
    },
    {
      filename: 'empty-lens.json',
      missingField: 'lenses'
    }
  ].forEach(({ filename, missingField, lintWarning }) => {
    it(`validates template-info/invalid/${filename}`, async () => {
      const templateInfoPath = path.join(__dirname, 'schemas', 'testfiles', 'template-info', 'invalid', filename);
      const validator = new FileTemplateValidator(await FileTemplateValidator.createTextDocument(templateInfoPath));
      await validator.lint();
      const srcDiagnostics = getDiagnosticsForPath(validator.diagnostics, templateInfoPath);
      expect(srcDiagnostics, 'diagnostics').to.not.be.undefined;
      const diagnostics = JSON.parse(JSON.stringify(srcDiagnostics));
      const schemaRange = {
        start: {
          line: 0,
          character: 0
        },
        end: {
          line: 0,
          character: 1
        }
      };
      const expectedDiagnostics = [
        // json schema warnings from json-languageservice
        {
          range: schemaRange,
          message: 'Missing property "name".',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        },
        {
          range: schemaRange,
          message: 'Missing property "label".',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        },
        {
          range: schemaRange,
          message: 'Missing property "assetVersion".',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        },
        // this one can differ between app and dashboard/lens templates
        {
          range: schemaRange,
          message: `Missing property "${missingField}".`,
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ];
      // and possibly a warning form TemplateLinter
      if (lintWarning) {
        expectedDiagnostics.push({ severity: DiagnosticSeverity.Warning, source: 'adx-template', ...lintWarning });
      }
      expect(diagnostics, 'diagnostics').to.have.deep.members(expectedDiagnostics);
      if (validator.diagnostics.size > 1) {
        expect.fail(
          `Expected diagnostics only for ${templateInfoPath}, got diagnostics for: ` +
            Array.from(validator.diagnostics.keys())
              .map(doc => doc.uri)
              .filter(filepath => filepath !== templateInfoPath)
              .join(', ')
        );
      }
    });
  });

  it('validates allRelpaths/ template', async () => {
    const templatePath = path.join(sfdxTestTemplatesPath, 'allRelpaths');
    const templateInfoPath = path.join(templatePath, 'template-info.json');
    const validator = new FileTemplateValidator(await FileTemplateValidator.createTextDocument(templateInfoPath));
    await validator.lint();
    const diagnostics = getDiagnosticsByPath(validator.diagnostics);
    expect(diagnostics, 'diagnostics').to.deep.equal({
      [templateInfoPath]: [
        {
          range: { start: { line: 13, character: 2 }, end: { line: 13, character: 42 } },
          message: 'Deprecated. Use a templateToApp rule instead.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        },
        {
          range: { start: { line: 13, character: 2 }, end: { line: 13, character: 42 } },
          message:
            "Template is combining deprecated 'ruleDefinition' and 'rules'. Please consolidate 'ruleDefinition' into 'rules'",
          severity: DiagnosticSeverity.Error,
          code: ERRORS.TMPL_RULES_AND_RULE_DEFINITION,
          source: LINTER_SOURCE_ID
        },
        {
          range: { start: { line: 12, character: 2 }, end: { line: 12, character: 46 } },
          message: "'name' is required in folderDefinition file when using autoInstallDefinition",
          severity: DiagnosticSeverity.Warning,
          code: ERRORS.TMPL_AUTO_INSTALL_MISSING_FOLDER_NAME,
          source: LINTER_SOURCE_ID,
          relatedInformation: [
            {
              location: {
                uri: path.join(templatePath, 'folder.json'),
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
              },
              message: 'folderDefinition file'
            }
          ]
        }
      ],
      [path.join(templatePath, 'app-to-template-rules.json')]: [
        {
          range: { start: { line: 5, character: 2 }, end: { line: 5, character: 9 } },
          message: 'Property error is not allowed.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ],
      [path.join(templatePath, 'auto-install.json')]: [
        {
          range: { start: { line: 5, character: 2 }, end: { line: 5, character: 9 } },
          message: 'Property error is not allowed.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ],
      [path.join(templatePath, 'folder.json')]: [
        {
          range: { start: { line: 5, character: 2 }, end: { line: 5, character: 9 } },
          message: 'Property error is not allowed.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ],
      [path.join(templatePath, 'rule-definition.json')]: [
        {
          range: { start: { line: 5, character: 2 }, end: { line: 5, character: 9 } },
          message: 'Property error is not allowed.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ],
      [path.join(templatePath, 'template-to-app-rules.json')]: [
        {
          range: { start: { line: 5, character: 2 }, end: { line: 5, character: 9 } },
          message: 'Property error is not allowed.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ],
      [path.join(templatePath, 'ui.json')]: [
        {
          range: { start: { line: 5, character: 2 }, end: { line: 5, character: 9 } },
          message: 'Property error is not allowed.',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ],
      [path.join(templatePath, 'variables.json')]: [
        {
          range: { start: { line: 5, character: 11 }, end: { line: 5, character: 52 } },
          message: 'Incorrect type. Expected "object".',
          severity: DiagnosticSeverity.Warning,
          source: JSON_SCHEMA_SOURCE_ID
        }
      ]
    });
  });

  it('validates badFilepaths/ template', async () => {
    const templatePath = path.join(sfdxTestTemplatesPath, 'badFilepaths');
    const templateInfoPath = path.join(templatePath, 'template-info.json');
    const validator = new FileTemplateValidator(await FileTemplateValidator.createTextDocument(templateInfoPath));
    await validator.lint();
    const diagnostics = getDiagnosticsForPath(validator.diagnostics, templateInfoPath)
      ?.filter(
        // filter out the ones about ruleDefinition and the folder.json not having a name w/ auto-install
        d =>
          !(
            (d.source === JSON_SCHEMA_SOURCE_ID && d.message.startsWith('Deprecated')) ||
            d.code === ERRORS.TMPL_RULES_AND_RULE_DEFINITION ||
            d.code === ERRORS.TMPL_AUTO_INSTALL_MISSING_FOLDER_NAME
          )
      )
      ?.sort((d1, d2) => d1.range.start.line - d2.range.start.line)
      // trim them down to just the fields we're looking for
      ?.map(d => {
        return { line: d.range.start.line, code: d.code };
      });

    const expected = [
      ...[7, 71, 79, 93].map(line => {
        return { line, code: ERRORS.TMPL_INVALID_REL_PATH };
      }),
      ...[9, 10, 11, 12, 13, 17, 21, 27, 29, 30, 37, 44, 51, 58, 84].map(line => {
        return { line, code: ERRORS.TMPL_REL_PATH_NOT_EXIST };
      }),
      { line: 63, code: ERRORS.TMPL_REL_PATH_NOT_FILE }
    ].sort((d1, d2) => d1.line - d2.line);

    expect(diagnostics, 'diagnostics').to.have.deep.members(expected);

    if (validator.diagnostics.size > 1) {
      expect.fail(
        `Expected diagnostics only for ${templateInfoPath}, got diagnostics for: ` +
          Array.from(validator.diagnostics.keys())
            .map(doc => doc.uri)
            .filter(filepath => filepath !== templateInfoPath)
            .join(', ')
      );
    }
  });

  // TODO: add more validation/linting tests
  // There is a lot of testing in the vscode extension, which uses the same json schemas, vscode-json-languageservice
  // module, and TemplateLinter, so there should be indirect coverage there for now.
});
