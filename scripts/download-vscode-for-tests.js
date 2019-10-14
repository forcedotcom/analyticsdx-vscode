#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { downloadAndUnzipVSCode } = require('vscode-test');

function symlink(src, dest) {
  try {
    if (fs.lstatSync(dest)) {
      fs.unlinkSync(dest);
    }
  } catch (ignore) {
    // this can happen if link doesn't exist, or unlink failed (in which case the symlink
    // call next will fail)
  }
  fs.symlinkSync(src, dest);
}

// Downloads an instance of VS Code for tests to either .vscode-test/insiders or .vscode-test/stable
(async function() {
  const installDir = process.env.CODE_VERSION === 'insiders' ? 'insiders' : 'stable';
  const electron = await downloadAndUnzipVSCode(installDir);
  // downloadAndUnzipVSCode generates a path (with a version #) to the Electron executable, like:
  //   .../.vscode-test/vscode-1.36.1/Visual Studio Code.app/Contents/MacOS/Electron
  // but our stuff is expecting a .../.vscode-test/stable for stable version, so symlink
  const vscodeTestDir = path.join(process.cwd(), '.vscode-test');
  // this should give us the top install dir path part of vscode (e.g. 'vscode-1.36.1')
  const reldir = path.relative(vscodeTestDir, electron).split(path.sep)[0];
  if (reldir !== installDir) {
    // make a symlink from .vscode-test/[stable|insiders] to that
    symlink(path.join(vscodeTestDir, reldir), path.join(vscodeTestDir, installDir));
  }
})();
