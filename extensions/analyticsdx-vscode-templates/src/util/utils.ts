/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { posix as path } from 'path';

export { isValidRelpath } from 'analyticsdx-template-lint';

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

/** Match a filepath's extension.
 * @param filepath the filepath
 * @param exts the set of file extensions that match, case-insensitive, do not include the leading '.'
 */
export function matchesFileExtension(filepath: string, ...exts: string[]): boolean {
  const i = filepath.lastIndexOf('.');
  const found = i >= 0 ? filepath.substring(i + 1).toLocaleLowerCase() : '';
  return exts.some(ext => ext.toLocaleLowerCase() === found);
}

/** Generate a function that matches a filepath's extension.
 * @param exts the set of file extensions that match, case-insensitive, do not include the leading '.'
 */
export function newFileExtensionFilter(...exts: string[]): (s: string) => boolean {
  return s => matchesFileExtension(s, ...exts);
}
