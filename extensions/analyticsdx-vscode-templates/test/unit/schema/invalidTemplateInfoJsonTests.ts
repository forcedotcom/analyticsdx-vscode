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
    errors.expectMissingProps(true, 'name', 'label', 'assetVersion', 'releaseInfo');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('empty-app.json', async () => {
    const errors = await validate('empty-app.json');
    errors.expectMissingProps(true, 'name', 'label', 'assetVersion', 'releaseInfo');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('empty-dashboard.json', async () => {
    const errors = await validate('empty-dashboard.json');
    errors.expectMissingProps(true, 'name', 'label', 'assetVersion', 'dashboards');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('empty-lens.json', async () => {
    const errors = await validate('empty-lens.json');
    errors.expectMissingProps(true, 'name', 'label', 'assetVersion', 'lenses');
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-template-type.json', async () => {
    const errors = await validate('invalid-template-type.json');
    errors.expectInvalidProps(true, 'templateType');
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-fields.json', async () => {
    const errors = await validate('invalid-fields.json');
    errors.expectInvalidProps(
      true,
      'error',
      'releaseInfo.error',
      'rules[0].error',
      'externalFiles[0].error',
      'lenses[0].error',
      'dashboards[0].error',
      'eltDataflows[0].error',
      'datasetFiles[0].error',
      'storedQueries[0].error',
      'imageFiles[0].error',
      'extendedTypes.type[0].error',
      'icons.error',
      'icons.appBadge.error',
      'icons.templateBadge.error',
      'icons.templatePreviews[0].error',
      'customAttributes[0].error',
      'videos[0].error',
      'templateDependencies[0].error',
      'apexCallback.error'
    );
    errors.expectNoMissingProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('missing-required-fields.json', async () => {
    const errors = await validate('missing-required-fields.json');
    errors.expectMissingProps(
      true,
      'releaseInfo.templateVersion',
      'rules[0].type',
      'rules[0].file',
      'dashboards[0].file',
      'dashboards[0].label',
      'lenses[0].file',
      'lenses[0].label',
      'eltDataflows[0].file',
      'eltDataflows[0].name',
      'eltDataflows[0].label',
      'externalFiles[0].name',
      'externalFiles[0].type',
      'datasetFiles[0].label',
      'datasetFiles[0].name',
      'extendedTypes.type[0].file',
      'extendedTypes.type[0].label',
      'imageFiles[0].name',
      'imageFiles[0].file',
      'storedQueries[0].file',
      'storedQueries[0].label',
      'icons.appBadge.name',
      'icons.templateBadge.name',
      'icons.templatePreviews[0].name',
      'icons.templatePreviews[0].label',
      'customAttributes[0].label',
      'templateDependencies[0].name',
      'apexCallback.name',
      'apexCallback.namespace',
      'videos[0].purpose',
      'videos[0].id',
      'videos[0].linkType',
      'videos[0].label'
    );
    errors.expectNoInvalidProps();
    errors.expectNoUnrecognizedErrors();
  });

  it('invalid-templateVersion.json', async () => {
    const errors = await validate('invalid-templateVersion.json');
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
