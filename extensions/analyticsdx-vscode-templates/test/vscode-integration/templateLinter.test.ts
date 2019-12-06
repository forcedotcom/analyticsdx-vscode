/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { uriStat } from '../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  openFile,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  waitForDiagnostics,
  writeEmptyJsonFile
} from './vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateLinterManager', () => {
  let tmpdir: vscode.Uri | undefined;
  beforeEach(async () => {
    await closeAllEditors();
    tmpdir = undefined;
  });

  afterEach(async () => {
    await closeAllEditors();
    // delete the temp folder
    if (tmpdir && (await uriStat(tmpdir))) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
    tmpdir = undefined;
  });

  function failOnUnexpected(map: Map<any, vscode.Diagnostic>) {
    if (map.size !== 0) {
      expect.fail(
        'Got ' + map.size + ' unexpected diangotics:\n' + JSON.stringify(Array.from(map.values()), undefined, 2)
      );
    }
  }

  describe('lints template-info.json', () => {
    it('shows missing "dashboards" problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics(
        'Missing_dashboards_Dashboard',
        true,
        d => d && d.length >= 2
      );
      // filter out the 'Missing property "dashboards"' one from the schema, should just be the 1 warning
      const map = new Map(diagnostics.filter(d => !d.message.includes('Missing property')).map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having a dashboard
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows empty "dashboards" problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_dashboards_Dashboard');
      // there should just be a diagnostic on the dashboards field for not having a dashboard
      const map = new Map(diagnostics.map(i => [i.code, i]));
      const d = map.get('dashboards');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      map.delete('dashboards');

      failOnUnexpected(map);
    });

    it('shows multiple dashboards problem on dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Multiple_dashboards_Dashboard');
      // there should just be a diagnostic on the dashboards field for having mulitple
      const map = new Map(diagnostics.map(i => [i.code, i]));
      const d = map.get('dashboards');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals('Dashboard templates must have exactly 1 dashboard specified');
      map.delete('dashboards');

      failOnUnexpected(map);
    });

    it('shows problem on missing fields on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics(
        'Missing_required',
        true,
        d => d && d.length >= 3
      );
      // filter out the 'Missing property "..."' ones on dashboards and eltDataflows from the schema,
      // should just be the 1 warning
      const map = new Map(diagnostics.filter(d => !d.message.includes('Missing property')).map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having the fields
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      // on the missing fields, there shouldn't be any relatedInformations
      expect(d!.relatedInformation, 'relatedInformation').to.be.undefined;
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows empty arrays problem on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_required');
      const map = new Map(diagnostics.map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having the fields
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      // there should be related information for dashboards, datasets, and dataflows being empty
      expect(d!.relatedInformation, 'relatedInformation').to.be.not.undefined;
      if (d!.relatedInformation!.length !== 3) {
        expect.fail('Expected 3 relatedInformation, got ' + JSON.stringify(d!.relatedInformation, undefined, 2));
      }
      ['dashboards', 'datasets', 'dataflows'].forEach(name => {
        expect(d!.relatedInformation!.some(ri => ri.message === `Empty ${name} array`), name + ' related information')
          .to.be.true;
      });
      map.delete('templateType');

      failOnUnexpected(map);
    });

    it('shows problem on missing and empty fields on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Empty_and_missing_required');
      const map = new Map(diagnostics.map(i => [i.code, i]));
      // there should be a diagnostic on the templateType field for not having the fields
      const d = map.get('templateType');
      expect(d, 'missing dashboard diagnostic').to.be.not.undefined;
      expect(d!.message, 'message').to.be.equals(
        'App templates must have at least 1 dashboard, dataflow, or dataset specified'
      );
      // there should be relatedInformations for dashboards and datasets
      expect(d!.relatedInformation, 'relatedInformation').to.be.not.undefined;
      if (d!.relatedInformation!.length !== 2) {
        expect.fail('Expected 2 relatedInformation, got ' + JSON.stringify(d!.relatedInformation, undefined, 2));
      }
      ['dashboards', 'datasets'].forEach(name => {
        expect(
          d!.relatedInformation!.some(ri => ri.message === `Empty ${name} array`),
          name + ' related information to exist'
        ).to.be.true;
      });
      // but not for this dataflows (since it's missing in the json)
      expect(
        d!.relatedInformation!.some(ri => ri.message === 'Empty dataflows array'),
        'dataflows related information to exist'
      ).to.be.false;

      // there could also be a json-schema diagnostic that eltDataflows is missing, so don't failOnUnexpected()
    });

    it('shows file path problems on app template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('badFilepaths');
      // filter out the Deprecated warning on rulesDefinition for this test
      const map = new Map(diagnostics.filter(d => !d.message.includes('Deprecated')).map(i => [i.code, i]));
      // there should be a warning for each these fields about the file not existing
      [
        'variableDefinition',
        'uiDefinition',
        'folderDefinition',
        'ruleDefinition',
        'rules[0].file',
        'rules[1].file',
        'externalFiles[0].file',
        'externalFiles[0].schema',
        'externalFiles[0].userXmd',
        'lenses[0].file',
        'dashboards[0].file',
        'eltDataflows[0].file'
      ].forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.be.equals('Specified file does not exist in workspace');
        expect(d!.severity, path + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      // check for the ones complaining about non-relative or empty paths
      ['releaseInfo.notesFile', 'extendedTypes.visualforcePages[0].file', 'imageFiles[0].file'].forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.be.equals('Value should be a path relative to this file');
        expect(d!.severity, path + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      // the other expected errors
      const expected: Record<string, string> = {
        'datasetFiles[0].userXmd': "Path should not contain '..' parts",
        'storedQueries[0].file': 'Specified path is not a file'
      };
      Object.keys(expected).forEach(path => {
        const d = map.get(path);
        expect(d, path + ' diagnostic missing').to.be.not.undefined;
        expect(d!.message, path + ' diagnostic message').to.be.equals(expected[path]);
        expect(d!.severity, path + ' diagnostic severity').to.be.equals(vscode.DiagnosticSeverity.Warning);
        map.delete(path);
      });

      failOnUnexpected(map);
    });

    it("updates problems on missing related file when it's created and deleted", async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // now, set the variableDefinition to a file that doesn't exist
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
      const origNumDiagnostics = (await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.length >= 1 &&
          diagnostics.some(
            d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
          ),
        'Inital diagnostic on bad variableDefinition file'
      )).length;

      // create variables.json
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      // and the diagnostic should go away
      await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.length < origNumDiagnostics &&
          !diagnostics.some(
            d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
          ),
        'No more variableDefinition diagnostic after creating variables.json'
      );

      // delete variables.json
      await vscode.workspace.fs.delete(variablesUri, { useTrash: false });
      // and the diagnostic should come back
      await waitForDiagnostics(
        templateUri,
        diagnostics =>
          diagnostics &&
          diagnostics.some(
            d => d.code === 'variableDefinition' && d.message === 'Specified file does not exist in workspace'
          ),
        'Diagnostic on variableDefinition should exist after deleting variables.json'
      );
    });
  }); // describe('lints template-info.json')

  describe('lints variables.json', () => {
    it('shows problem on mulitple regex variable excludes', async () => {
      [tmpdir] = await createTempTemplate(false);
      // make an empty template
      const templateUri = tmpdir.with({ path: path.join(tmpdir.path, 'template-info.json') });
      const [, , templateEditor] = await openTemplateInfoAndWaitForDiagnostics(templateUri, true);
      // create a variables.json with some content that has 2 regex excludes
      const variablesUri = tmpdir.with({ path: path.join(tmpdir.path, 'variables.json') });
      await writeEmptyJsonFile(variablesUri);
      const [variablesDoc, variablesEditor] = await openFile(variablesUri);
      await setDocumentText(
        variablesEditor,
        JSON.stringify(
          {
            foovar: {
              description: 'mulitple regex excludes',
              excludes: ['/^(?:(?!__c).)*$/', 'Event', '/(?!^Case$|^Account$|^Contact$)(^.*$)/'],
              variableType: {
                type: 'SobjectFieldType'
              }
            }
          },
          undefined,
          2
        )
      );
      // but since it's not reference by the template-info.json, it should have no errors
      await waitForDiagnostics(variablesDoc.uri, d => d && d.length === 0, 'No initial diagnostics on variables.json');

      // now, hookup the variables.json to the template-info.json
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
      const diagnostics = await waitForDiagnostics(variablesDoc.uri);
      if (diagnostics.length !== 1) {
        expect.fail('Expected 1 diagnostic, got:\n' + JSON.stringify(diagnostics, undefined, 2));
      }
      const diagnostic = diagnostics[0];
      expect(diagnostic, 'diagnostic').to.not.be.undefined;
      expect(diagnostic.message, 'diagnostic.message').to.equal(
        'Multiple regular expression excludes found, only the first will be used'
      );

      // fix variables.json, make sure diagnostic goes away
      await setDocumentText(
        variablesEditor,
        JSON.stringify(
          {
            foovar: {
              description: 'mulitple regex excludes',
              excludes: ['/^(?:(?!__c).)*$/', 'Event'],
              variableType: {
                type: 'SobjectFieldType'
              }
            }
          },
          undefined,
          2
        )
      );
      // and it should end up no warnings
      await waitForDiagnostics(
        variablesDoc.uri,
        d => d && d.length === 0,
        'No diagnostics on variables.json after fix'
      );
    });
  }); // describe('lints variables.json')
});
