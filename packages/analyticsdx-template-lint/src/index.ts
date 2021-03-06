/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

export * from './constants';
export * from './filelinter';
export * from './linter';
export * from './schemas';
export * from './utils';

// Note: this is intentionally not re-exporting FileTemplateValidator, since that requires an optional
// dependency on vscode-json-languageservice; users with that installed can import it directly from
// 'analytics-template-lint/validator'
