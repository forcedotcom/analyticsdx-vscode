/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/* Update the SHA256.md file from the already built .vsix files in each extension folder.
 * This is designed to run from the top-level folder.
 */
const shell = require('shelljs');
const { checkNodeVersion } = require('./validation-utils');

shell.set('-e');
shell.set('+v');

checkNodeVersion();

// Generate the SHA256s and append to the raw file
shell.exec(`npm run vscode:sha256`);

// Concatenate the contents to the proper SHA256.md
shell.exec('node ./scripts/concatenate-sha256.js');

// Remove the temp SHA256 file
shell.rm('./SHA256');
