/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import childProcess = require('child_process');
import { openAppInStudio, openDataManager, openStudio, SfdxCommandBuilder } from '../../../src/commands';
import { AppGatherer } from '../../../src/commands/gatherers/appGatherer';

describe('openStudio.ts', () => {
  const mockSpawnLib = require('mock-spawn');
  let origSpawn: any;
  let mockSpawn: any;

  let sandbox: sinon.SinonSandbox;
  let withArgSpy: sinon.SinonSpy<[string], SfdxCommandBuilder>;
  let openExternal: sinon.SinonStub<any>;

  // Note: replace with Array.flat() once we're on ES6
  function flatten<T>(array: T[][]): T[] {
    return ([] as T[]).concat(...array);
  }

  beforeEach(() => {
    origSpawn = childProcess.spawn;
    mockSpawn = mockSpawnLib();
    childProcess.spawn = mockSpawn;

    sandbox = sinon.createSandbox();
    withArgSpy = sandbox.spy(SfdxCommandBuilder.prototype, 'withArg');
    openExternal = sandbox.stub(vscode.env, 'openExternal');
    openExternal.returns(Promise.resolve(true));
  });

  afterEach(() => {
    childProcess.spawn = origSpawn;
    sandbox.restore();
  });

  it('openStudio() parses sfdx response successfully', async () => {
    const expectedUrl = 'https://mydomain.salesforce.com/secur/frontdoor.jsp?sid=sid&retURL=analytics%2Fhome';
    mockSpawn.setDefault(
      mockSpawn.simple(
        0,
        JSON.stringify(
          {
            status: 0,
            result: {
              url: expectedUrl
            }
          },
          undefined,
          2
        )
      )
    );

    await openStudio();
    // make sure sfdx got the right -p arg
    sinon.assert.called(withArgSpy);
    expect(flatten(withArgSpy.args), 'sfdx args').to.include.members(['-p', '/analytics/home']);

    // and that it called vscode.env.openExternal with the url from the output
    sinon.assert.calledOnce(openExternal);
    // vscode.Uri doesn't implement equals() so have to do string compare
    expect(openExternal.firstCall.args[0].toString(), 'uri').to.equal(vscode.Uri.parse(expectedUrl).toString());
  });

  it('openDataManager() sends correct route', async () => {
    mockSpawn.setDefault(
      mockSpawn.simple(
        0,
        JSON.stringify(
          {
            status: 0,
            result: {
              url: 'https://mydomain.salesforce.com/secur/frontdoor.jsp?sid=sid&retURL=analytics%2FdataManager'
            }
          },
          undefined,
          2
        )
      )
    );
    await openDataManager();
    // make sure sfdx got the right -p arg
    sinon.assert.called(withArgSpy);
    expect(flatten(withArgSpy.args), 'sfdx args').to.include.members(['-p', '/analytics/dataManager']);
  });

  it('openAppInStudio() sends correct route', async () => {
    mockSpawn.setDefault(
      mockSpawn.simple(
        0,
        JSON.stringify(
          {
            status: 0,
            result: {
              url:
                'https://mydomain.salesforce.com/secur/frontdoor.jsp?sid=sid&retURL=analytics%2Fapplication%2Fid%2Fedit'
            }
          },
          undefined,
          2
        )
      )
    );

    const gatherStub = sandbox.stub(AppGatherer.prototype, 'gather');
    gatherStub.returns(
      Promise.resolve({
        type: 'CONTINUE',
        data: {
          name: 'app',
          label: 'app',
          folderid: 'id',
          status: 'status'
        }
      })
    );
    await openAppInStudio();
    // make sure sfdx got the right -p arg
    sinon.assert.called(withArgSpy);
    expect(flatten(withArgSpy.args), 'sfdx args').to.include.members(['-p', '/analytics/application/id/edit']);
  });

  it('openAppInStudio() no-ops on cancel', async () => {
    const gatherStub = sandbox.stub(AppGatherer.prototype, 'gather');
    gatherStub.returns(
      Promise.resolve({
        type: 'CANCEL'
      })
    );
    await openAppInStudio();
    // make sure an sfdx command wasn't built
    sinon.assert.notCalled(withArgSpy);
    // and no call to open a url
    sinon.assert.notCalled(openExternal);
  });
});
