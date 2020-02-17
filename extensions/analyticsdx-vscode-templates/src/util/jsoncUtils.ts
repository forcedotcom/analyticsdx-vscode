/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getNodePath, JSONPath, Node as JsonNode } from 'jsonc-parser';

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
  // (https://github.com/microsoft/node-jsonc-parser/blob/master/src/impl/parser.ts#L41)
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

const jsonIdRegex = /^[A-Za-z][-A-Za-z0-9_]*$/;
/**
 * Convert the specified path of a node to a an javascript-style expression (e.g. foo.bar[2])
 */
export function jsonPathToString(path: JSONPath): string {
  let buf = '';
  path.forEach(part => {
    if (typeof part === 'string') {
      // if the part is valid json-ish id, slap it on directly
      if (jsonIdRegex.test(part) && part !== 'true' && part !== 'false') {
        if (buf) {
          buf += '.';
        }
        buf += part;
      } else {
        // otherwise do associate-array style, with double-quotes
        buf += '["' + part.replace(/"/g, '\\"') + '"]';
      }
    } else {
      // number
      buf += '[' + part + ']';
    }
  });
  return buf;
}

/** Find the ancestor 'property' json node at or above the specified node for the specified property.
 * This does not support wildcard paths.
 * @param node the selected node.
 * @param propertyPath the path of the property name (e.g. ['icons', 'templateDetail']).
 * @return the property node, or undefined if propertyPath isn't at or under node.
 */
export function findPropertyNodeFor(node: JsonNode | undefined, propertyPath: JSONPath): JsonNode | undefined {
  if (node) {
    do {
      if (isPropertyNodeFor(node, propertyPath)) {
        return node;
      }
      node = node.parent;
    } while (node);
  }
  return undefined;
}

function isPropertyNodeFor(node: JsonNode, path: JSONPath): boolean {
  if (node.type === 'property') {
    // a property nodes will have a path of of the parent path (e.g. ['icons'] if node was ['icon', 'templateDetails'])
    // and have a first child whose value is the property name (e.g. 'templateDetails')
    const nodePath = getNodePath(node);
    // the nodePath should match the expected path except for the last part
    if (nodePath.length === path.length - 1 && pathPartsAreEquals(nodePath, path)) {
      const propName = node.children && node.children.length >= 1 && node.children[0] && node.children[0].value;
      // and the propName node should match the expected path's last part
      return propName === path[path.length - 1];
    }
  }
  return false;
}

/** Determine if the 2 paths are equals, up to the specified length (defaults to the length of the first path) */
export function pathPartsAreEquals(a1: JSONPath, a2: JSONPath, len = a1.length) {
  if (a1.length < len || a2.length < len) {
    return false;
  }
  for (let i = 0; i < len; i++) {
    if (a1[i] !== a2[i]) {
      return false;
    }
  }
  return true;
}
