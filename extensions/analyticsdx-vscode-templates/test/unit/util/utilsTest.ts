/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { isSameUriPath, isUriPathUnder, isWhitespaceChar, matchesFileExtension } from '../../../src/util/utils';

// tslint:disable: no-unused-expression
describe('utils', () => {
  describe('isWhitespaceChar()', () => {
    [
      [' ', 'space'],
      ['\t', 'tab'],
      ['\r', 'CR'],
      ['\n', 'LF']
    ].forEach(([ch, name]) => {
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
    [
      ['/foo', '/foo'],
      ['/foo/', '/foo'],
      ['/foo', '/foo/'],
      ['/foo/bar', '/foo/bar']
    ].forEach(([path1, path2]) => {
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

  describe('matchesFileExtension()', () => {
    ['foo.txt', 'dir/file.Txt', '/tmp/dir1/file.txt', 'C:\\Progra~1\\dir\\File.TXT'].forEach(path => {
      it(`single extension pattern matches ${path}`, () => {
        expect(matchesFileExtension(path, 'txt')).to.be.true;
      });
      it(`single extension pattern doesn't match ${path}`, () => {
        expect(matchesFileExtension(path, 'json')).to.be.false;
      });
    });

    ['foo.ppt', 'dir1/file.ppt', 'dir1\\file.PPTX'].forEach(path => {
      it(`mulitple extension patterns matches ${path}`, () => {
        expect(matchesFileExtension(path, 'ppt', 'pptx')).to.be.true;
      });
      it(`mulitple extension patterns don't match ${path}`, () => {
        expect(matchesFileExtension(path, 'htm', 'html')).to.be.false;
      });
    });
  });
});
