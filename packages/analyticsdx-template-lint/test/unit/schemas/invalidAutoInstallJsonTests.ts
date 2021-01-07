/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import { schemas } from '../../../src/schemas';
import { createRelPathValidateFn } from '../../testutils';

describe('auto-install-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(
    schemas.autoInstall,
    path.join(__dirname, 'testfiles', 'auto-install', 'invalid')
  );

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      true,
      'error',
      'hooks[0].error',
      'configuration.error',
      'configuration.appConfiguration.error'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    errors.expectInvalidProps(true, 'hooks[0].type');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-hooks.json', async () => {
    const errors = await validate('invalid-hooks.json');
    errors.expectMissingProps(true, 'hooks[0].type');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-configuration.json', async () => {
    const errors = await validate('invalid-configuration.json');
    errors.expectMissingProps(true, 'configuration.appConfiguration');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('empty.json', async () => {
    const errors = await validate('empty.json');
    errors.expectMissingProps(true, 'hooks', 'configuration');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });
});
