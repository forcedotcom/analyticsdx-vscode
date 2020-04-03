/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const shell = require('shelljs');
const logger = require('./logger-util');

// Publishes the .vsix that matches the version in package.json in the current directory.
// This is called from each extension's vscode:publish script target.
// It expects the publisher to have been setup via `vcse login salesforce` w/ a PAT

const packageVersion = JSON.parse(shell.cat('package.json')).version;
const vsix = shell.ls().filter(file => file.match(`-${packageVersion}.vsix`));

if (!vsix.length) {
  logger.error('No VSIX found matching the requested version in package.json');
  shell.exit(1);
}

const VSCE_PERSONAL_ACCESS_TOKEN = process.env['VSCE_PERSONAL_ACCESS_TOKEN'];
let vscePublish = '';
if (VSCE_PERSONAL_ACCESS_TOKEN) {
  vscePublish = shell.exec(`vsce publish --pat ${VSCE_PERSONAL_ACCESS_TOKEN} --packagePath ${vsix}`);
} else {
  // Assume that one has already been configured
  vscePublish = shell.exec(`vsce publish --packagePath ${vsix}`);
}

// Check that publishing extension was successful.
if (vscePublish.code !== 0) {
  logger.error(`There was and error while publishing extension ${vsix}`);
  shell.exit(1);
}
