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
import { TEMPLATE_INFO } from '../../src/constants';
import { TemplateEditingManager } from '../../src/templateEditing';
import { scanLinesUntil, uriStat } from '../../src/util/vscodeUtils';
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
      return await waitFor(() => templateEditingManager.has(dir), has => has === expected, 500, 15000);
    } catch (e) {
      if (e && e.name === 'timeout') {
        expect.fail(`Timeout waiting for TemplateEditingManager.has(${dir})===${expected}`);
      }
      throw e;
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
  });

  describe('stops on delete', () => {
    let tmpdir: vscode.Uri | undefined;
    beforeEach(async () => {
      await closeAllEditors();
      // create a temp template folder with an empty template-info.json
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
  });

  describe('configures template-info.json', () => {
    beforeEach(closeAllEditors);
    afterEach(closeAllEditors);

    it('related file schemas', async () => {
      const [, doc] = await openTemplateInfoAndWaitForDiagnostics('allRelpaths');
      const templateDir = doc.uri.with({ path: path.dirname(doc.uri.path) });
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
  });

  describe('configures folderDefinition', () => {
    let tmpdir: vscode.Uri | undefined;
    beforeEach(async () => {
      await closeAllEditors();
      // create a temp template folder with an empty template-info.json
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

    async function verifyCompletionsContain(
      document: vscode.TextDocument,
      position: vscode.Position,
      ...expectedLabels: string[]
    ) {
      const list = await getCompletionItems(document.uri, position);
      const labels = list.items.map(item => item.label);
      expect(labels, 'completion items').to.include.members(expectedLabels);
    }

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

      // go right to the [ in "shares"
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
  });

  // TODO: tests for the other template files, once they're implemented
});
