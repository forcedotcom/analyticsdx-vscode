#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const { runTests } = require('@vscode/test-electron');
const {
  downloadDirToExecutablePath,
  insidersDownloadDirToExecutablePath,
  systemDefaultPlatform
} = require('@vscode/test-electron/out/util.js');

// cleanup the .vscode-test/user-data folder before the run, otherwise it might fail like:
// Error: ENOENT: no such file or directory, unlink '.../analyticsdx-vscode/extensions/analyticsdx-vscode-core/.vscode-test/user-data/1.76-main.sock'
const userDataDir = path.join(cwd, '.vscode-test', 'user-data');
if (fs.existsSync(userDataDir)) {
  console.log(`Deleting  ${userDataDir} from previous run...`);
  fs.rmSync(userDataDir, { force: true, recursive: true });
}
// it looks like this can get left if a test run fails and it can also cause the above error, so delete it too
const userDaFile = path.join(cwd, '.vscode-test', 'user-da');
if (fs.existsSync(userDaFile)) {
  console.log(`Deleting  ${userDaFile} from previous run...`);
  fs.rmSync(userDaFile, { force: true });
}

// Run vscode tests under your out/test/vscode-integration folder.
// this assumes you ran download-vscode-for-tests or otherwise have a vscode install under
// $CWD/.vscode-test/[stable|insiders]
(async function () {
  const isInsiders = process.env.CODE_VERSION === 'insiders';
  const installDir = path.join(cwd, '.vscode-test', isInsiders ? 'insiders' : 'stable');
  const execPath = isInsiders
    ? insidersDownloadDirToExecutablePath(installDir, systemDefaultPlatform)
    : downloadDirToExecutablePath(installDir, systemDefaultPlatform);

  const opts = {
    vscodeExecutablePath: execPath,
    extensionDevelopmentPath: path.join(cwd, '.vscode-test', 'extensions'),
    extensionTestsPath: path.join(cwd, 'out', 'test', 'vscode-integration'),
    launchArgs: [
      // workspace path
      path.join(__dirname, '..', 'test-assets', 'sfdx-simple'),
      // turn off any user extensions, so it should run with only extensions setup in the run target
      '--disable-extensions',
      // turn off workspace trust for tests (so it doesn't show the big dialog on startup)
      '--disable-workspace-trust',
      '--sync',
      'off'
    ]
  };
  try {
    const exitCode = await runTests(opts);
    if (exitCode !== 0) {
      console.error('Either tests failed to run, or there was 1 or more test failures, exitCode=', exitCode);
    }
    process.exit(exitCode);
  } catch (e) {
    console.error('Either tests failed to run, or there was 1 or more test failure; error=', e);
    process.exit(1);
  }
})();
