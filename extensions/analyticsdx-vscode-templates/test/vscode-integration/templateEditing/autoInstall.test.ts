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
import { matchJsonNodeAtPattern } from '../../../src/util/jsoncUtils';
import { jsonpathFrom, scanLinesUntil, uriDirname, uriStat } from '../../../src/util/vscodeUtils';
import { NEW_VARIABLE_SNIPPETS } from '../../../src/variables';
import { waitFor } from '../../testutils';
import {
  closeAllEditors,
  compareCompletionItems,
  createTemplateWithRelatedFiles,
  createTempTemplate,
  getCodeActions,
  getCompletionItems,
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
describe('TemplateEditorManager configures autoInstallDefinitions', () => {
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
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'auto-install.json');
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

  it('json-schema defaultSnippets', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', 'auto-install.json');
    const [, doc] = await openFileAndWaitForDiagnostics(uri);
    const tree = parseTree(doc.getText());
    expect(tree, 'json text').to.not.be.undefined;
    // find the [ after hooks:
    const node = tree && findNodeAtLocation(tree, ['hooks']);
    expect(node, 'hooks').to.not.be.undefined;
    const scan = scanLinesUntil(doc, ch => ch === '[', doc.positionAt(node!.offset));
    if (scan.ch !== '[') {
      expect.fail("Expected to find '[' after '\"hooks\":'");
    }
    // go to just before it
    let position = scan.end.translate({ characterDelta: -1 });
    // that should give a snippet to create an array w/ a hook
    await verifyCompletionsContain(doc, position, 'New hooks');

    // go to just after the [ in "hooks"
    position = scan.end.translate({ characterDelta: 1 });
    // that should give a snippet for a new hook
    await verifyCompletionsContain(doc, position, 'New hook');
  });

  it('on change of path value', async () => {
    [tmpdir] = await createTempTemplate(false);
    // make an empty template
    const templateUri = vscode.Uri.joinPath(tmpdir, 'template-info.json');
    const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
    // and auto-install.json with some content that would have schema errors
    const autoInstallUri = vscode.Uri.joinPath(tmpdir, 'auto-install.json');
    await writeEmptyJsonFile(autoInstallUri);
    const [autoInstallDoc, autoInstallEditor] = await openFile(autoInstallUri);
    await setDocumentText(
      autoInstallEditor,
      JSON.stringify(
        {
          error: 'intentionally unknown error field for test to look for',
          hooks: [],
          configuration: {
            appConfiguration: {}
          }
        },
        undefined,
        2
      )
    );
    // but since it's not reference by the template-info.json, it should have no errors
    await waitForDiagnostics(autoInstallDoc.uri, d => d?.length === 0);

    // now, write "autoInstallDefinition": "auto-install.json" to the template-info.json
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          autoInstallDefinition: 'auto-install.json'
        },
        undefined,
        2
      )
    );

    // the auto-install.json should eventually end up with a diagnostic about the bad field
    const diagnostics = await waitForDiagnostics(autoInstallDoc.uri, d => d?.length === 1);
    expect(diagnostics, 'diagnostics').to.not.be.undefined;
    if (diagnostics.length !== 1) {
      expect.fail(
        'Expect 1 diagnostic on ' +
          autoInstallDoc.uri.toString() +
          ' got\n:' +
          JSON.stringify(diagnostics, undefined, 2)
      );
    }
    // make sure we got the error about the invalid field name
    const diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic.message').to.matches(/Property (.+) is not allowed/);

    // now, set autoInstallDefinition to a filename that doesn't exist
    await setDocumentText(
      templateEditor,
      JSON.stringify(
        {
          autoInstallDefinition: 'doesnotexist.json'
        },
        undefined,
        2
      )
    );
    // which should clear the warnings on auto-install.json since it's not a folder file anymore
    await waitForDiagnostics(autoInstallDoc.uri, d => d?.length === 0);
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
          autoInstallDefinition: 'auto-install.json'
        },
        undefined,
        2
      )
    );
    // that should give us a warning about auto-install.json not existing
    await waitForDiagnostics(templateUri, diagnostics =>
      diagnostics?.some(d => jsonpathFrom(d) === 'autoInstallDefinition')
    );
    // create a auto-install.json that has a comment and some bad json
    const autoInstallUri = vscode.Uri.joinPath(tmpdir, 'auto-install.json');
    await writeEmptyJsonFile(autoInstallUri);
    const [, autoInstallEditor] = await openFile(autoInstallUri);
    await setDocumentText(
      autoInstallEditor,
      `{
         // a comment here, with missing double-quotes below
         hooks: [],
         "configuration": {
           "appConfiguration": {}
         }
       }`
    );
    // we should only get an error on the missing double quotes (and not on the json comment)
    const diagnostics = await waitForDiagnostics(
      autoInstallUri,
      d => d?.length === 1,
      'Waiting for diagnostic on hooks'
    );
    if (diagnostics.length !== 1) {
      expect.fail('Expected one diagnostic on auto-install.json, got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(diagnostics[0], 'diagnostic').to.not.be.undefined;
    expect(diagnostics[0].message, 'diagnostic message').to.equal('Property keys must be doublequoted');
    expect(diagnostics[0].range.start.line, 'diagnostic line').to.equal(2);
  });

  it('hover text on variable names', async () => {
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'auto-install.json');
    const [doc] = await openFile(uri, true);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);
    const tree = parseTree(doc.getText());
    const node =
      tree && findNodeAtLocation(tree, ['configuration', 'appConfiguration', 'values', 'StringTypeVar'])?.parent;
    expect(node, 'configuration.appConfiguration.values.StringTypeVar propNode').to.be.not.undefined;
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
    const uri = uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'auto-install.json');
    const [doc] = await openFile(uri, true);
    // we should see the 1 warnings about UnknownVar
    await waitForDiagnostics(uri, d => d && d.length >= 1);
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), uriDirname(uri), true);

    // should find a definition location for StringTypeVar
    const root = parseTree(doc.getText());
    let propNode = matchJsonNodeAtPattern(root, ['configuration', 'appConfiguration', 'values', 'StringTypeVar'])
      ?.parent?.children?.[0];
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
    propNode = matchJsonNodeAtPattern(root, ['configuration', 'appConfiguration', 'values', 'UnknownVar'])?.parent
      ?.children?.[0];
    position = doc.positionAt(propNode!.offset);
    expect(propNode, 'StringVar property node').to.not.be.undefined;
    expect(position, 'configuration.appConfinguration.values.UnknownVar').to.not.be.undefined;
    locations = await getDefinitionLocations(uri, position!.translate(undefined, 1));
    if (locations.length !== 0) {
      expect.fail('Expected 0 locations for UnknownVar, got:\n' + JSON.stringify(locations, undefined, 2));
    }
  });

  it('quick fixes on bad variable names', async () => {
    const autoInstallJson = {
      hooks: [],
      configuration: {
        appConfiguration: {
          values: {
            varname: 'a',
            foo: 'b'
          }
        }
      }
    };
    const [t, [autoInstallEditor, variablesEditor]] = await createTemplateWithRelatedFiles(
      {
        field: 'autoInstallDefinition',
        path: 'auto-install.json',
        initialJson: autoInstallJson
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

    // get the 2 expected diagnostics on the variables in auto-install.json
    const diagnosticFilter = (d: vscode.Diagnostic) => d.code === ERRORS.AUTO_INSTALL_UNKNOWN_VARIABLE;
    let diagnostics = (
      await waitForDiagnostics(
        autoInstallEditor.document.uri,
        ds => ds?.filter(diagnosticFilter).length === 2,
        'Initial 2 invalid variable warnings on auto-install.json'
      )
    )
      .filter(diagnosticFilter)
      .sort(sortDiagnostics);
    // and there shouldn't be any warnings on variables.json
    await waitForDiagnostics(variablesEditor.document.uri, d => d?.length === 0);

    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal(
      'configuration.appConfiguration.values.varname'
    );
    expect(jsonpathFrom(diagnostics[1]), 'diagnostics[1].jsonpath').to.equal(
      'configuration.appConfiguration.values.foo'
    );

    // the 1st diagnostic should be for 'varname', which should have just the 2 quickfixes.
    // Note: they seem to no longer be guarenteed to come in original insert order so sort them by title
    let actions = (await getCodeActions(autoInstallEditor.document.uri, diagnostics[0].range)).sort((a1, a2) =>
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
        autoInstallEditor.document.uri,
        ds => ds?.filter(diagnosticFilter).length === 1,
        '1 invalid variable warning on auto-install.json after first quick fix'
      )
    )
      .filter(diagnosticFilter)
      .sort(sortDiagnostics);
    expect(jsonpathFrom(diagnostics[0]), 'diagnostics[0].jsonpath').to.equal(
      'configuration.appConfiguration.values.foo'
    );
    // and there should just be the Create variable quick fix for 'foo'
    actions = await getCodeActions(autoInstallEditor.document.uri, diagnostics[0].range);
    if (actions.length !== 1) {
      expect.fail('Expected 1 code actions, got: [' + actions.map(a => a.title).join(', ') + ']');
    }
    expect(actions[0].title, 'varname action[0].title').to.equals("Create variable 'foo'");
    expect(actions[0].edit, 'varname action[0].edit').to.not.be.undefined;
    // run that Create variable... quick fix
    if (!(await vscode.workspace.applyEdit(actions[0].edit!))) {
      expect.fail(`Quick fix '${actions[0].title}' failed`);
    }
    // which should fix the warning on auto-install.json
    await waitForDiagnostics(autoInstallEditor.document.uri, ds => ds?.filter(diagnosticFilter).length === 0);
    // and variables.json should be good, too
    await waitForDiagnostics(variablesEditor.document.uri, d => d?.length === 0);
    // make sure the 'foo' variable go into variables.json
    const variables = parseTree(variablesEditor.document.getText());
    const fooNode = variables && findNodeAtLocation(variables, ['foo']);
    expect(fooNode, 'foo in variables.json').to.not.be.undefined;
    // and that it's a {} object
    expect(fooNode!.type, 'foo in variables.json type').to.equal('object');
  });

  it('code completions in appConfiguration.values', async () => {
    const [t, [autoInstallEditor, variablesEditor]] = await createTemplateWithRelatedFiles(
      {
        field: 'autoInstallDefinition',
        path: 'auto-install.json',
        initialJson: {
          hooks: [],
          configuration: {
            appConfiguration: {
              values: {}
            }
          }
        }
      },
      {
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson: {
          stringvar: {
            description: 'stringvar description',
            variableType: {
              type: 'StringType'
            }
          },
          arrayvar: {
            label: 'Array label',
            variableType: {
              type: 'ArrayType',
              itemsType: {
                type: 'NumberType'
              }
            }
          }
        }
      }
    );
    tmpdir = t;

    // there shouldn't be any warnings on auto-install.json and variables.json
    await waitForDiagnostics(autoInstallEditor.document.uri, d => d?.length === 0);
    await waitForDiagnostics(variablesEditor.document.uri, d => d?.length === 0);
    // and editing should be setup
    await waitForTemplateEditorManagerHas(await getTemplateEditorManager(), tmpdir, true);

    let autoInstallJson = parseTree(autoInstallEditor.document.getText());
    expect(autoInstallJson, 'autoInstallJson').to.not.be.undefined;
    const valuesNode = matchJsonNodeAtPattern(autoInstallJson, ['configuration', 'appConfiguration', 'values']);
    expect(valuesNode, 'values node').to.not.be.undefined;
    // this should be right at the { after "values":
    let position = autoInstallEditor.document.positionAt(valuesNode!.offset).translate(0, 1);
    // make sure we get the completions for each variable to insert a full property
    let completions = (
      await verifyCompletionsContain(autoInstallEditor.document, position, '"arrayvar"', '"stringvar"')
    ).sort(compareCompletionItems);
    if (completions.length !== 2) {
      expect.fail('Expected 2 completions, got: ' + completions.map(i => i.label).join(', '));
    }
    expect(completions[0].kind, 'arrayvar.kind').to.equal(vscode.CompletionItemKind.Variable);
    expect(completions[0].detail, 'arrayvar.detail').to.equal('(NumberType[]) Array label');
    expect(completions[0].documentation, 'arrayvar.documentation').to.be.undefined;
    expect(completions[0].insertText, 'arrayvar.insertText').to.be.instanceOf(vscode.SnippetString);
    expect(completions[0].range, 'arrayvar.range').to.be.instanceOf(vscode.Range);
    expect(completions[1].kind, 'stringvar.kind').to.equal(vscode.CompletionItemKind.Variable);
    expect(completions[1].detail, 'stringvar.detail').to.equal('(StringType)');
    expect(completions[1].documentation, 'stringvar.documentation').to.equals('stringvar description');
    expect(completions[1].insertText, 'stringvar.insertText').to.be.instanceOf(vscode.SnippetString);
    expect(completions[1].range, 'stringvar.range').to.be.instanceOf(vscode.Range);

    // apply the arrayvar completion to add "arrayvar" to the values
    if (
      !(await autoInstallEditor.insertSnippet(
        completions[0].insertText as vscode.SnippetString,
        completions[0]!.range as vscode.Range
      ))
    ) {
      expect.fail(`Failed to apply completion item "${completions[0].label}"`);
    }
    // make sure still no diagnostics on auto-install.json
    await waitForDiagnostics(autoInstallEditor.document.uri, d => d?.length === 0);

    // re-parse and make sure arrayvar is in the appConfiguration.values
    autoInstallJson = parseTree(autoInstallEditor.document.getText());
    expect(autoInstallJson, 'autoInstallJson').to.not.be.undefined;
    const varNode = matchJsonNodeAtPattern(autoInstallJson, [
      'configuration',
      'appConfiguration',
      'values',
      'arrayvar'
    ]);
    expect(varNode, 'arrayvar node').to.not.be.undefined;
    // make the value of arrayvar is an empty array
    expect(varNode?.parent?.children?.[1], 'arrayvar value node').to.not.be.undefined;
    expect(varNode?.parent?.children?.[1].type, 'arrayvar value node type').to.equal('array');
    expect(varNode?.parent?.children?.[1].children?.length, 'arrayvar value node # children').to.equal(0);

    // this should be right at the first " in "arrayvar": []
    position = autoInstallEditor.document.positionAt(varNode!.parent!.children![0].offset);
    completions = (
      await verifyCompletionsContain(autoInstallEditor.document, position, '"arrayvar"', '"stringvar"')
    ).sort(compareCompletionItems);
    if (completions.length !== 2) {
      expect.fail('Expected 2 completions, got: ' + completions.map(i => i.label).join(', '));
    }
    // we should now get Variable code completions that should just replace the "arrayvar" part
    expect(completions[0].kind, 'arrayvar.kind').to.equal(vscode.CompletionItemKind.Variable);
    expect(completions[0].insertText, 'arrayvar.insertText').to.equal('"arrayvar"');
    expect(completions[1].kind, 'stringvar.kind').to.equal(vscode.CompletionItemKind.Variable);
    expect(completions[1].insertText, 'stringvar.insertText').to.equal('"stringvar"');

    // also, make sure that other completions items (like the New variable snippet items from
    // NewVariableCompletionItemProviderDelegate) don't bleed over
    position = autoInstallEditor.document.positionAt(autoInstallJson!.offset).translate(0, 1);
    completions = (await getCompletionItems(autoInstallEditor.document.uri, position)).items;
    if (completions.some(c => NEW_VARIABLE_SNIPPETS.some(s => c.label === s.label))) {
      expect.fail(
        'New variable completions items should not be in root completions: ' + completions.map(c => c.label).join(', ')
      );
    }
  });
});
