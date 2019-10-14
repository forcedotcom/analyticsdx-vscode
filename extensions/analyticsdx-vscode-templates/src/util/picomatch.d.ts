/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// picomatch doesn't come with it's own .d.ts file, so just do that here.
// see node_modules/picomatch/README.md
declare module 'picomatch' {
  // fill in options from node_modules/picomatch/README.md as we use them
  type Options = {
    /** Ignore dotfiles in matches (defaults to false) */
    dot?: boolean;
    /** True to do case-insenstiive matches (defaults to false, case-sensitive) */
    nocase?: boolean;
    [key: string]: any;
  };

  declare const picomatch: {
    (globs: string | string[], options?: Options): (s: string | string[]) => boolean;
    // these are the only things we might use
    makeRe: (s: string, options: Options) => RegExp;
    isMatch: (s: string | string[], globs: string | string[], options?: Options) => boolean;
  };
  export = picomatch;
}
