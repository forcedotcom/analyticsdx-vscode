/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { JSONSchema } from 'vscode-json-languageservice';
import * as baseSchema from './schemas/adx-template-json-base-schema.json';
import * as autoInstallSchema from './schemas/auto-install-schema.json';
import * as folderSchema from './schemas/folder-schema.json';
import * as layoutSchema from './schemas/layout-schema.json';
import * as rulesSchema from './schemas/rules-schema.json';
import * as templateInfoSchema from './schemas/template-info-schema.json';
import * as uiSchema from './schemas/ui-schema.json';
import * as variablesSchema from './schemas/variables-schema.json';

export const schemas = Object.freeze({
  base: baseSchema as JSONSchema,
  autoInstall: autoInstallSchema as JSONSchema,
  folder: folderSchema as JSONSchema,
  templateInfo: templateInfoSchema as JSONSchema,
  ui: uiSchema as JSONSchema,
  // jsonSchema.d.ts says these don't match JSONSchema with something about the not.enum on the
  // discriminated type logic, but I can't see how to fix it, and this works fine
  layout: layoutSchema as any as JSONSchema,
  rules: rulesSchema as any as JSONSchema,
  variables: variablesSchema as any as JSONSchema
});
