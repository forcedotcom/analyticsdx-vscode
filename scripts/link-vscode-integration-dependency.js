#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const path = require('path');
const fs = require('fs');

const srcDir = path.join(__dirname, '..', 'extensions');
const extensionsDir = path.join('.vscode-test', 'extensions');
if (!fs.existsSync(extensionsDir)) {
  fs.mkdirSync(extensionsDir, { recursive: true });
}

function symlink(src, dest) {
  try {
    if (fs.lstatSync(dest)) {
      fs.unlinkSync(dest);
    }
  } catch (ignore) {}
  fs.symlinkSync(src, dest);
}

// all the args should be folder names (under extensions/) of source extensions
for (let arg = 2; arg < process.argv.length; arg++) {
  const dir = process.argv[arg];
  symlink(path.join(srcDir, dir), path.join(extensionsDir, dir));
}
