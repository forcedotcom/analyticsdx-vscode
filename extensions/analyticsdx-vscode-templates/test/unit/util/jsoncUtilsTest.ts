/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { JSONPath, Node as JsonNode, ParseError, parseTree } from 'jsonc-parser';
import {
  findPropertyNodeFor,
  jsonPathToString,
  jsonStringifyWithOptions,
  matchJsonNodesAtPattern,
  pathPartsAreEquals
} from '../../../src/util/jsoncUtils';
import { parseErrorToString } from '../../testutils';

// tslint:disable:no-unused-expression
describe('jsoncUtils', () => {
  function parseOrThrow(object: any): JsonNode {
    const errors: ParseError[] = [];
    const json = JSON.stringify(object, undefined, 2);
    const jsonNode = parseTree(JSON.stringify(object, undefined, 2), errors);
    if (errors.length > 0) {
      throw new Error('Failed to parse json: ' + errors.map(e => parseErrorToString(e, json)).join(', '));
    }
    return jsonNode;
  }

  describe('jsonPathToString()', () => {
    it('works for empty path', () => {
      const path: JSONPath = [];
      expect(jsonPathToString(path)).to.be.equals('');
    });

    it('works for objects', () => {
      const path: JSONPath = ['releaseInfo', 'noteFiles'];
      expect(jsonPathToString(path)).to.be.equals('releaseInfo.noteFiles');
    });

    it('works for non-id fields in objects', () => {
      const path: JSONPath = [
        'root',
        '000',
        'a+b',
        'a b',
        'a/b',
        "'ab'",
        '"ab"',
        'true',
        'a.b',
        'a,b',
        'a:b',
        '[]',
        '()',
        'field'
      ];
      expect(jsonPathToString(path)).to.be.equals(
        'root["000"]["a+b"]["a b"]["a/b"]["\'ab\'"]["\\"ab\\""]["true"]["a.b"]["a,b"]["a:b"]["[]"]["()"].field'
      );
    });

    it('works for arrays', () => {
      const path: JSONPath = [0, 1, 14];
      expect(jsonPathToString(path)).to.be.equals('[0][1][14]');
    });

    it('works for objects and arrays', () => {
      const path: JSONPath = ['externalFiles', 0, 'file'];
      expect(jsonPathToString(path)).to.be.equals('externalFiles[0].file');
    });
  });

  describe('findPropertyNodeFor()', () => {
    const object = parseOrThrow({
      templateType: 'app',
      label: 'AppForTemplate',
      name: 'AppForTemplate',
      assetVersion: 47.0,
      variableDefinition: 'variables.json',
      uiDefinition: 'ui.json',
      releaseInfo: {
        templateVersion: '1.1',
        notesFile: 'releaseNotes.html'
      },
      rules: [
        {
          type: 'appToTemplate',
          file: 'app-to-template-rules.json'
        },
        {
          type: 'templateToApp',
          file: 'template-to-app-rules.json'
        }
      ],
      ruleDefinition: 'oldey-time.json',
      icons: {
        appBadge: {
          name: '16.png'
        },
        templateBadge: {
          name: 'default.png'
        },
        templateDetail: {
          name: 'template details'
        }
      }
    });

    it('finds nested node', () => {
      const node = matchJsonNodesAtPattern(object, ['icons', 'templateDetail'])[0];
      expect(node, 'icons.templateDetail node').to.be.not.undefined;
      const propNode = findPropertyNodeFor(node, ['icons', 'templateDetail']);
      expect(propNode, 'property node').to.be.not.undefined;
      expect(propNode!.type, 'propNode.type').to.be.equals('property');
    });

    it('finds nested node from nested node', () => {
      const node = matchJsonNodesAtPattern(object, ['icons', 'templateDetail', 'name'])[0];
      expect(node, 'icons.templateDetail node').to.be.not.undefined;
      const propNode = findPropertyNodeFor(node, ['icons', 'templateDetail']);
      expect(propNode, 'property node').to.be.not.undefined;
      expect(propNode!.type, 'propNode.type').to.be.equals('property');
    });

    it('finds top-level node', () => {
      const node = matchJsonNodesAtPattern(object, ['ruleDefinition'])[0];
      expect(node, 'ruleDefinition node').to.be.not.undefined;
      const propNode = findPropertyNodeFor(node, ['ruleDefinition']);
      expect(propNode, 'property node').to.be.not.undefined;
      expect(propNode!.type, 'propNode.type').to.be.equals('property');
    });

    it('finds top-level node from nested node', () => {
      const node = matchJsonNodesAtPattern(object, ['releaseInfo', 'notesFile'])[0];
      expect(node, 'releaseInfo.notesFiles node').to.be.not.undefined;
      const propNode = findPropertyNodeFor(node, ['releaseInfo']);
      expect(propNode, 'property node').to.be.not.undefined;
      expect(propNode!.type, 'propNode.type').to.be.equals('property');
    });

    it("doesn't find wrong named node", () => {
      const node = matchJsonNodesAtPattern(object, ['icons', 'templateDetail'])[0];
      expect(node, 'icons.templateDetail node').to.be.not.undefined;
      const propNode = findPropertyNodeFor(node, ['rules', 'templateToApp']);
      expect(propNode, 'property node').to.be.undefined;
    });

    it("doesn't find descendent property node", () => {
      const node = matchJsonNodesAtPattern(object, ['icons', 'templateDetail'])[0];
      expect(node, 'icons.templateDetail node').to.be.not.undefined;
      const propNode = findPropertyNodeFor(node, ['icons', 'templateDetail', 'name']);
      expect(propNode, 'property node').to.be.undefined;
    });
  });

  describe('pathPartsAreEquals()', () => {
    it('works for exact property', () => {
      const nodePath = ['icons', 'templateDetail'] as JSONPath;
      expect(pathPartsAreEquals(['icons', 'templateDetail'], nodePath)).to.be.true;
    });

    it('works for nested properties', () => {
      const nodePath = ['icons', 'templateDetail', 'name'] as JSONPath;
      expect(pathPartsAreEquals(['icons', 'templateDetail'], nodePath)).to.be.true;
    });

    it('works for top-level properties', () => {
      const nodePath = [] as JSONPath;
      expect(pathPartsAreEquals([], nodePath)).to.be.true;
    });

    it('works for non-matching', () => {
      const nodePath = ['icons', 'templateDetail', 'name'] as JSONPath;
      expect(pathPartsAreEquals(['icons', 'templateBadge'], nodePath)).to.be.false;
    });

    it('works for differring lengths', () => {
      const nodePath = ['icons'] as JSONPath;
      expect(pathPartsAreEquals(['icons', 'templateBadge'], nodePath)).to.be.false;
      expect(pathPartsAreEquals(nodePath, ['icons', 'templateBadge'], 2)).to.be.false;
    });
  });

  describe('jsonStringifyWithOptions()', () => {
    const o = {
      a: 'b',
      c: [{ d: 'e' }]
    };

    it('works for no options', () => {
      const s = jsonStringifyWithOptions(o, undefined);
      expect(s, 'json').to.equal(JSON.stringify(o, undefined, 2));
    });

    it('works for empty options', () => {
      const s = jsonStringifyWithOptions(o, {});
      expect(s, 'json').to.equal(JSON.stringify(o, undefined, 2));
    });

    it('works for spaces', () => {
      const s = jsonStringifyWithOptions(o, { insertSpaces: true, tabSize: 3 });
      expect(s, 'json').to.equal(JSON.stringify(o, undefined, 3));
    });

    it('works for tabs', () => {
      const s = jsonStringifyWithOptions(o, { insertSpaces: false, tabSize: 6 });
      expect(s, 'json').to.equal(JSON.stringify(o, undefined, '\t'));
    });

    it('works with replacer function', () => {
      const replacer = (key: string, value: any) => {
        if (key === 'a') {
          return 'z';
        }
        return value;
      };
      const s = jsonStringifyWithOptions(o, undefined, replacer);
      expect(s, 'json').to.equal(JSON.stringify(o, replacer, 2));
    });

    it('works with replacer array', () => {
      const replacer = ['a']; // only keep 'a'
      const s = jsonStringifyWithOptions(o, undefined, replacer);
      expect(s, 'json').to.equal(JSON.stringify(o, replacer, 2));
    });
  });
});
