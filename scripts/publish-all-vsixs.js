/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/** Do the full public to the marketplace process:
 * - update the version numbers
 * - build the .vsix files
 * - update the SHA256.md
 * - publish to the marketplace
 * - make a commit with the version & SHA256.md changes, and a release tag, and push those
 */
const shell = require('shelljs');
const {
  checkNodeVersion,
  checkSalesforcePublisherAccess,
  checkVersionTag,
  checkVSCodeVersion
} = require('./validation-utils');

shell.set('-e');
shell.set('+v');

checkNodeVersion();
checkSalesforcePublisherAccess();
const nextVersion = checkVSCodeVersion();
const tagName = checkVersionTag(nextVersion);

// do the build and upload
shell.exec('npm run update-versions');
shell.exec('npm run build-all-vsixs');
shell.exec('npm run update-sha256');
shell.exec('npm run vscode:publish');

// make the commit and tag and push
shell.exec('git add "**/package.json" lerna.json SHA256.md');
shell.exec(`git commit -m "Updates for Release ${nextVersion}"`);
shell.exec(`git tag -a ${tagName} -m "Release ${nextVersion}"`);
shell.exec(`git push origin ${tagName}`);
