/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { expect } from 'chai';
import * as path from 'path';
import { ERRORS } from '../../../src';
import { getDiagnosticsForPath } from '../../testutils';
import { StringDocument, stringifyDiagnostics, TestLinter } from './testlinter';

// tslint:disable: no-unused-expression
describe('TemplateLinter ui.json', () => {
  let linter: TestLinter | undefined;

  afterEach(() => {
    linter?.reset();
    linter = undefined;
  });

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
