/*
 * Copyright (c) 2023, salesforce.com, inc.
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
describe('readiness-schema.json hookup', () => {
  let tmpdir: vscode.Uri;
  beforeEach(closeAllEditors);
  afterEach(async () => {
    await closeAllEditors();
    if (tmpdir) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
  });

  async function createTemplateWithReadiness(initialJson: any) {
    const [dir, editors] = await createTemplateWithRelatedFiles({
      field: 'readinessDefinition',
      path: 'readiness.json',
      initialJson
    });
    // save off the temp directory so it'll get deleted
    tmpdir = dir;
    // return the layout editor
    return editors[0];
  }

  describe('has correct code completions for definition type', () => {
    async function createTemplateWithDefinitionType(type: string) {
      const initialJson: any = {
        error: 'This should cause a schema error to look for',
        definition: { foo: { type } }
      };
      return createTemplateWithReadiness(initialJson);
    }

    // make sure the doNotSuggest logic in readiness-schema.json for the type-specific fields in definitionProps works
    [
      { type: 'SobjectRowCount', expected: ['sobject', 'filters'] },
      { type: 'OrgDatasetRowCount', expected: ['dataset', 'filters'] },
      { type: 'AppDatasetRowCount', expected: ['dataset', 'filters'] },
      { type: 'DataCloudRowCount', expected: ['object', 'filters'] },
      { type: 'OrgPreferenceCheck', expected: ['names'] },
      { type: 'ApexCallout', expected: ['method', 'arguments'] }
    ].forEach(({ type, expected }) => {
      it(type, async () => {
        const readinessEditor = await createTemplateWithDefinitionType(type);
        await waitFor(
          () => readinessEditor.document.languageId,
          lang => lang === TEMPLATE_JSON_LANG_ID,
          { timeoutMessage: 'timeout waiting for readiness.json languageId' }
        );
        await waitForDiagnostics(
          readinessEditor.document.uri,
          // there should be the 'error' error and one about the missing field(s) on the definition
          d => d && d.length >= 2,
          'initial errors on readiness.json'
        );

        const tree = parseTree(readinessEditor.document.getText());
        // find the type {} in the json
        const typeNode = tree && findNodeAtLocation(tree, ['definition', 'foo', 'type']);
        expect(typeNode, 'name').to.not.be.undefined;
        // go right at the start of the definition's json (just before "type": "...")
        const position = readinessEditor.document.positionAt(typeNode!.parent!.offset + 1);
        await verifyCompletionsContain(readinessEditor.document, position, ...expected);
      });
    });
  });
});
