/*
 * Copyright (c) 2022, salesforce.com, inc.
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
describe('TemplateLinterManager lints layout.json', () => {
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
    // create a layout.json pointing to var that aren't in variables.json
    const layoutJson = {
      pages: [
        {
          title: 'Page1',
          layout: {
            type: 'TwoColumn',
            left: {
              items: [{ type: 'Variable', name: 'badvar' }]
            },
            right: {
              items: [{ type: 'Variable', name: 'var1' }]
            }
          }
        },
        {
          title: 'Page2',
          layout: {
            type: 'SingleColumn',
            center: {
              items: [{ type: 'Variable', name: 'var2' }]
            }
          }
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
    const [layoutEditor, variablesEditor] = await createTemplateWithRelatedFiles(
      {
        field: 'layoutDefinition',
        path: 'layout.json',
        initialJson: layoutJson
      },
      {
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson: variablesJson
      }
    );
    // we should get a warning on each var in layout.json
    let diagnostics = (
      await waitForDiagnostics(layoutEditor.document.uri, undefined, 'Initial variable warnings')
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostics[0]').to.be.not.undefined;
    expect(diagnostics[0].message, 'diagnostics[0].message').to.equal(
      "Cannot find variable 'badvar', did you mean 'var1'?"
    );
    expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(argsFrom(diagnostics[0])?.name, 'diagnostics[0].args.name').to.equal('badvar');
    expect(argsFrom(diagnostics[0])?.match, 'diagnostics[0].args.match').to.equal('var1');

    expect(diagnostics[1], 'diagnostics[1]').to.be.not.undefined;
    expect(diagnostics[1].message, 'diagnostics[1].message').to.equal(
      "Cannot find variable 'var2', did you mean 'var1'?"
    );
    expect(diagnostics[1].code, 'diagnostics[1].message').to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(argsFrom(diagnostics[1])?.name, 'diagnostics[1].args.name').to.equal('var2');
    expect(argsFrom(diagnostics[1])?.match, 'diagnostics[1].args.name').to.equal('var1');

    // now, change the 'badvar' ref to 'var1' in layout.json
    layoutJson.pages[0].layout.left!.items[0].name = 'var1';
    await setDocumentText(layoutEditor, layoutJson);
    // wait for the number of diagnostics to change
    diagnostics = (
      await waitForDiagnostics(
        layoutEditor.document.uri,
        d => d && d.length === 1,
        'Variable warnings after editing layout.json'
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
    expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
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
      layoutEditor.document.uri,
      d => d && d.length !== diagnostics.length,
      'Variable warnings after editing variables.json'
    );
    // and there should't be any warnings now
    if (diagnostics.length !== 0) {
      expect.fail('Expected 0 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
  });

  it('shows warnings on unsupported variable types in pages', async () => {
    // only look for diagnostics on page variables
    const varFilter = (d: vscode.Diagnostic) => /^pages\[\d\]\.layout\.center\.items\[/.test(jsonpathFrom(d) || '');

    const [doc] = await openFile(uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'layout.json'));
    const diagnostics = (
      await waitForDiagnostics(doc.uri, d => d && d.filter(varFilter).length >= 4, 'initial diagnostics on layout.json')
    )
      .filter(varFilter)
      .sort(sortDiagnostics);
    if (diagnostics.length !== 4) {
      expect.fail('Expected 4 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the 2 expected errors for variables not under a groupbox
    ['DateTimeType', 'ObjectType'].forEach((type, i) => {
      const diagnostic = diagnostics[i];
      expect(diagnostic, `diagnostics[${i}]`).to.be.not.undefined;
      expect(diagnostic.message, `diagnostics[${i}].message`).to.equal(
        `${type} variable '${type}Var' is not supported in layout pages`
      );
      expect(diagnostic.code, `diagnostics[${i}].code`).to.equal(ERRORS.LAYOUT_PAGE_UNSUPPORTED_VARIABLE);
      expect(jsonpathFrom(diagnostic), `diagnostics[${i}].jsonpath`).to.equal(
        `pages[0].layout.center.items[${i}].name`
      );
    });

    // make sure we get the 2 expected errors for variables under groupbox
    ['DateTimeType', 'ObjectType'].forEach((type, i) => {
      const groupBoxVarIndex = i + 2;
      const diagnostic = diagnostics[groupBoxVarIndex];
      expect(diagnostic, `diagnostics[${groupBoxVarIndex}]`).to.be.not.undefined;
      expect(diagnostic.message, `diagnostics[${groupBoxVarIndex}].message`).to.equal(
        `${type} variable '${type}GroupBoxVar' is not supported in layout pages`
      );
      expect(diagnostic.code, `diagnostics[${groupBoxVarIndex}].code`).to.equal(
        ERRORS.LAYOUT_PAGE_UNSUPPORTED_VARIABLE
      );
      expect(jsonpathFrom(diagnostic), `diagnostics[${groupBoxVarIndex}].jsonpath`).to.equal(
        `pages[0].layout.center.items[4].items[${i}].name`
      );
    });
  });

  it('shows problems on unnecessary navigation objects', async () => {
    const layoutJson = {
      pages: [
        {
          title: 'Page1',
          layout: {
            type: 'SingleColumn',
            right: {
              items: [{ type: 'Text', text: 'text' }]
            }
          },
          navigation: {} // This should get a warning since there is no `navigationPanel`
        }
      ],
      appDetails: {
        navigation: {} // Ditto
      }
    };
    const [layoutEditor] = await createTemplateWithRelatedFiles({
      field: 'layoutDefinition',
      path: 'layout.json',
      initialJson: layoutJson
    });

    const diagnostics = (
      await waitForDiagnostics(layoutEditor.document.uri, undefined, 'Navigation object warnings')
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostics[0]').to.be.not.undefined;
    expect(diagnostics[0].message, 'diagnostics[0].message').to.equal(
      'navigation has no effect unless a navigationPanel is defined as part of the layout.'
    );
    expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.LAYOUT_PAGE_UNNECESSARY_NAVIGATION_OBJECT);

    expect(diagnostics[1], 'diagnostics[1]').to.be.not.undefined;
    expect(diagnostics[1].message, 'diagnostics[1].message').to.equal(
      'navigation has no effect unless a navigationPanel is defined as part of the layout.'
    );
    expect(diagnostics[1].code, 'diagnostics[1].message').to.equal(ERRORS.LAYOUT_PAGE_UNNECESSARY_NAVIGATION_OBJECT);
  });
});
