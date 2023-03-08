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

// Installs a list of extensions passed on the command line
var isInsiders = process.env.CODE_VERSION === 'insiders';

const testRunFolder = path.join('.vscode-test', isInsiders ? 'insiders' : 'stable');
const testRunFolderAbsolute = path.join(process.cwd(), testRunFolder);

let executable;
if (process.platform === 'darwin') {
  executable = path.join(
    testRunFolderAbsolute,
    isInsiders ? 'Visual Studio Code - Insiders.app' : 'Visual Studio Code.app',
    'Contents',
    'Resources',
    'app',
    'bin',
    'code'
  );
} else if (process.platform === 'win32') {
  executable = path.join(testRunFolderAbsolute, 'bin', isInsiders ? 'code-insiders' : 'code');
} else {
  // assume linux
  executable = testRunFolderAbsolute;
  // downloadAndUnzipVSCode() in download-vscode-for-tests.js used to leave this folder under testRunFolder, but
  // now doesn't seem to to, so handle both cases
  if (fs.readdirSync(testRunFolderAbsolute).includes(name => name === 'VSCode-linux-x64')) {
    executable = path.join(executable, 'VSCode-linux-x64');
  }
  executable = path.join(executable, 'bin', isInsiders ? 'code-insiders' : 'code');
  // Sometimes the code executable doesn't have +x set on the github actions -- set it here
  shell.chmod('+x', executable);
}

const extensionsDir = path.join('.vscode-test', 'extensions');
if (!fs.existsSync(extensionsDir)) {
  fs.mkdirSync(extensionsDir, { recursive: true });
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
