/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { csvFileFilter, htmlFileFilter, imageFileFilter, jsonFileFilter } from '../../../src/constants';

// tslint:disable: no-unused-expression
describe('constants', () => {
  describe('csvFileFilter', () => {
    ['foo.csv', 'dir/file.csv', 'C:\\Progra~1\\dir\\file.CSV'].forEach(path => {
      it(`matches ${path}`, () => {
        expect(csvFileFilter(path)).to.be.true;
      });
    });
  });

  describe('htmlFileFilter', () => {
    ['foo.html', 'foo.htm', 'dir/file.html', '/tmp/dir1/file.htm', 'C:\\Progra~1\\dir\\file.HTML'].forEach(path => {
      it(`matches ${path}`, () => {
        expect(htmlFileFilter(path)).to.be.true;
      });
    });
  });

  describe('imageFileFilter', () => {
    ['png', 'gif', 'jpg', 'svg'].forEach(ext => {
      [
        `foo.${ext}`,
        `dir/file.${ext}`,
        `/tmp/dir1/file.${ext}`,
        `C:\\Progra~1\\dir\\file.${ext.toUpperCase()}`
      ].forEach(path => {
        it(`matches ${path}`, () => {
          expect(imageFileFilter(path)).to.be.true;
        });
      });
    });
  });

  describe('jsonFileFilter', () => {
    ['foo.json', 'dir/file.json', '/tmp/dir1/file.json', 'C:\\Progra~1\\dir\\file.JSON'].forEach(path => {
      it(`matches ${path}`, () => {
        expect(jsonFileFilter(path)).to.be.true;
      });
    });
  });
});
