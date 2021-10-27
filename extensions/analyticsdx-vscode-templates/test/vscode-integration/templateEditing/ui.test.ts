/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { jsonpathFrom, scanLinesUntil, uriDirname, uriRelPath, uriStat } from '../../../src/util/vscodeUtils';
import { waitFor } from '../../testutils';
import {
  closeAllEditors,
  compareCompletionItems,
  createTemplateWithRelatedFiles,
  createTempTemplate,
  findPositionByJsonPath,
  getCodeActions,
  getDefinitionLocations,
  getHovers,
  getTemplateEditorManager,
  openFile,
  openFileAndWaitForDiagnostics,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  sortDiagnostics,
  uriFromTestRoot,
  verifyCompletionsContain,
  waitForDiagnostics,
  waitForTemplateEditorManagerHas,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateEditorManager configures uiDefinition', () => {
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
    let node = findNodeAtLocation(tree!, ['pages', 0, 'variables', 0, 'visibility']);
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
    node = findNodeAtLocation(tree!, ['pages', 0]);
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
    let node = findNodeAtLocation(tree!, ['pages']);
    expect(node, 'pages').to.not.be.undefined;
    let scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"pages\":'");
    }
    let position = scan.end.translate({ characterDelta: -1 });
    // that should give a snippet to fill out the whole pages
    await verifyCompletionsContain(doc, position, 'New pages');

    // go to just after the [ in "variables"
    node = findNodeAtLocation(tree!, ['pages', 0, 'variables']);
    expect(node, 'pages[0].variables').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"variables\":'");
    }
    position = scan.end.translate({ characterDelta: 1 });
    // that should give a snippet for a new variable
    await verifyCompletionsContain(doc, position, 'New variable');

    // go right after the [ in "displayMessages"
    node = findNodeAtLocation(tree!, ['displayMessages']);
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
    const templateUri = uriRelPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and ui.json with some content that would have schema errors
    const uiUri = uriRelPath(tmpdir, 'ui.json');
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
    await waitForDiagnostics(uiDoc.uri, d => d?.length === 0);

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
    const diagnostics = await waitForDiagnostics(uiDoc.uri, d => d?.length === 1);
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
    await waitForDiagnostics(uiDoc.uri, d => d?.length === 0);
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
          uiDefinition: 'ui.json'
        },
        undefined,
        2
      )
    );
    // that should give us a warning about ui.json not existing
    await waitForDiagnostics(templateUri, diagnostics => diagnostics?.some(d => jsonpathFrom(d) === 'uiDefinition'));
    // create a ui.json that has a comment and some bad json
    const uiUri = uriRelPath(tmpdir, 'ui.json');
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
    const node = tree && findNodeAtLocation(tree, ['pages', 0, 'variables', 3, 'name'])?.parent;
    expect(node, 'pages[0].variables[3].name propNode').to.be.not.undefined;
    const nameNode = node!.children?.[0];
    expect(nameNode, 'nameNode').to.not.be.undefined;
    let hovers = await getHovers(uri, doc.positionAt(nameNode!.offset));
    expect(hovers, 'nameNode hovers').to.not.be.undefined;
    // on the name field, it should just return the hover from the schema
    expect(hovers.length, 'nameNode hovers.length').to.equal(1);

    const valueNode = node!.children?.[1];
    expect(valueNode, 'valueNode').to.not.be.undefined;
    hovers = await waitFor(
      () => getHovers(uri, doc.positionAt(valueNode!.offset)),
      hovers => hovers.length >= 2,
      {
        timeoutMessage: hovers =>
          'Timed out waiting for both hovers on valueNode, got hovers:' + JSON.stringify(hovers, undefined, 2)
      }
    );
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
    ).sort(compareCompletionItems);
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

    // the 1st diagnostic should be for 'varname', which should have just the 2 quickfixes.
    // Note: they seem to no longer be guarenteed to come in original insert order so sort them by title
    let actions = (await getCodeActions(uiEditor.document.uri, diagnostics[0].range)).sort((a1, a2) =>
      a1.title.localeCompare(a2.title)
    );
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
    const fooNode = variables && findNodeAtLocation(variables, ['foo']);
    expect(fooNode, 'foo in variables.json').to.not.be.undefined;
    // and that it's a {} object
    expect(fooNode!.type, 'foo in variables.json type').to.equal('object');
  });
});
