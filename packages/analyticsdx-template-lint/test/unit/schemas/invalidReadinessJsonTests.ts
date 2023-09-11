/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import { schemas } from '../../../src/schemas';
import { createRelPathValidateFn } from '../../testutils';

describe('readiness-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(
    schemas.readiness,
    path.join(__dirname, 'testfiles', 'readiness', 'invalid')
  );

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    errors.expectInvalidProps(
      false,
      'templateRequirements[0].type',
      'definition.empty.type',
      'definition.bad.type',
      'definition.filterOp.filters[0].operator'
    );
  });

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      false,
      'error',
      'values["-"]',
      'templateRequirements[0].error',
      'templateRequirements[1].image.error',
      'definition.sobject.error',
      'definition.sobject.sobject',
      'definition.sobject.filters[0].field',
      'definition.dataset.dataset',
      'definition.appDataset.dataset',
      'definition.datacloud.object'
    );
  });

  it('invalid-values.json', async () => {
    const errors = await validate('invalid-values.json');
    errors.expectInvalidProps(
      false,
      'templateRequirements[0].type',
      'definition.empty.type',
      'definition.bad.type',
      'definition.filterOp.filters[0].value',
      'definition.filterOp.filters[1].value',
      'definition.filterOp.filters[2].value',
      'definition.filterOp.filters[3].value',
      'definition.filterOp.filters[4].value',
      'definition.filterOp.filters[5].value'
    );
  });
});
