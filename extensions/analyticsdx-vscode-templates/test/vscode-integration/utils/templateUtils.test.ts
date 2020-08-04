/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { findTemplateInfoFileFor } from '../../../src/util/templateUtils';
import { uriFromTestRoot, waveTemplatesUriPath } from '../vscodeTestUtils';

// tslint:disable: no-unused-expression
describe('templateUtils', () => {
  describe('findTemplateInfoFileFor()', () => {
    [
      'folder.json',
      'releaseNotes.html',
      'ui.json',
      'variables.json',
      'template-to-app-rules.json',
      'template-info.json',
      'file-that-doesnot-exist.json',
      'dashboards/dashboard.json',
      'recipes/recipe.json',
      'images/image.png',
      'dir-not-exist/file-not-exist.json'
    ].forEach(path => {
      it(`finds template-info.json from ${waveTemplatesUriPath}/allRelpaths/${path}`, async () => {
        const file = uriFromTestRoot(waveTemplatesUriPath, 'allRelpaths', path);
        const templateInfo = await findTemplateInfoFileFor(file);
        expect(templateInfo, 'template-info.json uri').to.not.be.undefined;
        expect(templateInfo!.path, 'template-info.json path').to.match(/\/allRelpaths\/template-info\.json$/);
      });
    });

    [
      'force-app/aura/DemoApp.app',
      'vscodeUtilsTest/vscodeUtils.test.json',
      '../../out-of-workspace/foo.txt',
      '../../../../../../../../../etc/passwd',
      '',
      '   ',
      './folder.json'
    ].forEach(path => {
      it(`doesn't find template-info.json from ${path}`, async () => {
        const file = uriFromTestRoot(waveTemplatesUriPath, path);
        const templateInfo = await findTemplateInfoFileFor(file);
        expect(templateInfo, 'template-info.json uri').to.be.undefined;
      });
    });
  });
});
