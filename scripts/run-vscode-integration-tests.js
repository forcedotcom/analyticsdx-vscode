#!/usr/bin/env node

const path = require('path');
const cwd = process.cwd();
const { runTests } = require('vscode-test');
const { downloadDirToExecutablePath, insidersDownloadDirToExecutablePath } = require('vscode-test/out/util.js');

// Run vscode tests under your out/test/vscode-integration folder.
// this assumes you ran download-vscode-for-tests or otherwise have a vscode install under
// $CWD/.vscode-test/[stable|insiders]
(async function() {
  const isInsiders = process.env.CODE_VERSION === 'insiders';
  const installDir = path.join(cwd, '.vscode-test', isInsiders ? 'insiders' : 'stable');
  const execPath = isInsiders
    ? insidersDownloadDirToExecutablePath(installDir)
    : downloadDirToExecutablePath(installDir);

  const opts = {
    vscodeExecutablePath: execPath,
    extensionDevelopmentPath: path.join(cwd, '.vscode-test', 'extensions'),
    extensionTestsPath: path.join(cwd, 'out', 'test', 'vscode-integration'),
    launchArgs: [
      // workspace path
      path.join(__dirname, '..', 'test-assets', 'sfdx-simple'),
      // turn off any user extensions, so it should run with only extensions setup in the run target
      '--disable-extensions'
    ]
  };
  console.log('Running vscode tests with:\n', JSON.stringify(opts, undefined, 2));
  try {
    const exitCode = await runTests(opts);
    if (exitCode !== 0) {
      console.error('Either tests failed to run, or there was 1 or more test failures');
    }
    process.exit(exitCode);
  } catch (e) {
    console.error('Either tests failed to run, or there was 1 or more test failures, error=', e);
    process.exit(1);
  }
})();
