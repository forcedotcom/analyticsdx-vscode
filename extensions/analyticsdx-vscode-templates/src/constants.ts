/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { JSONPath } from 'jsonc-parser';
import { newFileExtensionFilter } from './util/utils';

// Note: keep these in-sync with the publisher and name in package.json
export const EXTENSION_PUBLISHER = 'salesforce';
export const EXTENSION_NAME = 'analyticsdx-vscode-templates';
export const EXTENSION_ID = EXTENSION_PUBLISHER + '.' + EXTENSION_NAME;

// Note: keep this is sync with the language id in package.json
export const TEMPLATE_JSON_LANG_ID = 'adx-template-json';

export const jsonFileFilter = newFileExtensionFilter('json');
export const htmlFileFilter = newFileExtensionFilter('html', 'htm');
export const imageFileFilter = newFileExtensionFilter('png', 'jpg', 'gif', 'svg');
export const csvFileFilter = newFileExtensionFilter('csv');

const jsonPats = [
  ['variableDefinition'] as JSONPath,
  ['uiDefinition'],
  ['folderDefinition'],
  ['ruleDefinition'],
  ['rules', '*', 'file'],
  ['dashboards', '*', 'file'],
  ['lenses', '*', 'file'],
  ['eltDataflows', '*', 'file'],
  ['externalFiles', '*', 'schema'],
  ['externalFiles', '*', 'userXmd'],
  ['storedQueries', '*', 'file'],
  ['datasetFiles', '*', 'userXmd'],
  ['extendedTypes', '*', '*', 'file']
];
const htmlPats = [['releaseInfo', 'notesFile'] as JSONPath];
const imagePats = [['imageFiles', '*', 'file'] as JSONPath];
const csvPats = [['externalFiles', '*', 'file'] as JSONPath];

/**
 * Constants related to template-info.json files.
 */
export const TEMPLATE_INFO = Object.freeze({
  /**
   * JSONPaths to attributes that should be relative-paths to other json files.
   */
  jsonRelFilePathLocationPatterns: Object.freeze(jsonPats),

  /**
   * JSONPaths to attributes that should be relative-paths to html files.
   */
  htmlRelFilePathLocationPatterns: Object.freeze(htmlPats),

  /**
   * JSONPaths to attributes that should be relative-paths to CSV files.
   */
  imageRelFilePathLocationPatterns: Object.freeze(imagePats),

  /**
   * JSONPaths to attributes that should be relative-paths to CSV files.
   */
  csvRelFilePathLocationPatterns: Object.freeze(csvPats),

  /**
   * All JSONPaths to attributes that can be relative-paths to other files.
   */
  allRelFilePathLocationPatterns: Object.freeze([...jsonPats, ...htmlPats, ...imagePats, ...csvPats])
});
