/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { jsonPathToString } from '@salesforce/analyticsdx-template-lint';
import { expect } from 'chai';
import { findNodeAtLocation, JSONPath, Node as JsonNode, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { jsonpathFrom, scanLinesUntil, uriDirname, uriStat } from '../../../src/util/vscodeUtils';
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
describe('TemplateEditorManager configures layoutDefinition', () => {
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
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'layout.json');
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
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'layout.json');
    const [, doc] = await openFileAndWaitForDiagnostics(uri);
    const tree = parseTree(doc.getText());
    expect(tree, 'json text').to.not.be.undefined;
    // find the visibility in the first page variable to see if the enum works
    let node = findNodeAtLocation(tree!, ['pages', 0, 'layout', 'center', 'items', 0, 'visibility']);
    expect(node, 'pages[0].layout.center.items[0]').to.not.be.undefined;
    let position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(
      doc,
      position,
      '"Disabled"',
      '"Hidden"',
      '"Visible"',
      '"{{Variables.booleanVariable}}"'
    );

    // find the start of the first page
    node = findNodeAtLocation(tree!, ['pages', 0]);
    expect(node, 'pages').to.not.be.undefined;
    // this should be right the opening '{'
    position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
    // make sure it has the fields from the schema that aren't in the document
    await verifyCompletionsContain(doc, position, 'condition', 'helpUrl', 'backgroundImage');

    // find the start of the first page layout
    node = findNodeAtLocation(tree!, ['pages', 0, 'layout']);
    expect(node, 'pages[0].layout').to.not.be.undefined;
    // this should be right the opening '{'
    position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
    // make sure it has the fields from the schema that aren't in the document
    await verifyCompletionsContain(doc, position, 'header');

    // find the start of the first page guidance panel
    node = findNodeAtLocation(tree!, ['pages', 0, 'guidancePanel']);
    expect(node, 'pages[0].guidancePanel').to.not.be.undefined;
    // this should be right the opening '{'
    position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
    // make sure it has the fields from the schema that aren't in the document
    await verifyCompletionsContain(doc, position, 'backgroundImage');

    // find the start of the second page
    node = findNodeAtLocation(tree!, ['pages', 1]);
    expect(node, 'pages').to.not.be.undefined;
    // this should be right the opening '{'
    position = doc.positionAt(node!.offset).translate({ characterDelta: 1 });
    // make sure it has the fields from the schema that aren't in the document
    await verifyCompletionsContain(doc, position, 'condition', 'helpUrl', 'backgroundImage', 'guidancePanel');
  });

  it('json-schema defaultSnippets', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'layout.json');
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
    // and go to just after the [ in "pages"
    position = scan.end.translate({ characterDelta: 1 });
    await verifyCompletionsContain(doc, position, 'New SingleColumn page', 'New TwoColumn page');

    // go to just before the { in "layout"
    node = findNodeAtLocation(tree!, ['pages', 0, 'layout']);
    expect(node, 'pages[0].layout').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '{', doc.positionAt(node!.offset));
    if (scan.ch !== '{') {
      expect.fail("Expected to find '{' after '\"layout\":'");
    }
    position = scan.end.translate({ characterDelta: -1 });
    await verifyCompletionsContain(doc, position, 'New SingleColumn layout', 'New TwoColumn layout');

    // go to just after the [ in "items"
    node = findNodeAtLocation(tree!, ['pages', 0, 'layout', 'center', 'items']);
    expect(node, 'pages[0].layout.center.items').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"items\":'");
    }
    position = scan.end.translate({ characterDelta: 1 });
    await verifyCompletionsContain(
      doc,
      position,
      'New Image item',
      'New Text item',
      'New Variable item',
      'New Groupbox item'
    );

    // go to just after the [ in items[3] (a GroupBox item type) "items"
    node = findNodeAtLocation(tree!, ['pages', 0, 'layout', 'center', 'items', 3, 'items']);
    expect(node, 'pages[0].layout.center.items[3].items').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"items[3].items\":'");
    }
    position = scan.end.translate({ characterDelta: 1 });
    await verifyCompletionsContain(doc, position, 'New Image item', 'New Text item', 'New Variable item');

    // go right after the [ in "displayMessages"
    node = findNodeAtLocation(tree!, ['displayMessages']);
    expect(node, 'displayMessages').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"displayMessages\":'");
    }
    position = scan.end.translate({ characterDelta: 1 });
    await verifyCompletionsContain(doc, position, 'New displayMessage');

    // go to just before the { in "guidancePanel"
    node = findNodeAtLocation(tree!, ['pages', 0, 'guidancePanel']);
    expect(node, 'pages[0].guidancePanel').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '{', doc.positionAt(node!.offset));
    if (scan.ch !== '{') {
      expect.fail("Expected to find '{' after '\"guidancePanel\":'");
    }
    position = scan.end.translate({ characterDelta: -1 });
    await verifyCompletionsContain(doc, position, 'New guidance panel');

    // go to just after the [ in "guidancePanel.items"
    node = findNodeAtLocation(tree!, ['pages', 0, 'guidancePanel', 'items']);
    expect(node, 'pages[0].guidancePanel.items').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"items\":'");
    }
    position = scan.end.translate({ characterDelta: 1 });
    await verifyCompletionsContain(doc, position, 'New Image item', 'New Text item', 'New LinkBox item');

    //  go to just before the { in "guidancePanel.backgroundImage" on page 3
    node = findNodeAtLocation(tree!, ['pages', 2, 'guidancePanel', 'backgroundImage']);
    expect(node, 'pages[0].guidancePanel.backgroundImage').to.not.be.undefined;
    scan = scanLinesUntil(doc, ch => ch === '{', doc.positionAt(node!.offset));
    if (scan.ch !== '{') {
      expect.fail("Expected to find '{' after '\"pages[2].guidancePanel.backgroundImage\":'");
    }
    position = scan.end.translate({ characterDelta: -1 });
    await verifyCompletionsContain(doc, position, 'New background image');
  });

  it('on change of path value', async () => {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = vscode.Uri.joinPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and layout.json with some content that would have schema errors
    const layoutUri = vscode.Uri.joinPath(tmpdir, 'layout.json');
    await writeEmptyJsonFile(layoutUri);
    const [layoutDoc, layoutEditor] = await openFile(layoutUri);
    await setDocumentText(
      layoutEditor,
      JSON.stringify(
        {
          error: 'intentionally unknown error field for test to look for'
        },
        undefined,
        2
      )
    );
    // but since it's not reference by the template-info.json, it should have no errors
    await waitForDiagnostics(layoutDoc.uri, d => d?.length === 0);

    // now, write "layoutDefinition": "layout.json" to the template-info.json
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          layoutDefinition: 'layout.json'
        },
        undefined,
        2
      )
    );

    // the layout.json should eventually end up with a diagnostic about the bad field
    const diagnostics = await waitForDiagnostics(layoutDoc.uri, d => d?.length === 1);
    expect(diagnostics, 'diagnostics').to.not.be.undefined;
    if (diagnostics.length !== 1) {
      expect.fail(
        'Expect 1 diagnostic on ' + layoutDoc.uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
      );
    }
    // make sure we got the error about the invalid field name
    const diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);

    // now, set layoutDefinition to a filename that doesn't exist
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          layoutDefinition: 'doesnotexist.json'
        },
        undefined,
        2
      )
    );
    // which should clear the warnings on layout.json since it's not a folder file anymore
    await waitForDiagnostics(layoutDoc.uri, d => d?.length === 0);
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
          layoutDefinition: 'layout.json'
        },
        undefined,
        2
      )
    );
    // that should give us a warning about layout.json not existing
    await waitForDiagnostics(templateUri, diagnostics =>
      diagnostics?.some(d => jsonpathFrom(d) === 'layoutDefinition' && d.code === ERRORS.TMPL_REL_PATH_NOT_EXIST)
    );
    // create a layout.json that has a comment and some bad json
    const layoutUri = vscode.Uri.joinPath(tmpdir, 'layout.json');
    await writeEmptyJsonFile(layoutUri);
    const [, layoutEditor] = await openFile(layoutUri);
    await setDocumentText(
      layoutEditor,
      `{
         // a comment here, with missing double-quotes below
         pages: []
       }`
    );
    // we should only get an error on the missing double quotes (and not on the json comment)
    const diagnostics = await waitForDiagnostics(layoutUri);
    if (diagnostics.length !== 1) {
      expect.fail('Expected one diagnostic on layout.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
    expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
    expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
  });

  async function testHover(
    doc: vscode.TextDocument,
    uri: vscode.Uri,
    tree: JsonNode,
    jsonpath: JSONPath,
    expectedHoverText: string
  ) {
    const node = tree && findNodeAtLocation(tree, jsonpath)?.parent;
    const jsonpathStr = jsonPathToString(jsonpath);
    expect(node, `${jsonpathStr} propNode`).to.be.not.undefined;
    const nameNode = node!.children?.[0];
    expect(nameNode, `${jsonpathStr} nameNode`).to.not.be.undefined;
    let hovers = await getHovers(uri, doc.positionAt(nameNode!.offset));
    expect(hovers, `${jsonpathStr} nameNode hovers`).to.not.be.undefined;
    // on the name field, it should just return the hover from the schema
    expect(hovers.length, `${jsonpathStr} nameNode hovers.length`).to.equal(1);

    const valueNode = node!.children?.[1];
    expect(valueNode, `${jsonpathStr} valueNode`).to.not.be.undefined;
    hovers = await waitFor(
      () => getHovers(uri, doc.positionAt(valueNode!.offset)),
      hovers => hovers.length >= 2,
      {
        timeoutMessage: hovers =>
          `Timed out waiting for both hovers on ${jsonpathStr} valueNode, got hovers:` +
          JSON.stringify(hovers, undefined, 2)
      }
    );
    expect(hovers, `${jsonpathStr} valueNode hovers`).to.not.be.undefined;
    // on the value field, it should have the schema hover and the hover from our provider
    expect(hovers.length, `${jsonpathStr} valueNode hovers.length`).to.equal(2);
    if (!hovers.some(h => h.contents.some(c => typeof c === 'object' && c.value.indexOf(expectedHoverText) >= 0))) {
      expect.fail(`Expected at least one ${jsonpathStr} hover to contain '${expectedHoverText}'`);
    }
  }

  it('hover text on variable names', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'layout.json');
    const [doc] = await openFile(uri, true);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);
    const tree = parseTree(doc.getText());
    expect(tree, 'BadVariables/layout.json json tree').to.not.be.undefined;
    await testHover(doc, uri, tree!, ['pages', 0, 'layout', 'center', 'items', 3, 'name'], 'StringTypeVar');
    await testHover(
      doc,
      uri,
      tree!,
      ['pages', 0, 'layout', 'center', 'items', 4, 'items', 0, 'name'],
      'DateTimeTypeGroupBoxVar'
    );
  });

  it('go to definition support for variable names', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'layout.json');
    const [doc] = await openFile(uri, true);
    // we should see the 4 warnings about the bad var types
    await waitForDiagnostics(uri, d => d && d.length >= 4);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

    const position = findPositionByJsonPath(doc, ['pages', 0, 'layout', 'center', 'items', 0, 'name']);
    expect(position, 'pages[0].layout.center.items[0].name').to.not.be.undefined;

    const locations = await getDefinitionLocations(uri, position!.translate(undefined, 1));
    if (locations.length !== 1) {
      expect.fail('Expected 1 location, got:\n' + JSON.stringify(locations, undefined, 2));
    }
    expect(locations[0].uri.fsPath, 'location path').to.equal(
      vscode.Uri.joinPath(uriDirname(uri), 'variables.json').fsPath
    );

    // Go to definition for variable defined in groupbox
    const groupBoxVarPosition = findPositionByJsonPath(doc, [
      'pages',
      0,
      'layout',
      'center',
      'items',
      4,
      'items',
      0,
      'name'
    ]);
    expect(groupBoxVarPosition, 'pages[0].layout.center.items[4].items[0].name').to.not.be.undefined;

    const groupBoxVarlocations = await getDefinitionLocations(uri, groupBoxVarPosition!.translate(undefined, 1));
    if (groupBoxVarlocations.length !== 1) {
      expect.fail('Expected 1 location, got:\n' + JSON.stringify(groupBoxVarlocations, undefined, 2));
    }
    expect(groupBoxVarlocations[0].uri.fsPath, 'location path').to.equal(
      vscode.Uri.joinPath(uriDirname(uri), 'variables.json').fsPath
    );
  });

  it('go to definition support for variable tiles keys', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'layout.json');
    const [doc] = await openFile(uri, true);
    // we should see the warnings about the bad var types
    await waitForDiagnostics(uri, d => d && d.length >= 1);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

    const verifyDefinition = async (...jsonpath: JSONPath) => {
      const position = findPositionByJsonPath(doc, jsonpath);
      const jsonpathStr = jsonPathToString(jsonpath);
      expect(position, jsonpathStr).to.not.be.undefined;

      // position will be the start of the tile key's {}, so go back 3 chars to the tile key
      const locations = await getDefinitionLocations(uri, position!.translate({ characterDelta: -3 }));
      if (locations.length !== 1) {
        expect.fail(`Expected 1 location for ${jsonpathStr}, got:\n` + JSON.stringify(locations, undefined, 2));
      }
      expect(locations[0].uri.fsPath, `${jsonpathStr} location path`).to.equal(
        vscode.Uri.joinPath(uriDirname(uri), 'variables.json').fsPath
      );
    };

    // check string enum tile
    await verifyDefinition('pages', 0, 'layout', 'center', 'items', 4, 'tiles', 'C');
    // check number enum tile
    await verifyDefinition('pages', 0, 'layout', 'center', 'items', 5, 'tiles', '3');
    // check string enum tile in groupbox
    await verifyDefinition('pages', 0, 'layout', 'center', 'items', 6, 'items', 0, 'tiles', 'B');
    // check number enum tile in groupbox
    await verifyDefinition('pages', 0, 'layout', 'center', 'items', 6, 'items', 1, 'tiles', '2');
  });

  it('code completions for variable names', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'layout.json');
    const [doc] = await openFile(uri, true);
    // we should see the 4 warnings about the bad var types
    await waitForDiagnostics(uri, d => d && d.length >= 4);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

    const position = findPositionByJsonPath(doc, ['pages', 0, 'layout', 'center', 'items', 0, 'name']);
    expect(position, 'pages[0].layout.center.items[0].name').to.not.be.undefined;
    const completions = (
      await verifyCompletionsContain(
        doc,
        position!,
        '"DatasetAnyFieldTypeVar"',
        '"DateTimeTypeGroupBoxVar"',
        '"DateTimeTypeVar"',
        '"ObjectTypeGroupBoxVar"',
        '"ObjectTypeVar"',
        '"StringArrayVar"',
        '"StringTypeVar"'
      )
    ).sort(compareCompletionItems);
    if (completions.length !== 7) {
      expect.fail('Expected 7 completions, got: ' + completions.map(i => i.label).join(', '));
    }
    // check some more stuff on the completion items
    [
      {
        detail: '(DatasetAnyFieldType) A dataset any field variable',
        docs: "This can't be put in a non-vfpage page"
      },
      {
        detail: '(DateTimeType) A datetime variable for groupbox',
        docs: "This can't be put in a non-vfpage page"
      },
      {
        detail: '(DateTimeType) A datetime variable',
        docs: "This can't be put in a non-vfpage page"
      },
      {
        detail: '(ObjectType) An object variable for groupbox',
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

    // Check for variable code completitons inside groupBox
    const groupBoxPosition = findPositionByJsonPath(doc, [
      'pages',
      0,
      'layout',
      'center',
      'items',
      4,
      'items',
      0,
      'name'
    ]);
    expect(groupBoxPosition, 'pages[0].layout.center.items[4].items[0].name').to.not.be.undefined;
    const groupBoxCompletions = (
      await verifyCompletionsContain(
        doc,
        groupBoxPosition!,
        '"DatasetAnyFieldTypeVar"',
        '"DateTimeTypeGroupBoxVar"',
        '"DateTimeTypeVar"',
        '"ObjectTypeGroupBoxVar"',
        '"ObjectTypeVar"',
        '"StringArrayVar"',
        '"StringTypeVar"'
      )
    ).sort(compareCompletionItems);
    if (groupBoxCompletions.length !== 7) {
      expect.fail('Expected 7 completions, got: ' + groupBoxCompletions.map(i => i.label).join(', '));
    }
    // check some more stuff on the completion items
    [
      {
        detail: '(DatasetAnyFieldType) A dataset any field variable',
        docs: "This can't be put in a non-vfpage page"
      },
      {
        detail: '(DateTimeType) A datetime variable for groupbox',
        docs: "This can't be put in a non-vfpage page"
      },
      {
        detail: '(DateTimeType) A datetime variable',
        docs: "This can't be put in a non-vfpage page"
      },
      {
        detail: '(ObjectType) An object variable for groupbox',
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
      const item = groupBoxCompletions[i];
      expect(item.kind, `${item.label} kind`).to.equal(vscode.CompletionItemKind.Variable);
      expect(item.detail, `${item.label} details`).to.equal(detail);
      expect(item.documentation, `${item.label} documentation`).to.equal(docs);
    });
  });

  it('quick fixes on bad variable names', async () => {
    const layoutJson = {
      pages: [
        {
          title: 'Test Title',
          layout: {
            type: 'SingleColumn',
            center: {
              items: [
                { type: 'Variable', name: 'varname' },
                { type: 'Variable', name: 'foo' }
              ]
            }
          }
        }
      ]
    };
    const [t, [layoutEditor, variablesEditor]] = await createTemplateWithRelatedFiles(
      {
        field: 'layoutDefinition',
        path: 'layout.json',
        initialJson: layoutJson
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

    // get the 2 expected diagnostics on the variables in layout.json
    const diagnosticFilter = (d: vscode.Diagnostic) => d.code === ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE;
    let diagnostics = (
      await waitForDiagnostics(
        layoutEditor.document.uri,
        ds => ds && ds.filter(diagnosticFilter).length === 2,
        'Initial 2 invalid variable warnings on layout.json'
      )
    )
      .filter(diagnosticFilter)
      .sort(sortDiagnostics);
    // and there shouldn't be any warnings on variables.json
    await waitForDiagnostics(variablesEditor.document.uri, d => d && d.length === 0);

    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('pages[0].layout.center.items[0].name');
    expect(jsonpathFrom(diagnostics[1]), 'diagnostics[1].jsonpath').to.equal('pages[0].layout.center.items[1].name');

    // the 1st diagnostic should be for 'varname', which should have the 2 quickfixes.
    // Note: they seem to no longer be guarenteed to come in original insert order so sort them by title
    let actions = (await getCodeActions(layoutEditor.document.uri, diagnostics[0].range)).sort((a1, a2) =>
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
        layoutEditor.document.uri,
        ds => ds && ds.filter(diagnosticFilter).length === 1,
        '1 invalid variable warning on layout.json after first quick fix'
      )
    )
      .filter(diagnosticFilter)
      .sort(sortDiagnostics);
    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('pages[0].layout.center.items[1].name');
    // and there should just be the Create variable quick fix for 'foo'
    actions = await getCodeActions(layoutEditor.document.uri, diagnostics[0].range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code actions, got: [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'varname action[0].title').to.equals("Create variable 'foo'");
    expect(actions[0].edit, 'varname action[0].edit').to.not.be.undefined;
    // run that Create variable... quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // which should fix the warning on layout.json
    await waitForDiagnostics(layoutEditor.document.uri, ds => ds && ds.filter(diagnosticFilter).length === 0);
    // and variables.json should be good, too
    await waitForDiagnostics(variablesEditor.document.uri, d => d && d.length === 0);
    // make sure the 'foo' variable got into variables.json
    const variables = parseTree(variablesEditor.document.getText());
    const fooNode = variables && findNodeAtLocation(variables, ['foo']);
    expect(fooNode, 'foo in variables.json').to.not.be.undefined;
    // and that it's a {} object
    expect(fooNode!.type, 'foo in variables.json type').to.equal('object');
  });

  it('code completions for tiles keys', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'layout.json');
    const [doc] = await openFile(uri, true);
    // we should see the warnings about the bad var types
    await waitForDiagnostics(uri, d => d && d.length >= 1);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

    const verifyTilesCompletions = async (jsonPath: JSONPath, expected: string[]) => {
      const jsonPathStr = jsonPathToString(jsonPath);
      // go the inside of tiles' "{}"
      const position = findPositionByJsonPath(doc, jsonPath)?.translate({ characterDelta: 1 });
      expect(position, jsonPathStr).to.not.be.undefined;
      const completions = (await verifyCompletionsContain(doc, position!, ...expected)).sort(compareCompletionItems);
      if (completions.length !== expected.length) {
        expect.fail(`Expected ${expected.length} completions, got: ` + completions.map(i => i.label).join(', '));
      }
    };
    const expectedStringEnumCompletions = ['"A"', '"B"', '"C"'];
    const expectedNumberEnumCompletions = ['"1"', '"2"', '"3"'];

    // SingleColumn page
    await verifyTilesCompletions(['pages', 0, 'layout', 'center', 'items', 4, 'tiles'], expectedStringEnumCompletions);
    await verifyTilesCompletions(['pages', 0, 'layout', 'center', 'items', 5, 'tiles'], expectedNumberEnumCompletions);
    // in GroupBox in SingleColumn page
    await verifyTilesCompletions(
      ['pages', 0, 'layout', 'center', 'items', 6, 'items', 0, 'tiles'],
      expectedStringEnumCompletions
    );
    await verifyTilesCompletions(
      ['pages', 0, 'layout', 'center', 'items', 6, 'items', 1, 'tiles'],
      expectedNumberEnumCompletions
    );

    // TwoColumn page left
    await verifyTilesCompletions(['pages', 1, 'layout', 'left', 'items', 0, 'tiles'], expectedStringEnumCompletions);
    await verifyTilesCompletions(['pages', 1, 'layout', 'left', 'items', 1, 'tiles'], expectedNumberEnumCompletions);
    // in GroupBox in SingleColumn page
    await verifyTilesCompletions(
      ['pages', 1, 'layout', 'left', 'items', 2, 'items', 0, 'tiles'],
      expectedStringEnumCompletions
    );
    await verifyTilesCompletions(
      ['pages', 1, 'layout', 'left', 'items', 2, 'items', 1, 'tiles'],
      expectedNumberEnumCompletions
    );
    // TwoColumn page right
    await verifyTilesCompletions(['pages', 1, 'layout', 'right', 'items', 0, 'tiles'], expectedStringEnumCompletions);
    await verifyTilesCompletions(['pages', 1, 'layout', 'right', 'items', 1, 'tiles'], expectedNumberEnumCompletions);
    // in GroupBox in SingleColumn page
    await verifyTilesCompletions(
      ['pages', 1, 'layout', 'right', 'items', 2, 'items', 0, 'tiles'],
      expectedStringEnumCompletions
    );
    await verifyTilesCompletions(
      ['pages', 1, 'layout', 'right', 'items', 2, 'items', 1, 'tiles'],
      expectedNumberEnumCompletions
    );
  });

  it('quick fixes on bad variable tile keys', async () => {
    const layoutJson = {
      pages: [
        {
          title: 'Test Title',
          layout: {
            type: 'SingleColumn',
            center: {
              items: [
                { type: 'Variable', name: 'stringEnum', variant: 'CheckboxTiles', tiles: { c: {} } },
                {
                  type: 'GroupBox',
                  text: 'test',
                  items: [{ type: 'Variable', name: 'numberEnum', variant: 'CenteredCheckboxTiles', tiles: { 20: {} } }]
                }
              ]
            }
          }
        }
      ]
    };
    const [t, [layoutEditor, variablesEditor]] = await createTemplateWithRelatedFiles(
      {
        field: 'layoutDefinition',
        path: 'layout.json',
        initialJson: layoutJson
      },
      {
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson: {
          stringEnum: {
            variableType: {
              type: 'StringType',
              enums: ['A', 'B', 'C']
            }
          },
          numberEnum: {
            variableType: {
              type: 'NumberType',
              enums: [1, 2, 3]
            }
          }
        }
      }
    );
    tmpdir = t;

    // get the 2 expected diagnostics on the tiles in layout.json
    const diagnosticFilter = (d: vscode.Diagnostic) => d.code === ERRORS.LAYOUT_INVALID_TILE_NAME;
    let diagnostics = (
      await waitForDiagnostics(
        layoutEditor.document.uri,
        ds => ds && ds.filter(diagnosticFilter).length === 2,
        'Initial 2 invalid tiles warnings on layout.json'
      )
    )
      .filter(diagnosticFilter)
      .sort(sortDiagnostics);
    // and there shouldn't be any warnings on variables.json
    await waitForDiagnostics(variablesEditor.document.uri, d => d && d.length === 0);

    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('pages[0].layout.center.items[0].tiles.c');
    expect(jsonpathFrom(diagnostics[1]), 'diagnostics[1].jsonpath').to.equal(
      'pages[0].layout.center.items[1].items[0].tiles["20"]'
    );

    let actions = await getCodeActions(layoutEditor.document.uri, diagnostics[0].range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code action, got [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'stringEnum action title').to.equal("Switch to 'C'");
    expect(actions[0].edit, 'stringEnum action edit').to.not.be.undefined;
    // run the action
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // that should that diagnostic, leaving the one on numberEnum
    diagnostics = (
      await waitForDiagnostics(
        layoutEditor.document.uri,
        ds => ds && ds.filter(diagnosticFilter).length === 1,
        '1 invalid tiles warnings on layout.json'
      )
    ).filter(diagnosticFilter);
    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal(
      'pages[0].layout.center.items[1].items[0].tiles["20"]'
    );

    actions = await getCodeActions(layoutEditor.document.uri, diagnostics[0].range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code action, got [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'numberEnum action title').to.equal("Switch to '2'");
    expect(actions[0].edit, 'numberEnum action edit').to.not.be.undefined;
    // run that action
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // that should fix all the warnings
    await waitForDiagnostics(
      layoutEditor.document.uri,
      ds => ds && ds.filter(diagnosticFilter).length === 0,
      'No more diagnostics on layout.json'
    );
    // and the tile keys should have been updated
    const layoutTree = parseTree(layoutEditor.document.getText());
    expect(layoutTree, 'layout.json').to.not.be.undefined;
    expect(
      findNodeAtLocation(layoutTree!, ['pages', 0, 'layout', 'center', 'items', 0, 'tiles', 'C']),
      'stringEnum tile'
    ).to.not.be.undefined;
    expect(
      findNodeAtLocation(layoutTree!, ['pages', 0, 'layout', 'center', 'items', 1, 'items', 0, 'tiles', '2']),
      'stringEnum tile'
    ).to.not.be.undefined;
  });

  it('quick fixes on unnecessary navigation objects', async () => {
    const layoutJson = {
      pages: [
        {
          title: 'Test Title',
          navigation: {
            label: 'Test Label'
          },
          layout: {
            type: 'SingleColumn',
            center: {
              items: [
                {
                  type: 'GroupBox',
                  text: 'test',
                  items: []
                }
              ]
            }
          }
        }
      ]
    };
    const [t, [layoutEditor]] = await createTemplateWithRelatedFiles({
      field: 'layoutDefinition',
      path: 'layout.json',
      initialJson: layoutJson
    });
    tmpdir = t;

    // get the 1 expected diagnostics on the tiles in layout.json
    const diagnosticFilter = (d: vscode.Diagnostic) => d.code === ERRORS.LAYOUT_PAGE_UNNECESSARY_NAVIGATION_OBJECT;
    let diagnostics = (
      await waitForDiagnostics(
        layoutEditor.document.uri,
        ds => ds && ds.filter(diagnosticFilter).length === 1,
        'Initial 1 warning on layout.json'
      )
    )
      .filter(diagnosticFilter)
      .sort(sortDiagnostics);

    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal('pages[0].navigation');

    const actions = await getCodeActions(layoutEditor.document.uri, diagnostics[0].range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code action, got [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'quick fix action title').to.equal('Remove pages[0].navigation');
    expect(actions[0].edit, 'quick fix action edit').to.not.be.undefined;
    // run the action
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }

    // that should take care of that diagnostic
    diagnostics = (
      await waitForDiagnostics(
        layoutEditor.document.uri,
        ds => ds && ds.filter(diagnosticFilter).length === 0,
        'No more diagnostics on layout.json'
      )
    ).filter(diagnosticFilter);

    // and the tile keys should have been updated
    const layoutTree = parseTree(layoutEditor.document.getText());
    expect(layoutTree, 'layout.json').to.not.be.undefined;
    console.log(findNodeAtLocation(layoutTree!, ['pages', 0, 'navigation']));
    expect(findNodeAtLocation(layoutTree!, ['pages', 0, 'navigation']), 'navigation node').to.be.undefined;
  });
});
