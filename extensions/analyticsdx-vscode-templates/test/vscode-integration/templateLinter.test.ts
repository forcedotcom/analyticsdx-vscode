/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { ERRORS } from '../../src/constants';
import { argsFrom, jsonpathFrom, uriBasename, uriRelPath, uriStat } from '../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles as _createTemplateWithRelatedFiles,
  createTempTemplate,
  openFile,
  openTemplateInfoAndWaitForDiagnostics,
  PathFieldAndJson,
  setDocumentText,
  uriFromTestRoot,
  waitForDiagnostics,
  waveTemplatesUriPath,
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

  async function createTemplateWithRelatedFiles(...files: PathFieldAndJson[]) {
    const [dir, editors] = await _createTemplateWithRelatedFiles(...files);
    // save off the temp directory so it'll get deleted
    tmpdir = dir;
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
      const map = new Map(
        diagnostics.filter(d => !d.message.includes('Missing property')).map(d => [jsonpathFrom(d), d])
      );
      // there should be a diagnostic on the templateType field for not having a dashboard
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_DASH_ONE_DASHBOARD);
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows empty "dashboards" problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_dashboards_Dashboard');
      // there should just be a diagnostic on the dashboards field for not having a dashboard
      const map = new Map(diagnostics.map(d => [jsonpathFrom(d), d]));
      const d = map.get('dashboards');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_DASH_ONE_DASHBOARD);
      map.delete('dashboards');

      failOnUnexpected(map);
    });

    it('shows multiple dashboards problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Multiple_dashboards_Dashboard');
      // there should just be a diagnostic on the dashboards field for having mulitple
      const map = new Map(diagnostics.map(d => [jsonpathFrom(d), d]));
      const d = map.get('dashboards');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_DASH_ONE_DASHBOARD);
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
      const map = new Map(diagnostics.map(d => [jsonpathFrom(d), d]));
      // there should be a diagnostic on the templateType field for not having a dashboard, dataflow, or dataset
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
      // on the missing fields, there shouldn't be any relatedInformations
      expect(d!.relatedInformation, 'relatedInformation').to.be.undefined;
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows empty arrays problem on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_required');
      const map = new Map(diagnostics.map(d => [jsonpathFrom(d), d]));
      // there should be a diagnostic on the templateType field for not having the fields
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
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
      const map = new Map(diagnostics.map(d => [jsonpathFrom(d), d]));
      // since the file doesn't have templateType, there should be a diagnostic on the root object for not having the fields
      const d = map.get('');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
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

    it('shows problem on template name not matching folder name', async () => {
      const [t, , editor] = await createTempTemplate(true);
      tmpdir = t;
      const dirname = uriBasename(t);
      await setDocumentText(editor!, {
        name: 'NotTheFolderName'
      });
      const diagnosticFilter = (d: vscode.Diagnostic) => jsonpathFrom(d) === 'name';
      const diagnostics = (
        await waitForDiagnostics(editor!.document.uri, d => d?.some(diagnosticFilter), 'initial name warning')
      ).filter(diagnosticFilter);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 name diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic.message').equals(
        `Template name must match the template folder name '${dirname}'`
      );
      expect(diagnostics[0].code, 'diagnostic code').to.be.equal(ERRORS.TMPL_NAME_MATCH_FOLDER_NAME);
      // fix the name
      await setDocumentText(editor!, {
        name: dirname
      });
      await waitForDiagnostics(
        editor!.document.uri,
        d => d && d.filter(diagnosticFilter).length === 0,
        'no name warning after fix'
      );
    });

    it('shows warning on relpath pointing to template-info.json', async () => {
      const [t, , editor] = await createTempTemplate(true);
      tmpdir = t;
      await setDocumentText(editor!, {
        uiDefinition: 'template-info.json'
      });
      const diagnosticFilter = (d: vscode.Diagnostic) => jsonpathFrom(d) === 'uiDefinition';
      const diagnostics = (
        await waitForDiagnostics(editor!.document.uri, d => d?.some(diagnosticFilter), 'initial uiDefinition warning')
      ).filter(diagnosticFilter);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 uiDefinition diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic.message').equals("Path cannot be 'template-info.json'");
      expect(diagnostics[0].code, 'diagnostic.code').equals(ERRORS.TMPL_INVALID_REL_PATH);
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
      expect(diagnostics.map(d => jsonpathFrom(d), 'diagnostic jsonpaths')).to.include.members(expectedPaths);
      diagnostics.forEach(d => {
        expect(d.code, `${jsonpathFrom(d)} diagnotic.code`).to.equal(ERRORS.TMPL_DUPLICATE_REL_PATH);
        expect(d.relatedInformation, `${jsonpathFrom(d)} diagnostic.relatedInformation`).to.not.be.undefined;
        expect(d.relatedInformation!.length, `${jsonpathFrom(d)} diagnostic.relatedInformation.length`).to.equal(
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
        jsonpathFrom(d) === 'ruleDefinition' && d.severity === vscode.DiagnosticSeverity.Error;
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
      expect(diagnostics[0].code, 'diagnostics[0].code').to.equals(ERRORS.TMPL_RULES_AND_RULE_DEFINITION);

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

    it('shows problems on having deprecated icons with new badges', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make a template with the deprecrated and new icons
      const templateInfoUri = uriRelPath(tmpdir, 'template-info.json');
      await writeTextToFile(templateInfoUri, {
        assetIcon: '16.png',
        templateIcon: 'default.png',
        icons: {
          appBadge: {
            name: '16.png'
          },
          templateBadge: {
            name: 'default.png'
          }
        }
      });
      // make sure we get the warnings on the deprecated fields
      const diagnosticsFilter = (d: vscode.Diagnostic) =>
        (d.code === ERRORS.TMPL_ASSETICON_AND_APPBADGE && jsonpathFrom(d) === 'assetIcon') ||
        (d.code === ERRORS.TMPL_TEMPLATEICON_AND_TEMPLATEBADGE && jsonpathFrom(d) === 'templateIcon');
      const diagnostics = (
        await openTemplateInfoAndWaitForDiagnostics(
          templateInfoUri,
          true,
          d => d && d.filter(diagnosticsFilter).length === 2,
          'initial warnings on deprecated fields'
        )
      )[0]
        .filter(diagnosticsFilter)
        .sort(sortDiagnostics);
      if (diagnostics.length !== 2) {
        expect.fail('Expected 2 initial warnings, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic[0]').to.be.not.undefined;
      expect(diagnostics[0].message, 'diagnostic[0].message').to.equal(
        "Template is combining deprecated 'assetIcon' and 'icons.appBadge'"
      );
      expect(diagnostics[0].code, 'diagnostics[0].code').to.equals(ERRORS.TMPL_ASSETICON_AND_APPBADGE);
      expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equals('assetIcon');

      expect(diagnostics[1], 'diagnostic[1]').to.be.not.undefined;
      expect(diagnostics[1].message, 'diagnostic[1].message').to.equal(
        "Template is combining deprecated 'templateIcon' and 'icons.templateBadge'"
      );
      expect(diagnostics[1].code, 'diagnostics[1].code').to.equals(ERRORS.TMPL_TEMPLATEICON_AND_TEMPLATEBADGE);
      expect(jsonpathFrom(diagnostics[1]), 'diagnostics[1].jsonpath').to.equals('templateIcon');
    });

    it('shows file path problems on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('badFilepaths');
      // filter out the Deprecated warning on rulesDefinition for this test
      const map = new Map(diagnostics.filter(d => !d.message.includes('Deprecated')).map(d => [jsonpathFrom(d), d]));
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
        expect(d!.message, path + ' diagnostic message').to.equal('Specified file does not exist in workspace');
        expect(d!.code, path + ' diagnostic code').to.equal(ERRORS.TMPL_REL_PATH_NOT_EXIST);
        expect(d!.severity, path + ' diagnostic severity').to.equal(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      // check for the ones complaining about non-relative or empty paths
      ['releaseInfo.notesFile', 'extendedTypes.discoveryStories[0].file', 'imageFiles[0].file'].forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.equal('Value should be a path relative to this file');
        expect(d!.code, path + ' diagnostic code').to.equal(ERRORS.TMPL_INVALID_REL_PATH);
        expect(d!.severity, path + ' diagnostic severity').to.equal(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      // the other expected errors
      const expected: Record<string, [string, string]> = {
        'datasetFiles[0].userXmd': ["Path should not contain '..' parts", ERRORS.TMPL_INVALID_REL_PATH],
        'storedQueries[0].file': ['Specified path is not a file', ERRORS.TMPL_REL_PATH_NOT_FILE]
      };
      Object.keys(expected).forEach(path => {
        const d = map.get(path);
        const expectedMesg = expected[path][0];
        const expectedCode = expected[path][1];
        expect(d, path + ' diagnostic missing').to.not.be.undefined;
        expect(d!.message, path + ' diagnostic message').to.equal(expectedMesg);
        expect(d!.code, path + ' diagnostic code').to.equal(expectedCode);
        expect(d!.severity, path + ' diagnostic severity').to.equal(vscode.DiagnosticSeverity.Warning);
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

      const diagnosticFilter = (d: vscode.Diagnostic) =>
        jsonpathFrom(d) === 'variableDefinition' &&
        d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST &&
        d.message === 'Specified file does not exist in workspace';
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.length >= 1 && diagnostics.some(diagnosticFilter),
        'Inital diagnostic on bad variableDefinition file'
      );

      // create variables.json
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      // and the diagnostic should go away
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.length > 0 && !diagnostics.some(diagnosticFilter),
        'No more variableDefinition diagnostic after creating variables.json'
      );

      // delete variables.json
      await vscode.workspace.fs.delete(variablesUri, { useTrash: false });
      // and the diagnostic should come back
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.some(diagnosticFilter),
        'Diagnostic on variableDefinition should exist after deleting variables.json'
      );
    });

    it('warns on folder.json in embeddedapp', async () => {
      // create an embeddedapp template, with 1 page for 1 variable (without yet opening it)
      [tmpdir] = await createTempTemplate(false, { show: false });
      await writeTextToFile(uriRelPath(tmpdir, 'variables.json'), {
        var1: {
          variableType: {
            type: 'StringType'
          },
          defaultValue: 'default value'
        }
      });
      const uiUri = uriRelPath(tmpdir, 'ui.json');
      await writeTextToFile(uiUri, {
        pages: [
          {
            title: 'Page1',
            variables: [
              {
                name: 'var1',
                visibility: 'Visible'
              }
            ]
          }
        ]
      });
      const templateInfoUri = uriRelPath(tmpdir!, 'template-info.json');
      await writeTextToFile(templateInfoUri, {
        templateType: 'embeddedapp',
        name: uriBasename(tmpdir),
        label: 'Embedded app with ui.json, which should give a warning',
        assetVersion: 49.0,
        releaseInfo: {
          templateVersion: '1.0'
        },
        variableDefinition: 'variables.json',
        uiDefinition: 'ui.json'
      });

      // make sure we get the 1 warning on uiDefinition
      const diagnosticFilter = (d: vscode.Diagnostic) =>
        jsonpathFrom(d) === 'uiDefinition' && d.code === ERRORS.TMPL_EMBEDDED_APP_WITH_UI;
      await openTemplateInfoAndWaitForDiagnostics(
        templateInfoUri,
        true,
        d => d?.filter(diagnosticFilter).length === 1,
        'Diagnostic on uiDefinition being used in an embeddedapp'
      );

      // now change the ui.json to have no pages
      const [, uiEditor] = await openFile(uiUri);
      await setDocumentText(uiEditor, { pages: [] });
      // and the warning should go away
      await waitForDiagnostics(
        templateInfoUri,
        d => d?.filter(diagnosticFilter).length === 0,
        'Diagnostic on uiDefinition to go away'
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
      expect(diagnostics[0], 'diagnostics[0]').to.be.not.undefined;
      expect(diagnostics[0].message, 'diagnostics[0].message').to.equal(
        "Cannot find variable 'badvar', did you mean 'var1'?"
      );
      expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.UI_PAGE_UNKNOWN_VARIABLE);
      expect(argsFrom(diagnostics[0])?.name, 'diagnostics[0].args.name)').to.equal('badvar');
      expect(argsFrom(diagnostics[0])?.match, 'diagnostics[0].args.match)').to.equal('var1');

      expect(diagnostics[1], 'diagnostics[1]').to.be.not.undefined;
      expect(diagnostics[1].message, 'diagnostics[1].message').to.equal(
        "Cannot find variable 'var2', did you mean 'var1'?"
      );
      expect(diagnostics[1].code, 'diagnostics[1].message').to.equal(ERRORS.UI_PAGE_UNKNOWN_VARIABLE);
      expect(argsFrom(diagnostics[1])?.name, 'diagnostics[1].args.name)').to.equal('var2');
      expect(argsFrom(diagnostics[1])?.match, 'diagnostics[1].args.name)').to.equal('var1');

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
      expect(diagnostics[0], 'diagnostics[0]').to.be.not.undefined;
      expect(diagnostics[0].message, 'diagnostics[0].message').to.equal(
        "Cannot find variable 'var2', did you mean 'var1'?"
      );
      expect(diagnostics[0].code, 'diagnostics[0].message').to.equal(ERRORS.UI_PAGE_UNKNOWN_VARIABLE);
      expect(argsFrom(diagnostics[0])?.name, 'diagnostics[0].args.name)').to.equal('var2');
      expect(argsFrom(diagnostics[0])?.match, 'diagnostics[0].args.match)').to.equal('var1');

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
      expect(diagnostics[1].message, 'diagnostic[1].message').to.equal(
        'At least 1 variable or vfPage must be specified'
      );
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
            `${type} variable '${type}Var' is not supported in ui pages`
          );
          expect(diagnostic.code, `diagnostics[${i}].code`).to.equal(ERRORS.UI_PAGE_UNSUPPORTED_VARIABLE);
          expect(jsonpathFrom(diagnostic), `diagnostics[${i}].jsonpath`).to.equal(`pages[${j}].variables[${k}].name`);
        });
      }
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
      expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
      expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('constants[0].name');
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
      expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
      expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('constants[1].name');
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
      expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
      expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('constants[2].name');
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
      expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
      expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('constants[0].name');
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

    it('shows hints on duplicate rule names', async () => {
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
          'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate rule names hints'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 3) {
        expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      let diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate rule name 'name1'");
      expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
      expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('rules[0].name');
      expect(diagnostic.severity, 'diagnostic[0].severity').to.equal(vscode.DiagnosticSeverity.Hint);
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
      expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
      expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('rules[1].name');
      expect(diagnostic.severity, 'diagnostic[1].severity').to.equal(vscode.DiagnosticSeverity.Hint);
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
      expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
      expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('rules[2].name');
      expect(diagnostic.severity, 'diagnostic[2].severity').to.equal(vscode.DiagnosticSeverity.Hint);
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
          'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate rule names hints'
        )
      ).sort(sortDiagnostics);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we get the expected warnings
      diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate rule name 'name3'");
      expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
      expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('rules[0].name');
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
        'No hints on ' + uriBasename(rules3Editor.document.uri)
      );

      // fix the duplicate rule names
      rulesJson.rules[1].name = 'name2';
      rulesJson.rules[2].name = 'name5';
      await setDocumentText(rulesEditor, rulesJson);
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length === 0,
        'No hints on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate rule names'
      );
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length === 0,
        'No hints on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate rule names'
      );
      await waitForDiagnostics(
        rules3Editor.document.uri,
        d => d && d.length === 0,
        'No hints on ' + uriBasename(rules3Editor.document.uri)
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
      expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
      expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('macros[0].definitions[0].name');
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
      expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
      expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('macros[0].definitions[1].name');
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
      expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
      expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('macros[1].definitions[0].name');
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
      expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
      expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('macros[0].definitions[0].name');
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
        expect(diagnostic, `diagnostics[${i}]`).to.not.be.undefined;
        expect(diagnostic.message, `diagnostics[${i}].message`).to.equal(
          "Macro should have a 'return' or at least one action"
        );
        expect(diagnostic.code, `diagnostics[${i}].code`).to.equal(ERRORS.RULES_NOOP_MACRO);
        expect(diagnostic.severity, `diagnostics[${i}].severity`).to.equal(vscode.DiagnosticSeverity.Information);
        expect(jsonpathFrom(diagnostic), `diagnostics[${i}].jsonpath`).to.equal(
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
