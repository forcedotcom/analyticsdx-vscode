/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { JSONPath, parseTree } from 'jsonc-parser';
import { posix as path } from 'path';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { ExtensionType as TemplateExtensionType } from '../../src';
import { EXTENSION_ID, TEMPLATE_JSON_LANG_ID } from '../../src/constants';
import { TemplateEditingManager } from '../../src/templateEditing';
import { TemplateLinterManager } from '../../src/templateLinter';
import { matchJsonNodeAtPattern } from '../../src/util/jsoncUtils';
import { findTemplateInfoFileFor } from '../../src/util/templateUtils';
import { uriBasename, uriRelPath } from '../../src/util/vscodeUtils';
import { waitFor } from '../testutils';

// the tests here open vscode against /test-assets/sfdx-simple,
// so all paths should be relative to that
export const waveTemplatesUriPath = path.join('force-app', 'main', 'default', 'waveTemplates');

export async function closeAllEditors(): Promise<void> {
  // async/await to get it as a real Promise
  return await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export function waitForExtensionActive<T>(
  id: string,
  forceActive = true,
  pauseMs = 500,
  timeoutMs = 10000
): Promise<vscode.Extension<T>> {
  let didActivate = false;
  // wait upto 10s for the extension to activate
  return waitFor(
    () => {
      const ext = vscode.extensions.getExtension<T>(id);
      if (!ext) {
        throw new Error(`Failed to find extension ${id}`);
      }
      if (!ext.isActive && forceActive && !didActivate) {
        ext.activate();
        didActivate = true;
      }
      return ext;
    },
    ext => ext && ext.isActive,
    {
      pauseMs,
      timeoutMs,
      timeoutMessage: `waitForExtensionActive(): timeout on ${id}`
    }
  );
}

export function waitForTemplateExtensionActive(pauseMs?: number, timeoutMs?: number) {
  return waitForExtensionActive<TemplateExtensionType>(EXTENSION_ID, true, pauseMs, timeoutMs);
}

export function uriFromTestRoot(...paths: string[]): vscode.Uri {
  const root = vscode.workspace.workspaceFolders![0];
  if (paths && paths.length) {
    return root.uri.with({
      path: path.join(root.uri.path, ...paths)
    });
  }
  return root.uri;
}

export async function getTemplateEditorManager() {
  const ext = (await waitForTemplateExtensionActive()).exports;
  // tslint:disable:no-unused-expression
  expect(ext, 'extension exports').to.not.be.undefined;
  expect(ext!.templateEditingManager, 'templateEditingManager').to.not.be.undefined;
  return ext!.templateEditingManager;
}

export function waitForTemplateEditorManagerHas(
  templateEditingManager: TemplateEditingManager,
  dir: vscode.Uri,
  expected: boolean
): Promise<boolean> {
  return waitFor(
    () => templateEditingManager.has(dir),
    has => has === expected,
    {
      pauseMs: 500,
      timeoutMs: 15000,
      timeoutMessage: () => `Timeout waiting for TemplateEditingManager.has(${dir}) to be ${expected}`
    }
  );
}

export async function getTemplateLinterManager() {
  const ext = (await waitForTemplateExtensionActive()).exports;
  // tslint:disable:no-unused-expression
  expect(ext, 'extension exports').to.not.be.undefined;
  expect(ext!.templateLinterManager, 'templateLinterManager').to.not.be.undefined;
  return ext!.templateLinterManager;
}

export function waitForTemplateLinterManagerIsQuiet(
  linterManager: TemplateLinterManager,
  expected = true
): Promise<boolean> {
  return waitFor(
    () => linterManager.isQuiet,
    quiet => quiet === expected,
    {
      // check this state a little more often than the linter timer runs
      pauseMs: TemplateLinterManager.LINT_DEBOUNCE_MS - 100,
      timeoutMs: 15000,
      timeoutMessage: () => `Timeout waiting for TemplateLinterManager.isQuiet to be ${expected}`
    }
  );
}

/** Utility function to sort diagnostics by their start position in the file. */
export function sortDiagnostics(d1: vscode.Diagnostic, d2: vscode.Diagnostic) {
  let i = d1.range.start.line - d2.range.start.line;
  if (i !== 0) {
    return i;
  }
  i = d1.range.start.character - d2.range.start.character;
  if (i !== 0) {
    return i;
  }
  return d1.message.localeCompare(d2.message);
}

export async function openFile(uri: vscode.Uri, show?: true): Promise<[vscode.TextDocument, vscode.TextEditor]>;
export async function openFile(uri: vscode.Uri, show: false): Promise<[vscode.TextDocument, undefined]>;
export async function openFile(
  uri: vscode.Uri,
  show: boolean
): Promise<[vscode.TextDocument, vscode.TextEditor | undefined]>;
export async function openFile(
  uri: vscode.Uri,
  show = true
): Promise<[vscode.TextDocument, vscode.TextEditor | undefined]> {
  const doc = await vscode.workspace.openTextDocument(uri);
  // if we're opening a template json file, wait for the editor manager to kick in and switch the language id
  if ((await findTemplateInfoFileFor(doc.uri)) && (doc.languageId === 'json' || doc.languageId === 'jsonc')) {
    await waitFor(
      () => doc.languageId,
      langId => langId === TEMPLATE_JSON_LANG_ID,
      {
        timeoutMessage: langId =>
          `Timeout waiting for ${doc.uri.path} language id to switch to ${TEMPLATE_JSON_LANG_ID} from ${langId}`
      }
    );
  }
  let editor: vscode.TextEditor | undefined;
  if (show) {
    // we need to give a column to have multiple editor open, otherwise it will always replace an active editor
    // (by closing the active editor)
    // TODO: figure out why this won't open a 2nd doc in a tab in the active column
    editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }
  return [doc, editor];
}

export function openTemplateInfo(
  relDirOrUri: string | vscode.Uri,
  show?: true
): Promise<[vscode.TextDocument, vscode.TextEditor]>;
export function openTemplateInfo(
  relDirOrUri: string | vscode.Uri,
  show: false
): Promise<[vscode.TextDocument, undefined]>;
export function openTemplateInfo(
  relDirOrUri: string | vscode.Uri,
  show: boolean
): Promise<[vscode.TextDocument, vscode.TextEditor | undefined]>;
export function openTemplateInfo(
  relDirOrUri: string | vscode.Uri,
  show = true
): Promise<[vscode.TextDocument, vscode.TextEditor | undefined]> {
  const uri =
    typeof relDirOrUri === 'string'
      ? uriFromTestRoot(waveTemplatesUriPath, relDirOrUri, 'template-info.json')
      : relDirOrUri;
  return openFile(uri, show);
}

export async function openFileAndWaitForDiagnostics(
  uri: vscode.Uri,
  show?: true,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined
): Promise<[vscode.Diagnostic[], vscode.TextDocument, vscode.TextEditor]>;
export async function openFileAndWaitForDiagnostics(
  uri: vscode.Uri,
  show: false,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined
): Promise<[vscode.Diagnostic[], vscode.TextDocument, undefined]>;
export async function openFileAndWaitForDiagnostics(
  uri: vscode.Uri,
  show: boolean,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined
): Promise<[vscode.Diagnostic[], vscode.TextDocument, vscode.TextEditor | undefined]>;
export async function openFileAndWaitForDiagnostics(
  uri: vscode.Uri,
  show = true,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined
): Promise<[vscode.Diagnostic[], vscode.TextDocument, vscode.TextEditor | undefined]> {
  const [doc, editor] = await openFile(uri, show);
  return [await waitForDiagnostics(doc.uri, filter), doc, editor];
}

export async function openTemplateInfoAndWaitForDiagnostics(
  relDirOrUri: string | vscode.Uri,
  show?: true,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined,
  filterDescription?: string
): Promise<[vscode.Diagnostic[], vscode.TextDocument, vscode.TextEditor]>;
export async function openTemplateInfoAndWaitForDiagnostics(
  relDirOrUri: string | vscode.Uri,
  show: false,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined,
  filterDescription?: string
): Promise<[vscode.Diagnostic[], vscode.TextDocument, undefined]>;
export async function openTemplateInfoAndWaitForDiagnostics(
  relDirOrUri: string | vscode.Uri,
  show: boolean,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined,
  filterDescription?: string
): Promise<[vscode.Diagnostic[], vscode.TextDocument, vscode.TextEditor | undefined]>;
export async function openTemplateInfoAndWaitForDiagnostics(
  relDirOrUri: string | vscode.Uri,
  show = true,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined,
  filterDescription?: string
): Promise<[vscode.Diagnostic[], vscode.TextDocument, vscode.TextEditor | undefined]> {
  const [doc, editor] = await openTemplateInfo(relDirOrUri, show);
  return [await waitForDiagnostics(doc.uri, filter, filterDescription), doc, editor];
}

const defDiagnosticFilter = (d: vscode.Diagnostic[] | undefined) => d && d.length > 0;
export async function waitForDiagnostics(
  uri: vscode.Uri,
  filter?: (d: vscode.Diagnostic[] | undefined) => boolean | undefined,
  filterDescription = `diagnostics on ${uri.toString()}`
): Promise<vscode.Diagnostic[]> {
  await vscode.commands.executeCommand('workbench.action.problems.focus');
  // if it's a template file, then presumably it just opened or some edits were made, so wait for the linter to finish
  // up any work it's doing
  if (await findTemplateInfoFileFor(uri)) {
    await waitForTemplateLinterManagerIsQuiet(await getTemplateLinterManager());
  }
  return waitFor(() => vscode.languages.getDiagnostics(uri), filter || defDiagnosticFilter, {
    timeoutMessage: diagnostics =>
      `Timeout waiting for: ${filterDescription}\nCurrent diagnostics:\n` + JSON.stringify(diagnostics, undefined, 2)
  });
}

type CreateTempTemplateParams = { show?: boolean; includeName?: boolean };
/** Create a temporary directory in waveTemplates/ and an empty template-info.json.
 * @param open true to open the template-info.json file
 * @param show true to open the editor on the template-info.json (if open == true); defaults to true
 * @param includeName true to set the name field in the template-info.json to the folder name; defaults to false
 * @param subdir optional sub directories paths under the temp directory, in which to create the template
 * @return the temp directory, and the document (if open == true) and the editor (if also show == true).
 */
export async function createTempTemplate(
  open: false,
  params?: CreateTempTemplateParams,
  ...subdirs: string[]
): Promise<[vscode.Uri, undefined, undefined]>;
export async function createTempTemplate(
  open: true,
  params?: { show?: true; includeName?: boolean },
  ...subdirs: string[]
): Promise<[vscode.Uri, vscode.TextDocument, vscode.TextEditor]>;
export async function createTempTemplate(
  open: true,
  params: { show: false; includeName?: boolean },
  ...subdirs: string[]
): Promise<[vscode.Uri, vscode.TextDocument, undefined]>;
export async function createTempTemplate(
  open: true,
  params?: CreateTempTemplateParams,
  ...subdirs: string[]
): Promise<[vscode.Uri, vscode.TextDocument, vscode.TextEditor | undefined]>;
export async function createTempTemplate(
  open: boolean,
  { show = true, includeName = false }: CreateTempTemplateParams = {},
  ...subdirs: string[]
): Promise<[vscode.Uri, vscode.TextDocument | undefined, vscode.TextEditor | undefined]> {
  const basedir = uriFromTestRoot(waveTemplatesUriPath);
  // Since tmpName() uses the filesystem directly, only supprt file:// uris, which is fine for now since
  // we're only running tests against a file system workspace
  expect(basedir.scheme, 'Base directry uri schema').to.equal('file');
  // Note: this prefix here is coordinated with the .gitignore in
  // /test-assets/sfdx-simple/force-app/main/default/waveTemplates so that
  // we don't accidently check in temp test files.
  // If you change this base name here, be sure to change that .gitignore
  const dir = await new Promise<vscode.Uri>((resolve, reject) => {
    // the folder name needs to be a valid dev name; tmpName() is supposed to only use alphanum chars
    tmp.tmpName({ tmpdir: basedir.fsPath, prefix: 'test_template_' }, (err, tmppath) => {
      if (err) {
        reject(err);
      } else {
        resolve(vscode.Uri.file(tmppath));
      }
    });
  });
  await vscode.workspace.fs.createDirectory(dir);
  let templateDir = dir;
  if (subdirs && subdirs.length) {
    for (const subdir of subdirs) {
      templateDir = templateDir.with({ path: path.join(templateDir.path, subdir) });
      await vscode.workspace.fs.createDirectory(templateDir);
    }
  }
  const file = templateDir.with({ path: path.join(templateDir.path, 'template-info.json') });
  // write the template-info.json file
  await writeTextToFile(file, includeName ? { name: uriBasename(templateDir) } : {});

  if (!open) {
    return [dir, undefined, undefined];
  }
  const [doc, editor] = await openTemplateInfo(file, show);
  return [dir, doc, editor];
}

export function writeTextToFile(file: vscode.Uri, textOrObj: string | object): Thenable<void> {
  const text = typeof textOrObj === 'string' ? textOrObj : JSON.stringify(textOrObj, undefined, 2);
  const buf = Buffer.from(text, 'utf-8');
  return vscode.workspace.fs.writeFile(file, new Uint8Array(buf));
}

export function writeEmptyJsonFile(file: vscode.Uri): Thenable<void> {
  return writeTextToFile(file, '{}');
}

export type PathFieldAndJson = {
  // pass in a either top-level field name, or a function that will inject the appropriate structure into the
  // template-info json structure
  field: string | ((json: any, path: string) => void);
  path: string;
  initialJson: string | object;
};
/** Create a template with related file(s) configured.
 * @param files the related file(s) information
 * @returns the template folder uri and related file editors
 */
export async function createTemplateWithRelatedFiles(
  ...files: PathFieldAndJson[]
): Promise<[vscode.Uri, vscode.TextEditor[]]> {
  const [tmpdir] = await createTempTemplate(false);
  // make an empty template
  const templateUri = uriRelPath(tmpdir, 'template-info.json');
  const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
  const templateJson: { [key: string]: any } = {};
  // create the related file(s)
  const editors = await Promise.all(
    files.map(async file => {
      const uri = uriRelPath(tmpdir!, file.path);
      await writeEmptyJsonFile(uri);
      const [, editor] = await openFile(uri);
      await setDocumentText(editor, file.initialJson);
      // but since it's not reference by the template-info.json, it should have no errors
      await waitForDiagnostics(editor.document.uri, d => d && d.length === 0, `No initial diagnostics on ${file.path}`);
      // inject the attribute into the template-info json
      if (typeof file.field === 'string') {
        templateJson[file.field] = file.path;
      } else {
        file.field(templateJson, file.path);
      }
      return editor;
    })
  );

  // now, hookup the related file(s)
  await setDocumentText(templateEditor, templateJson);
  return [tmpdir, editors];
}

export function findPositionByJsonPath(doc: vscode.TextDocument, path: JSONPath): vscode.Position | undefined {
  const root = parseTree(doc.getText());
  const node = matchJsonNodeAtPattern(root, path);
  if (node) {
    return doc.positionAt(node.offset);
  }
  return undefined;
}

export function getWholeDocumentRange(document: vscode.TextDocument): vscode.Range {
  const end = document.lineAt(document.lineCount - 1).range.end;
  return new vscode.Range(new vscode.Position(0, 0), end);
}

export async function setDocumentText(editor: vscode.TextEditor, textOrObj: string | object): Promise<void> {
  const text = typeof textOrObj === 'string' ? textOrObj : JSON.stringify(textOrObj, undefined, 2);
  const result = await editor.edit(edit => {
    const range = getWholeDocumentRange(editor.document);
    edit.replace(range, text);
  });
  if (!result) {
    expect.fail('Failed to set text for ' + editor.document.uri.toString());
  }
}

export function getCompletionItemLabelText(item: vscode.CompletionItem): string {
  return typeof item.label === 'string' ? item.label : item.label.label;
}

export function compareCompletionItems(l1: vscode.CompletionItem, l2: vscode.CompletionItem): number {
  return getCompletionItemLabelText(l1).localeCompare(getCompletionItemLabelText(l2));
}

export async function getCompletionItems(uri: vscode.Uri, position: vscode.Position): Promise<vscode.CompletionList> {
  const result = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    uri,
    position
  );
  if (!result) {
    expect.fail('Expected vscode.CompletionList, got undefined');
  }
  return result!;
}

export async function verifyCompletionsContain(
  document: vscode.TextDocument,
  position: vscode.Position,
  ...expectedLabels: string[]
): Promise<vscode.CompletionItem[]> {
  const list = await getCompletionItems(document.uri, position);
  const labels = list.items.map(item => item.label);
  expect(labels, 'completion items').to.include.members(expectedLabels);
  // also we shouldn't get any duplicate code completion items (which can come if something else, like the default
  // json language service, is injecting extra stuff into our document type).
  const dups: string[] = [];
  list.items
    .reduce((m, val) => {
      const text = getCompletionItemLabelText(val);
      return m.set(text, (m.get(text) || 0) + 1);
    }, new Map<string, number>())
    .forEach((num, label) => {
      if (num >= 2) {
        dups.push(label);
      }
    });
  if (dups.length > 0) {
    expect.fail('Found duplicate completion items: ' + dups.join(', '));
  }
  return list.items;
}

export async function getDefinitionLocations(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]> {
  const result = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeDefinitionProvider',
    uri,
    position
  );
  if (!result) {
    expect.fail('Expected vscode.Location[], got undefined');
  }
  return result!;
}

export async function getCodeActions(uri: vscode.Uri, range: vscode.Range): Promise<vscode.CodeAction[]> {
  const result = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    uri,
    range
  );
  if (!result) {
    expect.fail('Expected vscode.CodeAction[], got undefined');
  }
  return result!;
}

export async function getHovers(uri: vscode.Uri, range: vscode.Position): Promise<vscode.Hover[]> {
  const result = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, range);
  if (!result) {
    expect.fail('Expected vscode.Hover[], got undefined');
  }
  return result!;
}
