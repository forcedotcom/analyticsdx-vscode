/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, JSONPath, parseTree } from 'jsonc-parser';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { ERRORS, TEMPLATE_INFO, TEMPLATE_JSON_LANG_ID } from '../../../src/constants';
import { jsonPathToString } from '../../../src/util/jsoncUtils';
import { argsFrom, jsonpathFrom, uriDirname, uriStat } from '../../../src/util/vscodeUtils';
import { jsoncParse, waitFor } from '../../testutils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles,
  createTempTemplate,
  findPositionByJsonPath,
  getCodeActions,
  getCompletionItems,
  getDefinitionLocations,
  getTemplateEditorManager,
  openTemplateInfo,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  sortDiagnostics,
  waitForDiagnostics,
  waitForTemplateEditorManagerHas
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateEditorManager configures template-info.json', () => {
  let tmpdir: vscode.Uri | undefined;
  beforeEach(async () => {
    await closeAllEditors();
    tmpdir = undefined;
  });

  afterEach(async () => {
    await closeAllEditors();
    // delete the temp folder if it got created
    if (tmpdir && (await uriStat(tmpdir))) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
    tmpdir = undefined;
  });

  it('related file schemas', async () => {
    const [, doc] = await openTemplateInfoAndWaitForDiagnostics('allRelpaths');
    const templateDir = uriDirname(doc.uri);
    const templateEditingManager = await getTemplateEditorManager();
    await waitForTemplateEditorManagerHas(templateEditingManager, templateDir, true);
    // make sure the languageId changes on the template-info.json
    await waitFor(
      () => doc.languageId,
      langId => langId === TEMPLATE_JSON_LANG_ID,
      {
        timeoutMessage: langId => `Timed out waiting for languageId to switch from ${langId}`
      }
    );
    // make sure that the schema associations method has the schema for the various related files
    const associations = templateEditingManager.getSchemaAssociations();
    expect(associations[path.join(templateDir.path, 'folder.json')], 'folder.json schema').to.have.members([
      templateEditingManager.folderSchemaPath.toString()
    ]);
    expect(associations[path.join(templateDir.path, 'variables.json')], 'variables.json schema').to.have.members([
      templateEditingManager.variablesSchemaPath.toString()
    ]);
    expect(associations[path.join(templateDir.path, 'ui.json')], 'ui.json schema').to.have.members([
      templateEditingManager.uiSchemaPath.toString()
    ]);
    ['rule-definition.json', 'template-to-app-rules.json', 'app-to-template-rules.json'].forEach(file => {
      expect(associations[path.join(templateDir.path, file)], `${file} schema`).to.have.members([
        templateEditingManager.rulesSchemaPath.toString()
      ]);
    });
    // the tests in the other describe()s for each related file will verify that the schems are actually all hooked up
  });

  async function testCompletions(jsonpath: JSONPath, ...expectedPaths: string[]) {
    const [doc] = await openTemplateInfo('allRelpaths');
    // make sure the template editing stuff is fully setup for the directory
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(doc.uri), true);
    const position = findPositionByJsonPath(doc, jsonpath);
    expect(position, 'position').to.not.be.undefined;
    const list = await getCompletionItems(doc.uri, position!);
    expect(list.items.length, 'length').to.be.greaterThan(0);
    const missing = [] as string[];
    expectedPaths.forEach(path => {
      if (!list.items.some(item => item.detail === path)) {
        missing.push(path);
      }
    });
    if (missing.length > 0) {
      expect.fail(
        `Missing [${missing.join(', ')}] in '${jsonPathToString(jsonpath)}' completions: ` +
          list.items.map(item => item.detail || item.label).join(', ')
      );
    }
    return list.items;
  }

  it('json file completions', async () => {
    const completions = await testCompletions(
      TEMPLATE_INFO.jsonRelFilePathLocationPatterns[0],
      'dashboards/dashboard.json',
      'dataflows/dataflow.json',
      'datasets/dataset.json',
      'lenses/lens.json',
      'queries/query.json'
      // there's other json files in the template dir, but if we see these, then it's hooked up
    );
    // make sure the completions don't include 'template-info.json'
    if (completions.some(item => item.detail === 'template-info.json')) {
      expect.fail(
        'Completions should be not contain template-info.json, got: ' +
          completions.map(item => item.detail || item.label)
      );
    }
  });

  it('html file completions', async () => {
    await testCompletions(TEMPLATE_INFO.htmlRelFilePathLocationPatterns[0], 'releaseNotes.html');
  });

  it('csv file completions', async () => {
    await testCompletions(TEMPLATE_INFO.csvRelFilePathLocationPatterns[0], 'externalFiles/externalFile.csv');
  });

  it('image file completions', async () => {
    await testCompletions(TEMPLATE_INFO.imageRelFilePathLocationPatterns[0], 'images/image.png');
  });

  it('dataModelObjects dataset completions', async () => {
    const [t, doc, editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
      templateType: 'app',
      datasetFiles: [{ name: 'dataset1' }, { name: 'otherdataset' }],
      dataModelObjects: [{ name: 'dmo0', label: 'dmo0', dataset: '' }]
    });
    // await for the warning on dmo0.dataset
    await waitForDiagnostics(
      doc.uri,
      ds =>
        ds &&
        ds.filter(
          d => d.code === ERRORS.TMPL_UNKNOWN_DMO_DATASET_NAME && jsonpathFrom(d) === 'dataModelObjects[0].dataset'
        ).length >= 1,
      'initial warning on dataModelObjects'
    );
    // move into the empty ""
    const position = findPositionByJsonPath(doc, ['dataModelObjects', 0, 'dataset'])?.translate({ characterDelta: 1 });
    expect(position, 'position').to.not.be.undefined;
    const completionLabels = (await getCompletionItems(doc.uri, position!)).items.map(
      item => item.detail || item.label
    );
    // the literal null completion comes from the json-schema
    expect(completionLabels, 'completions').to.deep.equal(['"dataset1"', '"otherdataset"', 'null']);
  });

  it('dataModeLObjects dataset definition support', async () => {
    const [t, doc, editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
      templateType: 'app',
      datasetFiles: [{ name: 'dataset1' }, { name: 'otherdataset' }],
      dataModelObjects: [{ name: 'dmo0', label: 'dmo0', dataset: 'otherdataset' }]
    });
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), t, true);
    const position = findPositionByJsonPath(doc, ['dataModelObjects', 0, 'dataset'])?.translate({ characterDelta: 1 });
    expect(position, 'position').to.not.be.undefined;
    const locations = await getDefinitionLocations(doc.uri, position!);
    expect(locations.length, 'locations.length').to.equal(1);
    // make sure the location is the same template-info.json file
    expect(locations[0].uri.path, 'location path').to.equal(doc.uri.path);
    // and points to the "otherdataset" name attribute
    const datasetNamePosition = findPositionByJsonPath(doc, ['datasetFiles', 1, 'name']);
    expect(datasetNamePosition, 'dataset name position').to.not.be.undefined;
    expect(locations[0].range.start.line, 'location line').to.equal(datasetNamePosition!.line);
    expect(locations[0].range.start.character, 'location character').to.equal(datasetNamePosition!.character);
  });

  it('quick fix to remove deprecated icon fields', async () => {
    const [t, doc, editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
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
    // wait for the warning on assetIcon
    const assetIconFilter = (d: vscode.Diagnostic) =>
      d.code === ERRORS.TMPL_ASSETICON_AND_APPBADGE && jsonpathFrom(d) === 'assetIcon';
    let diagnostics = (
      await waitForDiagnostics(doc.uri, d => d?.filter(assetIconFilter).length === 1, 'initial warnings on assetIcon')
    )
      .filter(assetIconFilter)
      .sort(sortDiagnostics);
    // look for the 'Remove assetIcon' quick fix on the first diagnostic
    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('assetIcon');
    let allActions = await getCodeActions(doc.uri, diagnostics[0].range);
    let actions = allActions.filter(a => a.title.startsWith('Remove assetIcon'));
    if (actions.length !== 1) {
      expect.fail('Expected 1 remove action for assetIcon, got: [' + allActions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].edit, 'assetIcon quick fix.edit').to.not.be.undefined;
    // run the quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // that should fix the assetIcon warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(assetIconFilter).length === 0,
      'no warnings on assetIcon after quick fix'
    );

    // wait for the warning on templateIcon
    const templateIconFilter = (d: vscode.Diagnostic) =>
      d.code === ERRORS.TMPL_TEMPLATEICON_AND_TEMPLATEBADGE && jsonpathFrom(d) === 'templateIcon';
    diagnostics = (
      await waitForDiagnostics(
        doc.uri,
        d => d?.filter(templateIconFilter).length === 1,
        'initial warnings on templateIcon'
      )
    )
      .filter(templateIconFilter)
      .sort(sortDiagnostics);
    // look for the 'Remove templateIcon' quick fix on the first diagnostic
    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('templateIcon');
    allActions = await getCodeActions(doc.uri, diagnostics[0].range);
    actions = allActions.filter(a => a.title.startsWith('Remove templateIcon'));
    if (actions.length !== 1) {
      expect.fail('Expected 1 remove action for templateIcon, got: [' + allActions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].edit, 'templateIcon quick fix.edit').to.not.be.undefined;
    // run the Remove templateIcon quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // that should fix the templateIcon warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(templateIconFilter).length === 0,
      'no warnings on templateIcon after quick fix'
    );

    // make sure assetIcon and templateIcon got removed
    const tree = parseTree(doc!.getText());
    expect(tree, 'jsonNode root').to.not.be.undefined;
    if (findNodeAtLocation(tree!, ['assetIcon'])) {
      expect.fail('"assetIcon" was not removed from the file');
    }
    if (findNodeAtLocation(tree!, ['templateIcon'])) {
      expect.fail('"templateIcon" was not removed from the file');
    }
  });

  it('quick fix for missing relative path files', async () => {
    const [t, doc, editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
      folderDefinition: 'dir/folder.json',
      imageFiles: [
        {
          file: 'images/image.png',
          name: 'image.png'
        }
      ]
    });
    // wait for the warning on folderDefinition that the file doesn't exist
    const folderFilter = (d: vscode.Diagnostic) =>
      jsonpathFrom(d) === 'folderDefinition' && d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST;
    let [diagnostic] = (
      await waitForDiagnostics(
        doc.uri,
        d => d?.filter(folderFilter).length === 1,
        'initial warning on folderDefinition'
      )
    ).filter(folderFilter);
    // look for the quick fix
    let actions = await getCodeActions(doc.uri, diagnostic.range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code actions for folderDefinition, got: [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'quick fix title').to.equals('Create dir/folder.json');
    expect(actions[0].edit, 'quick fix.edit').to.not.be.undefined;
    // run the quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // that should fix the warning
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(folderFilter).length === 0,
      'no warnings on folderDefintion after quick fix'
    );
    // make sure the file got created
    const uri = vscode.Uri.joinPath(tmpdir, 'dir/folder.json');
    const stat = await uriStat(uri);
    if (!stat) {
      expect.fail(`${uri.toString()} doesn't exist after quick fix`);
    }
    // get the text of the new file, which shouldn't be empty since it's json
    const folderDoc = await vscode.workspace.openTextDocument(uri);
    expect(folderDoc.getText().trim().length, `${uri} char length`).to.be.greaterThan(0);

    // wait for the warning on imageFiles that the file doesn't exist
    const imageFilter = (d: vscode.Diagnostic) =>
      jsonpathFrom(d) === 'imageFiles[0].file' && d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST;
    [diagnostic] = (
      await waitForDiagnostics(doc!.uri, d => d?.filter(imageFilter).length === 1, 'initial warning on imageFiles[0]')
    ).filter(imageFilter);
    // for paths pointing to files, there shouldn't be a quick fix
    actions = await getCodeActions(doc.uri, diagnostic.range);
    if (actions.length !== 0) {
      expect.fail('Expected 0 code actions for imageFile, got: [' + actions.map(a => a.title).join(', ') + ']');
    }
  });

  it('quick fix for missing shares for embeddedapp', async () => {
    // make an embeddedapp template w/ a folder.json that has no shares specified
    [tmpdir] = await createTemplateWithRelatedFiles({
      field: 'folderDefinition',
      path: 'folder.json',
      initialJson: {}
    });
    const [doc, editor] = await openTemplateInfo(vscode.Uri.joinPath(tmpdir, 'template-info.json'), true);
    await setDocumentText(editor, {
      templateType: 'embeddedapp',
      folderDefinition: 'folder.json'
    });
    // wait for the warning on folderDefinition about missing shares
    const folderFilter = (d: vscode.Diagnostic) =>
      jsonpathFrom(d) === 'folderDefinition' && d.code === ERRORS.TMPL_EMBEDDED_APP_NO_SHARES;
    const [diagnostic] = (
      await waitForDiagnostics(
        doc!.uri,
        d => d?.filter(folderFilter).length === 1,
        'initial warning on folderDefinition'
      )
    ).filter(folderFilter);
    // the folderDefinitionUri arg should be on the diagnostic
    expect(argsFrom(diagnostic)?.folderDefinitionUri, 'folderDefinitionUri').to.not.be.undefined;

    // look for the quick fix
    const actions = await getCodeActions(doc!.uri, diagnostic.range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code action for folderDefinition, got: [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'quick fix title').to.equals('Add default share to folder.json');
    expect(actions[0].edit, 'quick fix.edit').to.not.be.undefined;
    // run the quick fix's edit
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // that should fix the warning on folderDefinition
    await waitForDiagnostics(
      doc!.uri,
      d => d?.filter(folderFilter).length === 0,
      'no warnings on folderDefintion after quick fix'
    );
    // make sure the share got created in folder.json
    const uri = vscode.Uri.joinPath(tmpdir, 'folder.json');
    const folderDoc = await vscode.workspace.openTextDocument(uri);
    const folderJson = jsoncParse(folderDoc.getText());
    expect(folderJson, 'folder.json').to.not.be.undefined;
    expect(folderJson.shares, '"shares" in folder.json').to.not.be.undefined;
    expect(folderJson.shares, '"shares" in folder.json').to.have.deep.members([
      {
        accessType: 'View',
        shareType: 'Organization'
      }
    ]);
  });

  it('quick fix to remove unsupported data template asset fields', async () => {
    const [t, doc, editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
      templateType: 'data',
      recipes: [{ label: 'recipe', name: 'recipe', file: 'recipe.json' }],
      // lenses aren't supported in data templates
      lenses: [{ label: 'lens', name: 'lens', file: 'lens.json' }],
      // empty array, though, should not have a diagnostic
      dashboards: []
    });
    // wait for the warning on lenses
    const assetIconFilter = (d: vscode.Diagnostic) => d.code === ERRORS.TMPL_DATA_UNSUPPORTED_OBJECT;
    const diagnostics = (
      await waitForDiagnostics(doc.uri, d => d && d.filter(assetIconFilter).length >= 1, 'initial warning on lenses')
    )
      .filter(assetIconFilter)
      .sort(sortDiagnostics);
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 diagnostic on "lenses", got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    // look for the 'Remove lenses' quick fix on the diagnostic
    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('lenses');
    const allActions = await getCodeActions(doc.uri, diagnostics[0].range);
    const actions = allActions.filter(a => a.title.startsWith('Remove lenses'));
    if (actions.length !== 1) {
      expect.fail('Expected 1 remove action for lenses, got: [' + allActions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].edit, 'lenses quick fix.edit').to.not.be.undefined;

    // run the quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }

    // make sure the lenses warnings went away
    await waitForDiagnostics(
      doc.uri,
      d => d?.filter(assetIconFilter).length === 0,
      'no warnings lenses after quick fix'
    );

    // make sure the json got updated
    const json = jsoncParse(doc.getText());
    expect(json, 'template-info.json').to.not.be.undefined;
    expect(json.lenses, 'lenses').to.be.undefined;
  });

  it('quick fix to update dataModelObjects dataset field', async () => {
    const [t, doc, editor] = await createTempTemplate(true);
    tmpdir = t;
    await setDocumentText(editor, {
      templateType: 'app',
      datasetFiles: [{ name: 'dataset1' }, { name: 'otherdataset' }],
      dataModelObjects: [
        // this one should have a quickfix to switch to 'dataset1'
        { name: 'dmo0', label: 'dmo0', dataset: 'dataset' },
        // this one is fine
        { name: 'dmo0', label: 'dmo0', dataset: 'otherdataset' }
      ]
    });
    // wait for the warning
    const dmoFilter = (d: vscode.Diagnostic) => d.code === ERRORS.TMPL_UNKNOWN_DMO_DATASET_NAME;
    const diagnostics = (
      await waitForDiagnostics(
        doc.uri,
        d => d && d.filter(dmoFilter).length >= 1,
        'initial warning on dataModelObjects'
      )
    )
      .filter(dmoFilter)
      .sort(sortDiagnostics);
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 diagnostic, got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(jsonpathFrom(diagnostics[0]), 'diagnostic[0].jsonpath').to.equal('dataModelObjects[0].dataset');
    // get the quick fix actions
    const actions = await getCodeActions(doc.uri, diagnostics[0].range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code action, got: [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].edit, 'action.edit').to.not.be.undefined;
    // run the quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // make sure the warning went away
    await waitForDiagnostics(doc.uri, d => d?.filter(dmoFilter).length === 0, 'no warnings lenses after quick fix');
    // make sure the json got updated
    const json = jsoncParse(doc.getText());
    expect(json, 'template-info.json').to.not.be.undefined;
    expect(json.dataModelObjects[0].dataset, 'dataModelObjects[0].dataset').to.equal('dataset1');
  });

  // TODO: tests for definitionProvider, actionProvider, etc.
});
