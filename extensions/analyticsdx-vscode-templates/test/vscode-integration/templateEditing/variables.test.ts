/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { jsonpathFrom, scanLinesUntil, uriDirname, uriStat } from '../../../src/util/vscodeUtils';
import { NEW_VARIABLE_SNIPPETS } from '../../../src/variables';
import { waitFor } from '../../testutils';
import {
  closeAllEditors,
  createTempTemplate,
  getCompletionItems,
  getHovers,
  getTemplateEditorManager,
  openFile,
  openFileAndWaitForDiagnostics,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  uriFromTestRoot,
  verifyCompletionsContain,
  waitForDiagnostics,
  waitForTemplateEditorManagerHas,
  waveTemplatesUriPath,
  writeEmptyJsonFile
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateEditorManager configures variablesDefinition', () => {
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
    let node = findNodeAtLocation(tree!, ['string', 'variableType', 'type']);
    expect(node, 'string.variableType.type').to.not.be.undefined;
    let position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(
      doc,
      position,
      '"ArrayType"',
      '"BooleanType"',
      '"CalculatedInsightType"',
      '"CalculatedInsightFieldType"',
      '"DataLakeObjectType"',
      '"DataLakeObjectFieldType"',
      '"DataModelObjectType"',
      '"DataModelObjectFieldType"',
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

    // check for the unused fields in the sobjectfield var
    node = findNodeAtLocation(tree!, ['sobjectfield']);
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

    // find the start of the first "dataType" field in the 2nd variable
    node = findNodeAtLocation(tree!, ['sobjectfield', 'variableType', 'dataType']);
    expect(node, 'sobjectfield.variableType.dataType').to.not.be.undefined;
    position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(
      doc,
      position,
      '"tns:ID"',
      '"xsd:anyType"',
      '"xsd:base64Binary"',
      '"xsd:boolean"',
      '"xsd:date"',
      '"xsd:dateTime"',
      '"xsd:double"',
      '"xsd:int"',
      '"xsd:string"',
      '"xsd:time"'
    );

    // find the start of the first "dataType" field in the data cloud field variables
    node = findNodeAtLocation(tree!, ['dlofield', 'variableType', 'dataType']);
    expect(node, 'dlofield.variableType.dataType').to.not.be.undefined;
    position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(doc, position, '"date"', '"date_time"', '"number"', '"string"', 'null');

    node = findNodeAtLocation(tree!, ['dmofield', 'variableType', 'dataType']);
    expect(node, 'dmofield.variableType.dataType').to.not.be.undefined;
    position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(doc, position, '"date"', '"date_time"', '"number"', '"string"', 'null');

    node = findNodeAtLocation(tree!, ['cifield', 'variableType', 'dataType']);
    expect(node, 'cifield.variableType.dataType').to.not.be.undefined;
    position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(doc, position, '"date"', '"date_time"', '"number"', '"string"', 'null');

    // and check calculated insights field fieldType
    node = findNodeAtLocation(tree!, ['cifield', 'variableType', 'fieldType']);
    expect(node, 'cifield.variableType.fieldType').to.not.be.undefined;
    position = doc.positionAt(node!.offset);
    await verifyCompletionsContain(doc, position, '"dimension"', '"measure"', 'null');
  });

  it('json-schema defaultSnippets', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'variables.json');
    const [, doc] = await openFileAndWaitForDiagnostics(uri);
    const tree = parseTree(doc.getText());
    expect(tree, 'json text').to.not.be.undefined;
    // go to just before the { in "variableType" in the string var
    const node = findNodeAtLocation(tree!, ['string', 'variableType']);
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
    const templateUri = vscode.Uri.joinPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and variables.json with some content that would have schema errors
    const variablesUri = vscode.Uri.joinPath(tmpdir, 'variables.json');
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
    await waitForDiagnostics(variablesDoc.uri, d => d?.length === 0);

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
    const diagnostics = await waitForDiagnostics(variablesDoc.uri, d => d?.length === 1);
    expect(diagnostics, 'diagnostics').to.not.be.undefined;
    if (diagnostics.length !== 1) {
      expect.fail(
        'Expect 1 diagnostic on ' + variablesDoc.uri.toString() + ' got\n:' + JSON.stringify(diagnostics, undefined, 2)
      );
    }
    // make sure we got the error about the invalid type
    const diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic.message').to.matches(/Incorrect type/);

    // now, set variableDefinition to an empty value
    await setDocumentText(templateEditor, JSON.stringify({}, undefined, 2));
    // which should clear the warnings on variables.json since it's not a variables file anymore
    await waitForDiagnostics(variablesDoc.uri, d => d?.length === 0);
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
          variableDefinition: 'variables.json'
        },
        undefined,
        2
      )
    );
    // that should give us a warning about variables.json not existing
    await waitForDiagnostics(templateUri, diagnostics =>
      diagnostics?.some(d => jsonpathFrom(d) === 'variableDefinition')
    );
    // create a variables.json that has a comment and some bad json
    const variablesUri = vscode.Uri.joinPath(tmpdir, 'variables.json');
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
    const node = tree && findNodeAtLocation(tree, ['ObjectTypeVar'])?.parent;
    expect(node, 'ObjectTypeVar propNode').to.be.not.undefined;
    const nameNode = node!.children?.[0];
    expect(nameNode, 'nameNode').to.not.be.undefined;
    // on the name field, it should have the schema hover and the hover from our provider
    let hovers = await waitFor(
      () => getHovers(uri, doc.positionAt(nameNode!.offset)),
      hovers => hovers && hovers.length === 2,
      { timeoutMessage: hovers => 'Exepected 2 hovers, got: ' + JSON.stringify(hovers, undefined, 2) }
    );
    if (!hovers.some(h => h.contents.some(c => typeof c === 'object' && c.value.indexOf('ObjectTypeVar') >= 0))) {
      expect.fail("Expected at least one hover to contain 'ObjectTypeVar'");
    }

    const valueNode = findNodeAtLocation(tree!, ['ObjectTypeVar', 'label']);
    expect(valueNode, 'ObjectTypeVar.label').to.not.be.undefined;
    hovers = await getHovers(uri, doc.positionAt(valueNode!.offset));
    expect(hovers, 'ObjectTypeVar.label hovers').to.not.be.undefined;
    // on other fields, it should just have the hover from the schema descrption
    expect(hovers.length, 'ObjectTypeVar.label hovers.length').to.equal(1);
  });

  it('code completion snippets for new variables', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'variables.json');
    const [doc] = await openFile(uri, true);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);
    const tree = parseTree(doc.getText());
    expect(tree?.type, 'root json type').to.equal('object');
    // this shold right after the opening { (and before any of the existing variable defs)
    let position = doc.positionAt(tree!.offset).translate(0, 1);
    let completions = await verifyCompletionsContain(doc, position, ...NEW_VARIABLE_SNIPPETS.map(s => s.label));
    if (completions.length !== NEW_VARIABLE_SNIPPETS.length) {
      expect.fail(
        `Expected ${NEW_VARIABLE_SNIPPETS.length} completions, got: ` + completions.map(c => c.label).join(', ')
      );
    }
    completions.forEach(c => {
      expect(c.kind, `${c.label} kind`).to.equal(vscode.CompletionItemKind.Variable);
      expect(c.insertText, `${c.label} insertText`).to.be.instanceOf(vscode.SnippetString);
    });

    // make sure the snippets don't show up elsewhere, like in a variable def body
    const node = findNodeAtLocation(tree!, ['StringTypeVar']);
    expect(node, 'StringTypeVar node').to.not.be.undefined;
    position = doc.positionAt(node!.offset);
    completions = (await getCompletionItems(doc.uri, position)).items;
    if (completions.some(c => NEW_VARIABLE_SNIPPETS.some(s => s.label === c.label))) {
      expect.fail('Found new variable completion item in ' + completions.map(c => c.label).join(', '));
    }
    // or in a variable name
    expect(node!.parent, 'StringTypeVar whole property node').to.not.be.undefined;
    position = doc.positionAt(node!.parent!.offset);
    completions = (await getCompletionItems(doc.uri, position)).items;
    if (completions.some(c => NEW_VARIABLE_SNIPPETS.some(s => s.label === c.label))) {
      expect.fail('Found new variable completion item in ' + completions.map(c => c.label).join(', '));
    }
  });
});
