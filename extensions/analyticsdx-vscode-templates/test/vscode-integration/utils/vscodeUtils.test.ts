/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { Node as JsonNode, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { findPropertyNodeFor, matchJsonNodesAtPattern } from '../../../src/util/jsoncUtils';
import {
  AdxDiagnostic,
  argsFrom,
  isSameUri,
  isUriAtOrUnder,
  isUriUnder,
  jsonpathFrom,
  rangeForNode,
  scanLinesUntil,
  uriBasename,
  uriDirname,
  uriReaddir
} from '../../../src/util/vscodeUtils';
import { closeAllEditors, uriFromTestRoot } from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('vscodeUtils', () => {
  describe('scanLinesUntil()', () => {
    let document: vscode.TextDocument;
    before(async () => {
      await closeAllEditors();
      document = await vscode.workspace.openTextDocument(uriFromTestRoot('vscodeUtilsTest', 'vscodeUtils.test.json'));
    });
    after(closeAllEditors);

    it('reads across lines', () => {
      // read from the beginning to the first '}', which should be on the 4th line
      const { end, ch } = scanLinesUntil(document, ch => ch === '}');
      expect(end.line, 'end.line').to.be.equals(3);
      expect(end.character, 'end.character').to.be.equals(2);
      expect(ch, 'final character').to.be.equals('}');
    });

    it('reads on a single line', () => {
      // starting on the 2nd line, read until the first ':', which should be on the same line
      const { end, ch } = scanLinesUntil(document, ch => ch === ':', new vscode.Position(1, 2));
      expect(end.line, 'end.line').to.be.equals(1);
      expect(end.character, 'end.character').to.be.equals(7);
      expect(ch, 'final character').to.be.equals(':');
    });

    it('obeys start position', () => {
      // starting on the 3rd line, just past the "b" in "bar", until the next "b" in "baz"
      const { end, ch } = scanLinesUntil(document, ch => ch === 'b', new vscode.Position(2, 6));
      expect(end.line, 'end.line').to.be.equals(2);
      expect(end.character, 'end.character').to.be.equals(12);
      expect(ch, 'final character').to.be.equals('b');
    });

    it('reads to the end', () => {
      // don't stop at any character, should read to the end of the file
      const { end, ch } = scanLinesUntil(document, () => false);
      expect(end.line, 'end.line').to.be.equals(10);
      expect(end.character, 'end.character').to.be.equals(0);
      // and the last line is empty so there should be no char
      expect(ch, 'final character').to.be.undefined;
    });
  });

  describe('rangeForNode()', () => {
    let document: vscode.TextDocument;
    let root: JsonNode | undefined;

    before(async () => {
      await closeAllEditors();
      document = await vscode.workspace.openTextDocument(uriFromTestRoot('vscodeUtilsTest', 'vscodeUtils.test.json'));
      root = parseTree(document.getText());
      expect(root, 'jsonNode root').to.not.be.undefined;
    });
    after(closeAllEditors);

    it('works for object node', () => {
      const nodes = matchJsonNodesAtPattern(root, ['foo']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node type').to.be.equals('object');
      const range = rangeForNode(nodes[0], document);
      expect(range.start.line, 'range.start.line').to.be.equals(1);
      expect(range.start.character, 'range.start.character').to.be.equals(9);
      expect(range.end.line, 'range.end.line').to.be.equals(3);
      expect(range.end.character, 'range.end.character').to.be.equals(3);
    });

    it('works for object node, including trailing comma', () => {
      const nodes = matchJsonNodesAtPattern(root, ['foo']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node type').to.be.equals('object');

      const range = rangeForNode(nodes[0], document, true);
      expect(range.start.line, 'range.start.line').to.be.equals(1);
      expect(range.start.character, 'range.start.character').to.be.equals(9);
      expect(range.end.line, 'range.end.line').to.be.equals(4);
      expect(range.end.character, 'range.end.character').to.be.equals(2);
    });

    it('works for array node', () => {
      const nodes = matchJsonNodesAtPattern(root, ['a']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node type').to.be.equals('array');

      const range = rangeForNode(nodes[0], document);
      expect(range.start.line, 'range.start.line').to.be.equals(4);
      expect(range.start.character, 'range.start.character').to.be.equals(7);
      expect(range.end.line, 'range.end.line').to.be.equals(8);
      expect(range.end.character, 'range.end.character').to.be.equals(3);
    });

    it('works for array node, including (no) trailing comma', () => {
      const nodes = matchJsonNodesAtPattern(root, ['a']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node type').to.be.equals('array');

      const range = rangeForNode(nodes[0], document, true);
      expect(range.start.line, 'range.start.line').to.be.equals(4);
      expect(range.start.character, 'range.start.character').to.be.equals(7);
      // since there's no trailing comma, for now the end will be the closing ']'
      expect(range.end.line, 'range.end.line').to.be.equals(8);
      expect(range.end.character, 'range.end.character').to.be.equals(3);
    });

    it('works for property node', () => {
      const nodes = matchJsonNodesAtPattern(root, ['foo']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node type').to.be.equals('object');
      const propNode = findPropertyNodeFor(nodes[0], ['foo']);
      expect(propNode, 'property node').to.be.not.undefined;

      const range = rangeForNode(propNode!, document);
      expect(range.start.line, 'range.start.line').to.be.equals(1);
      expect(range.start.character, 'range.start.character').to.be.equals(2);
      expect(range.end.line, 'range.end.line').to.be.equals(3);
      expect(range.end.character, 'range.end.character').to.be.equals(3);
    });

    it('works for property node, including trailing comma', () => {
      const nodes = matchJsonNodesAtPattern(root, ['foo']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node type').to.be.equals('object');
      const propNode = findPropertyNodeFor(nodes[0], ['foo']);
      expect(propNode, 'property node').to.be.not.undefined;

      const range = rangeForNode(propNode!, document, true);
      expect(range.start.line, 'range.start.line').to.be.equals(1);
      expect(range.start.character, 'range.start.character').to.be.equals(2);
      expect(range.end.line, 'range.end.line').to.be.equals(4);
      expect(range.end.character, 'range.end.character').to.be.equals(2);
    });
  });

  describe('isUriUnder()', () => {
    ['file://', 'http://www.salesforce.com'].forEach(base => {
      [
        ['/foo', '/foo/file.json'],
        ['/foo', '/foo/bar/file.json'],
        ['/foo/', '/foo/bar/'],
        ['/foo', '/foo/./file.json'],
        ['/foo', '/foo/bar/../file.json']
      ].forEach(([parentPath, filePath]) => {
        const parent = vscode.Uri.parse(base + parentPath);
        const file = vscode.Uri.parse(base + filePath);
        it(`matches ${parent} -> ${file}`, () => {
          expect(isUriUnder(parent, file)).to.be.true;
        });
      });

      [
        ['/foo', '/'],
        ['/foo', '/foo'],
        ['/foo/', '/foobar'],
        ['/foo', '/foo/../bar']
      ].forEach(([parentPath, filePath]) => {
        const parent = vscode.Uri.parse(base + parentPath);
        const file = vscode.Uri.parse(base + filePath);
        it(`doesn't match ${parent} -> ${file}`, () => {
          expect(isUriUnder(parent, file)).to.be.false;
        });
      });
    });

    it("doesn't match on different scheme", () => {
      const parent = vscode.Uri.parse('file:///foo');
      const file = vscode.Uri.parse('http://www.salesforce.com/foo/file.json');
      expect(isUriUnder(parent, file)).to.be.false;
    });

    it("doesn't match on different authority", () => {
      const parent = vscode.Uri.parse('http://localhost:6109/foo');
      const file = vscode.Uri.parse('http://www.salesforce.com/foo/file.json');
      expect(isUriUnder(parent, file)).to.be.false;
    });
  });

  describe('isSameUri()', () => {
    ['file://', 'http://www.salesforce.com'].forEach(base => {
      [
        ['/foo', '/foo'],
        ['/foo/', '/foo'],
        ['/foo', '/foo/']
      ].forEach(([path1, path2]) => {
        const uri1 = vscode.Uri.parse(base + path1);
        const uri2 = vscode.Uri.parse(base + path2);
        it(`matches ${uri1} -> ${uri2}`, () => {
          expect(isSameUri(uri1, uri2)).to.be.true;
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
        const uri1 = vscode.Uri.parse(base + path1);
        const uri2 = vscode.Uri.parse(base + path2);
        it(`doesn't match ${uri1} -> ${uri2}`, () => {
          expect(isSameUri(uri1, uri2)).to.be.false;
        });
      });
    });

    it("doesn't match on different scheme", () => {
      const uri1 = vscode.Uri.parse('file:///foo');
      const uri2 = vscode.Uri.parse('http://www.salesforce.com/foo');
      expect(isSameUri(uri1, uri2)).to.be.false;
    });

    it("doesn't match on different authority", () => {
      const uri1 = vscode.Uri.parse('http://localhost:6109/foo');
      const uri2 = vscode.Uri.parse('http://www.salesforce.com/foo');
      expect(isSameUri(uri1, uri2)).to.be.false;
    });
  });

  describe('isUriAtOrUnder', () => {
    ['file://', 'http://www.salesforce.com'].forEach(base => {
      [
        ['/foo', '/foo'],
        ['/foo/', '/foo'],
        ['/foo', '/foo/'],
        ['/foo', '/foo/file.json'],
        ['/foo', '/foo/bar/file.json'],
        ['/foo/', '/foo/bar/'],
        ['/foo', '/foo/./file.json'],
        ['/foo', '/foo/bar/../file.json']
      ].forEach(([path1, path2]) => {
        const uri1 = vscode.Uri.parse(base + path1);
        const uri2 = vscode.Uri.parse(base + path2);
        it(`matches ${uri1} -> ${uri2}`, () => {
          expect(isUriAtOrUnder(uri1, uri2)).to.be.true;
        });
      });

      [
        ['/foo', '/'],
        ['/foo/', '/foobar'],
        ['/foo', '/foo/../bar'],
        ['/foo/bar', '/foo'],
        ['/foo/bar', '/foo/']
      ].forEach(([path1, path2]) => {
        const uri1 = vscode.Uri.parse(base + path1);
        const uri2 = vscode.Uri.parse(base + path2);
        it(`doesn't match ${uri1} -> ${uri2}`, () => {
          expect(isUriAtOrUnder(uri1, uri2)).to.be.false;
        });
      });
    });

    it("doesn't match on different scheme", () => {
      const uri1 = vscode.Uri.parse('file:///foo');
      const uri2 = vscode.Uri.parse('http://www.salesforce.com/foo');
      expect(isUriAtOrUnder(uri1, uri2)).to.be.false;
    });

    it("doesn't match on different authority", () => {
      const uri1 = vscode.Uri.parse('http://localhost:6109/foo');
      const uri2 = vscode.Uri.parse('http://www.salesforce.com/foo');
      expect(isUriAtOrUnder(uri1, uri2)).to.be.false;
    });
  });

  describe('uriDirname()', () => {
    ['file://', 'http://www.salesforce.com'].forEach(base => {
      [
        ['/', '/'],
        ['/foo', '/'],
        ['/foo/', '/'],
        ['/foo/bar', '/foo'],
        ['/foo/bar/', '/foo']
      ].forEach(([relpath, expectedDirname]) => {
        const uri = vscode.Uri.parse(base + relpath);
        it(`${uri} dirname -> ${expectedDirname}`, () => {
          expect(uriDirname(uri).path).to.be.equals(expectedDirname);
        });
      });
    });
  });

  describe('uriBasename()', () => {
    ['file://', 'http://www.salesforce.com'].forEach(base => {
      [
        ['/', ''],
        ['/foo', 'foo'],
        ['/foo/', 'foo'],
        ['/foo/bar', 'bar'],
        ['/foo/bar/', 'bar']
      ].forEach(([relpath, expectedBasename]) => {
        const uri = vscode.Uri.parse(base + relpath);
        it(`${uri} basename -> ${expectedBasename}`, () => {
          expect(uriBasename(uri)).to.be.equals(expectedBasename);
        });
      });
    });
  });

  describe('uriReaddir()', () => {
    const rootDir = uriFromTestRoot('vscodeUtilsTest', 'uriReaddirTest');

    describe('non-recursive', () => {
      it('finds files and directories with no filter', async () => {
        const list = (await uriReaddir(rootDir, undefined, false)).map(([path]) => path);
        expect(list).to.have.members(['1.txt', '2.txt', 'dir1']);
      });

      it('finds files and directories with a filter', async () => {
        const list = (await uriReaddir(rootDir, ([path]) => path.indexOf('1') >= 0, false)).map(([path]) => path);
        expect(list).to.have.members(['1.txt', 'dir1']);
      });

      it('finds files', async () => {
        const list = (
          await uriReaddir(rootDir, ([path, fileType]) => (fileType & vscode.FileType.File) !== 0, false)
        ).map(([path]) => path);
        expect(list).to.have.members(['1.txt', '2.txt']);
      });

      it('finds directories', async () => {
        const list = (
          await uriReaddir(rootDir, ([path, fileType]) => (fileType & vscode.FileType.Directory) !== 0, false)
        ).map(([path]) => path);
        expect(list).to.have.members(['dir1']);
      });
    });

    describe('recursive', () => {
      it('finds files and directories with no filter', async () => {
        const list = (await uriReaddir(rootDir)).map(([path]) => path);
        expect(list).to.have.members([
          '1.txt',
          '2.txt',
          'dir1',
          'dir1/11.txt',
          'dir1/12.txt',
          'dir1/dir11',
          'dir1/dir11/111.txt',
          'dir1/dir11/112.txt'
        ]);
      });

      it('finds files and directories with a filter', async () => {
        const list = (await uriReaddir(rootDir, ([path]) => path.indexOf('2') >= 0)).map(([path]) => path);
        expect(list).to.have.members(['2.txt', 'dir1/12.txt', 'dir1/dir11/112.txt']);
      });

      it('finds files', async () => {
        const list = (await uriReaddir(rootDir, ([path, fileType]) => (fileType & vscode.FileType.File) !== 0)).map(
          ([path]) => path
        );
        expect(list).to.have.members([
          '1.txt',
          '2.txt',
          'dir1/11.txt',
          'dir1/12.txt',
          'dir1/dir11/111.txt',
          'dir1/dir11/112.txt'
        ]);
      });

      it('finds directories', async () => {
        const list = (
          await uriReaddir(rootDir, ([path, fileType]) => (fileType & vscode.FileType.Directory) !== 0)
        ).map(([path]) => path);
        expect(list).to.have.members(['dir1', 'dir1/dir11']);
      });
    });
  }); // describe('uriReaddir()')

  describe('AdxDiagnostic', () => {
    const toDispose = [] as Array<{ dispose: () => any }>;
    let diagnosticCollection: vscode.DiagnosticCollection;
    let uri: vscode.Uri;

    before(() => {
      diagnosticCollection = vscode.languages.createDiagnosticCollection();
      toDispose.push(
        diagnosticCollection,
        // make a fake uri text provider for this test so we don't have to create a real file
        vscode.workspace.registerTextDocumentContentProvider('adxtest', {
          provideTextDocumentContent() {
            return JSON.stringify({ a: ['b', 'c'], d: 42 }, undefined, 2);
          }
        })
      );
      uri = vscode.Uri.parse('adxtest:foo.adxtest');
    });
    after(() => {
      vscode.Disposable.from(...toDispose).dispose();
    });

    beforeEach(() => {
      diagnosticCollection.clear();
    });

    // make sure that we get AdxDiagnostic instance back when we put them in DiagnosticCollections, so we can
    // find the extended attributes
    describe('jsonpathFrom()', () => {
      it('works on AdxDiagnostic', () => {
        const d = new AdxDiagnostic(new vscode.Range(1, 2, 1, 5), 'error');
        d.jsonpath = 'a[1]';
        diagnosticCollection.set(uri, [d]);
        const diagnostics = diagnosticCollection.get(uri);
        expect(diagnostics!.length, 'diagnostics.length').to.equal(1);
        expect(jsonpathFrom(diagnostics![0]), 'diagnostic.jsonpath').to.equal('a[1]');
      });

      it('works on vscode.Diagnostic', () => {
        const d = new vscode.Diagnostic(new vscode.Range(1, 2, 1, 5), 'error');
        diagnosticCollection.set(uri, [d]);
        const diagnostics = diagnosticCollection.get(uri);
        expect(diagnostics!.length, 'diagnostics.length').to.equal(1);
        expect(jsonpathFrom(diagnostics![0]), 'diagnostic.jsonpath').to.be.undefined;
      });
    });

    describe('argsFrom()', () => {
      it('works on AdxDiagnostic', () => {
        const d = new AdxDiagnostic(new vscode.Range(1, 2, 1, 5), 'error');
        d.args = {
          arg1: 'value1',
          arg2: -42
        };
        diagnosticCollection.set(uri, [d]);
        const diagnostics = diagnosticCollection.get(uri);
        expect(diagnostics!.length, 'diagnostics.length').to.equal(1);
        expect(argsFrom(diagnostics![0]), 'diagnostic.args').to.deep.equal({ arg1: 'value1', arg2: -42 });
      });

      it('works on vscode.Diagnostic', () => {
        const d = new vscode.Diagnostic(new vscode.Range(1, 2, 1, 5), 'error');
        diagnosticCollection.set(uri, [d]);
        const diagnostics = diagnosticCollection.get(uri);
        expect(diagnostics!.length, 'diagnostics.length').to.equal(1);
        expect(argsFrom(diagnostics![0]), 'diagnostic.args').to.be.undefined;
      });
    });
  }); // describe('AdxDiagnostic')
});
