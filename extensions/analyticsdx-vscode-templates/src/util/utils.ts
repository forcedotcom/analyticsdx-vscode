/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as Fuse from 'fuse.js';
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

const noFuzzyMatch = () => [];
const fuzzOptions = {
  // see Fuse.FuseOptions for valid options
  caseSensitive: false,
  shouldSort: true,
  maxPatternLength: 32
};
/** Create a function which can perform a fuzzy text search against a list of possible values.
 * Everything is initialized lazily
 * @param values the possible values
 * @param limit the maximum number of result to return, defaults to 1
 * @return (pattern: string) => string[]
 * @example
 * const fuzz = fuzzySearcher(['one', 'two', 'three'])
 * const [match] = fuzz('on'); // match === 'one'
 * const fuzz2 = fuzzySearcher(['one', 'two', 'three'], {limit: 2});
 * fuzz2('t'); // should return ['two', 'three']
 */
export function fuzzySearcher(
  values: Iterable<string> | ArrayLike<string> | Set<string>
): (pattern: string) => [string] | [];
export function fuzzySearcher(
  values: Iterable<string> | ArrayLike<string> | Set<string>,
  { limit }: { limit?: number }
): (pattern: string) => string[];
export function fuzzySearcher(
  values: Iterable<string> | ArrayLike<string> | Set<string>,
  { limit = 1 }: { limit?: number } = {}
): (pattern: string) => string[] {
  // shortcut if we know the values are empty
  if (!values || (Array.isArray(values) && values.length <= 0) || (values instanceof Set && values.size <= 0)) {
    return noFuzzyMatch;
  }
  let list: string[] | undefined;
  const searchOpts = { limit };
  let fuzzer: Fuse<string, Fuse.FuseOptions<string>> | undefined;
  return (pattern: string) => {
    const results: string[] = [];
    // lazily, make a copy of the array since we have to index into it later and it could change outside of this
    // generated method
    if (!list) {
      list = Array.from(values);
    }
    // if the list is empty, there will never be any matches
    if (list.length <= 0) {
      return noFuzzyMatch();
    }
    // lazily create the fuzzer on first call
    if (!fuzzer) {
      fuzzer = new Fuse(list, fuzzOptions);
    }
    // fuse.js says it will throw an error if the pattern is longer than maxPatternLength (which defaults to 32),
    // handle that by just trimming the pattern so it doesn't blow up
    if (pattern.length > fuzzOptions.maxPatternLength) {
      pattern = pattern.substring(0, fuzzOptions.maxPatternLength);
    }
    fuzzer.search(pattern, searchOpts).forEach((index: any) => {
      // on flat string arrays, fuse.js gives us an array of indices into the original list
      if (typeof index === 'number') {
        if (index >= 0 && index < list!.length) {
          results.push(list![index]);
        }
      }
    });
    return results;
  };
}
