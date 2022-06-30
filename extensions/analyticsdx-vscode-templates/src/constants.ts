/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { newFileExtensionFilter } from './util/utils';

// re-export these from the linter library, in case we need to muck with them in the future
export { ERRORS, LINTER_SOURCE_ID, TEMPLATE_INFO } from '@salesforce/analyticsdx-template-lint';

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
