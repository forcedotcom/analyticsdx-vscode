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
  createTemplateWithRelatedFiles,
  verifyCompletionsContain,
  waitForDiagnostics
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('variables-schema.json hookup', () => {
  let tmpdir: vscode.Uri;
  beforeEach(closeAllEditors);
  afterEach(async () => {
    await closeAllEditors();
    if (tmpdir) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
  });

  async function createTemplateWithVariables(initialJson: any) {
    const [dir, editors] = await createTemplateWithRelatedFiles({
      field: 'variableDefinition',
      path: 'variables.json',
      initialJson
    });
    // save off the temp directory so it'll get deleted
    tmpdir = dir;
    // return the variable editor
    return editors[0];
  }

  describe('has correct code completions for variableType', () => {
    async function createTemplateWithVariableType(name: string, type: string) {
      const initialJson: any = {
        error: 'This should cause a schema error to look for',
        [name]: {
          variableType: {
            type
          }
        }
      };
      return createTemplateWithVariables(initialJson);
    }

    // make sure the doNotSuggest logic in variables-schema.json for the type-specific fields in variableType works
    [
      // these types should see some available completions in the variableType {}
      { type: 'StringType', expected: ['enums', 'enumsLabels'] } as {
        type: string;
        expected: string[];
        initialErrorsCount?: number;
      },
      { type: 'NumberType', expected: ['enums', 'enumsLabels', 'min', 'max', 'format', 'scale'] },
      { type: 'SobjectFieldType', expected: ['dataType'] },
      { type: 'DataLakeObjectFieldType', expected: ['dataType'] },
      { type: 'DataModelObjectFieldType', expected: ['dataType'] },
      { type: 'CalculatedInsightFieldType', expected: ['dataType', 'fieldType'] },
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
        const variablesEditor = await createTemplateWithVariableType(varName, type);
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

  it('has code-completions for connectorType', async () => {
    const variablesEditor = await createTemplateWithVariables({
      error: 'an initial error to look for',
      connectorVar: { variableType: { type: 'ConnectorType', connectorType: '' } }
    });
    await waitFor(
      () => variablesEditor.document.languageId,
      lang => lang === TEMPLATE_JSON_LANG_ID,
      { timeoutMessage: 'timeout waiting for variables.json languageId' }
    );
    await waitForDiagnostics(variablesEditor.document.uri, d => d?.length === 1, 'initial error on variables.json');
    const tree = parseTree(variablesEditor.document.getText());
    // find the variableType {} in the json
    const connectorType = tree && findNodeAtLocation(tree, ['connectorVar', 'variableType', 'connectorType']);
    expect(connectorType, `connectorType node`).to.not.be.undefined;
    expect(connectorType!.parent, `connectorType prop node`).to.not.be.undefined;
    expect(connectorType!.parent!.colonOffset, `connectorType colonOffset`).to.not.be.undefined;
    // go right after the colon
    const position = variablesEditor.document.positionAt(connectorType!.parent!.colonOffset! + 1);
    // check that it has some of the known connector types from the schema
    await verifyCompletionsContain(
      variablesEditor.document,
      position,
      '"ActCRM"',
      '"AmazonS3"',
      '"Redshift"',
      '"SalesforceReport"',
      '"SfdcLocal"',
      // and null and empty string shoudl be in the completions too
      'null',
      '""'
    );
  });

  it('has code-completions for format', async () => {
    const variablesEditor = await createTemplateWithVariables({
      error: 'an initial error to look for',
      numVar: { variableType: { type: 'NumberType', format: 'Decimal' } }
    });
    await waitFor(
      () => variablesEditor.document.languageId,
      lang => lang === TEMPLATE_JSON_LANG_ID,
      { timeoutMessage: 'timeout waiting for variables.json languageId' }
    );
    await waitForDiagnostics(variablesEditor.document.uri, d => d?.length === 1, 'initial error on variables.json');
    const tree = parseTree(variablesEditor.document.getText());
    // find the variableType {} in the json
    const numVarFormat = tree && findNodeAtLocation(tree, ['numVar', 'variableType', 'format']);
    expect(numVarFormat, `format node`).to.not.be.undefined;
    expect(numVarFormat!.parent, `format prop node`).to.not.be.undefined;
    expect(numVarFormat!.parent!.colonOffset, `format colonOffset`).to.not.be.undefined;
    // go right after the colon
    const position = variablesEditor.document.positionAt(numVarFormat!.parent!.colonOffset! + 1);
    // check that it has some of the known connector types from the schema
    await verifyCompletionsContain(
      variablesEditor.document,
      position,
      '"Currency"',
      '"Decimal"',
      '"Percent"',
      '"PercentFixed"'
    );
  });
});
