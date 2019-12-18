/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, JSONPath, parseTree } from 'jsonc-parser';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { TEMPLATE_INFO, TEMPLATE_JSON_LANG_ID } from '../../src/constants';
import { TemplateEditingManager } from '../../src/templateEditing';
import { scanLinesUntil, uriDirname, uriStat } from '../../src/util/vscodeUtils';
import { waitFor } from '../testutils';
import {
  closeAllEditors,
  createTempTemplate,
  findPositionByJsonPath,
  getCompletionItems,
  openFile,
  openFileAndWaitForDiagnostics,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  uriFromTestRoot,
  waitForDiagnostics,
  waitForTemplateExtensionActive,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from './vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateEditorManager', () => {
  async function getTemplateEditorManager() {
    const ext = (await waitForTemplateExtensionActive()).exports;
    expect(ext, 'extension exports').to.not.be.undefined;
    expect(ext!.templateEditingManager, 'templateEditingManager').to.not.be.undefined;
    return ext!.templateEditingManager;
  }

  async function waitForTemplateEditorManagerHas(
    templateEditingManager: TemplateEditingManager,
    dir: vscode.Uri,
    expected: boolean
  ) {
    try {
      return await waitFor(() => templateEditingManager.has(dir), has => has === expected, {
        pauseMs: 500,
        timeoutMs: 15000
      });
    } catch (e) {
      if (e && e.name === 'timeout') {
        expect.fail(`Timeout waiting for TemplateEditingManager.has(${dir})===${expected}`);
      }
      throw e;
    }
  }

  async function verifyCompletionsContain(
    document: vscode.TextDocument,
    position: vscode.Position,
    ...expectedLabels: string[]
  ) {
    const list = await getCompletionItems(document.uri, position);
    const labels = list.items.map(item => item.label);
    expect(labels, 'completion items').to.include.members(expectedLabels);
    // also we shouldn't get any duplicate code completion items (which can come if something else, like the default
    // json language service, is injecting extra stuff into our document type).
    const dups: string[] = [];
    list.items
      .reduce((m, val) => m.set(val.label, (m.get(val.label) || 0) + 1), new Map<string, number>())
      .forEach((num, label) => {
        if (num >= 2) {
          dups.push(label);
        }
      });
    if (dups.length > 0) {
      expect.fail('Found duplicate completion items: ' + dups.join(', '));
    }
  }

  describe('starts on', () => {
    let tmpdir: vscode.Uri | undefined;
    beforeEach(async () => {
      await closeAllEditors();
      // create a temp template folder with an empty template-info.json
      [tmpdir] = await createTempTemplate(false);
    });

    afterEach(async () => {
      await closeAllEditors();
      // delete the temp folder
      if (tmpdir && (await uriStat(tmpdir))) {
        await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
      }
    });

    it('template-info.json opened', async () => {
      const templateEditingManager = await getTemplateEditorManager();
      expect(templateEditingManager.has(tmpdir!), `initial templateEditingManager.has(${tmpdir})`).to.be.false;

      // open the template-info.json in the create tmp folder
      const file = tmpdir!.with({ path: path.join(tmpdir!.path, 'template-info.json') });
      await openTemplateInfoAndWaitForDiagnostics(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir!, true);
    });

    it('related file opened', async () => {
      const templateEditingManager = await getTemplateEditorManager();
      expect(templateEditingManager.has(tmpdir!), `initial templateEditingManager.has(${tmpdir})`).to.be.false;

      // create an empty folder.json in the template directory
      const file = tmpdir!.with({ path: path.join(tmpdir!.path, 'folder.json') });
      await writeEmptyJsonFile(file);
      // open that file
      await openFile(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir!, true);
    });
  }); // describe('starts on')

  describe('stops on delete', () => {
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

    it('of template-info.json', async () => {
      [tmpdir] = await createTempTemplate(false);
      const templateEditingManager = await getTemplateEditorManager();
      expect(templateEditingManager.has(tmpdir), `initial templateEditingManager.has(${tmpdir})`).to.be.false;

      // open the template-info.json
      const file = tmpdir!.with({ path: path.join(tmpdir.path, 'template-info.json') });
      await openTemplateInfoAndWaitForDiagnostics(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir, true);

      // now delete the template-info.json file
      await vscode.workspace.fs.delete(file, { useTrash: false });
      // make sure the template dir gets editing removed
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir, false);
    });

    it('of template folder', async () => {
      [tmpdir] = await createTempTemplate(false);
      const templateEditingManager = await getTemplateEditorManager();
      expect(templateEditingManager.has(tmpdir), `initial templateEditingManager.has(${tmpdir})`).to.be.false;

      // open the template-info.json
      const file = tmpdir!.with({ path: path.join(tmpdir.path, 'template-info.json') });
      await openTemplateInfoAndWaitForDiagnostics(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir, true);

      // now delete the template directory
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
      // make sure the template dir gets editing removed
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir, false);
    });

    it("of template folder's folder", async () => {
      [tmpdir] = await createTempTemplate(false, false, 'subdir');
      const templateDir = tmpdir.with({ path: path.join(tmpdir.path, 'subdir') });
      const templateEditingManager = await getTemplateEditorManager();
      expect(templateEditingManager.has(tmpdir), `initial templateEditingManager.has(${tmpdir})`).to.be.false;
      expect(templateEditingManager.has(templateDir), `initial templateEditingManager.has(${templateDir})`).to.be.false;

      // open the template-info.json
      const file = templateDir.with({ path: path.join(templateDir.path, 'template-info.json') });
      await openTemplateInfoAndWaitForDiagnostics(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(templateEditingManager, templateDir, true);
      // and the grandparent dir shouldn't have editing
      await waitForTemplateEditorManagerHas(templateEditingManager, tmpdir, false);

      // now delete the grandparent temp directory
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
      // make sure the template dir gets editing removed
      await waitForTemplateEditorManagerHas(templateEditingManager, templateDir, false);
    });
  }); // describe('stops on delete')

  describe('configures template-info.json', () => {
    beforeEach(closeAllEditors);
    afterEach(closeAllEditors);

    it('related file schemas', async () => {
      const [, doc] = await openTemplateInfoAndWaitForDiagnostics('allRelpaths');
      const templateDir = uriDirname(doc.uri);
      const templateEditingManager = await getTemplateEditorManager();
      await waitForTemplateEditorManagerHas(templateEditingManager, templateDir, true);
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

    async function testCompletions(path: JSONPath, ...expectedPaths: string[]) {
      const [, doc] = await openTemplateInfoAndWaitForDiagnostics('allRelpaths');
      const position = findPositionByJsonPath(doc, path);
      expect(position, 'position').to.not.be.undefined;
      const list = await getCompletionItems(doc.uri, position!);
      expect(list.items.length, 'length').to.be.greaterThan(0);
      expectedPaths.forEach(path => {
        const found = list.items.some(item => item.detail === path);
        expect(found, `items to contain ${path}`).to.be.true;
      });
    }

    it('json file completions', async () => {
      await testCompletions(
        TEMPLATE_INFO.jsonRelFilePathLocationPatterns[0],
        'dashboards/dashboard.json',
        'dataflows/dataflow.json',
        'datasets/dataset.json',
        'lenses/lens.json',
        'queries/query.json'
        // there's other json files in the template dir, but if we see these, then it's hooked up
      );
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

    // TODO: tests for definitionProvider, actionProvider, etc.
  }); // describe('configures template-info.json')

  describe('configures folderDefinition', () => {
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

    it('json-schema diagnostics on open', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'folder.json');
      const [diagnostics] = await openFileAndWaitForDiagnostics(uri);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail('Expect 1 diagnostic on ' + uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we got the error about the invalid field name
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);
    });

    it('json-schema code completions', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'folder.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // find the accessType in the first shares to see if the enum works
      let node = findNodeAtLocation(tree, ['shares', 0, 'accessType']);
      expect(node, 'shares[0].accessType').to.not.be.undefined;
      let position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(doc, position, '"Edit"', '"Manage"', '"View"');

      // find the start of the first node (which should be the "error" property)
      node = tree.children![0];
      expect(node, 'first node').to.not.be.undefined;
      // this should be right the first double-quote at the beginning of "error"
      position = doc.positionAt(node.offset);
      // make sure it has the fields from the schema that aren't in the document
      // Note: we will also get "$schema" (from the regular json language client), but, at some point, we'll fix that
      await verifyCompletionsContain(doc, position, 'description', 'label', 'name');
    });

    it('json-schema defaultSnippets', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'folder.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // go just before the {} in "featuresAssets"
      let node = findNodeAtLocation(tree, ['featuredAssets']);
      expect(node, 'featuredAssets').to.not.be.undefined;
      let scan = scanLinesUntil(doc, ch => ch === '{', doc.positionAt(node!.offset));
      if (scan.ch !== '{') {
        expect.fail("Expected to find '{' after '\"featuredAssets\":'");
      }
      let position = scan.end.translate({ characterDelta: -1 });
      // that should give a snippet to fill out the whole featuresAssets
      await verifyCompletionsContain(doc, position, 'New featuredAssets');

      // go right after the [ in "shares"
      node = findNodeAtLocation(tree, ['shares']);
      expect(node, 'shares').to.not.be.undefined;
      scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"shares\":'");
      }
      position = scan.end.translate({ characterDelta: 1 });
      // that should give a snippet for default
      await verifyCompletionsContain(doc, position, 'New share');
      // REVIEWME: we could test for 'New featuresAsset' and 'New shares', but this is enough to make sure the
      // json schema association is there
    });

    it('on change of path value', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // and folder.json with some content that would have schema errors
      const folderUri = tmpdir.with({ path: path.join(tmpdir.path, 'folder.json') });
      await writeEmptyJsonFile(folderUri);
      const [folderDoc, folderEditor] = await openFile(folderUri);
      await setDocumentText(
        folderEditor,
        JSON.stringify(
          {
            error: 'intentionally unknown error field for test to look for'
          },
          undefined,
          2
        )
      );
      // but since it's not reference by the template-info.json, it should have no errors
      await waitForDiagnostics(folderDoc.uri, d => d && d.length === 0);

      // now, write "folderDefinition": "folder.json" to the template-info.json
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            folderDefinition: 'folder.json'
          },
          undefined,
          2
        )
      );

      // the folder.json should eventually end up with a diagnostic about the bad field
      const diagnostics = await waitForDiagnostics(folderDoc.uri, d => d && d.length === 1);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail(
          'Expect 1 diagnostic on ' + folderDoc.uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
        );
      }
      // make sure we got the error about the invalid field name
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);

      // now, set folderDefinition to a filename that doesn't exist
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            folderDefinition: 'doesnotexist.json'
          },
          undefined,
          2
        )
      );
      // which should clear the warnings on folder.json since it's not a folder file anymore
      await waitForDiagnostics(folderDoc.uri, d => d && d.length === 0);
    });

    it('without default json language services', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            folderDefinition: 'folder.json'
          },
          undefined,
          2
        )
      );
      // that should give us a warning about folder.json not existing
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.some(d => d.code === 'folderDefinition')
      );
      // create a folder.json that has a comment and some bad json
      const folderUri = tmpdir.with({ path: path.join(tmpdir.path, 'folder.json') });
      await writeEmptyJsonFile(folderUri);
      const [, folderEditor] = await openFile(folderUri);
      await setDocumentText(
        folderEditor,
        `{
           // a comment here, with missing double-quotes below
           featuredAssets: {}
         }`
      );
      // we should only get an error on the missing double quotes (and not on the json comment)
      const diagnostics = await waitForDiagnostics(folderUri);
      if (diagnostics.length !== 1) {
        expect.fail('Expected one diagnostic on folder.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
      expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
    });

    it('formatting', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            folderDefinition: 'folder.json'
          },
          undefined,
          2
        )
      );
      // create a folder.json
      const folderUri = tmpdir.with({ path: path.join(tmpdir.path, 'folder.json') });
      await writeEmptyJsonFile(folderUri);
      const [, folderEditor] = await openFile(folderUri);
      // wait for the doc to get mapped to adx-template-json
      await waitFor(() => folderEditor.document.languageId, id => id === TEMPLATE_JSON_LANG_ID, {
        timeoutMessage: 'Timeout waiting for lanaugeId'
      });
      // put in some badly-formatted json
      await setDocumentText(
        folderEditor,
        `
        {
        "name":"AllFields",
        "label" :"AllFields",
        "description": "Test all the available fields and values for folder.json",
        "featuredAssets": {
        "default": {
        "assets": [
        {"id": "assetId","name": "assetName","namespace": "assetNamespace", "type": "assetType"}
              ]
        }
        },
                  "shares" : [
            {
              "accessType": "View",
              "shareType": "Organization",
              "sharedWithId": "someId"
            }
          ]
        }
        `
      );

      // format it
      await vscode.commands.executeCommand('editor.action.formatDocument');
      const expectedJson = JSON.stringify(
        {
          name: 'AllFields',
          label: 'AllFields',
          description: 'Test all the available fields and values for folder.json',
          featuredAssets: {
            default: {
              assets: [{ id: 'assetId', name: 'assetName', namespace: 'assetNamespace', type: 'assetType' }]
            }
          },
          shares: [
            {
              accessType: 'View',
              shareType: 'Organization',
              sharedWithId: 'someId'
            }
          ]
        },
        undefined,
        // the .vscode/settigs.json in the test-assets/sfdx-simple workspace has tabSize: 2, so this should match
        2
      ).replace('\r\n', '\n');
      expect(folderEditor.document.getText().replace('\r\n', '\n'), 'folder.json text').to.equal(expectedJson);
    });
  }); // describe('configures folderDefinition')

  describe('configures uiDefinition', () => {
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

    it('json-schema diagnostics on open', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'ui.json');
      const [diagnostics] = await openFileAndWaitForDiagnostics(uri);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail('Expect 1 diagnostic on ' + uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we got the error about the invalid field name
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);
    });

    it('json-schema code completions', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'ui.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // find the visibility in the first page variable to see if the enum works
      let node = findNodeAtLocation(tree, ['pages', 0, 'variables', 0, 'visibility']);
      expect(node, 'pages[0].variables').to.not.be.undefined;
      let position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(
        doc,
        position,
        '"Disabled"',
        '"Hidden"',
        '"Visible"',
        '"{{Variables.booleanVariable}}"'
      );

      // find the start of the first "page" item
      node = findNodeAtLocation(tree, ['pages', 0]);
      expect(node, 'pages').to.not.be.undefined;
      // this should be right the opening '{'
      position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
      // make sure it has the fields from the schema that aren't in the document
      await verifyCompletionsContain(doc, position, 'condition', 'helpUrl', 'vfPage');
    });

    it('json-schema defaultSnippets', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'ui.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // go to just before the [ in "pages"
      let node = findNodeAtLocation(tree, ['pages']);
      expect(node, 'pages').to.not.be.undefined;
      let scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"pages\":'");
      }
      let position = scan.end.translate({ characterDelta: -1 });
      // that should give a snippet to fill out the whole pages
      await verifyCompletionsContain(doc, position, 'New pages');

      // go to just after the [ in "variables"
      node = findNodeAtLocation(tree, ['pages', 0, 'variables']);
      expect(node, 'pages[0].variables').to.not.be.undefined;
      scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"variables\":'");
      }
      position = scan.end.translate({ characterDelta: 1 });
      // that should give a snippet for a new variable
      await verifyCompletionsContain(doc, position, 'New variable');

      // go right after the [ in "displayMessages"
      node = findNodeAtLocation(tree, ['displayMessages']);
      expect(node, 'displayMessages').to.not.be.undefined;
      scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"displayMessages\":'");
      }
      position = scan.end.translate({ characterDelta: 1 });
      // that should give a snippet for default
      await verifyCompletionsContain(doc, position, 'New displayMessage');
    });

    it('on change of path value', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // and ui.json with some content that would have schema errors
      const uiUri = tmpdir.with({ path: path.join(tmpdir.path, 'ui.json') });
      await writeEmptyJsonFile(uiUri);
      const [uiDoc, uiEditor] = await openFile(uiUri);
      await setDocumentText(
        uiEditor,
        JSON.stringify(
          {
            error: 'intentionally unknown error field for test to look for'
          },
          undefined,
          2
        )
      );
      // but since it's not reference by the template-info.json, it should have no errors
      await waitForDiagnostics(uiDoc.uri, d => d && d.length === 0);

      // now, write "uiDefinition": "ui.json" to the template-info.json
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            uiDefinition: 'ui.json'
          },
          undefined,
          2
        )
      );

      // the ui.json should eventually end up with a diagnostic about the bad field
      const diagnostics = await waitForDiagnostics(uiDoc.uri, d => d && d.length === 1);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail(
          'Expect 1 diagnostic on ' + uiDoc.uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
        );
      }
      // make sure we got the error about the invalid field name
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);

      // now, set uiDefinition to a filename that doesn't exist
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            uiDefinition: 'doesnotexist.json'
          },
          undefined,
          2
        )
      );
      // which should clear the warnings on ui.json since it's not a folder file anymore
      await waitForDiagnostics(uiDoc.uri, d => d && d.length === 0);
    });

    it('without default json language services', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            uiDefinition: 'ui.json'
          },
          undefined,
          2
        )
      );
      // that should give us a warning about ui.json not existing
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.some(d => d.code === 'uiDefinition')
      );
      // create a ui.json that has a comment and some bad json
      const uiUri = tmpdir.with({ path: path.join(tmpdir.path, 'ui.json') });
      await writeEmptyJsonFile(uiUri);
      const [, uiEditor] = await openFile(uiUri);
      await setDocumentText(
        uiEditor,
        `{
           // a comment here, with missing double-quotes below
           pages: []
         }`
      );
      // we should only get an error on the missing double quotes (and not on the json comment)
      const diagnostics = await waitForDiagnostics(uiUri);
      if (diagnostics.length !== 1) {
        expect.fail('Expected one diagnostic on ui.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
      expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
    });
  }); // describe('configures uiDefinition')

  describe('configures variablesDefinition', () => {
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

    it('json-schema diagnostics on open', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'variables.json');
      const [diagnostics] = await openFileAndWaitForDiagnostics(uri);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail('Expect 1 diagnostic on ' + uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2));
      }
      // make sure we got the error about the invalid field name
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Incorrect type/);
    });

    it('json-schema code completions', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'variables.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // find the type in the first variable
      let node = findNodeAtLocation(tree, ['string', 'variableType', 'type']);
      expect(node, 'string.variableType.type').to.not.be.undefined;
      let position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(
        doc,
        position,
        '"ArrayType"',
        '"BooleanType"',
        '"ConnectorType"',
        '"DatasetAnyFieldType"',
        '"DatasetDateType"',
        '"DatasetDimensionType"',
        '"DatasetMeasureType"',
        '"DatasetType"',
        '"DateTimeType"',
        '"NumberType"',
        '"ObjectType"',
        '"SobjectFieldType"',
        '"SobjectType"',
        '"StringType"'
      );

      // find the start of the first "dataType" field in the 2nd variable
      node = findNodeAtLocation(tree, ['sobjectfield', 'variableType', 'dataType']);
      expect(node, 'sobjectfield.variableType.dataType').to.not.be.undefined;
      position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(
        doc,
        position,
        '"xsd:base64"',
        '"xsd:boolean"',
        '"xsd:byte"',
        '"xsd:date"',
        '"xsd:dateTime"',
        '"xsd:double"',
        '"xsd:int"',
        '"xsd:string"',
        '"xsd:time"'
      );

      // check for the unused fields in the sobjectfield var
      node = findNodeAtLocation(tree, ['sobjectfield']);
      expect(node, 'sobjectfield').to.not.be.undefined;
      // this should be right at the opening '{'
      position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
      // make sure it has the fields from the schema that aren't in the document
      await verifyCompletionsContain(
        doc,
        position,
        'defaultValue',
        'description',
        'excludes',
        'excludeSelected',
        'label',
        'required'
      );
    });

    it('json-schema defaultSnippets', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'variables.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // go to just before the { in "variableType" in the string var
      const node = findNodeAtLocation(tree, ['string', 'variableType']);
      expect(node, 'string.variableType').to.not.be.undefined;
      const scan = scanLinesUntil(doc, ch => ch === '{', doc.positionAt(node!.offset));
      if (scan.ch !== '{') {
        expect.fail("Expected to find '{' after '\"string.variableType\":'");
      }
      const position = scan.end.translate({ characterDelta: -1 });
      // that should give a snippet for a new variableType
      await verifyCompletionsContain(doc, position, 'New variableType');
    });

    it('on change of path value', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // and variables.json with some content that would have schema errors
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      const [variablesDoc, variablesEditor] = await openFile(variablesUri);
      await setDocumentText(
        variablesEditor,
        JSON.stringify(
          {
            error: 'intentionally unknown error field for test to look for'
          },
          undefined,
          2
        )
      );
      // but since it's not referenced by the template-info.json, it should have no errors
      await waitForDiagnostics(variablesDoc.uri, d => d && d.length === 0);

      // now, write "variableDefinition": "variables.json" to the template-info.json
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

      // the variables.json should eventually end up with a diagnostic about the bad field
      const diagnostics = await waitForDiagnostics(variablesDoc.uri, d => d && d.length === 1);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail(
          'Expect 1 diagnostic on ' +
            variablesDoc.uri.toString() +
            ' got\n:' +
            JSON.stringify(diagnostics, undefined, 2)
        );
      }
      // make sure we got the error about the invalid type
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Incorrect type/);

      // now, set variableDefinition to an empty value
      await setDocumentText(templateEditor, JSON.stringify({}, undefined, 2));
      // which should clear the warnings on variables.json since it's not a variables file anymore
      await waitForDiagnostics(variablesDoc.uri, d => d && d.length === 0);
    });

    it('without default json language services', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
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
      // that should give us a warning about variables.json not existing
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.some(d => d.code === 'variableDefinition')
      );
      // create a variables.json that has a comment and some bad json
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      const [, variablesEditor] = await openFile(variablesUri);
      await setDocumentText(
        variablesEditor,
        `{
           // a comment here, with missing double-quotes below
           varname: {}
         }`
      );
      // we should only get an error on the missing double quotes (and not on the json comment)
      const diagnostics = await waitForDiagnostics(variablesUri);
      if (diagnostics.length !== 1) {
        expect.fail('Expected one diagnostic on variables.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
      expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
    });
  }); // describe('configures variablesDefinition')

  describe('configures rulesDefinitions', () => {
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

    ['template-to-app-rules.json', 'app-to-template-rules.json'].forEach(filename => {
      it(`json-schema diagnostics on open (${filename})`, async () => {
        const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', filename);
        const [diagnostics] = await openFileAndWaitForDiagnostics(uri);
        expect(diagnostics, 'diagnostics').to.not.be.undefined;
        if (diagnostics.length !== 1) {
          expect.fail(
            'Expect 1 diagnostic on ' + uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
          );
        }
        // make sure we got the error about the invalid field name
        const diagnostic = diagnostics[0];
        expect(diagnostic, 'diagnostic').to.not.be.undefined;
        expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);
      });
    });

    it('json-schema code completions', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'template-to-app-rules.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // find the appliesTo.type in the first rule to see if the enum works
      let node = findNodeAtLocation(tree, ['rules', 0, 'appliesTo', 0, 'type']);
      expect(node, 'rules[0].appliesTo[0].type').to.not.be.undefined;
      let position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(doc, position, '"*"', '"dashboard"', '"lens"', '"schema"', '"workflow"', '"xmd"');

      // find the actions.action in the first rule to see if the enum works
      node = findNodeAtLocation(tree, ['rules', 0, 'actions', 0, 'action']);
      expect(node, 'rules[0].actions[0].action').to.not.be.undefined;
      position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(doc, position, '"add"', '"delete"', '"eval"', '"put"', '"replace"', '"set"');

      node = tree;
      // this should be at the opening '{'
      position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
      // make sure it has the fields from the schema that aren't in the document
      await verifyCompletionsContain(doc, position, 'macros');
    });

    it('json-schema defaultSnippets', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'template-to-app-rules.json');
      const [, doc] = await openFileAndWaitForDiagnostics(uri);
      const tree = parseTree(doc.getText());
      expect(tree, 'json text').to.not.be.undefined;
      // go to just before the [ in "rules"
      let node = findNodeAtLocation(tree, ['rules']);
      expect(node, 'rules').to.not.be.undefined;
      let scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"rules\":'");
      }
      let position = scan.end.translate({ characterDelta: -1 });
      // that should give a snippet to fill out the whole rules
      await verifyCompletionsContain(doc, position, 'New rule');

      // go to just after the [ in "actions"
      node = findNodeAtLocation(tree, ['rules', 0, 'actions']);
      expect(node, 'rules[0].actions').to.not.be.undefined;
      scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"actions\":'");
      }
      position = scan.end.translate({ characterDelta: 1 });
      // that should give a snippet for a new action
      await verifyCompletionsContain(doc, position, 'New action');

      // go right after the [ in "constants"
      node = findNodeAtLocation(tree, ['constants']);
      expect(node, 'constants').to.not.be.undefined;
      scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
      if (scan.ch !== '[') {
        expect.fail("Expected to find '[' after '\"constants\":'");
      }
      position = scan.end.translate({ characterDelta: 1 });
      // that should give a snippet for default
      await verifyCompletionsContain(doc, position, 'New constant');
    });

    it('on change of path value', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // and rules.json with some content that would have schema errors
      const rulesUri = tmpdir.with({ path: path.join(tmpdir.path, 'rules.json') });
      await writeEmptyJsonFile(rulesUri);
      const [rulesDoc, rulesEditor] = await openFile(rulesUri);
      await setDocumentText(
        rulesEditor,
        JSON.stringify(
          {
            error: 'intentionally unknown error field for test to look for',
            rules: [],
            constants: []
          },
          undefined,
          2
        )
      );
      // but since it's not referenced by the template-info.json, it should have no errors
      await waitForDiagnostics(rulesDoc.uri, d => d && d.length === 0);

      // now, write the reference to the rules.json in template-info.json
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            rules: [
              {
                type: 'templateToApp',
                file: 'rules.json'
              }
            ]
          },
          undefined,
          2
        )
      );

      // the rules.json should eventually end up with a diagnostic about the bad field
      const diagnostics = await waitForDiagnostics(rulesDoc.uri, d => d && d.length === 1);
      expect(diagnostics, 'diagnostics').to.not.be.undefined;
      if (diagnostics.length !== 1) {
        expect.fail(
          'Expect 1 diagnostic on ' + rulesDoc.uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
        );
      }
      // make sure we got the error about the invalid field name
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);

      // now, set uiDefinition to a filename that doesn't exist
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            rules: [
              {
                type: 'templateToApp',
                file: 'doesnotexist.json'
              }
            ]
          },
          undefined,
          2
        )
      );
      // which should clear the warnings on ui.json since it's not a folder file anymore
      await waitForDiagnostics(rulesDoc.uri, d => d && d.length === 0);
    });

    it('without default json language services', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      await setDocumentText(
        templateEditor,
        JSON.stringify(
          {
            rules: [
              {
                type: 'templateToApp',
                file: 'rules.json'
              }
            ]
          },
          undefined,
          2
        )
      );
      // that should give us a warning about rules.json not existing
      await waitForDiagnostics(
        templateUri,
        diagnostics => diagnostics && diagnostics.some(d => d.code === 'rules[0].file')
      );
      // create a rules.json that has a comment and some bad json
      const rulesUri = tmpdir.with({ path: path.join(tmpdir.path, 'rules.json') });
      await writeEmptyJsonFile(rulesUri);
      const [, rulesEditor] = await openFile(rulesUri);
      await setDocumentText(
        rulesEditor,
        `{
           // a comment here, with missing double-quotes below
           rules: []
         }`
      );
      // we should only get an error on the missing double quotes (and not on the json comment)
      const diagnostics = await waitForDiagnostics(rulesUri);
      if (diagnostics.length !== 1) {
        expect.fail('Expected one diagnostic on rules.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
      }
      expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
      expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
      expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
    });
  }); // describe('configures rulesDefinitions')

  // TODO: tests for the other template files, once they're implemented
});
