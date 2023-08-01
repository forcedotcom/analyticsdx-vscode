/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { expect } from 'chai';
import * as path from 'path';
import { ERRORS } from '../../../src';
import { getDiagnosticsForPath } from '../../testutils';
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
        foo: { variableType: { type: 'StringType' } }
      }),
      new StringDocument(layoutPath, {
        pages: [
          {
            title: '',
            layout: {
              type: 'SingleColumn',
              center: {
                items: [
                  { type: 'Variable', name: 'foo' },
                  { type: 'Variable', name: 'food' }
                ]
              }
            }
          },
          {
            title: '',
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
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 unknown variable errors, got' + stringifyDiagnostics(diagnostics));
    }

    let diagnostic = diagnostics.find(d => d.jsonpath === 'pages[0].layout.center.items[1].name');
    expect(diagnostic, 'food variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(diagnostic!.args).to.deep.equal({ name: 'food', match: 'foo' });

    diagnostic = diagnostics.find(d => d.jsonpath === 'pages[1].layout.left.items[0].name');
    expect(diagnostic, 'bar variable error').to.not.be.undefined;
    expect(diagnostic!.code).to.equal(ERRORS.LAYOUT_PAGE_UNKNOWN_VARIABLE);
    expect(diagnostic!.args).to.deep.equal({ name: 'bar' });
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
});
