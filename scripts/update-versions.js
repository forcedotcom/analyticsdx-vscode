/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* Update the version number in the various extension and packages.
 * This is designed to run from the top-level folder.
 */
const shell = require('shelljs');
const { checkVSCodeVersion, checkNodeVersion } = require('./validation-utils');

shell.set('-e');
shell.set('+v');

checkNodeVersion();
const nextVersion = checkVSCodeVersion();

// lerna version
// increment the version number in all packages without publishing to npmjs
shell.exec(`lerna version ${nextVersion} --force-publish  --no-git-tag-version --exact --yes`);
// prettier up lerna.json (since lerna rewrites it differently)
shell.exec('prettier --config .prettierrc --write lerna.json lerna.json ');
