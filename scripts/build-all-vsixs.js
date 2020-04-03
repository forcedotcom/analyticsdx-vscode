/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/** Build the production-ready .vsix files for each extension.
 * This should be run from the top-level directory.
 */
const shell = require('shelljs');
const { checkNodeVersion } = require('./validation-utils');

shell.set('-e');
shell.set('+v');

checkNodeVersion();

// Clean everything except the top-level node_modules
shell.exec('git clean -xfd -e node_modules');

// this will do a an install in each package & extension
shell.exec('npm install');

// do a production compile
const prodEnv = Object.assign({}, process.env);
prodEnv['NODE_ENV'] = 'production';
shell.exec('npm run compile', { env: prodEnv });

// create the .vsix for each extension (in each extension's directory)
shell.exec('npm run vscode:package');
