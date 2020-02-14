/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import {
  fuzzySearcher,
  isSameUriPath,
  isUriPathUnder,
  isValidRelpath,
  isWhitespaceChar,
  matchesFileExtension
} from '../../../src/util/utils';

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

  describe('isValidRelPath()', () => {
    ['relpath.html', 'dir/file.html', 'dir1/dir2/', './dir/foo'].forEach(path => {
      it(`matches '${path}'`, () => {
        expect(isValidRelpath(path)).to.be.true;
      });
    });

    [
      '/path.html',
      '../file.html',
      'dir/../file',
      'dir/../../../../../../../../../etc/passwd',
      'dir/..',
      '',
      null,
      undefined
    ].forEach(path => {
      it(`doesn't match ${JSON.stringify(path)}`, () => {
        expect(isValidRelpath(path)).to.be.false;
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

  describe('fuzzySearch()', () => {
    let array = ['one', 'two', 'three'];
    let arrayLike: ArrayLike<string> = Object.freeze({
      length: array.length,
      0: array[0],
      1: array[1],
      2: array[2]
    });
    // make sure everything works for each ArrayLike thing the method supports
    [
      [array, 'an array'],
      [arrayLike, 'an ArrayLike'],
      [new Set(array), 'a Set']
    ].forEach(([values, description]) => {
      it(`matches one from ${description}`, () => {
        const fuzz = fuzzySearcher(values);
        expect(fuzz('on')).has.members(['one']);
        const [match] = fuzz('tw');
        expect(match, 'destructured match').to.not.be.undefined;
        expect(match).to.equal('two');
      });

      it(`matches multiple from ${description}`, () => {
        const fuzz = fuzzySearcher(values, { limit: 2 });
        expect(fuzz('on')).has.members(['one', 'two']);
        expect(fuzz('t')).has.members(['two', 'three']);
      });

      it(`doesn't match from ${description}`, () => {
        const fuzz = fuzzySearcher(values);
        expect(fuzz('z')).has.members([]);
        const [match] = fuzz('z');
        expect(match, 'destructured match').to.be.undefined;
      });
    });

    array = [];
    arrayLike = Object.freeze({ length: 0 });
    [
      [array, 'array'],
      [arrayLike, 'ArrayLike'],
      [new Set<string>(), 'Set']
    ].forEach(([values, description]) => {
      it(`doesn't match on empty ${description}`, () => {
        const fuzz = fuzzySearcher(values);
        expect(fuzz('z')).has.members([]);
      });
    });

    it("doesn't error on big pattern", () => {
      const fuzz = fuzzySearcher(['one', 'two', 'three']);
      let pattern = '012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789';
      pattern += pattern;
      // really just make sure it doesn't throw an error
      expect(fuzz(pattern)).has.members([]);
    });
  });
});
