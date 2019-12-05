/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { posix as path } from 'path';

const whitespaceRe = /^\s$/;

export function isWhitespaceChar(ch: string) {
  return whitespaceRe.test(ch);
}

export function isUriPathUnder(parent: string, file: string): boolean {
  const rel = path.relative(parent, file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function isSameUriPath(path1: string, path2: string): boolean {
  return path.relative(path1, path2) === '';
}

/** Tell if the specified string is a valid relative-path (for templates) */
export function isValidRelpath(relpath: string): boolean {
  return (
    !!relpath &&
    relpath.trim().length > 0 &&
    !relpath.startsWith('/') &&
    !relpath.startsWith('../') &&
    !relpath.includes('/../') &&
    !relpath.endsWith('/..')
  );
}
