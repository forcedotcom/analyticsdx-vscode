/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import Fuse from 'fuse.js';
import { JSONPath, Node as JsonNode } from 'jsonc-parser';

/**
 * Return all nodes that match the path-patterns.
 * @param roots the json node root(s) to start at.
 * @param path the list of property-name or array index or '*' to match on any
 * @param callback if specified, will be called on each matching node (passing in the other matches found so far),
 *                 can return exactly false to not add the node to the matches.
 * @param matches (optional) a list to collect the result into; if specified, will be used and returned.
 * @return the matches, always non-null.
 */
export function matchJsonNodesAtPattern(
  roots: JsonNode | JsonNode[] | undefined,
  path: JSONPath,
  callback?: (node: JsonNode, matches: JsonNode[]) => false | any,
  matches?: JsonNode[]
): JsonNode[] {
  if (!matches) {
    matches = [];
  }
  if (!roots) {
    return matches;
  }

  // no path remaining, so push the current roots, checking with any passed in callback
  if (path.length === 0) {
    if (Array.isArray(roots)) {
      if (callback) {
        roots.forEach(root => {
          if (!callback || callback(root, matches!) !== false) {
            matches!.push(root);
          }
        });
      } else {
        matches.push(...roots);
      }
    } else {
      if (!callback || callback(roots, matches) !== false) {
        matches.push(roots);
      }
    }
  } else {
    roots = Array.isArray(roots) ? roots : [roots];
    const name = path.slice(0, 1)[0];
    path = path.slice(1);
    roots.forEach(root => {
      if (typeof name === 'string') {
        // just go into the children
        if (name === '*') {
          if (Array.isArray(root.children)) {
            if (root.type === 'array') {
              matchJsonNodesAtPattern(root.children, path, callback, matches);
            } else if (root.type === 'object') {
              // for an object node, we need to get each 'property' child and get its value child
              root.children.forEach(propNode => {
                if (Array.isArray(propNode.children)) {
                  matchJsonNodesAtPattern(propNode.children[1], path, callback, matches);
                }
              });
            }
          }
        } else {
          // name match, only works on 'object' node
          if (root.type === 'object' && Array.isArray(root.children)) {
            // check each 'property' child to see if the name child matches
            root.children.forEach(propNode => {
              if (Array.isArray(propNode.children) && propNode.children[0] && propNode.children[0].value === name) {
                matchJsonNodesAtPattern(propNode.children[1], path, callback, matches);
              }
            });
          }
        }
      } else {
        // name is a number, so root needs to be an array
        if (root.type === 'array' && name >= 0 && Array.isArray(root.children) && name < root.children.length) {
          matchJsonNodesAtPattern(root.children[name], path, callback, matches);
        }
      }
    });
  }

  return matches;
}

/**
 * Return the first node that match the path-patterns and optional callback.
 * @param roots the json node root(s) to start at.
 * @param path the list of property-name or array index or '*' to match on any
 * @param callback if specified, will be called on each node that matches the pattern; if this returns exactly false,
 *                 the node will be skipped and searching will continue, otherwise the node will be returned.
 * @param matches (optional) a list to collect the result into; if specified, will be used and returned.
 * @return the matches, always non-null.
 */
export function matchJsonNodeAtPattern(
  roots: JsonNode | JsonNode[] | undefined,
  path: JSONPath,
  callback?: (node: JsonNode) => false | any
): JsonNode | undefined {
  let found: JsonNode | undefined;
  const earlyReturnException = new Object();
  // this exception-based stack-unwinding is similar to what jsonc-parser's getLocation() impl does to exit early
  // (https://github.com/microsoft/node-jsonc-parser/blob/main/src/impl/parser.ts#L41)
  try {
    matchJsonNodesAtPattern(
      roots,
      path,
      node => {
        if (!callback || callback(node) !== false) {
          found = node;
          throw earlyReturnException;
        }
        return false; // tell matchJsonNodesAtPattern() to keep looking
      },
      []
    );
  } catch (e) {
    if (e !== earlyReturnException) {
      throw e;
    }
  }

  return found;
}

/** Tell if the specified file path exists and is a file.
 * @return true if it's a file, false it's not a file, undefined if it doesn't exist.
 */
export async function pathIsFile(filepath: string): Promise<boolean | undefined> {
  try {
    const stat = await fs.promises.stat(filepath);
    return stat.isFile();
  } catch (error) {
    if (typeof error === 'object' && (error as any).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
/** Tell if the specified string is a valid relative-path (for templates) */
export function isValidRelpath(relpath: string | undefined | null): boolean {
  return (
    !!relpath &&
    relpath.trim().length > 0 &&
    !relpath.startsWith('/') &&
    !relpath.startsWith('../') &&
    !relpath.includes('/../') &&
    !relpath.endsWith('/..')
  );
}

const varNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]+$/;
/** Tell if the specified value is a valid template variable name. */
export function isValidVariableName(name: string): boolean {
  return varNameRegex.test(name);
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
  let fuzzer: Fuse<string> | undefined;
  return (pattern: string) => {
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
    return fuzzer.search(pattern, searchOpts).map(result => result.item);
  };
}
