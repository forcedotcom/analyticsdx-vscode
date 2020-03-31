/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { JSONPath } from 'jsonc-parser';
import * as vscode from 'vscode';
import { TEMPLATE_INFO } from '../../../src/constants';
import { JsonAttributeRelFilePathDefinitionProvider } from '../../../src/util/definitions';
import { jsonPathToString } from '../../../src/util/jsoncUtils';
import { closeAllEditors, findPositionByJsonPath, openTemplateInfo } from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
// this is really a unit test of JsonAttributeRelFilePathDefinitionProvider
describe('JsonAttributeRelFilePathDefinitionProvider', () => {
  let cancellationTokenSource: vscode.CancellationTokenSource;

  beforeEach(async () => {
    await closeAllEditors();
    cancellationTokenSource = new vscode.CancellationTokenSource();
  });

  afterEach(async () => {
    await closeAllEditors();
    if (cancellationTokenSource) {
      cancellationTokenSource.dispose();
    }
  });

  it('matches valid relative path on matching jsonpath patterns', async () => {
    const [doc] = await openTemplateInfo('allRelpaths');
    // map of jsonpath in the template-info.json to expected relative path value
    const expectedDefs = new Map<JSONPath, string>([
      [['variableDefinition'] as JSONPath, 'variables.json'],
      [['uiDefinition'], 'ui.json'],
      [['folderDefinition'], 'folder.json'],
      [['ruleDefinition'], 'rule-definition.json'],
      [['rules', 0, 'file'], 'template-to-app-rules.json'],
      [['rules', 1, 'file'], 'app-to-template-rules.json'],
      [['externalFiles', 0, 'file'], 'externalFiles/externalFile.csv'],
      [['externalFiles', 0, 'schema'], 'externalFiles/schema.json'],
      [['externalFiles', 0, 'userXmd'], 'externalFiles/userXmd.json'],
      [['lenses', 0, 'file'], 'lenses/lens.json'],
      [['dashboards', 0, 'file'], 'dashboards/dashboard.json'],
      [['eltDataflows', 0, 'file'], 'dataflows/dataflow.json'],
      [['storedQueries', 0, 'file'], 'queries/query.json'],
      [['datasetFiles', 0, 'userXmd'], 'datasets/userXmd.json'],
      [['extendedTypes', 'discoveryStories', 0, 'file'], 'stories/story.json'],
      [['imageFiles', 0, 'file'], 'images/image.png']
    ]);

    const provider = new JsonAttributeRelFilePathDefinitionProvider(TEMPLATE_INFO.allRelFilePathLocationPatterns);

    for (const path of expectedDefs.keys()) {
      const pathStr = jsonPathToString(path);
      // find the Position of the field in the json
      const position = findPositionByJsonPath(doc, path);
      expect(position, pathStr + ' position').to.be.not.undefined;

      // api for doing F12 on field at the jsonpath
      const definition = await provider.provideDefinition(doc, position!, cancellationTokenSource.token);

      expect(definition, pathStr + ' definition').to.be.not.undefined;
      expect(definition, pathStr + ' definition').to.be.instanceOf(vscode.Location);
      const location = definition as vscode.Location;
      const expectedRelPath = expectedDefs.get(path);
      if (!location.uri.path.endsWith('/allRelpaths/' + expectedRelPath)) {
        expect.fail(
          'Exepcted ' +
            pathStr +
            ' definition to end with /allRelpaths/' +
            expectedRelPath +
            ', got ' +
            location.uri.path
        );
      }
    }
  });

  it("doesn't match on no matching jsonpath pattern", async () => {
    const [doc] = await openTemplateInfo('allRelpaths');
    // find the Position of the "assetVersion" field in the json
    const position = findPositionByJsonPath(doc, ['assetVersion']);
    expect(position, '"assetVersion" position').to.be.not.undefined;

    // make a provider that doesn't match on "assetVersion" (which this shouldn't)
    const provider = new JsonAttributeRelFilePathDefinitionProvider(TEMPLATE_INFO.allRelFilePathLocationPatterns);
    // api for doing F12 on "assetVersion" value
    const definition = await provider.provideDefinition(doc, position!, cancellationTokenSource.token);
    // since the path in the provider isn't the path at the position, we should get undefined
    expect(definition, 'definition').to.be.undefined;
  });

  // these are the jsonpaths to fields in badFilepaths/template-info.json that have invalid rel paths,
  // make a test that checks each one doesn't return a location
  [
    ['releaseInfo', 'notesFile'] as JSONPath,
    ['datasetFiles', 0, 'userXmd'],
    ['extendedTypes', 'discoveryStories', 0, 'file'],
    ['imageFiles', 0, 'file']
  ].forEach(path => {
    const pathStr = jsonPathToString(path);
    const provider = new JsonAttributeRelFilePathDefinitionProvider(TEMPLATE_INFO.allRelFilePathLocationPatterns);
    it("doesn't match on invalid relative path at " + pathStr, async () => {
      const [doc] = await openTemplateInfo('badFilepaths');
      // find the Position of the jsonpath in the json
      const position = findPositionByJsonPath(doc, path);
      expect(position, pathStr + ' position').to.be.not.undefined;

      // api for doing F12 on the jsonpath's value
      const definition = await provider.provideDefinition(doc, position!, cancellationTokenSource.token);
      // since the path in the provider is either empty, absolute, or has '..', we should get no definition
      expect(definition, pathStr + ' definition').to.be.undefined;
    });
  });
});
