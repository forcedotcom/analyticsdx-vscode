/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { camelCaseToTitleCase, upperFirst } from '@salesforce/kit';
import { expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { createDashboardLWC, createDashboardLWCCommand } from '../../../src/commands';
import { nls } from '../../../src/messages';
import { getRootWorkspace } from '../../../src/util/rootWorkspace';

function makeTmpLWCName(basedir: vscode.Uri): Promise<string> {
  return new Promise((resolve, reject) => {
    // tmpName() w/ template is supposed to only use alphanum chars, which should be valid for lwc names
    tmp.tmpName({ tmpdir: basedir.fsPath, template: 'test_lwc_XXXXXX' }, (err, tmppath) => {
      if (err) {
        reject(err);
      }
      resolve(path.basename(tmppath));
    });
  });
}

async function verifyLWC(lwcDir: vscode.Uri, lwcName: string, hasStep: boolean) {
  const jsFileName = lwcName + '.js';
  const jsDoc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(lwcDir, jsFileName));
  let text = jsDoc.getText();
  expect(text, jsFileName).to.match(
    new RegExp(`export default class ${upperFirst(lwcName)} extends LightningElement`, 'i')
  );
  expect(text, jsFileName).to.match(/@api\s+getState;/);
  expect(text, jsFileName).to.match(/@api\s+setState;/);
  expect(text, jsFileName).to.match(/@api\s+refresh;/);
  if (hasStep) {
    expect(text, jsFileName).to.match(/@api\s+results;/);
    expect(text, jsFileName).to.match(/@api\s+metadata;/);
    expect(text, jsFileName).to.match(/@api\s+selection;/);
    expect(text, jsFileName).to.match(/@api\s+setSelection;/);
    expect(text, jsFileName).to.match(/@api\s+selectMode;/);
  }

  const metaFilename = lwcName + '.js-meta.xml';
  const metaDoc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(lwcDir, metaFilename));
  text = metaDoc.getText();
  expect(text, metaFilename).to.contain('<target>analytics__Dashboard</target>');
  expect(text, metaFilename).to.contain('targets="analytics__Dashboard"');
  expect(text, metaFilename).to.contain('<hasStep>' + (hasStep ? 'true' : 'false') + '</hasStep>');
  expect(text, metaFilename).to.contain(`<masterLabel>${camelCaseToTitleCase(lwcName)}</masterLabel>`);

  const htmlFilename = lwcName + '.html';
  const htmlDoc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(lwcDir, htmlFilename));
  text = htmlDoc.getText();
  expect(text, htmlFilename).to.contain('<template>');
  expect(text, htmlFilename).to.contain('</template>');
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (e) {
    // stat() should only throw NotFound FileSystemErrors
    if (e instanceof vscode.FileSystemError) {
      return false;
    }
    throw e;
  }
}

describe('createDashboardLWC.ts', () => {
  const ws = getRootWorkspace();
  const lwcRootDirFsRelPath = path.join('force-app', 'main', 'default', 'lwc');
  const lwcRootDir = vscode.Uri.joinPath(ws.uri, 'force-app/main/default/lwc');

  let lwcDir: vscode.Uri | undefined;
  beforeEach(() => {
    lwcDir = undefined;
  });

  afterEach(async () => {
    if (lwcDir) {
      if (await uriExists(lwcDir)) {
        await vscode.workspace.fs.delete(lwcDir, { recursive: true, useTrash: false });
      }
    }
  });

  describe('createDashboardLWC()', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      sandbox
        .stub(vscode.window, 'showQuickPick')
        .callsFake(async () => expect.fail('vscode.window.showQuickPick() was incorrectly called during test'));
    });

    afterEach(async () => {
      sandbox.restore();
    });

    it('creates lwc with step', async () => {
      const lwcName = await makeTmpLWCName(lwcRootDir);
      lwcDir = vscode.Uri.joinPath(lwcRootDir, lwcName);
      await createDashboardLWC({ folderUri: lwcRootDir, fileName: lwcName });
      await verifyLWC(lwcDir, lwcName, true);
    });

    it('creates lwc without step', async () => {
      const lwcName = await makeTmpLWCName(lwcRootDir);
      lwcDir = vscode.Uri.joinPath(lwcRootDir, lwcName);
      await createDashboardLWC({ folderUri: lwcRootDir, fileName: lwcName, template: 'analyticsDashboard' });
      await verifyLWC(lwcDir, lwcName, false);
    });
  });

  describe('createDashboardLWCCommand()', () => {
    let sandbox: sinon.SinonSandbox;

    let templateOption: string | undefined;
    let lwcName: string;

    beforeEach(async () => {
      templateOption = undefined;
      sandbox = sinon.createSandbox();

      const showInputBox = sandbox.stub(vscode.window, 'showInputBox');
      lwcName = await makeTmpLWCName(lwcRootDir);
      showInputBox.callsFake(() => Promise.resolve(lwcName));

      const showQuickPick = sandbox.stub(vscode.window, 'showQuickPick') as sinon.SinonStub<
        [any | Thenable<any>],
        any | Thenable<any>
      >;
      let callNum = 0;
      showQuickPick.callsFake(async () => {
        callNum++;
        if (callNum === 1) {
          // 1st quick pick should be for the directory
          return Promise.resolve(lwcRootDirFsRelPath);
        } else if (callNum === 2) {
          // 2nd quick pick should be for step/no-step
          return Promise.resolve(templateOption);
        }
        return Promise.reject(new Error(`showQuickPick called ${callNum} times`));
      });

      lwcDir = vscode.Uri.joinPath(lwcRootDir, lwcName);
    });

    afterEach(async () => {
      sandbox.restore();
    });

    it('creates lwc with step', async () => {
      templateOption = nls.localize('create_dashboard_lwc_has_step');
      await createDashboardLWCCommand();
      await verifyLWC(lwcDir!, lwcName, true);
    });

    it('creates lwc without step', async () => {
      templateOption = nls.localize('create_dashboard_lwc_no_has_step');
      await createDashboardLWCCommand();
      await verifyLWC(lwcDir!, lwcName, false);
    });
  });
});
