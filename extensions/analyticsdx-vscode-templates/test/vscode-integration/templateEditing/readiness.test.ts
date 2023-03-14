/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { matchJsonNodeAtPattern } from '../../../src/util/jsoncUtils';
import { jsonpathFrom, uriDirname, uriStat } from '../../../src/util/vscodeUtils';
import { waitFor } from '../../testutils';
import {
  closeAllEditors,
  createTempTemplate,
  getDefinitionLocations,
  getHovers,
  getTemplateEditorManager,
  openFile,
  openFileAndWaitForDiagnostics,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  uriFromTestRoot,
  waitForDiagnostics,
  waitForTemplateEditorManagerHas,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateEditorManager configures readinessDefinitions', () => {
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
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'readiness.json');
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

  it('on change of path value', async () => {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = vscode.Uri.joinPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and readiness.json with some content that would have schema errors
    const readinessUri = vscode.Uri.joinPath(tmpdir, 'readiness.json');
    await writeEmptyJsonFile(readinessUri);
    const [readinessDoc, readinessEditor] = await openFile(readinessUri);
    await setDocumentText(
      readinessEditor,
      JSON.stringify(
        {
          error: 'intentionally unknown error field for test to look for',
          values: {},
          templateRequirements: [],
          definition: {}
        },
        undefined,
        2
      )
    );
    // but since it's not reference by the template-info.json, it should have no errors
    await waitForDiagnostics(readinessDoc.uri, d => d?.length === 0);

    // now, write "readinessDefinition": "readiness.json" to the template-info.json
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          readinessDefinition: 'readiness.json'
        },
        undefined,
        2
      )
    );

    // the readiness.json should eventually end up with a diagnostic about the bad field
    const diagnostics = await waitForDiagnostics(readinessDoc.uri, d => d?.length === 1);
    expect(diagnostics, 'diagnostics').to.not.be.undefined;
    if (diagnostics.length !== 1) {
      expect.fail(
        'Expect 1 diagnostic on ' + readinessDoc.uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
      );
    }
    // make sure we got the error about the invalid field name
    const diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);

    // now, set readinessDefinition to a filename that doesn't exist
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          readinessDefinition: 'doesnotexist.json'
        },
        undefined,
        2
      )
    );
    // which should clear the warnings on readiness.json since it's not a folder file anymore
    await waitForDiagnostics(readinessDoc.uri, d => d?.length === 0);
  });

  it('without default json language services', async () => {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = vscode.Uri.joinPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          readinessDefinition: 'readiness.json'
        },
        undefined,
        2
      )
    );
    // that should give us a warning about readiness.json not existing
    await waitForDiagnostics(templateUri, diagnostics =>
      diagnostics?.some(d => jsonpathFrom(d) === 'readinessDefinition')
    );
    // create a readiness.json that has a comment and some bad json
    const readinessUri = vscode.Uri.joinPath(tmpdir, 'readiness.json');
    await writeEmptyJsonFile(readinessUri);
    const [, readinessEditor] = await openFile(readinessUri);
    await setDocumentText(
      readinessEditor,
      `{
         // a comment here, with missing double-quotes below
         values: {},
         "templateRequirements": [],
         "definition": {}
       }`
    );
    // we should only get an error on the missing double quotes (and not on the json comment)
    const diagnostics = await waitForDiagnostics(
      readinessUri,
      d => d?.length === 1,
      'Waiting for diagnostic on values'
    );
    if (diagnostics.length !== 1) {
      expect.fail('Expected one diagnostic on readiness.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
    expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
    expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
  });

  it('hover text on variable names', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'readiness.json');
    const [doc] = await openFile(uri, true);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);
    const tree = parseTree(doc.getText());
    const node = tree && findNodeAtLocation(tree, ['values', 'StringTypeVar'])?.parent;
    expect(node, 'values.StringTypeVar propNode').to.be.not.undefined;
    const nameNode = node!.children?.[0];
    expect(nameNode, 'nameNode').to.not.be.undefined;
    // sometimes we get an initial 1 empty hover, then the hover comes after a little bit
    await waitFor(
      () => getHovers(uri, doc.positionAt(nameNode!.offset)),
      hovers => hovers.some(h => h.contents.some(c => typeof c === 'object' && c.value.indexOf('StringTypeVar') >= 0)),
      {
        timeoutMessage: hovers =>
          "Expected a hover to contain 'StringTypeVar', got: " + JSON.stringify(hovers, undefined, 2)
      }
    );
  });

  it('go to definition support for variable names', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'readiness.json');
    const [doc] = await openFile(uri, true);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

    // should find a definition location for StringTypeVar
    const root = parseTree(doc.getText());
    let propNode = matchJsonNodeAtPattern(root, ['values', 'StringTypeVar'])?.parent?.children?.[0];
    expect(propNode, 'StringVar property node').to.not.be.undefined;
    let position = doc.positionAt(propNode!.offset);
    let locations = await getDefinitionLocations(uri, position!.translate(undefined, 1));
    if (locations.length !== 1) {
      expect.fail('Expected 1 location for StringTypeVar, got:\n' + JSON.stringify(locations, undefined, 2));
    }
    expect(locations[0].uri.fsPath, 'location path').to.equal(
      vscode.Uri.joinPath(uriDirname(uri), 'variables.json').fsPath
    );

    // should not find a definition location for UnknownVar
    propNode = matchJsonNodeAtPattern(root, ['values', 'UnknownVar'])?.parent?.children?.[0];
    position = doc.positionAt(propNode!.offset);
    expect(propNode, 'StringVar property node').to.not.be.undefined;
    expect(position, 'values.UnknownVar').to.not.be.undefined;
    locations = await getDefinitionLocations(uri, position!.translate(undefined, 1));
    if (locations.length !== 0) {
      expect.fail('Expected 0 locations for UnknownVar, got:\n' + JSON.stringify(locations, undefined, 2));
    }
  });
});
