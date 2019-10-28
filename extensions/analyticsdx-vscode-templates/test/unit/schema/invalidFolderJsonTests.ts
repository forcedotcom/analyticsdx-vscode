/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import * as schema from '../../../schemas/folder-schema.json';
import { createRelPathValidateFn } from '../../testutils';

describe('folder-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(schema, path.join(__dirname, 'testfiles', 'folder', 'invalid'));

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    errors.expectInvalidProps(true, 'shares[0].accessType', 'shares[0].shareType');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-featured-assets.json', async () => {
    const errors = await validate('invalid-featured-assets.json');
    errors.expectInvalidProps(true, 'featuredAssets.unsupported');
    errors.expectMissingProps(true, 'featuredAssets.default.assets[0].id');
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-shares.json', async () => {
    const errors = await validate('invalid-shares.json');
    errors.expectMissingProps(
      true,
      'shares[0].shareType',
      'shares[1].accessType',
      'shares[2].shareType',
      'shares[2].accessType'
    );
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });
});
