/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { OutputDirGatherer } from '../../../../src/commands/gatherers/outputDirGatherer';

describe('OutputDirGatherer', () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('show correct initial options', async () => {
    const showQuickPick = sandbox.stub(vscode.window, 'showQuickPick') as sinon.SinonStub<
      [any | Thenable<any>],
      any | Thenable<any>
    >;
    let quickPickItems: any;
    showQuickPick.callsFake(async (items: any) => {
      quickPickItems = await items;
      return Promise.resolve(undefined);
    });
    const gatherer = new OutputDirGatherer('lwc', true);
    const response = await gatherer.gather();
    expect(response.type, 'response.type').to.equal('CANCEL');
    expect(quickPickItems, 'quickPickItems').to.have.members([
      path.join('force-app', 'main', 'default', 'lwc'),
      OutputDirGatherer.customDirOption
    ]);
  });

  it('show correct custom directories', async () => {
    const showQuickPick = sandbox.stub(vscode.window, 'showQuickPick') as sinon.SinonStub<
      [any | Thenable<any>],
      any | Thenable<any>
    >;
    let callNum = 0;
    let quickPickItems: any;
    showQuickPick.callsFake(async (items: any) => {
      callNum++;
      if (callNum === 1) {
        return Promise.resolve(OutputDirGatherer.customDirOption);
      } else if (callNum === 2) {
        quickPickItems = await items;
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`showQuickPick called ${callNum} times`));
    });
    const gatherer = new OutputDirGatherer('lwc', true);
    const response = await gatherer.gather();
    expect(response.type, 'response.type').to.equal('CANCEL');
    // there will be more but just make sure it got to the glob logic by checking for a few
    expect(quickPickItems, 'quickPickItems').to.include.members([
      path.join('force-app', 'main', 'default', 'lwc'),
      path.join('force-app', 'main', 'default', 'waveTemplates', 'lwc'),
      path.join('force-app', 'main', 'default', 'waveTemplates', 'allRelpaths', 'lwc'),
      path.join('force-app', 'main', 'default', 'waveTemplates', 'allRelpaths', 'components', 'lwc'),
      path.join('force-app', 'main', 'default', 'waveTemplates', 'empty', 'lwc')
    ]);
  });
});
