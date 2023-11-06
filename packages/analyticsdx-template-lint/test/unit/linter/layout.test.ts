/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { expect } from 'chai';
import * as path from 'path';
import { ERRORS } from '../../../src';
import { getDiagnosticsByPath, getDiagnosticsForPath } from '../../testutils';
import { StringDocument, stringifyDiagnostics, TestLinter } from './testlinter';

// tslint:disable: no-unused-expression
describe('TemplateLinter layout.json', () => {
  let linter: TestLinter | undefined;

  afterEach(() => {
    linter?.reset();
    linter = undefined;
  });

  it('validates variables exist', async () => {
    const dir = 'layoutVariables';
    const layoutPath = path.join(dir, 'layout.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'data',
        layoutDefinition: 'layout.json',
        variableDefinition: 'variables.json'
      },
      new StringDocument(path.join(dir, 'variables.json'), {
        foo: { variableType: { type: 'StringType' } },
        groupBar: { variableType: { type: 'StringType' } }
      }),
      new StringDocument(layoutPath, {
        pages: [
          {
            title: '',
            type: 'Configuration',
            layout: {
              type: 'SingleColumn',
              center: {
                items: [
                  { type: 'Variable', name: 'foo' },
                  { type: 'Variable', name: 'food' },
                  {
                    type: 'GroupBox',
                    items: [
                      { type: 'Variable', name: 'groupFoo' },
                      { type: 'Variable', name: 'groupBar' }
                    ]
                  }
                ]
              }
            }
          },
          {
            title: '',
            type: 'Configuration',
            layout: {
              type: 'TwoColumn',
              left: {
                items: [{ type: 'Variable', name: 'bar' }]
              },
              right: {
                items: [
                  { type: 'Variable', name: 'foo' },
                  { type: 'Text', text: '...' }
                ]
              }
            }
          }
        ]
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
    if (diagnostics.length !== 3) {
      expect.fail('Expected 3 unknown variable errors, got' + stringifyDiagnostics(diagnostics));
    }

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[1].name');
    expect(diagnostic, 'food variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(diagnostic!.args).to.deep.equal({ name: 'food', match: 'foo' });

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[2].items[0].name');
    expect(diagnostic, 'groupFoo variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(diagnostic!.args).to.deep.equal({ name: 'groupFoo', match: 'groupBar' });

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].layout.left.items[0].name');
    expect(diagnostic, 'bar variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(diagnostic!.args).to.deep.equal({ name: 'bar', match: 'groupBar' });
  });

  it('validates variable types', async () => {
    const dir = 'layoutVariables';
    const layoutPath = path.join(dir, 'layout.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'data',
        layoutDefinition: 'layout.json',
        variableDefinition: 'variables.json'
      },
      new StringDocument(path.join(dir, 'variables.json'), {
        obj: { variableType: { type: 'ObjectType' } },
        datetime: { variableType: { type: 'DateTimeType' } },
        foo: { variableType: { type: 'StringType' } }
      }),
      new StringDocument(layoutPath, {
        pages: [
          {
            title: '',
            type: 'Configuration',
            layout: {
              type: 'SingleColumn',
              center: {
                items: [
                  { type: 'Variable', name: 'obj' },
                  { type: 'Variable', name: 'datetime' },
                  { type: 'Variable', name: 'foo' }
                ]
              }
            }
          }
        ]
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 unsupported variable errors, got' + stringifyDiagnostics(diagnostics));
    }

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[0].name');
    expect(diagnostic, 'obj variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNSUPPORTED_VARIABLE);

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[1].name');
    expect(diagnostic, 'datetime variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNSUPPORTED_VARIABLE);
  });

  it('validates checkboxtiles variables', async () => {
    const dir = 'layoutVariables';
    const layoutPath = path.join(dir, 'layout.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'data',
        layoutDefinition: 'layout.json',
        variableDefinition: 'variables.json'
      },
      new StringDocument(path.join(dir, 'variables.json'), {
        stringEnum: { variableType: { type: 'StringType', enums: ['a', 'b', 'c'] } },
        numberEnum: { variableType: { type: 'NumberType', enums: [1, 2, 3] } },
        // some that are invalid for tiles
        string: { variableType: { type: 'StringType' } },
        stringEmptyEnums: { variableType: { type: 'StringType', enums: [] } },
        stringArray: { variableType: { type: 'ArrayType', itemsType: { type: 'StringType' } } },
        number: { variableType: { type: 'NumberType' } },
        numberEmptyEnums: { variableType: { type: 'NumberType', enums: [] } },
        sobject: { variableType: { type: 'SObjectType' } }
      }),
      new StringDocument(layoutPath, {
        pages: [
          {
            title: '',
            type: 'Configuration',
            layout: {
              type: 'SingleColumn',
              center: {
                items: [
                  // these should have warnings
                  { type: 'Variable', variant: 'CheckboxTiles', name: 'string' },
                  {
                    type: 'Variable',
                    variant: 'CenteredCheckboxTiles',
                    name: 'stringEmptyEnums'
                  },
                  { type: 'Variable', variant: 'CenteredCheckboxTiles', name: 'stringArray' },
                  { type: 'Variable', variant: 'CenteredCheckboxTiles', name: 'number' },
                  { type: 'Variable', variant: 'CenteredCheckboxTiles', name: 'numberEmptyEnums' },
                  { type: 'Variable', variant: 'CheckboxTiles', name: 'sobject' },
                  // these should have warnings on the invalid tile
                  { type: 'Variable', variant: 'CheckboxTiles', name: 'stringEnum', tiles: { a: {}, C: {} } },
                  {
                    type: 'Variable',
                    variant: 'CenteredCheckboxTiles',
                    name: 'numberEnum',
                    tiles: { 1: {}, 30: {} }
                  }
                ]
              }
            }
          }
        ]
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[0].name');
    expect(diagnostic, 'string variable error').to.not.be.undefined;
    expect(diagnostic!.code, 'string variable error code').to.equal(ERRORS.LAYOUT_TILES_EMPTY_ENUMS_VARAIBLE);
    expect(diagnostic!.relatedInformation, 'string variable error related information').to.be.undefined;

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[1].name');
    expect(diagnostic, 'stringEmptyEnum variable error').to.not.be.undefined;
    expect(diagnostic!.code, 'stringEmptyEnum variable error code').to.equal(ERRORS.LAYOUT_TILES_EMPTY_ENUMS_VARAIBLE);
    expect(diagnostic!.relatedInformation, 'stringEmptyEnum variable error related information').to.have.length(1);
    expect(
      diagnostic!.relatedInformation![0].doc.uri,
      'stringEmptyEnum variable error related information uri'
    ).to.match(/variables\.json$/);

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[2].name');
    expect(diagnostic, 'stringArray variable error').to.not.be.undefined;
    expect(diagnostic!.code, 'stringArray variable error code').to.equal(ERRORS.LAYOUT_INVALID_TILES_VARIABLE_TYPE);
    expect(diagnostic!.relatedInformation, 'stringArray variable error related information').to.not.be.undefined;
    expect(diagnostic!.relatedInformation![0].doc.uri, 'stringArray variable error related information uri').to.match(
      /layout\.json$/
    );

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[3].name');
    expect(diagnostic, 'number variable error').to.not.be.undefined;
    expect(diagnostic!.code, 'number variable error code').to.equal(ERRORS.LAYOUT_TILES_EMPTY_ENUMS_VARAIBLE);

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[4].name');
    expect(diagnostic, 'numberEmptyEnum variable error').to.not.be.undefined;
    expect(diagnostic!.code, 'numberEmptyEnum variable error code').to.equal(ERRORS.LAYOUT_TILES_EMPTY_ENUMS_VARAIBLE);

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[5].name');
    expect(diagnostic, 'sobject variable error').to.not.be.undefined;
    expect(diagnostic!.code, 'sobject variable error code').to.equal(ERRORS.LAYOUT_INVALID_TILES_VARIABLE_TYPE);

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[6].tiles.C');
    expect(diagnostic, 'stringEnum tile error').to.not.be.undefined;
    expect(diagnostic!.code, 'stringEnum tile error code').to.equal(ERRORS.LAYOUT_INVALID_TILE_NAME);
    expect(diagnostic!.relatedInformation, 'stringEnum tile related error information').to.have.length(1);
    expect(diagnostic!.relatedInformation![0].doc.uri, 'stringEnum tile error related information uri').to.match(
      /variables\.json$/
    );
    expect(diagnostic!.args, 'numberEnum tile error args').to.deep.equal({ name: 'C', match: 'c' });

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[7].tiles["30"]');
    expect(diagnostic, 'numberEnum tile error').to.not.be.undefined;
    expect(diagnostic!.code, 'numberEnum tile error code').to.equal(ERRORS.LAYOUT_INVALID_TILE_NAME);
    expect(diagnostic!.relatedInformation, 'numberEnum tile related error information').to.have.length(1);
    expect(diagnostic!.relatedInformation![0].doc.uri, 'numberEnum tile error related information uri').to.match(
      /variables\.json$/
    );
    expect(diagnostic!.args, 'numberEnum tile error args').to.deep.equal({ name: '30', match: '3' });

    if (diagnostics.length !== 8) {
      expect.fail('Expected 8 invalid variable errors, got ' + stringifyDiagnostics(diagnostics));
    }
  });

  it('validates unnecessary navigation objections', async () => {
    const dir = 'layoutVariables';
    const layoutPath = path.join(dir, 'layout.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'data',
        layoutDefinition: 'layout.json'
      },
      new StringDocument(layoutPath, {
        pages: [
          {
            title: '',
            type: 'Configuration',
            layout: {
              type: 'SingleColumn',
              center: {
                items: [{ type: 'Text', text: 'text' }]
              }
            },
            navigation: {} // This should get a warning since there is no `navigationPanel`
          }
        ],
        appDetails: {
          navigation: {} // Ditto
        }
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 unsupported variable errors, got ' + stringifyDiagnostics(diagnostics));
    }

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].navigation');
    expect(diagnostic, 'navigation has no effect unless a navigationPanel is defined as part of the layout.').to.not.be
      .undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNNECESSARY_NAVIGATION_OBJECT);

    diagnostic = diagnostics.find(d => d.jsonpath === 'appDetails.navigation');
    expect(diagnostic, 'navigation has no effect unless a navigationPanel is defined as part of the layout.').to.not.be
      .undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNNECESSARY_NAVIGATION_OBJECT);
  });

  it('validates validation page group tags', async () => {
    const dir = 'validationTags';
    const layoutPath = path.join(dir, 'layout.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'data',
        readinessDefinition: 'readiness.json',
        layoutDefinition: 'layout.json'
      },
      new StringDocument(path.join(dir, 'readiness.json'), {
        templateRequirements: [
          { expression: '{{Variables.foo}}}', tags: ['foo'] },
          { expression: '{{Variables.bar}}}', tags: ['foo', 'bar'] }
        ]
      }),
      new StringDocument(layoutPath, {
        pages: [
          {
            title: 'valid tags',
            type: 'Validation',
            groups: [
              { text: '' },
              { text: '', tags: [] },
              { text: '', tags: ['foo'] },
              { text: '', tags: ['foo', 'bar'] }
            ]
          },
          {
            title: 'invalid tags',
            type: 'Validation',
            groups: [
              { text: '', tags: ['', 'fo'] },
              { text: '', tags: ['baz', 'shouldnotmatchanything'] }
            ]
          }
        ]
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
    if (diagnostics.length !== 4) {
      expect.fail('Expected 4 invalid tag errors, got ' + stringifyDiagnostics(diagnostics));
    }

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].groups[0].tags[0]');
    expect(diagnostic, 'group[0].tag[0]').to.not.be.undefined;
    expect(diagnostic!.code, 'group[0].tag[0] code').to.equal(ERRORS.LAYOUT_VALIDATION_PAGE_UNKNOWN_GROUP_TAG);
    expect(diagnostic!.args, 'group[0].tag[0] args').to.not.be.undefined;
    expect(diagnostic!.args!.name, 'group[0].tag[0] args name').to.equal('');
    expect(diagnostic!.args!.match, 'group[0].tag[0] args match').to.be.undefined;

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].groups[0].tags[1]');
    expect(diagnostic, 'group[0].tag[1]').to.not.be.undefined;
    expect(diagnostic!.code, 'group[0].tag[1] code').to.equal(ERRORS.LAYOUT_VALIDATION_PAGE_UNKNOWN_GROUP_TAG);
    expect(diagnostic!.args, 'group[0].tag[1] args').to.not.be.undefined;
    expect(diagnostic!.args!.name, 'group[0].tag[1] args name').to.equal('fo');
    expect(diagnostic!.args!.match, 'group[0].tag[1] args match').to.equal('foo');

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].groups[1].tags[0]');
    expect(diagnostic, 'group[1].tag[0]').to.not.be.undefined;
    expect(diagnostic!.code, 'group[1].tag[1] code').to.equal(ERRORS.LAYOUT_VALIDATION_PAGE_UNKNOWN_GROUP_TAG);
    expect(diagnostic!.args, 'group[1].tag[0] args').to.not.be.undefined;
    expect(diagnostic!.args!.name, 'group[1].tag[0] args name').to.equal('baz');
    expect(diagnostic!.args!.match, 'group[1].tag[0] args match').to.equal('bar');

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].groups[1].tags[1]');
    expect(diagnostic, 'group[1].tag[1]').to.not.be.undefined;
    expect(diagnostic!.code, 'group[1].tag[1] code').to.equal(ERRORS.LAYOUT_VALIDATION_PAGE_UNKNOWN_GROUP_TAG);
    expect(diagnostic!.args, 'group[1].tag[1] args').to.not.be.undefined;
    expect(diagnostic!.args!.name, 'group[1].tag[1] args name').to.equal('shouldnotmatchanything');
    expect(diagnostic!.args!.match, 'group[1].tag[1] args match').to.be.undefined;
  });

  it('validates validation page group includeUnmatched', async () => {
    const dir = 'includeUnmatched';
    const layoutPath = path.join(dir, 'layout.json');
    linter = new TestLinter(
      dir,
      {
        templateType: 'data',
        layoutDefinition: 'layout.json'
      },
      new StringDocument(layoutPath, {
        pages: [
          {
            title: 'valid includeUnmatcheds',
            type: 'Validation',
            groups: [
              { text: '', includeUnmatched: true },
              { text: '', includeUnmatched: false },
              { text: '', includeUnmatched: null },
              { text: '' }
            ]
          },
          {
            title: 'mulitple invaludeUnmatcheds',
            type: 'Validation',
            groups: [
              { text: '', includeUnmatched: true },
              { text: '', includeUnmatched: false },
              { text: '', includeUnmatched: true },
              { text: '' }
            ]
          }
        ]
      })
    );

    await linter.lint();
    const diagnostics = getDiagnosticsForPath(linter.diagnostics, layoutPath) || [];
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 multiple includeUnmatched errors, got ' + stringifyDiagnostics(diagnostics));
    }

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].groups[0].includeUnmatched');
    expect(diagnostic, 'group[0]').to.not.be.undefined;
    expect(diagnostic!.code, 'group[0] code').to.equal(ERRORS.LAYOUT_VALIDATION_PAGE_MULTIPLE_INCLUDE_UNMATCHED);

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].groups[2].includeUnmatched');
    expect(diagnostic, 'group[2]').to.not.be.undefined;
    expect(diagnostic!.code, 'group[2] code').to.equal(ERRORS.LAYOUT_VALIDATION_PAGE_MULTIPLE_INCLUDE_UNMATCHED);
  });
});
