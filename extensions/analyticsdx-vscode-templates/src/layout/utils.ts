/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { JSONPath, Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { matchJsonNodeAtPattern } from '../util/jsoncUtils';

const paths: Array<Readonly<JSONPath>> = [
  ['pages', '*', 'layout', 'center', 'items', '*'],
  ['pages', '*', 'layout', 'right', 'items', '*'],
  ['pages', '*', 'layout', 'left', 'items', '*'],
  ['pages', '*', 'layout', 'center', 'items', '*', 'items', '*'],
  ['pages', '*', 'layout', 'right', 'items', '*', 'items', '*'],
  ['pages', '*', 'layout', 'left', 'items', '*', 'items', '*']
];

/** Tell if the specified json location is in a layout item
 * @param location the location
 * @param attrName the name of an item attribute to also check.
 */
export function matchesLayoutItem(location: Location, attrName?: string) {
  // TODO: make this more specific to the layout type (e.g. only 'center' if SingleColumn)
  return paths.some(path => location.matches(attrName ? path.concat(attrName) : (path as JSONPath)));
}

export function isInTilesEnumKey(location: Location) {
  return (
    location.isAtPropertyKey &&
    matchesLayoutItem(location, 'tiles') &&
    // when it's directly in the keys of 'tiles', then the path will be like [..., 'tiles', ''] or
    // [..., 'tiles', 'enumValue'], so only trigger then (to avoid triggering when down the tree in the
    // tile def objects). also, check the path length to avoid triggering when a tile enumValue is
    // literally "tiles"
    ((location.path.length === 8 && location.path[6] === 'tiles') ||
      (location.path.length === 10 && location.path[8] === 'tiles'))
  );
}

/** Find the "name" in the item above the passed in "tiles" location, if the item type="Variable"
 */
export function getLayoutItemVariableName(document: vscode.TextDocument, itemPath: JSONPath): string | undefined {
  const tree = parseTree(document.getText());
  // go up one from the tiles to the item
  const item = tree?.type === 'object' ? matchJsonNodeAtPattern(tree, itemPath) : undefined;
  if (item) {
    const typeNode = matchJsonNodeAtPattern(item, ['type']);
    if (typeNode?.value === 'Variable') {
      const nameNode = matchJsonNodeAtPattern(item, ['name']);
      return typeof nameNode?.value === 'string' ? nameNode.value : undefined;
    }
  }
}
