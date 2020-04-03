#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const shell = require('shelljs');
const logger = require('./logger-util');

// Generate the SHA256 for the .vsix that matches the version in package.json, in the current directory
// This is called from each extension's vscode:sha256 script target.

const packageVersion = JSON.parse(shell.cat('package.json')).version;
const vsix = shell.ls().filter(file => file.match(`-${packageVersion}.vsix`));

if (!vsix.length) {
  logger.error(`No VSIX found matching the requested version ${packageVersion} in ${process.cwd()}/package.json`);
  process.exit(1);
}

if (/win32/.test(process.platform)) {
  shell.exec(`CertUtil -hashfile ${vsix} SHA256`);
} else {
  shell.exec(`shasum -a 256 ${vsix}`);
}
