/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { jsonpathFrom, scanLinesUntil, uriRelPath, uriStat } from '../../../src/util/vscodeUtils';
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
describe('TemplateEditorManager configures rulesDefinitions', () => {
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
        expect.fail('Expect 1 diagnostic on ' + uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2));
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
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and rules.json with some content that would have schema errors
    const rulesUri = uriRelPath(tmpdir, 'rules.json');
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
    await waitForDiagnostics(rulesDoc.uri, d => d?.length === 0);

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
    const diagnostics = await waitForDiagnostics(rulesDoc.uri, d => d?.length === 1);
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
    await waitForDiagnostics(rulesDoc.uri, d => d?.length === 0);
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
    await waitForDiagnostics(templateUri, diagnostics => diagnostics?.some(d => jsonpathFrom(d) === 'rules[0].file'));
    // create a rules.json that has a comment and some bad json
    const rulesUri = uriRelPath(tmpdir, 'rules.json');
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
});
