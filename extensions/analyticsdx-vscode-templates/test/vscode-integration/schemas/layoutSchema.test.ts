/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TEMPLATE_JSON_LANG_ID } from '../../../src/constants';
import { waitFor } from '../../testutils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles,
  verifyCompletionsContain,
  waitForDiagnostics
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('layout-schema.json hookup', () => {
  let tmpdir: vscode.Uri;
  beforeEach(closeAllEditors);
  afterEach(async () => {
    await closeAllEditors();
    if (tmpdir) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
  });

  async function createTemplateWithLayout(initialJson: any) {
    const [dir, editors] = await createTemplateWithRelatedFiles(
      {
        field: 'layoutDefinition',
        path: 'layout.json',
        initialJson
      },
      {
        field: 'variablesDefinition',
        path: 'variables.json',
        initialJson: {
          foo: { variableType: { type: 'StringType' } }
        }
      }
    );
    // save off the temp directory so it'll get deleted
    tmpdir = dir;
    // return the layout editor
    return editors[0];
  }

  describe('has correct code completions for item type', () => {
    async function createTemplateWithItemType(type: string) {
      const initialJson: any = {
        error: 'This should cause a schema error to look for',
        pages: [
          {
            title: '',
            layout: {
              type: 'SingleColumn',
              center: {
                items: [{ type }]
              }
            }
          }
        ]
      };
      return createTemplateWithLayout(initialJson);
    }

    // make sure the doNotSuggest logic in layout-schema.json for the type-specific fields in panel items works
    [
      // these types should see some available completions in the item (plus visibility)
      { type: 'Variable', expected: ['name'] },
      { type: 'Image', expected: ['image'] },
      { type: 'Text', expected: ['text'] },
      { type: 'GroupBox', expected: ['text', 'description', 'items'] }
    ].forEach(({ type, expected }) => {
      it(type, async () => {
        const layoutEditor = await createTemplateWithItemType(type);
        await waitFor(
          () => layoutEditor.document.languageId,
          lang => lang === TEMPLATE_JSON_LANG_ID,
          { timeoutMessage: 'timeout waiting for layout.json languageId' }
        );
        await waitForDiagnostics(
          layoutEditor.document.uri,
          // there should be the 'error' error and one about the missing item field
          d => d && d.length >= 2,
          'initial errors on layout.json'
        );

        const tree = parseTree(layoutEditor.document.getText());
        // find the variableType {} in the json
        const typeNode = tree && findNodeAtLocation(tree, ['pages', 0, 'layout', 'center', 'items', 0, 'type']);
        expect(typeNode, 'name').to.not.be.undefined;
        // go right at the start of the item's json (just before "type": "...")
        const position = layoutEditor.document.positionAt(typeNode!.parent!.offset + 1);
        await verifyCompletionsContain(layoutEditor.document, position, ...expected.concat('visibility'));
      });
    });
  });
});
