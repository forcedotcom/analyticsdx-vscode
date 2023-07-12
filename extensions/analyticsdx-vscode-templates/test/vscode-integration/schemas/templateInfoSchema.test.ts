/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findNodeAtLocation, JSONPath, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { jsonPathToString } from '../../../src/util/jsoncUtils';
import { scanLinesUntil, uriStat } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  getCompletionItems,
  openFile,
  openTemplateInfo,
  openTemplateInfoAndWaitForDiagnostics,
  setDocumentText,
  verifyCompletionsContain,
  waitForDiagnostics,
  writeTextToFile
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('template-info-schema.json hookup', () => {
  describe('shows problems on', () => {
    beforeEach(closeAllEditors);
    afterEach(closeAllEditors);

    // this is really just testing that vscode is picking up our schema on template-info.json's --
    // these diagnostics comes from vscode
    it('empty file', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics(
        'emptyTemplateInfo',
        true,
        d => d && d.length >= 4
      );
      // we should get a warning about needing 1 dashboard/dataflow/dataset on the root object from the linter,
      // so just filter that out for now
      const map = new Map(diagnostics.filter(d => d.message.startsWith('Missing property ')).map(d => [d.message, d]));
      // there should be a warning for each these fields being missing
      ['name', 'label', 'assetVersion', 'releaseInfo'].forEach(name => {
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

    it('Simple_Dashboard template', async () => {
      const [diagnostics] = await openTemplateInfoAndWaitForDiagnostics('Simple_Dashboard');
      if (diagnostics.length !== 1) {
        expect.fail(
          'Expected 1 diagnostic, got ' + diagnostics.length + ':\n' + JSON.stringify(diagnostics, undefined, 2)
        );
      }
      expect(diagnostics[0].message, 'diagnostic message').to.be.equals(
        "Deprecated. Use 'icons.templateBadge' instead."
      );
      // this is also testing the positive case for linter.js's file-path checks since there are no warnings about them,
      // and that the allowComments: true in the schema works in VSCode
    });
  }); // describe('shows problems on')

  describe('has snippet for', () => {
    beforeEach(closeAllEditors);
    afterEach(closeAllEditors);

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
      ['components', 'dashboard component'],
      ['lenses', 'lens'],
      ['recipes', 'recipe'],
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
    [
      ['discoveryStories', 'discoveryStory'],
      ['predictiveScoring', 'predictiveScoring']
    ].forEach(([name, completionName]) => {
      it(`extendedTypes.${name}`, async () => {
        await testCompletions(`{\n  "extendedTypes": {\n    "${name}": []\n  }\n}`, '[', 2, `New ${completionName}`);
      });
    });

    ['appBadge', 'templateBadge', 'templateDetail'].forEach(name => {
      it(`icons.${name}`, async () => {
        await testCompletions(`{\n  "icons": {\n    "${name}": \n  }\n}`, ':', 2, 'New icon');
      });
    });

    it('icons.templatePreviews', async () => {
      await testCompletions('{\n  "icons": {\n    "templatePreviews": []\n  }\n}', '[', 2, 'New icon');
    });
  }); // describe('has snippet for')

  describe('has completions for nullable field', () => {
    let tmpdir: vscode.Uri | undefined;
    let doc: vscode.TextDocument | undefined;
    // we don't need values on anything since we're only looking at completions; also,
    // we need all the top-level fields, but only the subfields that have completions that
    // come from the schema (templateEditing.test.ts will test the dynamic completions)
    const json: any = {
      templateType: 'app',
      description: null,
      variableDefinition: null,
      uiDefinition: null,
      ruleDefinition: null,
      assetIcon: null,
      templateIcon: null,
      folderDefinition: null,
      autoInstallDefinition: null,
      releaseInfo: {
        notesFile: null
      },
      rules: null,
      externalFiles: [
        {
          file: null,
          schema: null,
          userXmd: null,
          condition: null,
          rows: null,
          overwriteOnUpgrade: null,
          label: null,
          onFailure: { defaultStatus: null }
        }
      ],
      lenses: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          onFailure: null
        }
      ],
      dashboards: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          onFailure: null
        }
      ],
      components: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          onFailure: null
        }
      ],
      eltDataflows: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          onFailure: null
        }
      ],
      recipes: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          onFailure: null
        }
      ],
      datasetFiles: [
        {
          userXmd: null,
          condition: null,
          overwriteOnUpgrade: null,
          file: null,
          onFailure: null
        }
      ],
      storedQueries: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          onFailure: null
        }
      ],
      imageFiles: [
        {
          condition: null,
          overwriteOnUpgrade: null,
          label: null,
          onFailure: null
        }
      ],
      extendedTypes: {
        discoveryStories: [
          {
            condition: null,
            overwriteOnUpgrade: null,
            onFailure: null
          }
        ],
        predictiveScoring: [
          {
            condition: null,
            overwriteOnUpgrade: null,
            onFailure: null
          }
        ]
      },
      icons: {
        appBadge: {
          namespace: null
        },
        templateBadge: {
          namespace: null
        },
        templatePreviews: [
          {
            description: null
          }
        ]
      },
      customAttributes: [
        {
          values: null
        }
      ],
      templateDependencies: [
        {
          templateVersion: null,
          namespace: null,
          condition: null
        }
      ],
      videos: null,
      tags: null
    };

    before(async () => {
      await closeAllEditors();
      [tmpdir] = await createTempTemplate(false);
      const templateInfo = vscode.Uri.joinPath(tmpdir, 'template-info.json');
      await writeTextToFile(templateInfo, json);
      [doc] = await openFile(templateInfo);
    });
    after(async () => {
      if (tmpdir && (await uriStat(tmpdir))) {
        await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
      }
      tmpdir = undefined;
      doc = undefined;
    });

    // make a test for each of these fields to make sure it has the expected completion items
    [
      { jsonpath: ['templateType'] as JSONPath, completions: ['"app"', '"dashboard"', '"data"', '"embeddedapp"'] },
      { jsonpath: ['variableDefinition'], completions: ['""'] },
      { jsonpath: ['uiDefinition'], completions: ['""'] },
      { jsonpath: ['ruleDefinition'], completions: ['""'] },
      { jsonpath: ['assetIcon'], completions: ['""'] },
      { jsonpath: ['templateIcon'], completions: ['""'] },
      { jsonpath: ['folderDefinition'], completions: ['""'] },
      { jsonpath: ['autoInstallDefinition'], completions: ['""'] },
      { jsonpath: ['releaseInfo', 'notesFile'], completions: ['""'] },
      { jsonpath: ['rules'], completions: ['[]', 'New rules'] },
      { jsonpath: ['externalFiles'], completions: ['[]'] },
      { jsonpath: ['externalFiles', 0, 'file'], completions: ['""'] },
      { jsonpath: ['externalFiles', 0, 'schema'], completions: ['""'] },
      { jsonpath: ['externalFiles', 0, 'userXmd'], completions: ['""'] },
      { jsonpath: ['externalFiles', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['externalFiles', 0, 'rows'], completions: ['5'] },
      { jsonpath: ['externalFiles', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['externalFiles', 0, 'onFailure', 'defaultStatus'], completions: ['"Fail"', '"Skip"', '"Warn"'] },
      { jsonpath: ['lenses'], completions: ['[]'] },
      { jsonpath: ['lenses', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['lenses', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['lenses', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['dashboards'], completions: ['[]'] },
      { jsonpath: ['dashboards', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['dashboards', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['dashboards', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['components'], completions: ['[]'] },
      { jsonpath: ['components', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['components', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['components', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['eltDataflows'], completions: ['[]'] },
      { jsonpath: ['eltDataflows', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['eltDataflows', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['eltDataflows', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['recipes'], completions: ['[]'] },
      { jsonpath: ['recipes', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['recipes', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['recipes', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['datasetFiles'], completions: ['[]'] },
      { jsonpath: ['datasetFiles', 0, 'userXmd'], completions: ['""'] },
      { jsonpath: ['datasetFiles', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['datasetFiles', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['datasetFiles', 0, 'file'], completions: ['""'] },
      { jsonpath: ['datasetFiles', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['storedQueries'], completions: ['[]'] },
      { jsonpath: ['storedQueries', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['storedQueries', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['storedQueries', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['imageFiles'], completions: ['[]'] },
      { jsonpath: ['imageFiles', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['imageFiles', 0, 'overwriteOnUpgrade'], completions: ['${...} expression'] },
      { jsonpath: ['imageFiles', 0, 'label'], completions: ['""'] },
      { jsonpath: ['imageFiles', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['extendedTypes'], completions: ['{}'] },
      { jsonpath: ['extendedTypes', 'discoveryStories', 0, 'condition'], completions: ['""', '${...} expression'] },
      {
        jsonpath: ['extendedTypes', 'discoveryStories', 0, 'overwriteOnUpgrade'],
        completions: ['${...} expression']
      },
      { jsonpath: ['extendedTypes', 'discoveryStories', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['extendedTypes', 'predictiveScoring', 0, 'condition'], completions: ['""', '${...} expression'] },
      {
        jsonpath: ['extendedTypes', 'predictiveScoring', 0, 'overwriteOnUpgrade'],
        completions: ['${...} expression']
      },
      { jsonpath: ['extendedTypes', 'predictiveScoring', 0, 'onFailure'], completions: ['New onFailure'] },
      { jsonpath: ['icons'], completions: ['{}'] },
      { jsonpath: ['icons', 'appBadge', 'namespace'], completions: ['""'] },
      { jsonpath: ['icons', 'templateBadge', 'namespace'], completions: ['""'] },
      { jsonpath: ['icons', 'templatePreviews', 0, 'description'], completions: ['""'] },
      { jsonpath: ['customAttributes'], completions: ['[]'] },
      { jsonpath: ['customAttributes', 0, 'values'], completions: ['[]'] },
      { jsonpath: ['templateDependencies'], completions: ['[]'] },
      { jsonpath: ['templateDependencies', 0, 'namespace'], completions: ['""'] },
      { jsonpath: ['templateDependencies', 0, 'templateVersion'], completions: ['""'] },
      { jsonpath: ['templateDependencies', 0, 'condition'], completions: ['""', '${...} expression'] },
      { jsonpath: ['videos'], completions: ['[]'] },
      { jsonpath: ['tags'], completions: ['[]', 'New tags'] }
    ].forEach(({ jsonpath, completions }) => {
      const jsonPathStr = jsonPathToString(jsonpath);
      it(jsonPathStr, async () => {
        const tree = parseTree(doc!.getText());
        expect(tree, 'json node').to.not.be.undefined;
        // go to the field
        const node = findNodeAtLocation(tree!, jsonpath);
        expect(node, jsonPathStr).to.not.be.undefined;
        // go to right after the ":"
        const position = doc!.positionAt(node!.parent!.colonOffset! + 1);
        // that should give a snippet to fill out the whole featuresAssets
        await verifyCompletionsContain(doc!, position, 'null', ...completions);
      });
    });
  }); // describe('has completions for nullable field')
});
