/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { TEMPLATE_JSON_LANG_ID } from '../../../src/constants';
import { uriStat } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  getTemplateEditorManager,
  openFile,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  uriFromTestRoot,
  waitForDiagnostics,
  waitForTemplateEditorManagerHas,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from '../vscodeTestUtils';

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
      // open the template-info.json in the create tmp folder
      const file = vscode.Uri.joinPath(tmpdir!, 'template-info.json');
      await openTemplateInfoAndWaitForDiagnostics(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), tmpdir!, true);
    });

    it('related file opened', async () => {
      // create an empty folder.json in the template directory
      const file = vscode.Uri.joinPath(tmpdir!, 'folder.json');
      await writeEmptyJsonFile(file);
      // open that file
      await openFile(file);
      // make sure the template dir gets setup for editing
      await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), tmpdir!, true);
    });
  });

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
      const file = vscode.Uri.joinPath(tmpdir, 'template-info.json');
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
      const file = vscode.Uri.joinPath(tmpdir, 'template-info.json');
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
      const templateDir = vscode.Uri.joinPath(tmpdir, 'subdir');
      const templateEditingManager = await getTemplateEditorManager();

      // open the template-info.json
      const file = vscode.Uri.joinPath(templateDir, 'template-info.json');
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
      'datasets/conversion.json',
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
  }); // describe('configures adx-template-json base schema')
});
