/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as quickpick from '../../../src/util/quickpick';

import childProcess = require('child_process');
import { updateTemplate } from '../../../src/commands';
import { TemplateQuickPickItem } from '../../../src/commands/gatherers/templateGatherer';

// tslint:disable: no-unused-expression
describe('updateTemplate.ts', () => {
  const mockSpawnLib = require('mock-spawn');
  let origSpawn: any;
  let mockSpawn: any;

  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    origSpawn = childProcess.spawn;
    mockSpawn = mockSpawnLib();
    childProcess.spawn = mockSpawn;

    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    childProcess.spawn = origSpawn;
    sandbox.restore();
  });

  // make a mock spawn response for sfdx-style --json output
  function sfdxMockSpawnJson(json: any, exitCode = 0) {
    return mockSpawn.simple(
      exitCode,
      JSON.stringify({
        status: exitCode,
        result: json
      })
    );
  }

  describe('updateTemplate()', () => {
    let showQuickPick: sinon.SinonStub<
      [vscode.QuickPickItem[] | Promise<vscode.QuickPickItem[]>, any],
      Promise<vscode.QuickPickItem | undefined>
    >;
    // the quick pick items passed to showQuickPick() during updateTemplate()
    let templateQuickPickItems: vscode.QuickPickItem[] | undefined;

    beforeEach(() => {
      templateQuickPickItems = undefined;
      // make our showQuickPick() method always cancel out since we aren't checking the end part right now
      showQuickPick = sandbox.stub(quickpick, 'showQuickPick');
      showQuickPick.callsFake(async (itemsOrPromise, options) => {
        // save these off
        templateQuickPickItems = await itemsOrPromise;
        return Promise.resolve(undefined);
      });
    });

    it('shows template with source folder', async () => {
      const expectedTemplateId = '0Nkxx0000004CAeCAM';
      const expectedFolderId = '00lxx000000j8k1AAA';
      // first call is for templates
      mockSpawn.sequence.add(
        sfdxMockSpawnJson([
          {
            name: 'AppTwo',
            label: 'AppTwo',
            templateid: expectedTemplateId,
            templatetype: 'app',
            folderid: expectedFolderId,
            namespace: null
          },
          {
            // template w/ no source app
            name: 'long_dataflow_name',
            label: 'Long Dataflow Name',
            templateid: '0Nkxx0000004CAgCAM',
            templatetype: 'app',
            folderid: null,
            namespace: null
          }
        ])
      );
      // second call is for apps
      mockSpawn.sequence.add(
        sfdxMockSpawnJson([
          {
            name: 'app2_1',
            label: 'app2_1',
            folderid: expectedFolderId,
            status: 'completedstatus',
            templateSourceId: expectedTemplateId
          },
          {
            // this is an app made from the other template but not a source app
            name: 'long5',
            label: 'long5',
            folderid: '00lxx000000j6wjAAA',
            status: 'completedstatus',
            templateSourceId: '0Nkxx0000004CAgCAM'
          }
        ])
      );

      await updateTemplate();
      sinon.assert.called(showQuickPick);
      expect(templateQuickPickItems, 'templates in picker').to.not.be.undefined;
      expect(templateQuickPickItems?.length, 'number of templates in picker').to.equal(1);
      if (!(templateQuickPickItems![0] instanceof TemplateQuickPickItem)) {
        expect.fail(
          'Expected a TemplateQuickPickItem, got ' + JSON.stringify(templateQuickPickItems![0], undefined, 2)
        );
      }
      const item = templateQuickPickItems![0] as TemplateQuickPickItem;
      expect(item.template.templateid, 'templateid in picker').to.equal(expectedTemplateId);
      expect(item.template.folderid, 'folderid in picker').to.equal(expectedFolderId);
    });

    it('shows no templates when no source folder after decouple', async () => {
      // first call is for templates -- after a decouple, the template will still list the folderid, but
      // the app won't have the templateSourceId
      mockSpawn.sequence.add(
        sfdxMockSpawnJson([
          {
            name: 'AppTwo',
            label: 'AppTwo',
            templateid: '0Nkxx0000004CAeCAM',
            templatetype: 'app',
            folderid: '00lxx000000j8k1AAA',
            namespace: null
          },
          {
            name: 'long_dataflow_name',
            label: 'Long Dataflow Name',
            templateid: '0Nkxx0000004CAgCAM',
            templatetype: 'app',
            folderid: null,
            namespace: null
          }
        ])
      );
      // second call is for apps
      mockSpawn.sequence.add(
        sfdxMockSpawnJson([
          {
            name: 'app2_1',
            label: 'app2_1',
            folderid: '00lxx000000j8k1AAA',
            status: 'newstatus'
          },
          {
            name: 'long5',
            label: 'long5',
            folderid: '00lxx000000j6wjAAA',
            status: 'completedstatus',
            templateSourceId: '0Nkxx0000004CAgCAM'
          }
        ])
      );

      await updateTemplate();
      sinon.assert.called(showQuickPick);
      expect(templateQuickPickItems, 'templates in picker').to.not.be.undefined;
      if (templateQuickPickItems?.length !== 0) {
        expect.fail('Expected 0 templates, got ' + JSON.stringify(templateQuickPickItems, undefined, 2));
      }
    });
  }); // describe('updateTemplate()')
});
