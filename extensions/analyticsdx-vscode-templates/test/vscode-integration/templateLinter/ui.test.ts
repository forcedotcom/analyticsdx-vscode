/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { argsFrom, jsonpathFrom, uriStat } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles as _createTemplateWithRelatedFiles,
  openFile,
  PathFieldAndJson,
  setDocumentText,
  sortDiagnostics,
  uriFromTestRoot,
  waitForDiagnostics,
  waveTemplatesUriPath
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateLinterManager lints ui.json', () => {
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

  async function createTemplateWithRelatedFiles(...files: PathFieldAndJson[]) {
    const [dir, editors] = await _createTemplateWithRelatedFiles(...files);
    // save off the temp directory so it'll get deleted
    tmpdir = dir;
    return editors;
  }

  it('shows problems on unrecognized variables', async () => {
    // create a ui.json pointing to var that aren't in variables.json
    const uiJson = {
      pages: [
        {
          title: 'Page1',
          variables: [
            {
              name: 'badvar'
            },
            {
              name: 'var2'
            }
          ]
        }
      ]
    };
    const variablesJson: { [key: string]: { variableType: { type: string } } } = {
      var1: {
        variableType: {
          type: 'StringType'
        }
      }
    };
    const [uiEditor, variablesEditor] = await createTemplateWithRelatedFiles(
      {
        field: 'uiDefinition',
        path: 'ui.json',
        initialJson: uiJson
      },
      {
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson: variablesJson
      }
    );
    // we should get a warning on each var in ui.json
    let diagnostics = (await waitForDiagnostics(uiEditor.document.uri, undefined, 'Initial variable warnings')).sort(
      sortDiagnostics
    );
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostics[0]').to.be.not.undefined;
    expect(diagnostics[0].message, 'diagnostics[0].message').to.equal(
      "Cannot find variable 'badvar', did you mean 'var1'?"
    );
    expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.UI_PAGE_UNKNOWN_VARIABLE);
    expect(argsFrom(diagnostics[0])?.name, 'diagnostics[0].args.name').to.equal('badvar');
    expect(argsFrom(diagnostics[0])?.match, 'diagnostics[0].args.match').to.equal('var1');

    expect(diagnostics[1], 'diagnostics[1]').to.be.not.undefined;
    expect(diagnostics[1].message, 'diagnostics[1].message').to.equal(
      "Cannot find variable 'var2', did you mean 'var1'?"
    );
    expect(diagnostics[1].code, 'diagnostics[1].message').to.equal(ERRORS.UI_PAGE_UNKNOWN_VARIABLE);
    expect(argsFrom(diagnostics[1])?.name, 'diagnostics[1].args.name').to.equal('var2');
    expect(argsFrom(diagnostics[1])?.match, 'diagnostics[1].args.name').to.equal('var1');

    // now, change the 'badvar' ref to 'var1' in ui.json
    uiJson.pages[0].variables[0].name = 'var1';
    await setDocumentText(uiEditor, uiJson);
    // wait for the number of diagnostics to change
    diagnostics = (
      await waitForDiagnostics(
        uiEditor.document.uri,
        d => d && d.length === 1,
        'Variable warnings after editing ui.json'
      )
    ).sort(sortDiagnostics);
    // we should still have the warning about var2
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostics[0]').to.be.not.undefined;
    expect(diagnostics[0].message, 'diagnostics[0].message').to.equal(
      "Cannot find variable 'var2', did you mean 'var1'?"
    );
    expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.UI_PAGE_UNKNOWN_VARIABLE);
    expect(argsFrom(diagnostics[0])?.name, 'diagnostics[0].args.name').to.equal('var2');
    expect(argsFrom(diagnostics[0])?.match, 'diagnostics[0].args.match').to.equal('var1');

    // now, add the 'var2' variable to variables.json
    variablesJson.var2 = {
      variableType: {
        type: 'NumberType'
      }
    };
    await setDocumentText(variablesEditor, variablesJson);
    // wait for the number of diagnostics to change
    diagnostics = await waitForDiagnostics(
      uiEditor.document.uri,
      d => d && d.length !== diagnostics.length,
      'Variable warnings after editing variables.json'
    );
    // and there should't be any warnings now
    if (diagnostics.length !== 0) {
      expect.fail('Expected 0 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
  });

  it('shows warnings on missing and empty variables on non-vfPage page', async () => {
    // create a ui.json with missing variables on non-vfPage pages
    const uiJson: {
      pages: Array<{ title: string; variables?: any[]; vfPage?: { name: string; namespace: string } }>;
    } = {
      pages: [
        {
          title: 'Invalid missing variables'
        },
        {
          title: 'Invalid empty variables',
          variables: []
        },
        // we should not get warnings on the vfPage ones
        {
          title: 'Valid missing variables on vfPage',
          vfPage: {
            name: 'page',
            namespace: 'ns'
          }
        },
        {
          title: 'Valid empty variables on vfPage',
          variables: [],
          vfPage: {
            name: 'page',
            namespace: 'ns'
          }
        }
      ]
    };
    const [uiEditor] = await createTemplateWithRelatedFiles(
      {
        field: 'uiDefinition',
        path: 'ui.json',
        initialJson: uiJson
      },
      // include some variables we can reference
      {
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson: { var1: {}, var2: {} }
      }
    );
    // we should get warnings on the 2 pages
    const diagnostics = (
      await waitForDiagnostics(uiEditor.document.uri, d => d && d.length >= 2, 'Initial ui.json variable warnings')
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0].message, 'diagnostic[0].message').to.equal('Either variables or vfPage must be specified');
    expect(jsonpathFrom(diagnostics[0]), 'diagnostic[0].jsonpath').to.equal('pages[0]');
    expect(diagnostics[0].code, 'diagnostics[0].code').to.equal(ERRORS.UI_PAGE_MISSING_VARIABLES);
    expect(diagnostics[1].message, 'diagnostic[1].message').to.equal('At least 1 variable or vfPage must be specified');
    expect(diagnostics[1].code, 'diagnostics[1].code').to.equal(ERRORS.UI_PAGE_EMPTY_VARIABLES);
    expect(jsonpathFrom(diagnostics[1]), 'diagnostic[1].jsonpath').to.equal('pages[1].variables');

    // update the ui.json to set variables on those pages
    uiJson.pages[0].variables = [{ name: 'var1' }];
    uiJson.pages[1].variables = [{ name: 'var2' }];
    await setDocumentText(uiEditor, uiJson);
    // and the warnings should go away
    await waitForDiagnostics(uiEditor.document.uri, d => !d || d.length === 0, 'ui.json warnings after edit');
  });

  it('shows warnings on unsupported variable types in pages', async () => {
    // only look for diagnostics on page variables
    const varFilter = (d: vscode.Diagnostic) => /^pages\[\d\]\.variables\[/.test(jsonpathFrom(d) || '');

    const [doc] = await openFile(uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'ui.json'));
    const diagnostics = (
      await waitForDiagnostics(doc.uri, d => d && d.filter(varFilter).length >= 6, 'initial diagnostics on ui.json')
    )
      .filter(varFilter)
      .sort(sortDiagnostics);
    if (diagnostics.length !== 6) {
      expect.fail('Expected 6 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // each page's 1st 3 vars should have the warnings
    for (let j = 0; j < 2; j++) {
      ['DateTimeType', 'ObjectType', 'DatasetAnyFieldType'].forEach((type, k) => {
        const i = j * 3 + k;
        const diagnostic = diagnostics[i];
        expect(diagnostic, `diagnostics[${i}]`).to.be.not.undefined;
        expect(diagnostic.message, `diagnostics[${i}].message`).to.equal(
          type === 'DatasetAnyFieldType'
            ? `${type} variable '${type}Var' is only supported in ui pages in data templates`
            : `${type} variable '${type}Var' is not supported in ui pages`
        );
        expect(diagnostic.code, `diagnostics[${i}].code`).to.equal(ERRORS.UI_PAGE_UNSUPPORTED_VARIABLE);
        expect(jsonpathFrom(diagnostic), `diagnostics[${i}].jsonpath`).to.equal(`pages[${j}].variables[${k}].name`);
      });
    }
  });
});
