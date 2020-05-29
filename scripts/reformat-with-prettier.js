#!/usr/bin/env node

/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const path = require('path');
const shell = require('shelljs');

const prettierExecutable = path.join(__dirname, '..', 'node_modules', '.bin', 'prettier');

shell.exec(
  `${prettierExecutable} --config .prettierrc --write "extensions/analyticsdx-*/package.json" "package.json"`,
  {
    cwd: path.join(__dirname, '..')
  }
);
