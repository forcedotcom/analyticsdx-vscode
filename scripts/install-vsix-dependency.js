#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const path = require('path');
const shell = require('shelljs');
const fs = require('fs');
const mkdirp = require('mkdirp');

// Installs a list of extensions passed on the command line
var isInsiders = process.env.CODE_VERSION === 'insiders';

const testRunFolder = path.join('.vscode-test', isInsiders ? 'insiders' : 'stable');
const testRunFolderAbsolute = path.join(process.cwd(), testRunFolder);

const windowsExecutable = path.join(testRunFolderAbsolute, 'bin', isInsiders ? 'code-insiders' : 'code');
const darwinExecutable = path.join(
  testRunFolderAbsolute,
  isInsiders ? 'Visual Studio Code - Insiders.app' : 'Visual Studio Code.app',
  'Contents',
  'Resources',
  'app',
  'bin',
  'code'
);
const linuxExecutable = path.join(
  testRunFolderAbsolute,
  'VSCode-linux-x64',
  'bin',
  isInsiders ? 'code-insiders' : 'code'
);

const extensionsDir = path.join('.vscode-test', 'extensions');
if (!fs.existsSync(extensionsDir)) {
  mkdirp.sync(extensionsDir);
}

const executable =
  process.platform === 'darwin' ? darwinExecutable : process.platform === 'win32' ? windowsExecutable : linuxExecutable;

if (process.platform === 'linux') {
  // Somehow the code executable doesn't have +x set on the autobuilds -- set it here
  shell.chmod('+x', executable);
}

// We always invoke this script with 'node install-vsix-dependency arg ...'
// so position2 is where the first argument is
for (let arg = 2; arg < process.argv.length; arg++) {
  let result;
  if (process.platform === 'win32') {
    // Windows Powershell doesn't like the single quotes around the executable
    result = shell.exec(
      `${executable} --extensions-dir ${extensionsDir} --install-extension ${process.argv[arg]} --force`
    );
  } else {
    result = shell.exec(
      `'${executable}' --extensions-dir ${extensionsDir} --install-extension ${process.argv[arg]} --force`
    );
  }
  if (result.code !== 0) {
    process.exit(result.code);
  }
}
