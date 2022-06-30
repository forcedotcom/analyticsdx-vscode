#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const path = require('path');
const cwd = process.cwd();
const { runTests } = require('@vscode/test-electron');
const {
  downloadDirToExecutablePath,
  insidersDownloadDirToExecutablePath,
  systemDefaultPlatform
} = require('@vscode/test-electron/out/util.js');

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
