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
describe('TemplateLinter auto-install.json', () => {
  let linter: TestLinter | undefined;

  afterEach(() => {
    linter?.reset();
    linter = undefined;
  });

  it('validates variable names in values', async () => {
    const dir = 'variableNames';
    const autoInstallPath = path.join(dir, 'auto-install.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'app',
        variableDefinition: 'variables.json',
        autoInstallDefinition: 'auto-install.json'
      },
      new StringDocument(path.join(dir, 'variables.json'), { foo: {}, bar: {} }),
      new StringDocument(autoInstallPath, {
        hooks: [{ type: 'PackageInstall' }],
        configuration: {
          appConfiguration: {
            values: {
              foo: 'exact match',
              baz: 'should fuzzy match on bar',
              thing: 'should not fuzzy match anything'
            }
          }
        }
      })
    );
    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, autoInstallPath) || [];
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 unknown variable errors, got ' + stringifyDiagnostics(diagnostics));
    }
    expect(diagnostics[0].code, 'diagnostics[0].code').to.equal(ERRORS.AUTO_INSTALL_UNKNOWN_VARIABLE);
    expect(diagnostics[0].jsonpath, 'diagnostics[0].jsonpath').to.equal('configuration.appConfiguration.values.baz');
    expect(diagnostics[0].args?.match, 'diagnostics[0].args.match').to.equal('bar');

    expect(diagnostics[1].code, 'diagnostics[1].code').to.equal(ERRORS.AUTO_INSTALL_UNKNOWN_VARIABLE);
    expect(diagnostics[1].jsonpath, 'diagnostics[1].jsonpath').to.equal('configuration.appConfiguration.values.thing');
    expect(diagnostics[1].args?.match, 'diagnostics[1].args.match').to.be.undefined;
  });
});
