/*
 * Copyright (c) 2020, salesforce.com, inc.
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
  createTemplateWithRelatedFiles as _createTemplateWithRelatedFiles,
  verifyCompletionsContain,
  waitForDiagnostics
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('variables-schema.json hookup', () => {
  describe('has correct code completions for variableType', () => {
    let tmpdir: vscode.Uri;
    beforeEach(closeAllEditors);
    afterEach(async () => {
      await closeAllEditors();
      if (tmpdir) {
        await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
      }
    });

    async function createTemplateWithVariable(name: string, type: string) {
      const initialJson: any = {
        error: 'This should cause a schema error to look for'
      };
      initialJson[name] = {
        variableType: {
          type
        }
      };
      const [dir, editors] = await _createTemplateWithRelatedFiles({
        field: 'variableDefinition',
        path: 'variables.json',
        initialJson
      });
      // save off the temp directory so it'll get deleted
      tmpdir = dir;
      // return the variable editor
      return editors[0];
    }

    // make sure the doNotSuggest logic in variables-schema.json for the type-specific fields in variableType works
    [
      // these types should see some available completions in the variableType {}
      { type: 'StringType', expected: ['enums'] } as { type: string; expected: string[]; initialErrorsCount?: number },
      { type: 'NumberType', expected: ['enums', 'min', 'max'] },
      { type: 'SobjectFieldType', expected: ['dataType'] },
      { type: 'ArrayType', expected: ['itemsType', 'sizeLimit'], initialErrorsCount: 2 },
      { type: 'ConnectorType', expected: ['connectorType'] },
      { type: 'ObjectType', expected: ['properties', 'required', 'strictValidation'] },
      // these types should not
      { type: 'BooleanType', expected: [] },
      { type: 'DateTimeType', expected: [] },
      { type: 'DatasetType', expected: [] },
      { type: 'DatasetDimensionType', expected: [] },
      { type: 'DatasetMeasureType', expected: [] },
      { type: 'DatasetDateType', expected: [] },
      { type: 'DatasetAnyFieldType', expected: [] },
      { type: 'SobjectType', expected: [] },
      { type: 'InvalidType', expected: [], initialErrorsCount: 2 }
    ].forEach(({ type, expected, initialErrorsCount }) => {
      it(type, async () => {
        const varName = `${type}Var`;
        const variablesEditor = await createTemplateWithVariable(varName, type);
        await waitFor(
          () => variablesEditor.document.languageId,
          lang => lang === TEMPLATE_JSON_LANG_ID,
          { timeoutMessage: 'timeout waiting for variables.json languageId' }
        );
        await waitForDiagnostics(
          variablesEditor.document.uri,
          d => d && d.length === (initialErrorsCount ?? 1),
          'initial error on variables.json'
        );

        const tree = parseTree(variablesEditor.document.getText());
        // find the variableType {} in the json
        const varType = tree && findNodeAtLocation(tree, [varName, 'variableType']);
        expect(varType, `${varName}.variableType`).to.not.be.undefined;
        // go right after the opening brace
        const position = variablesEditor.document.positionAt(varType!.offset + 1);
        await verifyCompletionsContain(variablesEditor.document, position, ...expected);
      });
    });
  }); // describe('has correct code-completions for variableType')
});
