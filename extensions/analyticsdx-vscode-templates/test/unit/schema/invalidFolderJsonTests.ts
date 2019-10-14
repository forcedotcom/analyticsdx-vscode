/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as Ajv from 'ajv';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as schema from '../../../schemas/folder-schema.json';
import { SchemaErrors } from '../../testutils';

const basedir = path.join(__dirname, 'testfiles', 'folder', 'invalid');

describe('folder-schema.json finds errors in', () => {
  const ajv = new Ajv({ allErrors: true });
  const validator = ajv.compile(schema);
  const readFile = promisify(fs.readFile);

  async function validate(relpath: string) {
    const json = await readFile(path.join(basedir, relpath), { encoding: 'utf-8' }).then(JSON.parse);
    const result = await validator(json);
    if (result || !validator.errors || validator.errors.length <= 0) {
      expect.fail('Expected validation errors on ' + relpath);
    }
    return new SchemaErrors(validator.errors);
  }

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
