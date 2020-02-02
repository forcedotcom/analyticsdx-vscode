/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { uriBasename, uriRelPath, uriStat } from '../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  openFile,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  waitForDiagnostics,
  writeEmptyJsonFile,
  writeTextToFile
} from './vscodeTestUtils';

function sortDiagnostics(d1: vscode.Diagnostic, d2: vscode.Diagnostic) {
  return d1.range.start.line - d2.range.start.line;
}

// tslint:disable:no-unused-expression
describe('TemplateLinterManager', () => {
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

  type PathFieldAndJson = {
    // pass in a either top-level field name, or a function that will inject the appropriate structure into the
    // template-info json structure
    field: string | ((json: any, path: string) => void);
    path: string;
    initialJson: string | object;
  };
  /** Create a template with a related file configured.
   * @param files the related file(s) information
   * @returns the related file editors
   */
  async function createTemplateWithRelatedFiles(...files: PathFieldAndJson[]): Promise<vscode.TextEditor[]> {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    const templateJson: { [key: string]: any } = {};
    // create the related file(s)
    const editors = await Promise.all(
      files.map(async file => {
        const uri = uriRelPath(tmpdir!, file.path);
        await writeEmptyJsonFile(uri);
        const [, editor] = await openFile(uri);
        await setDocumentText(editor, file.initialJson);
        // but since it's not reference by the template-info.json, it should have no errors
        await waitForDiagnostics(
          editor.document.uri,
          d => d && d.length === 0,
          `No initial diagnostics on ${file.path}`
        );
        // inject the attribute into the template-info json
        if (typeof file.field === 'string') {
          templateJson[file.field] = file.path;
        } else {
          file.field(templateJson, file.path);
        }
        return editor;
      })
    );

    // now, hookup the related file(s)
    await setDocumentText(templateEditor, templateJson);
    return editors;
  }

  describe('lints template-info.json', () => {
    function failOnUnexpected(map: Map<any, vscode.Diagnostic>) {
      if (map.size !== 0) {
        expect.fail(
          'Got ' + map.size + ' unexpected diangotics:\n' + JSON.stringify(Array.from(map.values()), undefined, 2)
        );
      }
    }

    it('shows missing "dashboards" problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics(
        'Missing_dashboards_Dashboard',
        true,
        d => d && d.length >= 2
      );
      // filter out the 'Missing property "dashboards"' one from the schema, should just be the 1 warning
      const map = new Map(diagnostics.filter(d => !d.message.includes('Missing property')).map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having a dashboard
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows empty "dashboards" problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_dashboards_Dashboard');
      // there should just be a diagnostic on the dashboards field for not having a dashboard
      const map = new Map(diagnostics.map(i => [i.code, i]));
      const d = map.get('dashboards');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      map.delete('dashboards');

      failOnUnexpected(map);
    });

    it('shows multiple dashboards problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Multiple_dashboards_Dashboard');
      // there should just be a diagnostic on the dashboards field for having mulitple
      const map = new Map(diagnostics.map(i => [i.code, i]));
      const d = map.get('dashboards');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      map.delete('dashboards');

      failOnUnexpected(map);
    });

    it('shows problem on missing fields on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics(
        'Missing_required',
        true,
        d => d && d.length >= 1
      );
      // should just be the 1 warning
      const map = new Map(diagnostics.map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having a dashboard, dataflow, or dataset
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      // on the missing fields, there shouldn't be any relatedInformations
      expect(d!.relatedInformation, 'relatedInformation').to.be.undefined;
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows empty arrays problem on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_required');
      const map = new Map(diagnostics.map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having the fields
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      // there should be related information for dashboards, datasets, and dataflows being empty
      expect(d!.relatedInformation, 'relatedInformation').to.be.not.undefined;
      if (d!.relatedInformation!.length !== 3) {
        expect.fail('Expected 3 relatedInformation, got ' + JSON.stringify(d!.relatedInformation, undefined, 2));
      }
      ['dashboards', 'datasets', 'dataflows'].forEach(name => {
        expect(
          d!.relatedInformation!.some(ri => ri.message === `Empty ${name} array`),
          name + ' related information'
        ).to.be.true;
      });
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows problem on missing and empty fields on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_and_missing_required');
      const map = new Map(diagnostics.map(i => [i.code, i]));
      // since the file doesn't have templateType, there should be a diagnostic on the root object for not having the fields
      const d = map.get('');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      // there should be relatedInformations for dashboards and datasets
      expect(d!.relatedInformation, 'relatedInformation').to.be.not.undefined;
      if (d!.relatedInformation!.length !== 2) {
        expect.fail('Expected 2 relatedInformation, got ' + JSON.stringify(d!.relatedInformation, undefined, 2));
      }
      ['dashboards', 'datasets'].forEach(name => {
        expect(
          d!.relatedInformation!.some(ri => ri.message === `Empty ${name} array`),
          name + ' related information to exist'
        ).to.be.true;
      });
      // but not for this dataflows (since it's missing in the json)
      expect(
        d!.relatedInformation!.some(ri => ri.message === 'Empty dataflows array'),
        'dataflows related information to exist'
      ).to.be.false;

      // there could also be a json-schema diagnostic that eltDataflows is missing, so don't failOnUnexpected()
    });

    it('shows warning on relpath pointing to template-info.json', async () => {
      const [t, , editor] = await createTempTemplate(true);
      tmpdir = t;
      await setDocumentText(editor!, {
        uiDefinition: 'template-info.json'
      });
      const diagnosticFilter = (d: vscode.Diagnostic) => d.code === 'uiDefinition';
      const diagnostics = (
        await waitForDiagnostics(editor!.document.uri, d => d?.some(diagnosticFilter), 'initial uiDefinition warning')
      ).filter(diagnosticFilter);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 uiDefinition diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic.message').equals("Path cannot be 'template-info.json'");
    });

    it('shows warnings on duplicate relpath usages', async () => {
      const [t, , editor] = await createTempTemplate(true);
      tmpdir = t;
      await writeEmptyJsonFile(uriRelPath(tmpdir, 'file.json'));
      await setDocumentText(editor!, {
        variableDefinition: 'file.json',
        uiDefinition: 'file.json',
        folderDefinition: 'file.json',
        ruleDefinition: 'file.json',
        rules: [
          {
            type: 'templateToApp',
            file: 'file.json'
          }
        ],
        dashboards: [
          {
            file: 'file.json',
            label: 'dashboard',
            name: 'dashboard'
          }
        ],
        lenses: [
          {
            file: 'file.json',
            label: 'lens',
            name: 'lens'
          }
        ],
        eltDataflows: [
          {
            file: 'file.json',
            label: 'dataflow',
            name: 'dataflow'
          }
        ],
        storedQueries: [
          {
            file: 'file.json',
            label: 'stored-query'
          }
        ],
        extendedTypes: {
          stories: [
            {
              file: 'file.json',
              label: 'story',
              name: 'story'
            }
          ]
        }
      });
      const dupFilter = (d: vscode.Diagnostic) => d?.message === 'Duplicate usage of path file.json';
      const expectedPaths = [
        'variableDefinition',
        'uiDefinition',
        'folderDefinition',
        'ruleDefinition',
        'rules[0].file',
        'dashboards[0].file',
        'lenses[0].file',
        'eltDataflows[0].file',
        'storedQueries[0].file',
        'extendedTypes.stories[0].file'
      ];
      const diagnostics = (
        await waitForDiagnostics(
          editor!.document.uri,
          d => d && d.filter(dupFilter).length >= expectedPaths.length,
          'initial duplicate path warnings'
        )
      ).filter(dupFilter);
      if (diagnostics.length !== expectedPaths.length) {
        expect.fail(`Expected ${expectedPaths.length} diagnostics, got:\n` + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics.map(d => d.code, 'diagnostic codes')).to.include.members(expectedPaths);
      diagnostics.forEach(d => {
        expect(d.relatedInformation, `${d.code} diagnostic.relatedInformation`).to.not.be.undefined;
        expect(d.relatedInformation!.length, `${d.code} diagnostic.relatedInformation.length`).to.equal(
          expectedPaths.length - 1
        );
      });
    });

    it('shows error on having ruleDefinition and rules', async () => {
      [tmpdir] = await createTempTemplate(false);
      await writeTextToFile(uriRelPath(tmpdir, 'rules1.json'), {});
      await writeTextToFile(uriRelPath(tmpdir, 'rules2.json'), {});
      // make a template with ruleDefinition and rules
      const templateInfoUri = uriRelPath(tmpdir, 'template-info.json');
      await writeTextToFile(templateInfoUri, {
        rules: [
          {
            type: 'appToTemplate',
            file: 'rules1.json'
          }
        ],
        ruleDefinition: 'rules2.json'
      });
      // make sure we get the error
      const errorFilter = (d: vscode.Diagnostic) =>
        d.code === 'ruleDefinition' && d.severity === vscode.DiagnosticSeverity.Error;
      const [allDiagnostics, , editor] = await openTemplateInfoAndWaitForDiagnostics(
        templateInfoUri,
        true,
        d => d?.some(errorFilter),
        'error on ruleDefinition'
      );
      const diagnostics = allDiagnostics.filter(errorFilter);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 initial ruleDefinition error, got:\n' + JSON.stringify(allDiagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic[0]').to.be.not.undefined;
      expect(diagnostics[0].message, 'diagnostic[0].message').to.equal(
        "Template is combining deprecated 'ruleDefinition' and 'rules'. Please consolidate 'ruleDefinition' into 'rules'"
      );

      // fix the error
      await setDocumentText(editor, {
        rules: [
          {
            type: 'appToTemplate',
            file: 'rules1.json'
          },
          {
            type: 'templateToApp',
            file: 'rules2.json'
          }
        ]
      });
      // make sure the ruleDefinition error goes away
      await waitForDiagnostics(editor.document.uri, d => d && d.filter(errorFilter).length === 0);
    });

    it('shows file path problems on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('badFilepaths');
      // filter out the Deprecated warning on rulesDefinition for this test
      const map = new Map(diagnostics.filter(d => !d.message.includes('Deprecated')).map(i => [i.code, i]));
      // there should be a warning for each these fields about the file not existing
      [
        'variableDefinition',
        'uiDefinition',
        'folderDefinition',
        'ruleDefinition',
        'rules[0].file',
        'rules[1].file',
        'externalFiles[0].file',
        'externalFiles[0].schema',
        'externalFiles[0].userXmd',
        'lenses[0].file',
        'dashboards[0].file',
        'eltDataflows[0].file'
      ].forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.be.equals('Specified file does not exist in workspace');
        expect(d!.severity, path + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      // check for the ones complaining about non-relative or empty paths
      ['releaseInfo.notesFile', 'extendedTypes.visualforcePages[0].file', 'imageFiles[0].file'].forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.be.equals('Value should be a path relative to this file');
        expect(d!.severity, path + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      // the other expected errors
      const expected: Record<string, string> = {
        'datasetFiles[0].userXmd': "Path should not contain '..' parts",
        'storedQueries[0].file': 'Specified path is not a file'
      };
      Object.keys(expected).forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.be.equals(expected[path]);
        expect(d!.severity, path + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      failOnUnexpected(map);
    });

    it("updates problems on missing related file when it's created and deleted", async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // now, set the variableDefinition to a file that doesn't exist
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            variableDefinition: 'variables.json'
          },
          undefined,
          2
        )
      );
      await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.length >= 1 &&
          diagnostics.some(
            d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
          ),
        'Inital diagnostic on bad variableDefinition file'
      );

      // create variables.json
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      // and the diagnostic should go away
      await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.length > 0 &&
          !diagnostics.some(
            d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
          ),
        'No more variableDefinition diagnostic after creating variables.json'
      );

      // delete variables.json
      await vscode.workspace.fs.delete(variablesUri, { useTrash: false });
      // and the diagnostic should come back
      await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.some(
            d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
          ),
        'Diagnostic on variableDefinition should exist after deleting variables.json'
      );
    });
  }); // describe('lints template-info.json')

  // if someone opens a related file (w/o opening template-info.json), TemplateLinter will possibly add diagnostics
  // for template-info.json (or other related files); make sure those are removed appropriately, esp. when the
  // template folder is deleted.
  // Note: this is technically testing TemplateLinterManger (for diagnostics from the linter) and TemplateEditorManager
  // (for diagnostics from the json-schemas), so if these start failing, see which diagnostics are left to figure out
  // the right place to fix.
  describe('cleans up all diagnostics', () => {
    let templateInfo: vscode.Uri | undefined;
    let uiJson: vscode.Uri | undefined;
    beforeEach(async () => {
      // create a template with errors in a related file and in template-info.json w/o opening any documents (yet)
      [tmpdir] = await createTempTemplate(false);
      uiJson = uriRelPath(tmpdir, 'ui.json');
      await writeTextToFile(uiJson, {
        error: 'This should trigger a diagnostic from the json-schema',
        pages: [
          {
            variables: [
              {
                // and this should trigger a diagnostic from the linter
                name: 'nosuchvar'
              }
            ]
          }
        ]
      });
      templateInfo = uriRelPath(tmpdir, 'template-info.json');
      await writeTextToFile(templateInfo, {
        // this should give diagnostics from both the json schema and the linter
        templateType: 'app',
        uiDefinition: 'ui.json'
      });
    });

    it('when folder is deleted', async () => {
      await openFile(uiJson!, true);
      await waitForDiagnostics(uiJson!, d => d && d.length >= 2, 'initial diagnostics on ui.json');
      // make sure there's diagnostics on template-info.json, too
      await waitForDiagnostics(templateInfo!, d => d && d.length >= 2, 'initial diagnostics on template-info.json');

      // now, delete the folder
      await vscode.workspace.fs.delete(tmpdir!, { recursive: true, useTrash: false });
      await waitForDiagnostics(uiJson!, d => d?.length === 0, '0 diagnostics on ui.json after delete');
      await waitForDiagnostics(templateInfo!, d => d?.length === 0, '0 diagnostics on template-info.json after delete');
    });

    it('when template-info.json is deleted', async () => {
      await openFile(uiJson!, true);
      await waitForDiagnostics(uiJson!, d => d && d.length >= 2, 'initial diagnostics on ui.json');
      // make sure there's diagnostics on template-info.json, too
      await waitForDiagnostics(templateInfo!, d => d && d.length >= 2, 'initial diagnostics on template-info.json');

      // now, delete template-info.json
      await vscode.workspace.fs.delete(templateInfo!, { recursive: true, useTrash: false });
      await waitForDiagnostics(uiJson!, d => d?.length === 0, '0 diagnostics on ui.json after delete');
      await waitForDiagnostics(templateInfo!, d => d?.length === 0, '0 diagnostics on template-info.json after delete');
    });
  });

  describe('lints ui.json', () => {
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
      expect(diagnostics[0], 'diagnostic[0]').to.be.not.undefined;
      expect(diagnostics[0].message, 'diagnostic[0].message').to.equal(
        "Cannot find variable 'badvar', did you mean 'var1'?"
      );
      expect(diagnostics[1], 'diagnostic[1]').to.be.not.undefined;
      expect(diagnostics[1].message, 'diagnostic[1].message').to.equal(
        "Cannot find variable 'var2', did you mean 'var1'?"
      );

      // now, change the 'badvar' ref to 'var1' in ui.json
      uiJson.pages[0].variables[0].name = 'var1';
      await setDocumentText(uiEditor, uiJson);
      // wait for the number of diagnostics to change
      diagnostics = (
        await waitForDiagnostics(
          uiEditor.document.uri,
          d => d && d.length !== diagnostics.length,
          'Variable warnings after editing ui.json'
        )
      ).sort(sortDiagnostics);
      // we should still have the warning about var2
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic[0]').to.be.not.undefined;
      expect(diagnostics[0].message, 'diagnostic[0].message').to.equal(
        "Cannot find variable 'var2', did you mean 'var1'?"
      );

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
      expect(diagnostics[0].code, 'diagnostic[0].code').to.equal('pages[0]');
      expect(diagnostics[1].message, 'diagnostic[1].message').to.equal(
        'At least 1 variable or vfPage must be specified'
      );
      expect(diagnostics[1].code, 'diagnostic[1].code').to.equal('pages[1].variables');

      // update the ui.json to set variables on those pages
      uiJson.pages[0].variables = [{ name: 'var1' }];
      uiJson.pages[1].variables = [{ name: 'var2' }];
      await setDocumentText(uiEditor, uiJson);
      // and the warnings should go away
      await waitForDiagnostics(uiEditor.document.uri, d => !d || d.length === 0, 'ui.json warnings after edit');
    });
  }); // describe('lints ui.json')

  describe('lints variables.json', () => {
    async function createTemplateWithVariables(initialJson: string | object): Promise<vscode.TextEditor> {
      const [editor] = await createTemplateWithRelatedFiles({
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson
      });
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
      expect(diagnostic.code, 'diagnostic[1].code').to.equal('foovar.excludes[2]');

      diagnostic = diagnostics[2];
      expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[2].message').to.equal('Missing closing / for regular expression');
      expect(diagnostic.code, 'diagnostic[2].code').to.equal('foovar.excludes[3]');

      diagnostic = diagnostics[3];
      expect(diagnostic, 'diagnostic[3]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[3].message').to.equal('Missing closing / for regular expression');
      expect(diagnostic.code, 'diagnostic[3].code').to.equal('foovar.excludes[4]');

      diagnostic = diagnostics[4];
      expect(diagnostic, 'diagnostic[4]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[4].message').to.equal('Invalid regular expression options');
      expect(diagnostic.code, 'diagnostic[4].code').to.equal('foovar.excludes[5]');

      diagnostic = diagnostics[5];
      expect(diagnostic, 'diagnostic[5]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[5].message').to.equal('Duplicate option in regular expression options');
      expect(diagnostic.code, 'diagnostic[5].code').to.equal('foovar.excludes[6]');

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
        d => d && d.length === 1 && d[0].code === 'foovar.excludes',
        'No invalid regex diagnostics on variables.json after fix'
      );
    });
  }); // describe('lints variables.json')

  describe('lints rules.json', () => {
    function createTemplateWithRules(
      ...rules: Array<{ rulesJson: string | object; ruleType: 'appToTemplate' | 'templateToApp' | 'ruleDefinition' }>
    ): Promise<vscode.TextEditor[]> {
      const files = rules.map((file, i) => {
        return {
          field:
            file.ruleType === 'ruleDefinition'
              ? 'ruleDefinition'
              : (json, path) => {
                  const rules = json.rules || [];
                  rules.push({
                    type: file.ruleType,
                    file: path
                  });
                  json.rules = rules;
                },
          path: `rules${i + 1}.json`,
          initialJson: file.rulesJson
        } as PathFieldAndJson;
      });
      return createTemplateWithRelatedFiles(...files);
    }

    it('shows problems on duplicate constants', async () => {
      const rulesJson = {
        constants: [
          {
            // this should conflict in same file
            name: 'const1',
            value: null
          },
          {
            // this should conflict in rules2
            name: 'const3',
            value: null
          },
          {
            name: 'const1',
            value: null
          },
          {
            // this should be fine
            name: 'const4',
            value: null
          }
        ]
      };
      const [rulesEditor, rules2Editor, rules3Editor] = await createTemplateWithRules(
        { rulesJson, ruleType: 'templateToApp' },
        {
          rulesJson: {
            constants: [
              {
                name: 'const3',
                value: null
              }
            ]
          },
          ruleType: 'templateToApp'
        },
        {
          rulesJson: {
            constants: [
              {
                // this should be fine since it's a different ruleType
                name: 'const3',
                value: null
              }
            ]
          },
          ruleType: 'appToTemplate'
        }
      );
      // check rule1.json diagnostics
      let diagnostics = (
        await waitForDiagnostics(
          rulesEditor.document.uri,
          d => d && d.length >= 3,
          'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate constants warnings'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 3) {
        expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      let diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate constant 'const1'");
      expect(diagnostic.code, 'diagnostic[0].code').to.equal('constants[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(
        diagnostic.relatedInformation?.[0].location.range.start.line,
        'diagnostic[0].relatedInformation.line'
      ).to.be.greaterThan(diagnostic.range.start.line, 'diagnostic[0].line');
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      diagnostic = diagnostics[1];
      expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[1].message').to.equal("Duplicate constant 'const3'");
      expect(diagnostic.code, 'diagnostic[1].code').to.equal('constants[1].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[1].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[1].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[1].relatedInformation.uri').to.equal(
        rules2Editor.document.uri
      );

      diagnostic = diagnostics[2];
      expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[2].message').to.equal("Duplicate constant 'const1'");
      expect(diagnostic.code, 'diagnostic[2].code').to.equal('constants[2].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[2].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[2].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(
        diagnostic.relatedInformation?.[0].location.range.start.line,
        'diagnostic[2].relatedInformation.line'
      ).to.be.lessThan(diagnostic.range.start.line, 'diagnostic[2].line');
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      // check rules2.json warning
      diagnostics = (
        await waitForDiagnostics(
          rules2Editor.document.uri,
          d => d && d.length >= 1,
          'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate constants warnings'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate constant 'const3'");
      expect(diagnostic.code, 'diagnostic[0].code').to.equal('constants[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      // and no warnings on rules3.json
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules3Editor.document.uri)
      );

      // fix the duplicate constants
      rulesJson.constants[1].name = 'const2';
      rulesJson.constants[2].name = 'const5';
      await setDocumentText(rulesEditor, rulesJson);
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate constants'
      );
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate constants'
      );
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules3Editor.document.uri)
      );
    });

    it('shows problems on duplicate rule names', async () => {
      const rulesJson = {
        rules: [
          {
            // should conflict in same file
            name: 'name1',
            appliesTo: [
              {
                type: '*'
              }
            ],
            actions: [
              {
                action: 'delete',
                path: '$.name'
              }
            ]
          },
          {
            // should conflict in rules2.json
            name: 'name3',
            appliesTo: [
              {
                type: '*'
              }
            ],
            actions: [
              {
                action: 'delete',
                path: '$.name'
              }
            ]
          },
          {
            name: 'name1',
            appliesTo: [
              {
                type: '*'
              }
            ],
            actions: [
              {
                action: 'delete',
                path: '$.name'
              }
            ]
          },
          {
            // this should be fine
            name: 'name4',
            appliesTo: [
              {
                type: '*'
              }
            ],
            actions: [
              {
                action: 'delete',
                path: '$.name'
              }
            ]
          }
        ]
      };
      const [rulesEditor, rules2Editor, rules3Editor] = await createTemplateWithRules(
        { rulesJson, ruleType: 'ruleDefinition' },
        {
          rulesJson: {
            rules: [
              {
                name: 'name3',
                appliesTo: [
                  {
                    type: '*'
                  }
                ],
                actions: [
                  {
                    action: 'delete',
                    path: '$.name'
                  }
                ]
              }
            ]
          },
          ruleType: 'templateToApp'
        },
        {
          rulesJson: {
            rules: [
              {
                // this should be fine since it's a different ruleType
                name: 'name3',
                appliesTo: [
                  {
                    type: '*'
                  }
                ],
                actions: [
                  {
                    action: 'delete',
                    path: '$.name'
                  }
                ]
              }
            ]
          },
          ruleType: 'appToTemplate'
        }
      );
      // check rules1.json warnings
      let diagnostics = (
        await waitForDiagnostics(
          rulesEditor.document.uri,
          d => d && d.length >= 3,
          'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate rule names warnings'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 3) {
        expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      let diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate rule name 'name1'");
      expect(diagnostic.code, 'diagnostic[0].code').to.equal('rules[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );
      expect(
        diagnostic.relatedInformation?.[0].location.range.start.line,
        'diagnostic[0].relatedInformation.line'
      ).to.be.greaterThan(diagnostic.range.start.line, 'diagnostic[0].line');

      diagnostic = diagnostics[1];
      expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[1].message').to.equal("Duplicate rule name 'name3'");
      expect(diagnostic.code, 'diagnostic[1].code').to.equal('rules[1].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[1].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[1].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[1].relatedInformation.uri').to.equal(
        rules2Editor.document.uri
      );

      diagnostic = diagnostics[2];
      expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[2].message').to.equal("Duplicate rule name 'name1'");
      expect(diagnostic.code, 'diagnostic[2].code').to.equal('rules[2].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[2].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[2].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[2].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );
      expect(
        diagnostic.relatedInformation?.[0].location.range.start.line,
        'diagnostic[2].relatedInformation.line'
      ).to.be.lessThan(diagnostic.range.start.line, 'diagnostic[2].line');

      // check rules2.json warnings
      diagnostics = (
        await waitForDiagnostics(
          rules2Editor.document.uri,
          d => d && d.length >= 1,
          'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate rule names warnings'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate rule name 'name3'");
      expect(diagnostic.code, 'diagnostic[0].code').to.equal('rules[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      // and no warnings on rules3.json
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules3Editor.document.uri)
      );

      // fix the duplicate rule names
      rulesJson.rules[1].name = 'name2';
      rulesJson.rules[2].name = 'name5';
      await setDocumentText(rulesEditor, rulesJson);
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate rule names'
      );
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate rule names'
      );
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules3Editor.document.uri)
      );
    });

    it('shows problems on duplicate macros', async () => {
      const rulesJson = {
        macros: [
          {
            namespace: 'ns1',
            definitions: [
              {
                // should conflict in this file
                name: 'macro1',
                returns: ''
              },
              {
                // should conflict in rule2.json
                name: 'macro3',
                returns: ''
              }
            ]
          },
          {
            namespace: 'ns1',
            definitions: [
              {
                name: 'macro1',
                returns: ''
              },
              {
                // should be fine
                name: 'macro4',
                returns: ''
              }
            ]
          }
        ]
      };
      const [rulesEditor, rules2Editor, rules3Editor] = await createTemplateWithRules(
        { rulesJson, ruleType: 'appToTemplate' },
        {
          rulesJson: {
            macros: [
              {
                namespace: 'ns1',
                definitions: [
                  {
                    name: 'macro3',
                    returns: ''
                  }
                ]
              }
            ]
          },
          ruleType: 'appToTemplate'
        },
        {
          rulesJson: {
            macros: [
              {
                namespace: 'ns1',
                definitions: [
                  {
                    // this should be fine since it's a different ruleType
                    name: 'macro3',
                    returns: ''
                  }
                ]
              }
            ]
          },
          ruleType: 'templateToApp'
        }
      );
      // check rules1.json warnings
      let diagnostics = (
        await waitForDiagnostics(
          rulesEditor.document.uri,
          d => d && d.length >= 3,
          'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate macros warnings'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 3) {
        expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      let diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate macro 'ns1:macro1'");
      expect(diagnostic.code, 'diagnostic[0].code').to.equal('macros[0].definitions[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      diagnostic = diagnostics[1];
      expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[1].message').to.equal("Duplicate macro 'ns1:macro3'");
      expect(diagnostic.code, 'diagnostic[1].code').to.equal('macros[0].definitions[1].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[1].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[1].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[1].relatedInformation.uri').to.equal(
        rules2Editor.document.uri
      );

      diagnostic = diagnostics[2];
      expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[2].message').to.equal("Duplicate macro 'ns1:macro1'");
      expect(diagnostic.code, 'diagnostic[2].code').to.equal('macros[1].definitions[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[2].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[2].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[2].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      // check rules2.json warnings
      diagnostics = (
        await waitForDiagnostics(
          rules2Editor.document.uri,
          d => d && d.length >= 1,
          'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate macros warnings'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate macro 'ns1:macro3'");
      expect(diagnostic.code, 'diagnostic[0].code').to.equal('macros[0].definitions[0].name');
      expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
      expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
        'Other usage'
      );
      expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
        rulesEditor.document.uri
      );

      // and no warnings on rules3.json
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules3Editor.document.uri)
      );

      // fix the duplicate definition name, and all the warnings should go away
      rulesJson.macros[0].definitions[1].name = 'macro2';
      rulesJson.macros[1].namespace = 'ns2';
      await setDocumentText(rulesEditor, rulesJson);
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate macro names'
      );
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate macro names'
      );
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No warnings on ' + uriBasename(rules3Editor.document.uri)
      );
    });

    it('shows infos on no-op macro definitions', async () => {
      const rulesJson: {
        macros: Array<{
          namespace: string;
          definitions: Array<{ name: string; returns?: string; actions?: Array<{ action: string; path: string }> }>;
        }>;
      } = {
        macros: [
          {
            namespace: 'ns1',
            definitions: [
              {
                name: 'macro1'
              },
              {
                name: 'macro2',
                actions: []
              },
              {
                name: 'valid',
                actions: [
                  {
                    action: 'delete',
                    path: '$.name'
                  }
                ],
                returns: ''
              }
            ]
          }
        ]
      };
      const [rulesEditor] = await createTemplateWithRules({ rulesJson, ruleType: 'appToTemplate' });
      const diagnostics = (
        await waitForDiagnostics(rulesEditor.document.uri, d => d && d.length >= 2, 'Initial no-op macros warnings')
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 2) {
        expect.fail('Expected 2 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      diagnostics.forEach((diagnostic, i) => {
        expect(diagnostic, `diagnostic[${i}]`).to.not.be.undefined;
        expect(diagnostic.message, `diagnostic[${i}].message`).to.equal(
          "Macro should have a 'return' or at least one action"
        );
        expect(diagnostic.severity, `diagnostic[${i}].severity`).to.equal(vscode.DiagnosticSeverity.Information);
        expect(diagnostic.code, `diagnostic[${i}].code`).to.equal(
          i === 0 ? 'macros[0].definitions[0]' : 'macros[0].definitions[1].actions'
        );
      });

      // fix them
      rulesJson.macros[0].definitions[0].returns = 'foo';
      rulesJson.macros[0].definitions[1].actions!.push({ action: 'delete', path: '$.name' });
      await setDocumentText(rulesEditor, rulesJson);
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length === 0,
        'No warnings after fixing no-op macros'
      );
    });
  }); // describe('lints rules.json')
});
