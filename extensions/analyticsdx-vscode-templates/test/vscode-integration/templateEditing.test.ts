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
import { ERRORS, TEMPLATE_INFO, TEMPLATE_JSON_LANG_ID } from '../../src/constants';
import { jsonPathToString } from '../../src/util/jsoncUtils';
import { jsonpathFrom, scanLinesUntil, uriDirname, uriRelPath, uriStat } from '../../src/util/vscodeUtils';
import { waitFor } from '../testutils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles,
  createTempTemplate,
  findPositionByJsonPath,
  getCodeActions,
  getCompletionItems,
  getDefinitionLocations,
  getHovers,
  getTemplateEditorManager,
  openFile,
  openFileAndWaitForDiagnostics,
  openTemplateInfo,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  uriFromTestRoot,
  verifyCompletionsContain,
  waitForDiagnostics,
  waitForTemplateEditorManagerHas,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from './vscodeTestUtils';

function sortDiagnostics(d1: vscode.Diagnostic, d2: vscode.Diagnostic) {
  return d1.range.start.line - d2.range.start.line;
}

// tslint:disable:no-unused-expression
describe('TemplateEditorManager', () => {
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
      [tmpdir] = await createTempTemplate(false, { show: false }, 'subdir');
      const templateDir = tmpdir.with({ path: path.join(tmpdir.path, 'subdir') });
      const templateEditingManager = await getTemplateEditorManager();

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

    it('quick fix to remove deprecated icon fields', async () => {
      const [t, doc, editor] = await createTempTemplate(true);
      tmpdir = t;
      await setDocumentText(editor!, {
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
        await waitForDiagnostics(
          doc!.uri,
          d => d && d.filter(assetIconFilter).length === 1,
          'initial warnings on assetIcon'
        )
      )
        .filter(assetIconFilter)
        .sort(sortDiagnostics);
      // look for the 'Remove assetIcon' quick fix on the first diagnostic
      expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('assetIcon');
      let allActions = await getCodeActions(doc!.uri, diagnostics[0].range);
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
        doc!.uri,
        d => d && d.filter(assetIconFilter).length === 0,
        'no warnings on assetIcon after quick fix'
      );

      // wait for the warning on templateIcon
      const templateIconFilter = (d: vscode.Diagnostic) =>
        d.code === ERRORS.TMPL_TEMPLATEICON_AND_TEMPLATEBADGE && jsonpathFrom(d) === 'templateIcon';
      diagnostics = (
        await waitForDiagnostics(
          doc!.uri,
          d => d && d.filter(templateIconFilter).length === 1,
          'initial warnings on templateIcon'
        )
      )
        .filter(templateIconFilter)
        .sort(sortDiagnostics);
      // look for the 'Remove templateIcon' quick fix on the first diagnostic
      expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('templateIcon');
      allActions = await getCodeActions(doc!.uri, diagnostics[0].range);
      actions = allActions.filter(a => a.title.startsWith('Remove templateIcon'));
      if (actions.length !== 1) {
        expect.fail(
          'Expected 1 remove action for templateIcon, got: [' + allActions.map(a => a.title).join(', ') + ']'
        );
      }
      expect(actions[0].edit, 'templateIcon quick fix.edit').to.not.be.undefined;
      // run the Remove templateIcon quick fix
      if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
        expect.fail(`Quick fix '${actions[0].title}' failed`);
      }
      // that should fix the templateIcon warning
      await waitForDiagnostics(
        doc!.uri,
        d => d && d.filter(templateIconFilter).length === 0,
        'no warnings on templateIcon after quick fix'
      );

      // make sure assetIcon and templateIcon got removed
      const tree = parseTree(doc!.getText());
      if (findNodeAtLocation(tree, ['assetIcon'])) {
        expect.fail('"assetIcon" was not removed from the file');
      }
      if (findNodeAtLocation(tree, ['templateIcon'])) {
        expect.fail('"templateIcon" was not removed from the file');
      }
    });

    it('quick fix for missing relative path files', async () => {
      const [t, doc, editor] = await createTempTemplate(true);
      tmpdir = t;
      await setDocumentText(editor!, {
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
          doc!.uri,
          d => d && d.filter(folderFilter).length === 1,
          'initial warning on folderDefinition'
        )
      ).filter(folderFilter);
      // look for the quick fix
      let actions = await getCodeActions(doc!.uri, diagnostic.range);
      if (actions.length !== 1) {
        expect.fail(
          'Expected 1 code actions for folderDefinition, got: [' + actions.map(a => a.title).join(', ') + ']'
        );
      }
      expect(actions[0].title, 'quick fix title').to.equals('Create dir/folder.json');
      expect(actions[0].edit, 'quick fix.edit').to.not.be.undefined;
      // run the quick fix
      if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
        expect.fail(`Quick fix '${actions[0].title}' failed`);
      }
      // that should fix the warning
      await waitForDiagnostics(
        doc!.uri,
        d => d && d.filter(folderFilter).length === 0,
        'no warnings on folderDefintion after quick fix'
      );
      // make sure the file got created
      const uri = uriRelPath(tmpdir, 'dir/folder.json');
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
        await waitForDiagnostics(
          doc!.uri,
          d => d && d.filter(imageFilter).length === 1,
          'initial warning on imageFiles[0]'
        )
      ).filter(imageFilter);
      // for paths pointing to files, there shouldn't be a quick fix
      actions = await getCodeActions(doc!.uri, diagnostic.range);
      if (actions.length !== 0) {
        expect.fail('Expected 0 code actions for imageFile, got: [' + actions.map(a => a.title).join(', ') + ']');
      }
    });

    // TODO: tests for definitionProvider, actionProvider, etc.
  }); // describe('configures template-info.json')

  describe('configures adx-template-json base schema', () => {
    beforeEach(closeAllEditors);
    afterEach(closeAllEditors);

    [
      'dashboards/dashboard.json',
      'externalFiles/schema.json',
      'externalFiles/userXmd.json',
      'lenses/lens.json',
      'dataflows/dataflow.json',
      'queries/query.json',
      'datasets/userXmd.json',
      'stories/story.json'
    ].forEach(relpath => {
      it(`on ${relpath}`, async () => {
        const [doc, editor] = await openFile(uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', relpath));
        // this should wait for the languageId to change
        expect(doc.languageId, 'languageId').to.equal(TEMPLATE_JSON_LANG_ID);
        // put in some json with comments (which adx-template-json-base-schema.json enables) and an intentional syntax
        // error (to make sure the language server ran against this file)
        await setDocumentText(
          editor,
          '{\n  /* multi-line comment */\n  error: "intentional syntax error"\n  // comment\n}'
        );
        // errors about comments will be code 521 (which we shouldn't see)
        const filter = (d: vscode.Diagnostic) => d.source === TEMPLATE_JSON_LANG_ID || d.code === 521;
        const diagnostics = (await waitForDiagnostics(doc.uri, d => d?.some(filter))).filter(filter);
        if (diagnostics.length !== 1) {
          expect.fail('Expected 1 error, got: ' + JSON.stringify(diagnostics, undefined, 2));
        }
        expect(diagnostics[0].message, 'error message').to.equal('Property keys must be doublequoted');
      });
    });
  });

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
        diagnostics => diagnostics && diagnostics.some(d => jsonpathFrom(d) === 'folderDefinition')
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

    // FIXME: this started failing on the mac test run in Github Actions -- the editor.action.formatDocument command
    // only works if the vscode window has focus so something must be taking the focus away.
    // I'm skipping it for now, we can come back around a figure out a different way to trigger formatting
    it.skip('formatting', async () => {
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
      await waitFor(
        () => folderEditor.document.languageId,
        id => id === TEMPLATE_JSON_LANG_ID,
        {
          timeoutMessage: 'Timeout waiting for lanaugeId'
        }
      );
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
      ).replace(/\r\n/g, '\n');
      expect(folderEditor.document.getText().replace(/\r\n/g, '\n'), 'folder.json text').to.equal(expectedJson);
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
        diagnostics => diagnostics && diagnostics.some(d => jsonpathFrom(d) === 'uiDefinition')
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

    it('hover text on variable names', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'ui.json');
      const [doc] = await openFile(uri, true);
      await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);
      const tree = parseTree(doc.getText());
      const node = findNodeAtLocation(tree, ['pages', 0, 'variables', 3, 'name'])?.parent;
      expect(node, 'pages[0].variables[3].name propNode').to.be.not.undefined;
      const nameNode = node!.children?.[0];
      expect(nameNode, 'nameNode').to.not.be.undefined;
      let hovers = await getHovers(uri, doc.positionAt(nameNode!.offset));
      expect(hovers, 'nameNode hovers').to.not.be.undefined;
      // on the name field, it should just return the hover from the schema
      expect(hovers.length, 'nameNode hovers.length').to.equal(1);

      const valueNode = node!.children?.[1];
      expect(valueNode, 'valueNode').to.not.be.undefined;
      hovers = await getHovers(uri, doc.positionAt(valueNode!.offset));
      expect(hovers, 'valueNode hovers').to.not.be.undefined;
      // on the value field, it should have the schema hover and the hover from our provider
      expect(hovers.length, 'valueNode hovers.length').to.equal(2);
      if (!hovers.some(h => h.contents.some(c => typeof c === 'object' && c.value.indexOf('StringTypeVar') >= 0))) {
        expect.fail("Expected at least one hover to contain 'StringTypeVar'");
      }
    });

    it('go to definition support for variable names', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'ui.json');
      const [doc] = await openFile(uri, true);
      // we should see the 3 warnings about the bad var types
      await waitForDiagnostics(uri, d => d && d.length >= 3);
      await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

      const position = findPositionByJsonPath(doc, ['pages', 0, 'variables', 0, 'name']);
      expect(position, 'pages[0].variables[0].name').to.not.be.undefined;

      const locations = await getDefinitionLocations(uri, position!.translate(undefined, 1));
      if (locations.length !== 1) {
        expect.fail('Expected 1 location, got:\n' + JSON.stringify(locations, undefined, 2));
      }
      expect(locations[0].uri.path, 'location path').to.equal(uriRelPath(uriDirname(uri), 'variables.json').path);
    });

    it('code completions for variable names', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'ui.json');
      const [doc] = await openFile(uri, true);
      // we should see the 3 warnings about the bad var types
      await waitForDiagnostics(uri, d => d && d.length >= 3);
      await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

      const position = findPositionByJsonPath(doc, ['pages', 0, 'variables', 0, 'name']);
      expect(position, 'pages[0].variables[0].name').to.not.be.undefined;
      const completions = (
        await verifyCompletionsContain(
          doc,
          position!,
          '"DatasetAnyFieldTypeVar"',
          '"DateTimeTypeVar"',
          '"ObjectTypeVar"',
          '"StringArrayVar"',
          '"StringTypeVar"'
        )
      ).sort((i1, i2) => i1.label.localeCompare(i2.label));
      if (completions.length !== 5) {
        expect.fail('Expected 5 completions, got: ' + completions.map(i => i.label).join(', '));
      }
      // check some more stuff on the completion items
      [
        {
          detail: '(DatasetAnyFieldType) A dataset any field variable',
          docs: "This can't be put in a non-vfpage page"
        },
        {
          detail: '(DateTimeType) A datetime variable',
          docs: "This can't be put in a non-vfpage page"
        },
        {
          detail: '(ObjectType) An object variable',
          docs: "This can't be put in a non-vfpage page"
        },
        {
          detail: '(StringType[])',
          docs: undefined
        },
        {
          detail: '(StringType) A string variable',
          docs: 'String variable description'
        }
      ].forEach(({ detail, docs }, i) => {
        const item = completions[i];
        expect(item.kind, `${item.label} kind`).to.equal(vscode.CompletionItemKind.Variable);
        expect(item.detail, `${item.label} details`).to.equal(detail);
        expect(item.documentation, `${item.label} documentation`).to.equal(docs);
      });
    });

    it('quick fixes on bad variable names', async () => {
      const uiJson = {
        pages: [
          {
            title: 'Test Title',
            variables: [{ name: 'varname' }, { name: 'foo' }]
          }
        ]
      };
      const [t, [uiEditor, variablesEditor]] = await createTemplateWithRelatedFiles(
        {
          field: 'uiDefinition',
          path: 'ui.json',
          initialJson: uiJson
        },
        {
          field: 'variableDefinition',
          path: 'variables.json',
          initialJson: {
            varname1: {
              variableType: {
                type: 'StringType'
              }
            }
          }
        }
      );
      tmpdir = t;

      // get the 2 expected diagnostics on the variables in ui.json
      const diagnosticFilter = (d: vscode.Diagnostic) => d.code === ERRORS.UI_PAGE_UNKNOWN_VARIABLE;
      let diagnostics = (
        await waitForDiagnostics(
          uiEditor.document.uri,
          ds => ds && ds.filter(diagnosticFilter).length === 2,
          'Initial 2 invalid variable warnings on ui.json'
        )
      )
        .filter(diagnosticFilter)
        .sort(sortDiagnostics);
      // and there shouldn't be any warnings on variables.json
      await waitForDiagnostics(variablesEditor.document.uri, d => d && d.length === 0);

      expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('pages[0].variables[0].name');
      expect(jsonpathFrom(diagnostics[1]), 'diagnostics[1].jsonpath').to.equal('pages[0].variables[1].name');

      // the 1st diagnostic should be for 'varname', which should have just the 2 quickfixes
      let actions = await getCodeActions(uiEditor.document.uri, diagnostics[0].range);
      if (actions.length !== 2) {
        expect.fail('Expected 2 code actions, got: [' + actions.map(a => a.title).join(', ') + ']');
      }
      expect(actions[0].title, 'varname action[0].title').to.equals("Create variable 'varname'");
      expect(actions[0].edit, 'varname action[0].edit').to.not.be.undefined;
      expect(actions[1].title, 'varname action[1].title').to.equals("Switch to 'varname1'");
      expect(actions[1].edit, 'varname action[1].edit').to.not.be.undefined;
      // run the Switch to... quick action
      if (!(await vscode.workspace.applyEdit(actions[1].edit!))) {
        expect.fail(`Quick fix '${actions[1].title}' failed`);
      }

      // that should fix that diagnostic, leaving the one on 'foo'
      diagnostics = (
        await waitForDiagnostics(
          uiEditor.document.uri,
          ds => ds && ds.filter(diagnosticFilter).length === 1,
          '1 invalid variable warning on ui.json after first quick fix'
        )
      )
        .filter(diagnosticFilter)
        .sort(sortDiagnostics);
      expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('pages[0].variables[1].name');
      // and there should just be the Create variable quick fix for 'foo'
      actions = await getCodeActions(uiEditor.document.uri, diagnostics[0].range);
      if (actions.length !== 1) {
        expect.fail('Expected 1 code actions, got: [' + actions.map(a => a.title).join(', ') + ']');
      }
      expect(actions[0].title, 'varname action[0].title').to.equals("Create variable 'foo'");
      expect(actions[0].edit, 'varname action[0].edit').to.not.be.undefined;
      // run that Create variable... quick fix
      if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
        expect.fail(`Quick fix '${actions[0].title}' failed`);
      }
      // which should fix the warning on ui.json
      await waitForDiagnostics(uiEditor.document.uri, ds => ds && ds.filter(diagnosticFilter).length === 0);
      // and variables.json should be good, too
      await waitForDiagnostics(variablesEditor.document.uri, d => d && d.length === 0);
      // make sure the 'foo' variable go into variables.json
      const variables = parseTree(variablesEditor.document.getText());
      const fooNode = findNodeAtLocation(variables, ['foo']);
      expect(fooNode, 'foo in variables.json').to.not.be.undefined;
      // and that it's a {} object
      expect(fooNode!.type, 'foo in variables.json type').to.equal('object');
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
        diagnostics => diagnostics && diagnostics.some(d => jsonpathFrom(d) === 'variableDefinition')
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

    it('hover text on variable names', async () => {
      const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'variables.json');
      const [doc] = await openFile(uri, true);
      await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);
      const tree = parseTree(doc.getText());
      const node = findNodeAtLocation(tree, ['ObjectTypeVar'])?.parent;
      expect(node, 'ObjectTypeVar propNode').to.be.not.undefined;
      const nameNode = node!.children?.[0];
      expect(nameNode, 'nameNode').to.not.be.undefined;
      let hovers = await getHovers(uri, doc.positionAt(nameNode!.offset));
      expect(hovers, 'nameNode hovers').to.not.be.undefined;
      // on the name field, it should have the schema hover and the hover from our provider
      expect(hovers.length, 'valueNode hovers.length').to.equal(2);
      if (!hovers.some(h => h.contents.some(c => typeof c === 'object' && c.value.indexOf('ObjectTypeVar') >= 0))) {
        expect.fail("Expected at least one hover to contain 'ObjectTypeVar'");
      }

      const valueNode = findNodeAtLocation(tree, ['ObjectTypeVar', 'label']);
      expect(valueNode, 'ObjectTypeVar.label').to.not.be.undefined;
      hovers = await getHovers(uri, doc.positionAt(valueNode!.offset));
      expect(hovers, 'ObjectTypeVar.label hovers').to.not.be.undefined;
      // on other fields, it should just have the hover from the schema descrption
      expect(hovers.length, 'ObjectTypeVar.label hovers.length').to.equal(1);
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
      await verifyCompletionsContain(
        doc,
        position,
        '"*"',
        '"dashboard"',
        '"discoveryStories"',
        '"folder"',
        '"lens"',
        '"schema"',
        '"workflow"',
        '"xmd"'
      );

      // find the actions.action in the first rule to see if the enum works
      node = findNodeAtLocation(tree, ['rules', 0, 'actions', 0, 'action']);
      expect(node, 'rules[0].actions[0].action').to.not.be.undefined;
      position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(doc, position, '"add"', '"delete"', '"eval"', '"put"', '"replace"', '"set"');

      // find the returns in the first macro definition, and make sure the examples and snippet works
      node = findNodeAtLocation(tree, ['macros', 0, 'definitions', 0, 'returns']);
      expect(node, 'macros[0].definitions[0].returns').to.not.be.undefined;
      position = doc.positionAt(node!.offset);
      await verifyCompletionsContain(doc, position, '""', 'true', 'false', 'null', '[]', '{}');
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
        diagnostics => diagnostics && diagnostics.some(d => jsonpathFrom(d) === 'rules[0].file')
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
