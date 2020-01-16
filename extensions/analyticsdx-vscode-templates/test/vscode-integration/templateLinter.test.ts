/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { uriStat } from '../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  openFile,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  waitForDiagnostics,
  writeEmptyJsonFile
} from './vscodeTestUtils';

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
      const origNumDiagnostics = (
        await waitForDiagnostics(
          templateUri,
          diagnostics =>
            diagnostics &&
            diagnostics.length >= 1 &&
            diagnostics.some(
              d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
            ),
          'Inital diagnostic on bad variableDefinition file'
        )
      ).length;

      // create variables.json
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      // and the diagnostic should go away
      await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.length < origNumDiagnostics &&
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

  type PathFieldAndJson = {
    field: string;
    path: string;
    initialJson: string | object;
  };
  /** Create a template with a related file configured.
   * @param file the related file information
   * @returns the related file editor
   */
  function createTemplateWithRelatedFiles(file: PathFieldAndJson): Promise<[vscode.TextEditor]>;
  /** Create a template with a related files configured.
   * @param file1 the related file information
   * @param file2 the related file information
   * @returns the related file editors
   */
  function createTemplateWithRelatedFiles(
    file1: PathFieldAndJson,
    file2: PathFieldAndJson
  ): Promise<[vscode.TextEditor, vscode.TextEditor]>;
  /** Create a template with a related file configured.
   * @param files the related file(s) information
   * @returns the related file editors
   */
  async function createTemplateWithRelatedFiles(...files: PathFieldAndJson[]): Promise<vscode.TextEditor[]> {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    const templateJson: { [key: string]: any } = {};
    // create the related file(s)
    const editors = await Promise.all(
      files.map(async file => {
        const uri = tmpdir!.with({ path: path.join(tmpdir!.path, file.path) });
        await writeEmptyJsonFile(uri);
        const [, editor] = await openFile(uri);
        await setDocumentText(editor, file.initialJson);
        // but since it's not reference by the template-info.json, it should have no errors
        await waitForDiagnostics(
          editor.document.uri,
          d => d && d.length === 0,
          `No initial diagnostics on ${file.path}`
        );
        templateJson[file.field] = file.path;
        return editor;
      })
    );

    // now, hookup the related file(s)
    await setDocumentText(templateEditor, templateJson);
    return editors;
  }

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
        (d1, d2) => d1.range.start.line - d2.range.start.line
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
      ).sort((d1, d2) => d1.range.start.line - d2.range.start.line);
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

    it('warnings on missing and empty variables on non-vfPage page', async () => {
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
      ).sort((d1, d2) => d1.range.start.line - d2.range.start.line);
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
      ).sort((d1, d2) => d1.range.start.line - d2.range.start.line);
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
});
