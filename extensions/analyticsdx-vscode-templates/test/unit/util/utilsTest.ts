/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { isSameUriPath, isUriPathUnder, isWhitespaceChar } from '../../../src/util/utils';

// tslint:disable: no-unused-expression
describe.only('utils', () => {
  describe('isWhitespaceChar()', () => {
    [[' ', 'space'], ['\t', 'tab'], ['\r', 'CR'], ['\n', 'LF']].forEach(([ch, name]) => {
      it(`matches ${name}`, () => {
        expect(isWhitespaceChar(ch)).to.be.true;
      });
    });

    ['', 't', 'ttt', '  '].forEach(ch => {
      it(`doesn't match '${ch}'`, () => {
        expect(isWhitespaceChar(ch)).to.be.false;
      });
    });
  });

  describe('isUriPathUnder()', () => {
    [
      ['/foo', '/foo/file.json'],
      ['/foo', '/foo/bar/file.json'],
      ['/foo/', '/foo/bar/'],
      ['/foo', '/foo/./file.json'],
      ['/foo', '/foo/bar/../file.json']
    ].forEach(([parent, file]) => {
      it(`matches ${parent} -> ${file}`, () => {
        expect(isUriPathUnder(parent, file)).to.be.true;
      });
    });

    [
      ['/foo', '/'],
      ['/foo', '/foo'],
      ['/foo/', '/foo'],
      ['/foo', '/foo/'],
      ['/foo/', '/foobar'],
      ['/foo', '/foo/../bar']
    ].forEach(([parent, file]) => {
      it(`doesn't match ${parent} -> ${file}`, () => {
        expect(isUriPathUnder(parent, file)).to.be.false;
      });
    });
  });

  describe('isSameUriPath()', () => {
    [['/foo', '/foo'], ['/foo/', '/foo'], ['/foo', '/foo/'], ['/foo/bar', '/foo/bar']].forEach(([path1, path2]) => {
      it(`matches ${path1} -> ${path2}`, () => {
        expect(isSameUriPath(path1, path2)).to.be.true;
      });
    });

    [
      ['/foo', '/foo/file.json'],
      ['/foo', '/foo/bar/file.json'],
      ['/foo/', '/foo/bar/'],
      ['/foo', '/foo/./file.json'],
      ['/foo', '/foo/bar/../file.json'],
      ['/foo', '/'],
      ['/foo/', '/foobar'],
      ['/foo', '/foo/../bar']
    ].forEach(([path1, path2]) => {
      it(`doesn't match ${path1} -> ${path2}`, () => {
        expect(isSameUriPath(path1, path2)).to.be.false;
      });
    });
  });
});
