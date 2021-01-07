/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import { schemas } from '../../../src/schemas';
import { createRelPathValidateFn } from '../../testutils';

describe('variables-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(
    schemas.variables,
    path.join(__dirname, 'testfiles', 'variables', 'invalid')
  );

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    // with how Ajv processes the schema, we will get extraneous errors on variableType.type for the array, object, and
    // sobjectField vars, so this passes in false to ignore those
    errors.expectInvalidProps(
      false,
      'emptyType.variableType.type',
      'invalidType.variableType.type',
      'invalidArrayType.variableType.itemsType.type',
      'invalidObjectType.variableType.properties.foo.type',
      'invalidSobjectFieldType.variableType.dataType'
    );
    // and, also since things don't match, Ajv will report some extraneous missing fields and bad 'anyOf's, so
    // we're not going to check those
  });

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      false,
      'stringvar.error',
      'stringvar.variableType.error',
      'objvar.variableType.properties.foo.error',
      'arrayvar.variableType.itemsType.error',
      'arrayvar.variableType.sizeLimit.error'
    );
  });

  it('missing-vartype-fields.json', async () => {
    const errors = await validate('missing-vartype-fields.json');
    errors.expectMissingProps(false, 'array.variableType.itemsType');
  });
});
