/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { FormattingOptions, getNodePath, JSONPath, Node as JsonNode } from 'jsonc-parser';

export { matchJsonNodeAtPattern, matchJsonNodesAtPattern } from 'analyticsdx-template-lint';

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

/** Do a JSON.stringify, but obey the specified formatting options (for spaces vs. tabs).
 */
export function jsonStringifyWithOptions(
  value: any,
  formattingOptions: FormattingOptions | undefined,
  replacer?: ((this: any, key: string, value: any) => any) | Array<number | string> | null
): string;
export function jsonStringifyWithOptions(
  value: any,
  formattingOptions: FormattingOptions | undefined,
  replacer?: any
): string {
  const space = (formattingOptions?.insertSpaces === false ? '\t' : formattingOptions?.tabSize) || 2;
  // REVIEWME: handle formattingOptions.eol? The vscode text editor and formatters already handle line endings based on
  // other prefs so it's probably ok to skip that here.
  return JSON.stringify(value, typeof replacer === 'function' || Array.isArray(replacer) ? replacer : undefined, space);
}
