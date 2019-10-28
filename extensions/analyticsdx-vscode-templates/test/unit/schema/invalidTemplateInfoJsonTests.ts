/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as path from 'path';
import * as schema from '../../../schemas/template-info-schema.json';
import { createRelPathValidateFn } from '../../testutils';

// Note: VSCode doesn't use Ajv for it's json schema, so the errors we get here won't exactly line up with
// what shows in VSCode; we'll test that in a vscode-integration test.
// Also, the deprecationMessage's in the schema is only supported in VSCode, so we won't see those errors here
// either
describe('template-info-schema.json finds errors in', () => {
  const validate = createRelPathValidateFn(schema, path.join(__dirname, 'testfiles', 'template-info', 'invalid'));

  it('empty.json', async () => {
    const errors = await validate('empty.json');
    errors.expectMissingProps(
      true,
      'templateType',
      'name',
      'label',
      'assetVersion',
      'releaseInfo',
      'rules',
      'dashboards',
      'lenses',
      'eltDataflows',
      'externalFiles'
    );
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('empty-app.json', async () => {
    const errors = await validate('empty-app.json');
    errors.expectMissingProps(
      true,
      'name',
      'label',
      'assetVersion',
      'releaseInfo',
      'rules',
      'dashboards',
      'lenses',
      'eltDataflows',
      'externalFiles'
    );
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('empty-dashboard.json', async () => {
    const errors = await validate('empty-dashboard.json');
    errors.expectMissingProps(true, 'name', 'label', 'assetVersion', 'rules', 'dashboards');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-template-type.json', async () => {
    const errors = await validate('invalid-template-type.json');
    errors.expectInvalidProps(true, 'templateType');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('releaseInfo/missing-templateVersion.json', async () => {
    const errors = await validate('releaseInfo/missing-templateVersion.json');
    errors.expectMissingProps(true, 'releaseInfo.templateVersion');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('releaseInfo/invalid-templateVersion.json', async () => {
    const errors = await validate('releaseInfo/invalid-templateVersion.json');
    errors.expectInvalidProps(true, 'releaseInfo.templateVersion');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-overwriteOnUpgrade.json', async () => {
    const errors = await validate('invalid-overwriteOnUpgrade.json');
    errors.expectInvalidProps(true, 'dashboards[0].overwriteOnUpgrade', 'dashboards[1].overwriteOnUpgrade');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  // TODO: rules, dashboard, lenses, eltDataflows, externalFiles, datasetFiles, imageFiles, storedQueries, extendedTypes,
  //       customAttributes, icons, videos, templateDependencies required fields
  // TODO: rules.type valid
  // TODO: externalFiles.type and .rows valid
  // TODO: videos linkType and purpose valid, required fields
  // TODO: templateDependencies.templateVersion
});
