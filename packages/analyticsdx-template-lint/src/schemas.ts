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
import * as rulesSchema from './schemas/rules-schema.json';
import * as templateInfoSchema from './schemas/template-info-schema.json';
import * as uiSchema from './schemas/ui-schema.json';
import * as variablesSchema from './schemas/variables-schema.json';

export const schemas = Object.freeze({
  base: baseSchema as JSONSchema,
  autoInstall: autoInstallSchema as JSONSchema,
  folder: folderSchema as JSONSchema,
  // jsonSchema.d.ts says rulesSchema and variablesSchema doesn't match JSONSchema, but I can't tell how
  rules: (rulesSchema as any) as JSONSchema,
  templateInfo: templateInfoSchema as JSONSchema,
  ui: uiSchema as JSONSchema,
  variables: (variablesSchema as any) as JSONSchema
});
