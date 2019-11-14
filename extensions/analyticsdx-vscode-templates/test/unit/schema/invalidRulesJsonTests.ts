/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import * as schema from '../../../schemas/rules-schema.json';
import { createRelPathValidateFn } from '../../testutils';

describe('rules-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(schema, path.join(__dirname, 'testfiles', 'rules', 'invalid'));

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    errors.expectInvalidProps(
      true,
      'rules[0].appliesTo[0].type',
      'rules[0].appliesTo[1].type',
      'rules[0].actions[0].action',
      'rules[0].actions[1].action'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      true,
      'error',
      'constants[0].error',
      'rules[0].error',
      'rules[0].appliesTo[0].error',
      'rules[0].actions[0].error',
      'macros[0].error',
      'macros[0].definitions[0].error'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-actions.json', async () => {
    const errors = await validate('invalid-actions.json');
    // with the way Ajv works against rules-schema.json, we're going to get a bunch of 'anyOf' and 'not' errors that we
    // don't care about, so just make sure we see at least these
    errors.expectInvalidProps(
      false,
      'macros[0].definitions[0].actions[0].index',
      'macros[0].definitions[0].actions[1].key',
      'macros[0].definitions[0].actions[2].key',
      'macros[0].definitions[0].actions[3].key',
      'macros[0].definitions[0].actions[3].value'
    );
    errors.expectMissingProps(
      false,
      'rules[0].actions[0].action',
      'rules[0].actions[1].value',
      'rules[0].actions[1].path',
      'rules[0].actions[2].path',
      'rules[0].actions[3].value',
      'rules[0].actions[4].key',
      'rules[0].actions[4].value',
      'rules[0].actions[4].path',
      'rules[0].actions[5].key',
      'rules[0].actions[5].value',
      'rules[0].actions[6].path',
      'rules[0].actions[6].value'
    );
  });

  it('invalid-conditions.json', async () => {
    const errors = await validate('invalid-conditions.json');
    errors.expectInvalidProps(true, 'rules[0].condition', 'macros[0].definitions[0].actions[0].condition');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-macro-names.json', async () => {
    const errors = await validate('invalid-macro-names.json');
    errors.expectInvalidProps(
      true,
      'macros[0].namespace',
      'macros[1].namespace',
      'macros[2].namespace',
      'macros[3].namespace',
      'macros[4].namespace',
      'macros[4].definitions[0].name',
      'macros[4].definitions[1].name',
      'macros[4].definitions[2].name',
      'macros[4].definitions[3].name'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });
});
