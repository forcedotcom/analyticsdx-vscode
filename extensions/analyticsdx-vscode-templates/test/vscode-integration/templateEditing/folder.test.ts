/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TEMPLATE_JSON_LANG_ID } from '../../../src/constants';
import { jsonpathFrom, scanLinesUntil, uriRelPath, uriStat } from '../../../src/util/vscodeUtils';
import { waitFor } from '../../testutils';
import {
  closeAllEditors,
  createTempTemplate,
  openFile,
  openFileAndWaitForDiagnostics,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  uriFromTestRoot,
  verifyCompletionsContain,
  waitForDiagnostics,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateEditorManager configures folderDefinition', () => {
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
    // that should give an option for null and  a snippet to fill out the whole featuresAssets
    await verifyCompletionsContain(doc, position, 'New featuredAssets', 'null');

    // go before after the [ in "shares"
    node = findNodeAtLocation(tree, ['shares']);
    expect(node, 'shares').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"shares\":'");
    }
    position = scan.end.translate({ characterDelta: -1 });
    // that should give an option for null and a snippet for a new share
    await verifyCompletionsContain(doc, position, 'New share', 'null');

    // go right after the [ in "shares"
    node = findNodeAtLocation(tree, ['shares']);
    expect(node, 'shares').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"shares\":'");
    }
    position = scan.end.translate({ characterDelta: 1 });
    // that should give a snippet for a new share
    await verifyCompletionsContain(doc, position, 'New share');
    // REVIEWME: we could test for 'New featuresAsset' and 'New shares', but this is enough to make sure the
    // json schema association is there
  });

  it('on change of path value', async () => {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and folder.json with some content that would have schema errors
    const folderUri = uriRelPath(tmpdir, 'folder.json');
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
    await waitForDiagnostics(folderDoc.uri, d => d?.length === 0);

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
    const diagnostics = await waitForDiagnostics(folderDoc.uri, d => d?.length === 1);
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
    await waitForDiagnostics(folderDoc.uri, d => d?.length === 0);
  });

  it('without default json language services', async () => {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
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
    await waitForDiagnostics(templateUri, diagnostics =>
      diagnostics?.some(d => jsonpathFrom(d) === 'folderDefinition')
    );
    // create a folder.json that has a comment and some bad json
    const folderUri = uriRelPath(tmpdir, 'folder.json');
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
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
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
    const folderUri = uriRelPath(tmpdir, 'folder.json');
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
});
