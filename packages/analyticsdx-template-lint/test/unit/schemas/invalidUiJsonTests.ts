/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import { schemas } from '../../../src/schemas';
import { createRelPathValidateFn } from '../../testutils';

describe('ui-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(schemas.ui, path.join(__dirname, 'testfiles', 'ui', 'invalid'));

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    errors.expectInvalidProps(
      true,
      'pages[0].variables[0].visibility',
      'pages[0].variables[1].visibility',
      'displayMessages[0].location'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      true,
      'error',
      'pages[0].error',
      'pages[0].vfPage.error',
      'pages[0].variables[0].error',
      'displayMessages[0].error'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-pages.json', async () => {
    const errors = await validate('invalid-pages.json');
    errors.expectMissingProps(true, 'pages[0].title', 'pages[1].variables[0].name', 'pages[3].vfPage.name');
    errors.expectInvalidProps(true, 'pages[2].variables[0].name', 'pages[4].vfPage.name', 'pages[5].vfPage.name');
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-displayMessages.json', async () => {
    const errors = await validate('invalid-displayMessages.json');
    errors.expectMissingProps(true, 'displayMessages[0].text', 'displayMessages[0].location');
    errors.expectInvalidProps(true, 'displayMessages');
    errors.expectNoUnrecognizedErrors();
  });
});
