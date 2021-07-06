/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as path from 'path';
import { getPackageDirectoryPaths, getSfdxProject } from '../../../src/util/sfdx';

// tslint:disable: no-unused-expression
describe('sfdx.ts', () => {
  const multiProjPath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'test-assets', 'sfdx-multi');
  describe('getSfdxProject()', () => {
    it('returns default project', async () => {
      const proj = await getSfdxProject();
      expect(proj).to.not.be.undefined.and.not.be.null;
      expect(proj.getSfdxProjectJson().get('sourceApiVersion'), 'sourceApiVersion').to.equal('47.0');
    });

    it('returns project for path', async () => {
      const proj = await getSfdxProject(multiProjPath);
      expect(proj).to.not.be.undefined.and.not.be.null;
      expect(proj.getSfdxProjectJson().get('sourceApiVersion'), 'sourceApiVersion').to.equal('53.0');
    });

    it('throws error on invalid path', async () => {
      const projPath = path.join(__dirname);
      try {
        const proj = await getSfdxProject(projPath);
        expect.fail(`Expected error, but got ${proj}`);
      } catch (e) {
        // success
      }
    });
  });

  describe('getPackageDirectoryPaths()', () => {
    it('returns single packageDirectoryPath', async () => {
      const dirs = await getPackageDirectoryPaths();
      expect(dirs).to.have.members(['force-app']);
    });

    it('returns multiple packageDirectoryPaths', async () => {
      const dirs = await getPackageDirectoryPaths(multiProjPath);
      expect(dirs).to.have.members(['force-app', 'other']);
    });
  });
});
