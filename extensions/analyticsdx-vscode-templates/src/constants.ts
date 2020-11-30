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

/** Diagnostic source id for errors from TemplateLinter. */
export const LINTER_SOURCE_ID = 'adx-template';

export const jsonFileFilter = newFileExtensionFilter('json');
export const htmlFileFilter = newFileExtensionFilter('html', 'htm');
export const imageFileFilter = newFileExtensionFilter('png', 'jpg', 'gif', 'svg');
export const csvFileFilter = newFileExtensionFilter('csv');

const definitionFilesPats = [
  ['variableDefinition'] as JSONPath,
  ['uiDefinition'],
  ['folderDefinition'],
  ['autoInstallDefinition'],
  ['ruleDefinition'],
  ['rules', '*', 'file'],
  ['dashboards', '*', 'file'],
  ['lenses', '*', 'file'],
  ['eltDataflows', '*', 'file'],
  ['storedQueries', '*', 'file'],
  ['extendedTypes', '*', '*', 'file'],
  ['recipes', '*', 'file']
];
const jsonPats = [
  ...definitionFilesPats,
  ['externalFiles', '*', 'schema'],
  ['externalFiles', '*', 'userXmd'],
  ['datasetFiles', '*', 'userXmd']
];
const htmlPats = [['releaseInfo', 'notesFile'] as JSONPath];
const imagePats = [['imageFiles', '*', 'file'] as JSONPath];
const csvPats = [['externalFiles', '*', 'file'] as JSONPath];

/**
 * Constants related to template-info.json files.
 */
export const TEMPLATE_INFO = Object.freeze({
  /** JSONPaths to attributes that are relative-paths to object definition files.
   * Generally, these should not be referenced more than once in a template.
   */
  definitionFilePathLocationPatterns: Object.freeze(definitionFilesPats),

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

/** Diagnostic error codes, generally set in TemplateLinter. */
export const ERRORS = Object.freeze({
  /** Template name must match folder name */
  TMPL_NAME_MATCH_FOLDER_NAME: 'tmpl-1',
  /** Template is using rules and ruleDefinition */
  TMPL_RULES_AND_RULE_DEFINITION: 'tmpl-2',
  /** App template needs at least 1 dashbaord, dataflow, or dataset */
  TMPL_APP_MISSING_OBJECTS: 'tmpl-3',
  /** Dashboard template needs exactly 1 dashbaord */
  TMPL_DASH_ONE_DASHBOARD: 'tmpl-4',
  /** Relative paths in template must be valid */
  TMPL_INVALID_REL_PATH: 'tmpl-5',
  /** Relative path in template doesn't exist */
  TMPL_REL_PATH_NOT_EXIST: 'tmpl-6',
  /** Relative path in template is not a file */
  TMPL_REL_PATH_NOT_FILE: 'tmpl-7',
  /** Duplicate relative path in template */
  TMPL_DUPLICATE_REL_PATH: 'tmpl-8',
  /** Template is using assetIcon and icons.appBadge */
  TMPL_ASSETICON_AND_APPBADGE: 'tmpl-9',
  /** Template is using templateIcon and icons.templateBadge */
  TMPL_TEMPLATEICON_AND_TEMPLATEBADGE: 'tmpl-10',
  /** An embeddedapp template has a ui.json with pages. */
  TMPL_EMBEDDED_APP_WITH_UI: 'tmpl-11',
  /** An embeddedapp template is missing at least one share in the folderDefinition (or folderDefinition doesn't exist). */
  TMPL_EMBEDDED_APP_NO_SHARES: 'tmpl-12',
  /** A non-app/embeddedapp template with autoInstallDefinition specified.  */
  TMPL_NON_APP_WITH_AUTO_INSTALL: 'tmpl-13',
  /** A template with autoInstallDefinition doesn't have a name in the folderDefinition (or folderDefinition doesn't exist) */
  TMPL_AUTO_INSTALL_MISSING_FOLDER_NAME: 'tmpl-14',
  /** Duplicate name in a set of template assets */
  TMPL_DUPLICATE_NAME: 'tmpl-15',
  /** Duplicate label in a set of template assets */
  TMPL_DUPLICATE_LABEL: 'tmpl-16',

  /** Unknown variable in values in autoInstallDefinition. */
  AUTO_INSTALL_UNKNOWN_VARIABLE: 'auto-1',

  /** Regex in variable in variable excludes is missing closing / */
  VARS_REGEX_MISSING_SLASH: 'vars-1',
  /** Regex options in variable excludes are invalid */
  VARS_INVALID_REGEX_OPTIONS: 'vars-2',
  /** Regex in variable excludes is invalid */
  VARS_INVALID_REGEX: 'vars-3',
  /** Mulitple regex in variable excludes found */
  VARS_MULTIPLE_REGEXES: 'vars-4',

  /** Non-vfPage page missing variables */
  UI_PAGE_MISSING_VARIABLES: 'ui-1',
  /** Non-vfPage page has empty variable */
  UI_PAGE_EMPTY_VARIABLES: 'ui-2',
  /** Unknown variable in ui page */
  UI_PAGE_UNKNOWN_VARIABLE: 'ui-3',
  /** Unsupported variable type in non-vfPage ui page */
  UI_PAGE_UNSUPPORTED_VARIABLE: 'ui-4',

  /** Duplicate constant in rules file(s) */
  RULES_DUPLICATE_CONSTANT: 'rules-1',
  /** Duplicate rule name in rules file(s) */
  RULES_DUPLICATE_RULE_NAME: 'rules-2',
  /** Duplciate macro namespace:name in rules file(s) */
  RULES_DUPLICATE_MACRO: 'rules-3',
  /** Macro will no return nor actions */
  RULES_NOOP_MACRO: 'rules-4'
});
