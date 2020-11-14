/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { jsonpathFrom, uriBasename, uriRelPath, uriStat } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  openFile,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  sortDiagnostics,
  waitForDiagnostics,
  writeEmptyJsonFile,
  writeTextToFile
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateLinterManager lints template-info.json', () => {
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
    // there should be a diagnostic on the templateType field for the missing fields
    const d = map.get('templateType');
    expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
    expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
    expect(d!.message, 'message').to.be.equals(
      'App templates must have at least 1 dashboard, dataflow, externaFile, lens, or recipe specified'
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
    // there should be a diagnostic on the templateType field for not having values
    const d = map.get('templateType');
    expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
    expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
    expect(d!.message, 'message').to.be.equals(
      'App templates must have at least 1 dashboard, dataflow, externaFile, lens, or recipe specified'
    );
    expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
    // there should be related information for each field being empty
    expect(d!.relatedInformation, 'relatedInformation').to.be.not.undefined;
    if (d!.relatedInformation!.length !== 5) {
      expect.fail('Expected 5 relatedInformation, got ' + JSON.stringify(d!.relatedInformation, undefined, 2));
    }
    ['dashboards', 'dataflows', 'externalFiles', 'lenses', 'recipes'].forEach(name => {
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
    expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
    expect(d!.message, 'message').to.be.equals(
      'App templates must have at least 1 dashboard, dataflow, externaFile, lens, or recipe specified'
    );
    expect(d!.code, 'code').to.be.equal(ERRORS.TMPL_APP_MISSING_OBJECTS);
    // there should be relatedInformations for dashboards, externalFiles, and lenses
    expect(d!.relatedInformation, 'relatedInformation').to.be.not.undefined;
    if (d!.relatedInformation!.length !== 3) {
      expect.fail('Expected 2 relatedInformation, got ' + JSON.stringify(d!.relatedInformation, undefined, 2));
    }
    ['dashboards', 'externalFiles', 'lenses'].forEach(name => {
      expect(
        d!.relatedInformation!.some(ri => ri.message === `Empty ${name} array`),
        name + ' related information to exist'
      ).to.be.true;
    });
    // but not for this dataflows and recipes (since they're missing in the json)
    expect(
      d!.relatedInformation!.some(ri => ri.message === 'Empty dataflows array'),
      'dataflows related information to exist'
    ).to.be.false;

    expect(
      d!.relatedInformation!.some(ri => ri.message === 'Empty recipes array'),
      'recipes related information to exist'
    ).to.be.false;

    // there could also be a json-schema diagnostic that eltDataflows is missing, so don't failOnUnexpected()
  });

  it('shows problem on template name not matching folder name', async () => {
    const [t, , editor] = await createTempTemplate(true);
    tmpdir = t;
    const dirname = uriBasename(t);
    await setDocumentText(editor, {
      name: 'NotTheFolderName'
    });
    const diagnosticFilter = (d: vscode.Diagnostic) => jsonpathFrom(d) === 'name';
    const diagnostics = (
      await waitForDiagnostics(editor.document.uri, d => d?.some(diagnosticFilter), 'initial name warning')
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
    await setDocumentText(editor, {
      name: dirname
    });
    await waitForDiagnostics(
      editor.document.uri,
      d => d?.filter(diagnosticFilter).length === 0,
      'no name warning after fix'
    );
  });

  it('shows warning on relpath pointing to template-info.json', async () => {
    const [t, , editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
      uiDefinition: 'template-info.json'
    });
    const diagnosticFilter = (d: vscode.Diagnostic) => jsonpathFrom(d) === 'uiDefinition';
    const diagnostics = (
      await waitForDiagnostics(editor.document.uri, d => d?.some(diagnosticFilter), 'initial uiDefinition warning')
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
    await setDocumentText(editor, {
      variableDefinition: 'file.json',
      uiDefinition: 'file.json',
      folderDefinition: 'file.json',
      autoInstallDefinition: 'file.json',
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
        discoveryStories: [
          {
            file: 'file.json',
            label: 'story',
            name: 'story'
          }
        ],
        predictiveScoring: [
          {
            file: 'file.json',
            label: 'prediction',
            name: 'prediction'
          }
        ]
      }
    });
    const dupFilter = (d: vscode.Diagnostic) => d.message === 'Duplicate usage of path file.json';
    const expectedPaths = [
      'variableDefinition',
      'uiDefinition',
      'folderDefinition',
      'autoInstallDefinition',
      'ruleDefinition',
      'rules[0].file',
      'dashboards[0].file',
      'lenses[0].file',
      'eltDataflows[0].file',
      'storedQueries[0].file',
      'extendedTypes.discoveryStories[0].file',
      'extendedTypes.predictiveScoring[0].file'
    ];
    const diagnostics = (
      await waitForDiagnostics(
        editor.document.uri,
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

  it('shows warning on duplicate asset labels', async () => {
    const [t, , editor] = await createTempTemplate(true);
    tmpdir = t;
    await writeEmptyJsonFile(uriRelPath(tmpdir, 'file.json'));
    await setDocumentText(editor, {
      dashboards: [{ label: 'dashboard' }, { label: 'dashboard' }],
      lenses: [{ label: 'lens' }, { label: 'lens' }],
      eltDataflows: [{ label: 'dataflow' }, { label: 'dataflow' }],
      recipes: [{ label: 'recipe' }, { label: 'recipe' }],
      datasetFiles: [{ label: 'dataset' }, { label: 'dataset' }],
      storedQueries: [{ label: 'stored-query' }, { label: 'stored-query' }],
      extendedTypes: {
        discoveryStories: [{ label: 'story' }, { label: 'story' }],
        predictiveScoring: [{ label: 'prediction' }, { label: 'prediction' }]
      }
    });
    const dupFilter = (d: vscode.Diagnostic) => d.code === ERRORS.TMPL_DUPLICATE_LABEL;
    const expectedPaths = [
      'dashboards[0].label',
      'dashboards[1].label',
      'lenses[0].label',
      'lenses[1].label',
      'eltDataflows[0].label',
      'eltDataflows[1].label',
      'recipes[0].label',
      'recipes[1].label',
      'datasetFiles[0].label',
      'datasetFiles[1].label',
      'storedQueries[0].label',
      'storedQueries[1].label',
      'extendedTypes.discoveryStories[0].label',
      'extendedTypes.discoveryStories[1].label',
      'extendedTypes.predictiveScoring[0].label',
      'extendedTypes.predictiveScoring[1].label'
    ];
    const diagnostics = (
      await waitForDiagnostics(
        editor.document.uri,
        d => d && d.filter(dupFilter).length >= expectedPaths.length,
        'initial duplicate path warnings'
      )
    ).filter(dupFilter);
    if (diagnostics.length !== expectedPaths.length) {
      expect.fail(`Expected ${expectedPaths.length} diagnostics, got:\n` + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics.map(d => jsonpathFrom(d), 'diagnostic jsonpaths')).to.include.members(expectedPaths);
    diagnostics.forEach(d => {
      expect(d.severity, `${jsonpathFrom(d)} diagnotic.severity`).to.equal(vscode.DiagnosticSeverity.Warning);
      expect(d.relatedInformation, `${jsonpathFrom(d)} diagnostic.relatedInformation`).to.not.be.undefined;
      expect(d.relatedInformation!.length, `${jsonpathFrom(d)} diagnostic.relatedInformation.length`).to.equal(1);
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
    await waitForDiagnostics(editor.document.uri, d => d?.filter(errorFilter).length === 0);
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
        d => d?.filter(diagnosticsFilter).length === 2,
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
    // only look for the bad rel path errors (there should be a deprecated message on ruleDefinition and a
    // warning about missing folder name on autoInstallDefinition, but those are checked for elsewhere)
    const map = new Map(
      diagnostics
        .filter(
          d =>
            d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST ||
            d.code === ERRORS.TMPL_INVALID_REL_PATH ||
            d.code === ERRORS.TMPL_REL_PATH_NOT_FILE
        )
        .map(d => [jsonpathFrom(d), d])
    );
    // there should be a warning for each these fields about the file not existing
    [
      'variableDefinition',
      'uiDefinition',
      'folderDefinition',
      'autoInstallDefinition',
      'ruleDefinition',
      'rules[0].file',
      'rules[1].file',
      'externalFiles[0].file',
      'externalFiles[0].schema',
      'externalFiles[0].userXmd',
      'lenses[0].file',
      'dashboards[0].file',
      'eltDataflows[0].file',
      'recipes[0].file',
      'extendedTypes.predictiveScoring[0].file'
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
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
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
      diagnostics => diagnostics?.some(diagnosticFilter),
      'Inital diagnostic on bad variableDefinition file'
    );

    // create variables.json
    const variablesUri = uriRelPath(tmpdir, 'variables.json');
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
      diagnostics => diagnostics?.some(diagnosticFilter),
      'Diagnostic on variableDefinition should exist after deleting variables.json'
    );
  });

  it('warns on variables in ui.json in embeddedapp', async () => {
    // create an embeddedapp template, with 1 page for 1 variable (without yet opening it)
    [tmpdir] = await createTempTemplate(false);
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

  it('warns on missing shares in embeddedapp', async () => {
    // create an embeddedapp template
    [tmpdir] = await createTempTemplate(false, { show: false });
    const templateInfoUri = uriRelPath(tmpdir!, 'template-info.json');
    await writeTextToFile(templateInfoUri, {
      templateType: 'embeddedapp',
      name: uriBasename(tmpdir),
      label: 'Embedded app with initially no shares in folder.json',
      assetVersion: 49.0,
      releaseInfo: {
        templateVersion: '1.0'
      },
      // start off with folder.json missing
      folderDefinition: 'folder.json'
    });

    // make sure we get the 1 warning on folderDefinitoin
    const diagnosticFilter = (d: vscode.Diagnostic) =>
      jsonpathFrom(d) === 'folderDefinition' && d.code === ERRORS.TMPL_EMBEDDED_APP_NO_SHARES;
    await openTemplateInfoAndWaitForDiagnostics(
      templateInfoUri,
      true,
      d => d?.filter(diagnosticFilter).length === 1,
      'Diagnostic on non-existing folderDefinition in an embeddedapp'
    );

    // now create an empty folder.json
    const folderUri = uriRelPath(tmpdir!, 'folder.json');
    await writeTextToFile(folderUri, {});
    const [, folderEditor] = await openFile(folderUri);
    // and we should still have the diagnostic on folderDefinitoin
    await waitForDiagnostics(
      templateInfoUri,
      d => d?.filter(diagnosticFilter).length === 1,
      'Diagnostic on no shares in an embeddedapp'
    );

    // now set shares to an empty array
    await setDocumentText(folderEditor, { shares: [] });
    // and we should still have the diagnostic on folderDefinitoin
    await waitForDiagnostics(
      templateInfoUri,
      d => d?.filter(diagnosticFilter).length === 1,
      'Diagnostic on empty shares in an embeddedapp'
    );

    // now update it to have a share
    await setDocumentText(folderEditor, {
      shares: [
        {
          accessType: 'View',
          shareType: 'Organization'
        }
      ]
    });
    // and the warning should go away
    await waitForDiagnostics(
      templateInfoUri,
      d => d?.filter(diagnosticFilter).length === 0,
      'Diagnostic on folderDefinition to go away'
    );
  });

  it('warns on autoInstallDefinition on non-app template', async () => {
    const [dir, doc, editor] = await createTempTemplate(true);
    tmpdir = dir;
    await writeTextToFile(uriRelPath(dir, 'auto-install.json'), {
      hooks: [],
      configuration: { appConfiguration: {} }
    });
    const filter = (d: vscode.Diagnostic) =>
      d.code === ERRORS.TMPL_NON_APP_WITH_AUTO_INSTALL && jsonpathFrom(d) === 'autoInstallDefinition';
    // start as an embedded app template
    const templateJson = {
      templateType: 'embeddedapp',
      name: uriBasename(tmpdir),
      label: 'Test autoInstallDefinition on different templateTypes',
      assetVersion: 50.0,
      releaseInfo: {
        templateVersion: '1.0'
      },
      autoInstallDefinition: 'auto-install.json'
    };
    await setDocumentText(editor, templateJson);
    // should have no warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(filter).length === 0,
      'No warnings on autoInstallDefinition for embeddedapp template'
    );

    // switch to dashboard template
    templateJson.templateType = 'dashboard';
    await setDocumentText(editor, templateJson);
    // should have warning
    const [d] = (
      await waitForDiagnostics(
        doc.uri,
        d => d?.filter(filter).length === 1,
        'Warnings on autoInstallDefinition for dashboard template'
      )
    ).filter(filter);
    expect(d.relatedInformation, 'relatedInformation').to.not.be.undefined;
    expect(d.relatedInformation!.length, 'relatedInformation.length').to.equal(1);
    expect(d.relatedInformation![0], 'relatedInformation[0]').to.not.be.undefined;
    expect(d.relatedInformation![0].location.uri.toString(), 'relatedInformation[0].location').to.equal(
      doc.uri.toString()
    );
    expect(d.relatedInformation![0].message, 'relatedInformation[0].message').to.equal('"templateType" specification');

    // switch to app
    templateJson.templateType = 'app';
    await setDocumentText(editor, templateJson);
    // should have no warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(filter).length === 0,
      'No warnings on autoInstallDefinition for app template'
    );

    // switch to lens
    templateJson.templateType = 'lens';
    await setDocumentText(editor, templateJson);
    // should have warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(filter).length === 1,
      'Warnings on autoInstallDefinition for lens template'
    );

    // switch to no templateType (app)
    delete templateJson.templateType;
    await setDocumentText(editor, templateJson);
    // should have no warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(filter).length === 0,
      'No warnings on autoInstallDefinition for no templateType'
    );
  });

  it('warns on autoInstallDefinition with no folder name', async () => {
    const [dir, templateDoc, templateEditor] = await createTempTemplate(true);
    tmpdir = dir;
    await writeTextToFile(uriRelPath(dir, 'auto-install.json'), {
      hooks: [],
      configuration: { appConfiguration: {} }
    });
    const filter = (d: vscode.Diagnostic) =>
      d.code === ERRORS.TMPL_AUTO_INSTALL_MISSING_FOLDER_NAME && jsonpathFrom(d) === 'autoInstallDefinition';
    // start as an app template w/ no folder
    const templateJson: any = {
      templateType: 'app',
      name: uriBasename(tmpdir),
      label: 'Test for name in folder.json with autoInstallDefinition',
      assetVersion: 50.0,
      releaseInfo: {
        templateVersion: '1.0'
      },
      autoInstallDefinition: 'auto-install.json'
    };
    await setDocumentText(templateEditor, templateJson);
    // should have warning
    let [d] = (
      await waitForDiagnostics(
        templateDoc.uri,
        d => d?.filter(filter).length === 1,
        'Warnings on autoInstallDefinition for no folderDefinition'
      )
    ).filter(filter);
    // but no related info on the warning (since no folder.json)
    expect(d.relatedInformation, 'relatedInformation').to.be.undefined;

    // add folderDefiniton (but no folder.json yet)
    templateJson.folderDefinition = 'folder.json';
    await setDocumentText(templateEditor, templateJson);
    // should still have warning
    await waitForDiagnostics(
      templateDoc.uri,
      d => d?.filter(filter).length === 1,
      'Warnings on autoInstallDefinition for no folder.json'
    );
    expect(d.relatedInformation, 'relatedInformation').to.be.undefined;

    // create folder.json w/ a name
    const folderUri = uriRelPath(tmpdir, 'folder.json');
    await writeTextToFile(folderUri, { name: uriBasename(tmpdir) });
    const [folderDoc, folderEditor] = await openFile(folderUri);
    // should have no warning now
    await waitForDiagnostics(
      templateDoc.uri,
      d => d?.filter(filter).length === 0,
      'No warnings on autoInstallDefinition'
    );

    // empty name in folder.json
    await setDocumentText(folderEditor, { name: '' });
    // should have warning w/ relatedInfo to folder.json
    [d] = (
      await waitForDiagnostics(
        templateDoc.uri,
        d => d?.filter(filter).length === 1,
        'Warnings on autoInstallDefinition for empty name in folder.json'
      )
    ).filter(filter);
    expect(d.relatedInformation!.length, 'relatedInformation.length').to.equal(1);
    expect(d.relatedInformation![0], 'relatedInformation[0]').to.not.be.undefined;
    expect(d.relatedInformation![0].location.uri.toString(), 'relatedInformation[0].location').to.equal(
      folderDoc.uri.toString()
    );
    expect(d.relatedInformation![0].message, 'relatedInformation[0].message').to.equal('folderDefinition file');

    // invalid name in folder.json
    await setDocumentText(folderEditor, { name: 42 });
    // should have warning still
    await waitForDiagnostics(
      templateDoc.uri,
      d => d?.filter(filter).length === 1,
      'Warnings on autoInstallDefinition for no name in folder.json'
    );

    // missing name in folder.json
    await setDocumentText(folderEditor, {});
    // should have warning still
    await waitForDiagnostics(
      templateDoc.uri,
      d => d?.filter(filter).length === 1,
      'Warnings on autoInstallDefinition for no name in folder.json'
    );
  });
});
