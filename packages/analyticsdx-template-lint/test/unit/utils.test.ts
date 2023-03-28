/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { JSONPath, Node as JsonNode, ParseError, parseTree, printParseErrorCode } from 'jsonc-parser';
import {
  fuzzySearcher,
  isValidRelpath,
  isValidVariableName,
  jsonPathToString,
  matchJsonNodeAtPattern,
  matchJsonNodesAtPattern
} from '../../src/utils';

// tslint:disable:no-unused-expression
describe('utils', () => {
  /** Convert a ParserError from jsonc-parser to a human-readable string. */
  function parseErrorToString(e: ParseError, text?: string): string {
    return (
      printParseErrorCode(e.error) +
      '[offset=' +
      e.offset +
      (text ? `, text="${text.substring(e.offset, e.offset + e.length)}"` : '') +
      ']'
    );
  }

  function parseOrThrow(object: any): JsonNode {
    const errors: ParseError[] = [];
    const json = JSON.stringify(object, undefined, 2);
    const jsonNode = parseTree(JSON.stringify(object, undefined, 2), errors);
    if (errors.length > 0) {
      throw new Error('Failed to parse json: ' + errors.map(e => parseErrorToString(e, json)).join(', '));
    }
    if (!jsonNode) {
      throw new Error('Empty json from parse');
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
        '-',
        'a-b',
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
        'root["000"]["a+b"]["a b"]["a/b"]["-"]["a-b"]["\'ab\'"]["\\"ab\\""]["true"]["a.b"]["a,b"]["a:b"]["[]"]["()"].field'
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

  describe('matchJsonNodesAtPattern() on object root', () => {
    const object: JsonNode = parseOrThrow({
      templateType: 'app',
      label: 'AppForTemplate',
      name: 'AppForTemplate',
      description: 'Now with a description!!',
      assetVersion: 47.0,
      variableDefinition: 'variables.json',
      uiDefinition: 'ui.json',
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
      releaseInfo: {
        templateVersion: '1.1',
        notesFile: 'releaseNotes.html'
      },
      folderDefinition: 'folder.json',
      externalFiles: [
        {
          file: 'dashboards/New_dashboard.json',
          name: 'foo',
          type: 'CSV'
        }
      ],
      lenses: [
        {
          file: 'app-to-template-rules.json',
          label: 'blah'
        }
      ],
      dashboards: [
        {
          label: 'New dashboard',
          name: 'New_dashboard_tp',
          condition: '${Variables.Overrides.createAllDashboards}',
          file: 'dashboards/New_dashboard.json'
        },
        {
          label: 'foo',
          name: 'foo',
          file: 'dashboards/foo_dashboard.json'
        }
      ],
      eltDataflows: [
        {
          file: 'app-to-template-rules.json'
        }
      ],
      datasetFiles: [{}],
      storedQueries: [],
      imageFiles: [],
      extendedTypes: {
        discoveryStories: [
          {
            label: 'Test Something',
            name: 'Test_Something',
            file: 'stories/story.json'
          }
        ]
      },
      icons: {
        appBadge: {
          name: '16.png'
        },
        templateBadge: {
          name: 'default.png'
        },
        templateDetail: {
          name: 'template details'
        },
        templatePreviews: [
          {
            name: 'foo',
            label: 'Some preview label',
            description: 'A big description of what the preview is showing'
          }
        ]
      },
      customAttributes: [
        {
          label: 'Features',
          values: ['Embeddable Dashboards', 'Prebuilt Dashboards', 'Dataflow', 'KPI Rich Datasets']
        },
        {
          label: 'Salesforce Objects',
          values: ['Account', 'Case', 'Contact', 'Task', 'User', 'User Role']
        },
        {
          label: 'Publisher',
          values: ['Einstein Analytics']
        },
        {
          label: 'Industry',
          values: ['Public Sector']
        },
        {
          label: 'foo'
        }
      ],
      videos: [
        {
          purpose: 'walkthrough',
          id: 'walkthrough-video-id',
          linkType: 'youtube',
          label: 'Walkthrough Video',
          showPlaylist: true
        },
        {
          purpose: 'onboarding',
          id: 'onboarding-video-id',
          linkType: 'vidyard',
          label: 'Onboarding Video',
          showPlaylist: false
        }
      ],
      tags: ['one', 'two', '3'],
      templateDependencies: [
        {
          name: 'election_2012_template',
          namespace: 'sfdc_internal',
          templateVersion: '1.1',
          condition: '${Variables.IncludeElectionTemplate'
        },
        {
          name: 'featured_assets_template',
          namespace: 'sfdc_internal',
          templateVersion: '1.0'
        }
      ]
    });

    it('returns empty on undefined roots', () => {
      const nodes = matchJsonNodesAtPattern(undefined, ['tags']);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
    });

    it('returns empty on empty roots', () => {
      let count = 0;
      const nodes = matchJsonNodesAtPattern([], ['tags'], () => count++);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
      expect(count, 'callback count').to.be.equals(0);
    });

    it('returns root on empty path', () => {
      const nodes = matchJsonNodesAtPattern(object, []);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0], 'node').to.be.equals(object);
    });

    it('returns empty on no match on first pattern part', () => {
      const nodes = matchJsonNodesAtPattern(object, ['does-not-exist', '*']);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
    });

    it('returns empty on no match on second pattern part', () => {
      const nodes = matchJsonNodesAtPattern(object, ['icons', 'foo', '*']);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
    });

    it('returns empty on no match on third pattern part', () => {
      const nodes = matchJsonNodesAtPattern(object, ['icons', 'appBadge', 'no-such-thing']);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
    });

    it('finds named property node', () => {
      const nodes = matchJsonNodesAtPattern(object, ['variableDefinition']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].value, 'node.value').to.be.equals('variables.json');
    });

    it('finds named object node', () => {
      const nodes = matchJsonNodesAtPattern(object, ['icons', 'appBadge']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node.type').to.be.equals('object');
      // icons.appBadge has 1 property child for "name: '16.png'""
      expect(nodes[0].children!.length, 'node.children.length').to.be.equals(1);
      expect(nodes[0].children![0].type, 'node.child.type').to.be.equals('property');
      // the property child will have a child for the prop name and a child for the propvalue
      expect(nodes[0].children![0].children!.length, 'node.children.children.length').to.be.equals(2);
      expect(nodes[0].children![0].children![0].value, 'node.child.name').to.be.equals('name');
      expect(nodes[0].children![0].children![1].value, 'node.child.value').to.be.equals('16.png');
    });

    it('finds * root nodes', () => {
      const nodes = matchJsonNodesAtPattern(object, ['*']);
      expect(nodes.length, 'nodes.length').to.be.equals(object.children!.length);
    });

    it('filters based on callback', () => {
      // get all the dashboard label values, excluding the 'foo' one
      const nodes = matchJsonNodesAtPattern(object, ['dashboards', '*', 'label'], node => {
        return node.value !== 'foo';
      });
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].value, 'nodes[0].value').to.be.equals('New dashboard');
    });

    it('finds nested * nodes', () => {
      // also test that the callback is called
      let count = 0;
      const nodes = matchJsonNodesAtPattern(object, ['rules', '*', 'file'], node => {
        if (count === 0) {
          expect(node.value, 'nodes[0].value in callback').to.be.equals('app-to-template-rules.json');
        } else if (count === 1) {
          expect(node.value, 'nodes[1].value in callback').to.be.equals('template-to-app-rules.json');
        } else {
          expect.fail(`Got a callabck #${count} with node[type=${node.type}, value=${node.value}]`);
        }
        count++;
      });
      expect(count, 'callback count').to.be.equals(2);
      expect(nodes.length, 'nodes.length').to.be.equals(2);

      expect(nodes[0].type, 'nodes[0].type').to.be.equals('string');
      expect(nodes[0].value, 'nodes[0].value').to.be.equals('app-to-template-rules.json');
      expect(nodes[1].type, 'nodes[1].type').to.be.equals('string');
      expect(nodes[1].value, 'nodes[1].value').to.be.equals('template-to-app-rules.json');
    });

    it('finds no match on too large of an array index', () => {
      const nodes = matchJsonNodesAtPattern(object, ['templateDependencies', 14, 'name']);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
    });

    it('finds no match on negative array index', () => {
      const nodes = matchJsonNodesAtPattern(object, ['templateDependencies', -1, 'name']);
      expect(nodes.length, 'nodes.length').to.be.equals(0);
    });

    it('finds array nodes by index', () => {
      const nodes = matchJsonNodesAtPattern(object, ['templateDependencies', 0, 'name']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);

      expect(nodes[0].type, 'nodes.type').to.be.equals('string');
      expect(nodes[0].value, 'node.value').to.be.equals('election_2012_template');
    });

    it('finds named array node', () => {
      const nodes = matchJsonNodesAtPattern(object, ['extendedTypes', 'discoveryStories']);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node.type').to.be.equals('array');
      expect(nodes[0].children!.length, 'node.children.length').to.be.equals(1);
    });

    it('finds array node children with *', () => {
      const nodes = matchJsonNodesAtPattern(object, ['templateDependencies', '*']);
      expect(nodes.length, 'nodes.length').to.be.equals(2);
      expect(nodes[0].type, 'node[0].type').to.be.equals('object');
      expect(nodes[1].type, 'node[1].type').to.be.equals('object');
    });
  });

  describe('matchJsonNodesAtPattern() on an array root', () => {
    const array: JsonNode = parseOrThrow([
      {
        name: 'foo',
        value: 'bar'
      },
      {
        name: 'baz',
        value: '',
        'other-names': ['one', 'two', 'three'],
        $comment: 'a comment'
      },
      ['a', 42, true]
    ]);

    it('finds indexed child of array root', () => {
      const nodes = matchJsonNodesAtPattern(array, [1]);
      expect(nodes.length, 'nodes.length').to.be.equals(1);
      expect(nodes[0].type, 'node.type').to.be.equals('object');
      // should have 4 property child nodes
      expect(nodes[0].children!.length, 'node.children.length').to.be.equals(4);
    });

    it('finds children of a child of an array root', () => {
      const nodes = matchJsonNodesAtPattern(array, [2, '*']);
      expect(nodes.length, 'nodes.length').to.be.equals(3);
      expect(nodes[0].type, 'nodes[0].type').to.be.equals('string');
      expect(nodes[0].value, 'nodes[0].value').to.be.equals('a');
      expect(nodes[1].type, 'nodes[1].type').to.be.equals('number');
      expect(nodes[1].value, 'nodes[1].value').to.be.equals(42);
      expect(nodes[2].type, 'nodes[2].type').to.be.equals('boolean');
      expect(nodes[2].value, 'nodes[2].value').to.be.equals(true);
    });

    it('find nodes across multiple roots', () => {
      let count = 0;
      const nodes = matchJsonNodesAtPattern(array.children, ['name'], () => count++);
      expect(nodes.length, 'nodes.length').to.be.equals(2);
      expect(count, 'callback count').to.be.equals(2);
      expect(nodes[0].type, 'nodes[0].type').to.be.equals('string');
      expect(nodes[0].value, 'nodes[0].value').to.be.equals('foo');
    });

    it('find multiple roots', () => {
      let count = 0;
      const nodes = matchJsonNodesAtPattern(array.children, [], () => count++);
      expect(nodes.length, 'nodes.length').to.be.equals(array.children!.length);
      expect(count, 'callback count').to.be.equals(array.children!.length);
    });
  });

  describe('matchJsonNodeAtPattern()', () => {
    const object: JsonNode = parseOrThrow({
      templateType: 'app',
      label: 'AppForTemplate',
      name: 'AppForTemplate',
      description: 'Now with a description!!',
      assetVersion: 47.0,
      variableDefinition: 'variables.json',
      uiDefinition: 'ui.json',
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
      dashboards: [
        {
          label: 'New dashboard',
          name: 'New_dashboard_tp',
          condition: '${Variables.Overrides.createAllDashboards}',
          file: 'dashboards/New_dashboard.json'
        },
        {
          label: 'foo',
          name: 'foo',
          file: 'dashboards/foo_dashboard.json'
        }
      ]
    });

    it('finds 1 match', () => {
      const node = matchJsonNodeAtPattern(object, ['dashboards', '*', 'label']);
      expect(node, 'node').to.be.not.undefined;
      expect(node!.value, 'node.value').to.be.equals('New dashboard');
    });

    it('finds 1 match with callback', () => {
      let count = 0;
      const node = matchJsonNodeAtPattern(object, ['dashboards', '*', 'label'], () => count++);
      expect(node, 'node').to.be.not.undefined;
      expect(node!.value, 'node.value').to.be.equals('New dashboard');
      expect(count, 'callback count').to.be.equals(1);
    });

    it('finds 2nd node based on callback', () => {
      let count = 0;
      const node = matchJsonNodeAtPattern(object, ['dashboards', '*', 'label'], node => {
        count++;
        return node.value === 'foo';
      });
      expect(node, 'node').to.be.not.undefined;
      expect(node!.value, 'node.value').to.be.equals('foo');
      expect(count, 'callback count').to.be.equals(2); // should be called 2 since foo is 2nd path match
    });

    it('finds no match on path', () => {
      let count = 0;
      const node = matchJsonNodeAtPattern(object, ['dashboards', '*', 'no-such-field'], node => count++);
      expect(node, 'node').to.be.undefined;
      expect(count, 'callback count').to.be.equal(0);
    });

    it('finds no match based on callback', () => {
      let count = 0;
      const node = matchJsonNodeAtPattern(object, ['dashboards', '*', 'label'], node => {
        count++;
        return false;
      });
      expect(node, 'node').to.be.undefined;
      expect(count, 'callback count').to.be.equal(2);
    });

    it('propagates errors', () => {
      try {
        const node = matchJsonNodeAtPattern(object, ['*'], node => {
          throw Error('expected');
        });
        expect.fail('Expected an error throws, got ' + node);
      } catch (e) {
        expect((e as Error).message).to.be.equals('expected');
      }
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

  describe('isValidVariableName()', () => {
    ['a', '_', '_a', '_Z', 'b0', 'abcde_g42hi_'].forEach(name => {
      it(`matches '${name}'`, () => {
        expect(isValidVariableName(name)).to.be.true;
      });
    });

    ['0abc', '-', ' ', ' a', 'a ', 'a b', 'y+z', 'y-z'].forEach(name => {
      it(`doesn't '${name}'`, () => {
        expect(isValidVariableName(name)).to.be.false;
      });
    });
  });

  describe('fuzzySearcher()', () => {
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
