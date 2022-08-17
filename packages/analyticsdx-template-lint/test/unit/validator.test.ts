/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { JSONPath, Node as JsonNode, ParseError, parseTree } from 'jsonc-parser';
import * as path from 'path';
import { DiagnosticSeverity, ErrorCode, TextDocument } from 'vscode-json-languageservice';
import { ERRORS, JSON_SCHEMA_SOURCE_ID, JSON_SOURCE_ID, LINTER_SOURCE_ID, matchJsonNodeAtPattern } from '../../src';
import { FileTemplateValidator } from '../../src/validator';
import { getDiagnosticsByPath, getDiagnosticsForPath, parseErrorToString, sfdxTestTemplatesPath } from '../testutils';

function parseOrThrow(json: string): JsonNode {
  const errors: ParseError[] = [];
  const tree = parseTree(json, errors);
  if (errors.length > 0) {
    throw new Error('Failed to parse json: ' + errors.map(e => parseErrorToString(e, json)).join(', '));
  }
  if (!tree) {
    throw new Error('Empty json from parse');
  }
  return tree;
}

function jsonpathLineNum(tree: JsonNode, jsonpath: JSONPath, doc: TextDocument): number {
  const node = matchJsonNodeAtPattern(tree, jsonpath);
  if (!node) {
    throw new Error('Failed to find node for ' + jsonpath.join('.'));
  }
  return doc.positionAt(node.offset).line;
}

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
        message: 'App templates must have at least 1 dashboard, dataflow, externalFile, lens, or recipe specified',
        code: ERRORS.TMPL_APP_MISSING_OBJECTS
      }
    },
    {
      filename: 'empty-app.json',
      missingField: 'releaseInfo',
      lintWarning: {
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 23 } },
        message: 'App templates must have at least 1 dashboard, dataflow, externalFile, lens, or recipe specified',
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
      filename: 'empty-data-app.json',
      missingField: 'releaseInfo',
      lintWarning: {
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 24 } },
        message: 'Data templates must have at least 1 dataset, externalFile, or recipe specified',
        code: ERRORS.TMPL_DATA_MISSING_OBJECTS
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
          range: { start: { line: 14, character: 2 }, end: { line: 14, character: 42 } },
          message: 'Deprecated. Use a templateToApp rule instead.',
          severity: DiagnosticSeverity.Warning,
          code: ErrorCode.Deprecated,
          source: JSON_SOURCE_ID
        },
        {
          range: { start: { line: 14, character: 2 }, end: { line: 14, character: 42 } },
          message:
            "Template is combining deprecated 'ruleDefinition' and 'rules'. Please consolidate 'ruleDefinition' into 'rules'",
          severity: DiagnosticSeverity.Error,
          code: ERRORS.TMPL_RULES_AND_RULE_DEFINITION,
          source: LINTER_SOURCE_ID
        },
        {
          range: { start: { line: 11, character: 23 }, end: { line: 11, character: 34 } },
          message: 'layoutDefinition is only supported in data templates',
          severity: DiagnosticSeverity.Warning,
          code: ERRORS.TMPL_LAYOUT_UNSUPPORTED,
          source: LINTER_SOURCE_ID
        },
        {
          range: { start: { line: 13, character: 2 }, end: { line: 13, character: 46 } },
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
      [path.join(templatePath, 'layout.json')]: [
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
    const doc = await FileTemplateValidator.createTextDocument(templateInfoPath);
    const validator = new FileTemplateValidator(doc);
    await validator.lint();
    const diagnostics = getDiagnosticsForPath(validator.diagnostics, templateInfoPath)
      ?.filter(
        // filter out the ones about ruleDefinition and the folder.json not having a name w/ auto-install
        d =>
          !(
            (d.source === JSON_SOURCE_ID && d.code === ErrorCode.Deprecated) ||
            d.code === ERRORS.TMPL_RULES_AND_RULE_DEFINITION ||
            d.code === ERRORS.TMPL_AUTO_INSTALL_MISSING_FOLDER_NAME
          )
      )
      ?.sort((d1, d2) => d1.range.start.line - d2.range.start.line)
      // trim them down to just the fields we're looking for
      ?.map(d => {
        return { line: d.range.start.line, code: d.code };
      });

    const templateInfo = parseOrThrow(doc.getText());

    // the line #s of TMPL_INVALID_REL_PATH errors
    const invalidRelPathLines = [
      // empty rel path
      ['releaseInfo', 'notesFile'] as JSONPath,
      // .. in the middle of the path
      ['datasetFiles', 0, 'userXmd'],
      // .. at the beginning
      ['extendedTypes', 'discoveryStories', 0, 'file'],
      // absolute path
      ['imageFiles', 0, 'file']
    ].map(jsonpath => jsonpathLineNum(templateInfo, jsonpath, doc));

    // the line #s of TMPL_REL_PATH_NOT_EXIST errors
    const relPathNotExistLines = [
      ['variableDefinition'] as JSONPath,
      ['uiDefinition'],
      ['layoutDefinition'],
      ['folderDefinition'],
      ['autoInstallDefinition'],
      ['ruleDefinition'],
      ['rules', 0, 'file'],
      ['rules', 1, 'file'],
      ['externalFiles', 0, 'file'],
      ['externalFiles', 0, 'schema'],
      ['externalFiles', 0, 'userXmd'],
      ['lenses', 0, 'file'],
      ['dashboards', 0, 'file'],
      ['components', 0, 'file'],
      ['eltDataflows', 0, 'file'],
      ['recipes', 0, 'file'],
      ['extendedTypes', 'predictiveScoring', 0, 'file']
    ].map(jsonpath => jsonpathLineNum(templateInfo, jsonpath, doc));

    const expected = [
      ...invalidRelPathLines.map(line => {
        return { line, code: ERRORS.TMPL_INVALID_REL_PATH };
      }),
      ...relPathNotExistLines.map(line => {
        return { line, code: ERRORS.TMPL_REL_PATH_NOT_EXIST };
      }),
      // storedQueries points to a directory, so it gets a TMPL_REL_PATH_NOT_FILE error
      { line: jsonpathLineNum(templateInfo, ['storedQueries', 0, 'file'], doc), code: ERRORS.TMPL_REL_PATH_NOT_FILE },
      // layoutDefinition is only valid for templates
      { line: jsonpathLineNum(templateInfo, ['layoutDefinition'], doc), code: ERRORS.TMPL_LAYOUT_UNSUPPORTED }
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

  it('validates bad_data_template/ template', async () => {
    const templateInfoPath = path.join(sfdxTestTemplatesPath, 'bad_data_template', 'template-info.json');
    const doc = await FileTemplateValidator.createTextDocument(templateInfoPath);
    const validator = new FileTemplateValidator(doc);
    await validator.lint();

    // there should be one missing object warning on the templateType node
    const diagnostics = getDiagnosticsForPath(validator.diagnostics, templateInfoPath)?.filter(
      d => d.code === ERRORS.TMPL_DATA_MISSING_OBJECTS
    );
    if (diagnostics?.length !== 1) {
      expect.fail(
        `Expected 1 missing objects diagnostic for ${templateInfoPath}, got: ${JSON.stringify(
          diagnostics,
          undefined,
          2
        )}`
      );
    }
    const templateInfo = parseOrThrow(doc.getText());
    expect(diagnostics[0].range.start.line, 'missing objects diagnostic line num').to.equal(
      jsonpathLineNum(templateInfo, ['templateType'], doc)
    );
    // it should have relatedInformation pointing to the 2 empty array fields
    let lineNums = diagnostics[0].relatedInformation?.map(r => r.location.range.start.line).sort();
    let expectedLines = [
      jsonpathLineNum(templateInfo, ['recipes'], doc),
      jsonpathLineNum(templateInfo, ['datasetFiles'], doc)
    ].sort();
    expect(lineNums, 'missing objects diagnostic relatedInformation').to.have.deep.members(expectedLines);

    // there should be unsupported object warnings on the various fields
    lineNums = getDiagnosticsForPath(validator.diagnostics, templateInfoPath)
      ?.filter(d => d.code === ERRORS.TMPL_DATA_UNSUPPORTED_OBJECT)
      .map(d => d.range.start.line)
      .sort();
    expectedLines = [
      ['dashboards'] as JSONPath,
      ['components'],
      ['lenses'],
      ['eltDataflows'],
      ['storedQueries'],
      ['extendedTypes', 'discoveryStories'],
      ['extendedTypes', 'predictiveScoring'],
      ['imageFiles'],
      ['templateDependencies']
    ]
      .map(jsonpath => jsonpathLineNum(templateInfo, jsonpath, doc))
      .sort();
    expect(lineNums, 'unsupported object diagnostic line nums').to.have.deep.members(expectedLines);
  });

  // TODO: add more validation/linting tests
  // There is a lot of testing in the vscode extension, which uses the same json schemas, vscode-json-languageservice
  // module, and TemplateLinter, so there should be indirect coverage there for now.
});
