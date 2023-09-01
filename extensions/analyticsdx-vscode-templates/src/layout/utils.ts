/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { JSONPath, Location } from 'jsonc-parser';

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
