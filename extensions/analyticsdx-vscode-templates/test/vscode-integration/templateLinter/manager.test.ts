/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { uriStat } from '../../../src/util/vscodeUtils';
import { closeAllEditors, createTempTemplate, openFile, waitForDiagnostics, writeTextToFile } from '../vscodeTestUtils';

// if someone opens a related file (w/o opening template-info.json), TemplateLinter will possibly add diagnostics
// for template-info.json (or other related files); make sure those are removed appropriately, esp. when the
// template folder is deleted.
// Note: this is technically testing TemplateLinterManger (for diagnostics from the linter) and TemplateEditorManager
// (for diagnostics from the json-schemas), so if these start failing, see which diagnostics are left to figure out
// the right place to fix.
describe('TemplateLinterManager cleans up all diagnostics', () => {
  let tmpdir: vscode.Uri | undefined;
  let templateInfo: vscode.Uri | undefined;
  let uiJson: vscode.Uri | undefined;

  beforeEach(async () => {
    await closeAllEditors();
    // create a template with errors in a related file and in template-info.json w/o opening any documents (yet)
    [tmpdir] = await createTempTemplate(false);
    uiJson = vscode.Uri.joinPath(tmpdir, 'ui.json');
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
    templateInfo = vscode.Uri.joinPath(tmpdir, 'template-info.json');
    await writeTextToFile(templateInfo, {
      // this should give diagnostics from both the json schema and the linter
      templateType: 'app',
      uiDefinition: 'ui.json'
    });
  });

  afterEach(async () => {
    await closeAllEditors();
    // delete the temp folder
    if (tmpdir && (await uriStat(tmpdir))) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
    tmpdir = undefined;
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
