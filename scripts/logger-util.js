/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN_BOLD = `${BOLD}\x1b[36m%s${RESET}`;
const RED = `\x1b[31m%s${RESET}`;
const YELLOW = `\x1b[33m%s${RESET}`;

module.exports = {
  header: str => {
    console.log(CYAN_BOLD, str);
  },

  debug: str => {
    console.log(str);
  },

  info: str => {
    console.log(YELLOW, str);
  },

  error: str => {
    console.log(RED, str);
  }
};
