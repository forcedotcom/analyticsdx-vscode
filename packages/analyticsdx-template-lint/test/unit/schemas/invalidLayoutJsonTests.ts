/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import { schemas } from '../../../src/schemas';
import { createRelPathValidateFn } from '../../testutils';

describe('layout-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(schemas.layout, path.join(__dirname, 'testfiles', 'layout', 'invalid'));

  it('invalid-enums.json', async () => {
    const errors = await validate('invalid-enums.json');
    errors.expectInvalidProps(
      false,
      'pages[0].layout.center.items[0].type',
      'pages[0].layout.center.items[0].visibility',
      'pages[0].layout.center.items[1].type',
      'pages[0].layout.center.items[1].visibility',
      'pages[0].layout.center.items[2].items[0].type',
      'pages[0].layout.center.items[2].items[1].type',
      'pages[0].layout.center.items[2].items[1].visibility',
      'pages[0].layout.center.items[2].items[2].type',
      'pages[0].layout.center.items[2].items[2].visibility',
      'pages[0].layout.center.items[2].items[2].name',
      'pages[0].layout.center.items[3].variant',
      'pages[1].layout.type',
      'displayMessages[0].location',
      'pages[0].guidancePanel.items[0].type',
      'pages[0].guidancePanel.items[0].variant',
      'pages[0].guidancePanel.items[1].type',
      'pages[0].guidancePanel.items[1].variant',
      'pages[0].guidancePanel.items[2].type',
      'pages[0].guidancePanel.items[2].variant'
    );
  });

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      false,
      'error',
      'pages[0].error',
      'pages[0].backgroundImage.error',
      'pages[0].layout.error',
      'pages[0].layout.header.error',
      'pages[0].layout.center.error',
      'pages[0].layout.center.items[0].error',
      'pages[0].layout.center.items[0].image.error',
      'pages[0].layout.center.items[1].items',
      'pages[0].layout.center.items[2].error',
      'pages[0].layout.center.items[2].items[0].error',
      'pages[0].layout.center.items[2].items[0].image.error',
      'pages[0].layout.center.items[2].items[1].tiles.bar.error',
      'pages[0].layout.center.items[3].tiles.foo.error',
      'displayMessages[0].error',
      'pages[0].guidancePanel.error',
      'pages[0].guidancePanel.backgroundImage.error',
      'pages[0].guidancePanel.items[0].error',
      'pages[0].guidancePanel.items[1].image.error',
      'pages[0].guidancePanel.items[1].error',
      'pages[0].guidancePanel.items[2].error'
    );
  });

  it('invalid-pages.json', async () => {
    const errors = await validate('invalid-pages.json');
    errors.expectInvalidProps(
      false,
      'pages[0].layout.center.items[1].name',
      'pages[0].guidancePanel.title',
      'pages[0].guidancePanel.backgroundImage'
    );
    errors.expectMissingProps(
      false,
      'pages[0].layout.center.items[0].type',
      'pages[0].layout.center.items[2].name',
      'pages[0].layout.center.items[3].text',
      'pages[0].layout.center.items[4].image',
      'pages[0].layout.center.items[5].image.name',
      'pages[1].layout.center',
      'pages[2].layout.left',
      'pages[2].layout.right',
      'pages[0].guidancePanel.items[0].type',
      'pages[0].guidancePanel.items[1].text',
      'pages[0].guidancePanel.items[2].image',
      'pages[0].guidancePanel.items[3].text',
      'pages[0].guidancePanel.items[3].url',
      'pages[0].guidancePanel.items[4].image.name'
    );
  });

  it('invalid-displayMessages.json', async () => {
    const errors = await validate('invalid-displayMessages.json');
    errors.expectMissingProps(true, 'displayMessages[0].text', 'displayMessages[0].location');
    errors.expectInvalidProps(true, 'displayMessages');
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-appDetails.json', async () => {
    const errors = await validate('invalid-appDetails.json');
    errors.expectInvalidProps(true, 'appDetails.unknownProperty');
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-navigationPanel.json', async () => {
    const errors = await validate('invalid-navigationPanel.json');
    errors.expectInvalidProps(true, 'navigationPanel.unknownProperty');
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-navigation.json', async () => {
    const errors = await validate('invalid-navigation.json');
    errors.expectInvalidProps(true, 'pages[0].navigation.unknownProperty', 'appDetails.navigation.unknownProperty');
    errors.expectNoUnrecognizedErrors();
  });
});
