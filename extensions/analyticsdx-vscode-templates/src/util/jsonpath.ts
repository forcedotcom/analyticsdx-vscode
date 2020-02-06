/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { JSONPath, parse as parseJsonc } from 'jsonc-parser';
import { paths as _jsonpathSearch } from 'jsonpath';

/** Execute a jsonpath search.
 * @param jsonpath the jsonpath string
 * @param txtOrObj the raw json string text, or the json object itself
 * @return the list of matching paths (as structures, no leading $)
 */
export function jsonpathSearch(jsonpath: string, txtOrObj: string | object): JSONPath[] {
  const obj = typeof txtOrObj === 'string' ? parseJsonc(txtOrObj) : txtOrObj;
  const matches = _jsonpathSearch(obj, jsonpath).map(match =>
    // jsonpath.paths returns a leading $, which we don't want
    match[0] === '$' ? match.slice(1, match.length) : match
  );
  return matches;
}
