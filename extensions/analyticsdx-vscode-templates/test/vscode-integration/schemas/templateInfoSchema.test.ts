/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { scanLinesUntil } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  getCompletionItems,
  openTemplateInfo,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  waitForDiagnostics
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('template-info-schema.json hookup', () => {
  beforeEach(closeAllEditors);
  afterEach(closeAllEditors);

  // this is really just testing that vscode is picking up our schema on template-info.json's --
  // these diagnostics comes from vscode
  it('shows problems on empty file', async () => {
    const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('emptyTemplateInfo');
    const map = new Map(diagnostics.map(i => [i.message, i]));
    // there should be a warning for each these fields being missing
    [
      'name',
      'label',
      'assetVersion',
      'releaseInfo',
      'rules',
      'dashboards',
      'lenses',
      'eltDataflows',
      'externalFiles'
    ].forEach(name => {
      const d = map.get('Missing property "' + name + '".');
      expect(d, name + ' diagnostic missing').to.be.not.undefined;
      expect(d!.severity, name + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
      map.delete(d!.message);
    });
    if (map.size !== 0) {
      expect.fail(
        'Got ' + map.size + ' unexpected diangotics:\n' + JSON.stringify(Array.from(map.values()), undefined, 2)
      );
    }
  });

  it('shows problems on Simple_Dashboard template', async () => {
    const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Simple_Dashboard');
    if (diagnostics.length !== 1) {
      expect.fail(
        'Expected 1 diagnostic, got ' + diagnostics.length + ':\n' + JSON.stringify(diagnostics, undefined, 2)
      );
    }
    expect(diagnostics[0].message, 'diagnostic message').to.be.equals(
      "Deprecated - use 'icons.templateBadge' instead."
    );
    // this is also testing the positive case for linter.js's file-path checks since there are no warnings about them,
    // and that the allowComments: true in the schema works in VSCode
  });

  describe('has snippet for', () => {
    async function testCompletions(docText: string, scanForChar: string, scanStartLine: number, expectedLabel: string) {
      const [document, editor] = await openTemplateInfo('empty');
      expect(editor, 'editor').to.not.be.undefined;
      await setDocumentText(editor!, docText);
      // this should also make it wait for the json completion provider(s) to be ready
      await waitForDiagnostics(document.uri);
      // scan for the trigger location character in case any reformatting happened on edit
      const { end, ch } = scanLinesUntil(document, ch => ch === scanForChar, new vscode.Position(scanStartLine, 0));
      if (ch !== scanForChar) {
        expect.fail(`Failed to find '${scanForChar}' in document text: ` + document.getText());
      }
      const list = await getCompletionItems(editor!.document.uri, end.translate({ characterDelta: 1 }));
      const found = list.items.some(item => item.label === expectedLabel);
      if (!found) {
        expect.fail(`Failed to find "${expectedLabel}" in [` + list.items.map(item => item.label).join(', ') + ']');
      }
    }

    // verify each top-level field that has a snippet
    ['releaseInfo', 'rules', 'apexCallback', 'tags'].forEach(name => {
      it(name, async () => {
        await testCompletions(`{\n  "${name}": \n}`, ':', 1, `New ${name}`);
      });
    });

    // verify each array field that has a snippet for the array values
    [
      ['rules', 'rule'],
      ['dashboards', 'dashboard'],
      ['lenses', 'lens'],
      ['eltDataflows', 'dataflow'],
      ['externalFiles', 'externalFile'],
      ['datasetFiles', 'dataset'],
      ['imageFiles', 'imageFile'],
      ['storedQueries', 'storedQuery'],
      ['customAttributes', 'customAttribute'],
      ['templateDependencies', 'templateDependency']
    ].forEach(([name, completionName]) => {
      it(name, async () => {
        await testCompletions(`{\n  "${name}": []\n}`, '[', 1, `New ${completionName}`);
      });
    });

    // verify the other nested ones
    it('extendedTypes', async () => {
      await testCompletions('{\n  "extendedTypes": {\n    "visualforce": []\n  }\n}', '[', 2, 'New extendedType');
    });
    ['appBadge', 'templateBadge', 'templateDetail'].forEach(name => {
      it('icons.' + name, async () => {
        await testCompletions(`{\n  "icons": {\n    "${name}": \n  }\n}`, ':', 2, 'New icon');
      });
    });
    it('icons.templatePreviews', async () => {
      await testCompletions('{\n  "icons": {\n    "templatePreviews": []\n  }\n}', '[', 2, 'New icon');
    });
  });
});
