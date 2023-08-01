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
describe('TemplateLinter readiness.json', () => {
  let linter: TestLinter | undefined;

  afterEach(() => {
    linter?.reset();
    linter = undefined;
  });

  it('validates variable names in values', async () => {
    const dir = 'variableNames';
    const readinessPath = path.join(dir, 'readiness.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'app',
        variableDefinition: 'variables.json',
        readinessDefinition: 'readiness.json'
      },
      new StringDocument(path.join(dir, 'variables.json'), { foo: {}, bar: {} }),
      new StringDocument(readinessPath, {
        values: {
          foo: 'exact match',
          baz: 'should fuzzy match on bar',
          thing: 'should not fuzzy match anything'
        }
      })
    );
    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, readinessPath) || [];
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 unknown variable errors, got ' + stringifyDiagnostics(diagnostics));
    }
    expect(diagnostics[0].code, 'diagnostics[0].code').to.equal(ERRORS.READINESS_UNKNOWN_VARIABLE);
    expect(diagnostics[0].jsonpath, 'diagnostics[0].jsonpath').to.equal('values.baz');
    expect(diagnostics[0].args?.match, 'diagnostics[0].args.match').to.equal('bar');

    expect(diagnostics[1].code, 'diagnostics[1].code').to.equal(ERRORS.READINESS_UNKNOWN_VARIABLE);
    expect(diagnostics[1].jsonpath, 'diagnostics[1].jsonpath').to.equal('values.thing');
    expect(diagnostics[1].args?.match, 'diagnostics[1].args.match').to.be.undefined;
  });

  it('validates apexCallback for ApexCallout', async () => {
    const dir = 'apexCallback';
    const readinessPath = path.join(dir, 'readiness.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'app',
        readinessDefinition: 'readiness.json'
      },
      new StringDocument(readinessPath, {
        definition: {
          foo: {
            type: 'ApexCallout',
            method: 'foo',
            arguments: {}
          }
        }
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, readinessPath) || [];
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 ApexCallback error, got ' + stringifyDiagnostics(diagnostics));
    }
    expect(diagnostics[0].code).to.equal(ERRORS.READINESS_NO_APEX_CALLBACK);
  });
});
