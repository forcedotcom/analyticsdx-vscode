/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { jsonpathFrom, uriStat } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles,
  setDocumentText,
  sortDiagnostics,
  waitForDiagnostics
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateLinterManager lints variables.json', () => {
  let tmpdir: vscode.Uri | undefined;
  beforeEach(async () => {
    await closeAllEditors();
    tmpdir = undefined;
  });

  afterEach(async () => {
    await closeAllEditors();
    // delete the temp folder
    if (tmpdir && (await uriStat(tmpdir))) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
    tmpdir = undefined;
  });

  async function createTemplateWithVariables(initialJson: string | object): Promise<vscode.TextEditor> {
    const [dir, [editor]] = await createTemplateWithRelatedFiles({
      field: 'variableDefinition',
      path: 'variables.json',
      initialJson
    });
    tmpdir = dir;
    return editor;
  }

  it('shows problem on mulitple regex variable excludes', async () => {
    const variablesEditor = await createTemplateWithVariables({
      foovar: {
        description: 'mulitple regex excludes',
        excludes: ['/^(?:(?!__c).)*$/', 'Event', '/(?!^Case$|^Account$|^Contact$)(^.*$)/'],
        variableType: {
          type: 'SobjectFieldType'
        }
      }
    });
    const diagnostics = await waitForDiagnostics(
      variablesEditor.document.uri,
      undefined,
      'Initial multiple regex excludes warning'
    );
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 diagnostic, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    const diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic.message').to.equal(
      'Multiple regular expression excludes found, only the first will be used'
    );
    expect(diagnostic.code, 'diagnotic.code').to.equal(ERRORS.VARS_MULTIPLE_REGEXES);
    // there should be a relatedInfo for each regex exclude value
    expect(diagnostic.relatedInformation, 'diagnostic.relatedInformation').to.be.not.undefined;
    expect(diagnostic.relatedInformation!.length, 'diagnostic.relatedInformation.length').to.equal(2);

    // fix variables.json, make sure diagnostic goes away
    await setDocumentText(variablesEditor, {
      foovar: {
        excludes: ['/^(?:(?!__c).)*$/', 'Event'],
        variableType: {
          type: 'SobjectFieldType'
        }
      }
    });
    // and it should end up no warnings
    await waitForDiagnostics(
      variablesEditor.document.uri,
      d => d && d.length === 0,
      'No diagnostics on variables.json after fix'
    );
  });

  it('shows problems on invalid regex variable excludes', async () => {
    const variablesEditor = await createTemplateWithVariables({
      foovar: {
        description: 'invalid regex excludes -- missing close paren, missing end /s, and bad options',
        excludes: [
          '/^good$/',
          '/^good$/i',
          '/(?!^bad$|^Account$|^Contact$)(^.*$/',
          '/',
          '/missing-close-slash',
          '/foo/badoptions',
          '/double options/ii'
        ],
        variableType: {
          type: 'SobjectFieldType'
        }
      }
    });
    const diagnostics = (
      await waitForDiagnostics(variablesEditor.document.uri, undefined, 'Initial invalid regex excludes warning')
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 6) {
      expect.fail('Expected 6 diagnostic, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // the 1st diagnostic should be about having mulitple regexes, so skip that and check the others
    let diagnostic = diagnostics[1];
    expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
    // Note: the diagnostic message here will really be coming from Electron/node so it might change in newer versions
    expect(diagnostic.message, 'diagnostic[1].message')
      .to.match(/^Invalid regular expression:/)
      .and.match(/Unterminated group$/);
    expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.VARS_INVALID_REGEX);
    expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('foovar.excludes[2]');

    diagnostic = diagnostics[2];
    expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[2].message').to.equal('Missing closing / for regular expression');
    expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.VARS_REGEX_MISSING_SLASH);
    expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('foovar.excludes[3]');

    diagnostic = diagnostics[3];
    expect(diagnostic, 'diagnostic[3]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[3].message').to.equal('Missing closing / for regular expression');
    expect(diagnostic.code, 'diagnotic[3].code').to.equal(ERRORS.VARS_REGEX_MISSING_SLASH);
    expect(jsonpathFrom(diagnostic), 'diagnostic[3].jsonpath').to.equal('foovar.excludes[4]');

    diagnostic = diagnostics[4];
    expect(diagnostic, 'diagnostic[4]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[4].message').to.equal('Invalid regular expression options');
    expect(diagnostic.code, 'diagnotic[4].code').to.equal(ERRORS.VARS_INVALID_REGEX_OPTIONS);
    expect(jsonpathFrom(diagnostic), 'diagnostic[4].jsonpath').to.equal('foovar.excludes[5]');

    diagnostic = diagnostics[5];
    expect(diagnostic, 'diagnostic[5]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[5].message').to.equal('Duplicate option in regular expression options');
    expect(diagnostic.code, 'diagnotic[4].code').to.equal(ERRORS.VARS_INVALID_REGEX_OPTIONS);
    expect(jsonpathFrom(diagnostic), 'diagnostic[5].jsonpath').to.equal('foovar.excludes[6]');

    // fix variables.json, make sure diagnostic goes away
    await setDocumentText(variablesEditor, {
      foovar: {
        excludes: ['/^good$/', '/^good$/im', '/(?!^bad$|^Account$|^Contact$)(^.*)$/', '/foo/gimsuy'],
        variableType: {
          type: 'SobjectFieldType'
        }
      }
    });
    // and it should end up w/ just the mulitple regex warning
    await waitForDiagnostics(
      variablesEditor.document.uri,
      d => d && d.length === 1 && jsonpathFrom(d[0]) === 'foovar.excludes',
      'No invalid regex diagnostics on variables.json after fix'
    );
  });
});
