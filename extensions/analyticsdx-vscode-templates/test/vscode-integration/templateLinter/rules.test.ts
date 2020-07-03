/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { jsonpathFrom, uriBasename, uriStat } from '../../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTemplateWithRelatedFiles,
  PathFieldAndJson,
  setDocumentText,
  sortDiagnostics,
  waitForDiagnostics
} from '../vscodeTestUtils';

// tslint:disable:no-unused-expression
describe('TemplateLinterManager lints rules.json', () => {
  let tmpdir: vscode.Uri | undefined;
  beforeEach(async () => {
    await closeAllEditors();
    tmpdir = undefined;
  });

  afterEach(async () => {
    await closeAllEditors();
    // delete the temp folder
    if (tmpdir && (await uriStat(tmpdir))) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
    tmpdir = undefined;
  });

  async function createTemplateWithRules(
    ...rules: Array<{ rulesJson: string | object; ruleType: 'appToTemplate' | 'templateToApp' | 'ruleDefinition' }>
  ): Promise<vscode.TextEditor[]> {
    const files = rules.map((file, i) => {
      return {
        field:
          file.ruleType === 'ruleDefinition'
            ? 'ruleDefinition'
            : (json, path) => {
                const rules = json.rules || [];
                rules.push({
                  type: file.ruleType,
                  file: path
                });
                json.rules = rules;
              },
        path: `rules${i + 1}.json`,
        initialJson: file.rulesJson
      } as PathFieldAndJson;
    });
    const [dir, editors] = await createTemplateWithRelatedFiles(...files);
    tmpdir = dir;
    return editors;
  }

  it('shows problems on duplicate constants', async () => {
    const rulesJson = {
      constants: [
        {
          // this should conflict in same file
          name: 'const1',
          value: null
        },
        {
          // this should conflict in rules2
          name: 'const3',
          value: null
        },
        {
          name: 'const1',
          value: null
        },
        {
          // this should be fine
          name: 'const4',
          value: null
        }
      ]
    };
    const [rulesEditor, rules2Editor, rules3Editor] = await createTemplateWithRules(
      { rulesJson, ruleType: 'templateToApp' },
      {
        rulesJson: {
          constants: [
            {
              name: 'const3',
              value: null
            }
          ]
        },
        ruleType: 'templateToApp'
      },
      {
        rulesJson: {
          constants: [
            {
              // this should be fine since it's a different ruleType
              name: 'const3',
              value: null
            }
          ]
        },
        ruleType: 'appToTemplate'
      }
    );
    // check rule1.json diagnostics
    let diagnostics = (
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length >= 3,
        'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate constants warnings'
      )
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 3) {
      expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the expected warnings
    let diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate constant 'const1'");
    expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
    expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('constants[0].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(
      diagnostic.relatedInformation?.[0].location.range.start.line,
      'diagnostic[0].relatedInformation.line'
    ).to.be.greaterThan(diagnostic.range.start.line, 'diagnostic[0].line');
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    diagnostic = diagnostics[1];
    expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[1].message').to.equal("Duplicate constant 'const3'");
    expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
    expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('constants[1].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[1].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[1].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[1].relatedInformation.uri').to.equal(
      rules2Editor.document.uri
    );

    diagnostic = diagnostics[2];
    expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[2].message').to.equal("Duplicate constant 'const1'");
    expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
    expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('constants[2].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[2].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[2].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(
      diagnostic.relatedInformation?.[0].location.range.start.line,
      'diagnostic[2].relatedInformation.line'
    ).to.be.lessThan(diagnostic.range.start.line, 'diagnostic[2].line');
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    // check rules2.json warning
    diagnostics = (
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length >= 1,
        'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate constants warnings'
      )
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate constant 'const3'");
    expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_CONSTANT);
    expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('constants[0].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    // and no warnings on rules3.json
    await waitForDiagnostics(
      rules3Editor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rules3Editor.document.uri)
    );

    // fix the duplicate constants
    rulesJson.constants[1].name = 'const2';
    rulesJson.constants[2].name = 'const5';
    await setDocumentText(rulesEditor, rulesJson);
    await waitForDiagnostics(
      rulesEditor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate constants'
    );
    await waitForDiagnostics(
      rules2Editor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate constants'
    );
    await waitForDiagnostics(
      rules3Editor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rules3Editor.document.uri)
    );
  });

  it('shows hints on duplicate rule names', async () => {
    const rulesJson = {
      rules: [
        {
          // should conflict in same file
          name: 'name1',
          appliesTo: [
            {
              type: '*'
            }
          ],
          actions: [
            {
              action: 'delete',
              path: '$.name'
            }
          ]
        },
        {
          // should conflict in rules2.json
          name: 'name3',
          appliesTo: [
            {
              type: '*'
            }
          ],
          actions: [
            {
              action: 'delete',
              path: '$.name'
            }
          ]
        },
        {
          name: 'name1',
          appliesTo: [
            {
              type: '*'
            }
          ],
          actions: [
            {
              action: 'delete',
              path: '$.name'
            }
          ]
        },
        {
          // this should be fine
          name: 'name4',
          appliesTo: [
            {
              type: '*'
            }
          ],
          actions: [
            {
              action: 'delete',
              path: '$.name'
            }
          ]
        }
      ]
    };
    const [rulesEditor, rules2Editor, rules3Editor] = await createTemplateWithRules(
      { rulesJson, ruleType: 'ruleDefinition' },
      {
        rulesJson: {
          rules: [
            {
              name: 'name3',
              appliesTo: [
                {
                  type: '*'
                }
              ],
              actions: [
                {
                  action: 'delete',
                  path: '$.name'
                }
              ]
            }
          ]
        },
        ruleType: 'templateToApp'
      },
      {
        rulesJson: {
          rules: [
            {
              // this should be fine since it's a different ruleType
              name: 'name3',
              appliesTo: [
                {
                  type: '*'
                }
              ],
              actions: [
                {
                  action: 'delete',
                  path: '$.name'
                }
              ]
            }
          ]
        },
        ruleType: 'appToTemplate'
      }
    );
    // check rules1.json warnings
    let diagnostics = (
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length >= 3,
        'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate rule names hints'
      )
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 3) {
      expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the expected warnings
    let diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate rule name 'name1'");
    expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
    expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('rules[0].name');
    expect(diagnostic.severity, 'diagnostic[0].severity').to.equal(vscode.DiagnosticSeverity.Hint);
    expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );
    expect(
      diagnostic.relatedInformation?.[0].location.range.start.line,
      'diagnostic[0].relatedInformation.line'
    ).to.be.greaterThan(diagnostic.range.start.line, 'diagnostic[0].line');

    diagnostic = diagnostics[1];
    expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[1].message').to.equal("Duplicate rule name 'name3'");
    expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
    expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('rules[1].name');
    expect(diagnostic.severity, 'diagnostic[1].severity').to.equal(vscode.DiagnosticSeverity.Hint);
    expect(diagnostic.relatedInformation?.length, 'diagnostic[1].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[1].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[1].relatedInformation.uri').to.equal(
      rules2Editor.document.uri
    );

    diagnostic = diagnostics[2];
    expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[2].message').to.equal("Duplicate rule name 'name1'");
    expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
    expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('rules[2].name');
    expect(diagnostic.severity, 'diagnostic[2].severity').to.equal(vscode.DiagnosticSeverity.Hint);
    expect(diagnostic.relatedInformation?.length, 'diagnostic[2].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[2].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[2].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );
    expect(
      diagnostic.relatedInformation?.[0].location.range.start.line,
      'diagnostic[2].relatedInformation.line'
    ).to.be.lessThan(diagnostic.range.start.line, 'diagnostic[2].line');

    // check rules2.json warnings
    diagnostics = (
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length >= 1,
        'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate rule names hints'
      )
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the expected warnings
    diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate rule name 'name3'");
    expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_RULE_NAME);
    expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('rules[0].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    // and no warnings on rules3.json
    await waitForDiagnostics(
      rules3Editor.document.uri,
      d => d && d.length === 0,
      'No hints on ' + uriBasename(rules3Editor.document.uri)
    );

    // fix the duplicate rule names
    rulesJson.rules[1].name = 'name2';
    rulesJson.rules[2].name = 'name5';
    await setDocumentText(rulesEditor, rulesJson);
    await waitForDiagnostics(
      rulesEditor.document.uri,
      d => d && d.length === 0,
      'No hints on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate rule names'
    );
    await waitForDiagnostics(
      rules2Editor.document.uri,
      d => d && d.length === 0,
      'No hints on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate rule names'
    );
    await waitForDiagnostics(
      rules3Editor.document.uri,
      d => d && d.length === 0,
      'No hints on ' + uriBasename(rules3Editor.document.uri)
    );
  });

  it('shows problems on duplicate macros', async () => {
    const rulesJson = {
      macros: [
        {
          namespace: 'ns1',
          definitions: [
            {
              // should conflict in this file
              name: 'macro1',
              returns: ''
            },
            {
              // should conflict in rule2.json
              name: 'macro3',
              returns: ''
            }
          ]
        },
        {
          namespace: 'ns1',
          definitions: [
            {
              name: 'macro1',
              returns: ''
            },
            {
              // should be fine
              name: 'macro4',
              returns: ''
            }
          ]
        }
      ]
    };
    const [rulesEditor, rules2Editor, rules3Editor] = await createTemplateWithRules(
      { rulesJson, ruleType: 'appToTemplate' },
      {
        rulesJson: {
          macros: [
            {
              namespace: 'ns1',
              definitions: [
                {
                  name: 'macro3',
                  returns: ''
                }
              ]
            }
          ]
        },
        ruleType: 'appToTemplate'
      },
      {
        rulesJson: {
          macros: [
            {
              namespace: 'ns1',
              definitions: [
                {
                  // this should be fine since it's a different ruleType
                  name: 'macro3',
                  returns: ''
                }
              ]
            }
          ]
        },
        ruleType: 'templateToApp'
      }
    );
    // check rules1.json warnings
    let diagnostics = (
      await waitForDiagnostics(
        rulesEditor.document.uri,
        d => d && d.length >= 3,
        'Initial ' + uriBasename(rulesEditor.document.uri) + ' duplicate macros warnings'
      )
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 3) {
      expect.fail('Expected 3 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the expected warnings
    let diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate macro 'ns1:macro1'");
    expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
    expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('macros[0].definitions[0].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    diagnostic = diagnostics[1];
    expect(diagnostic, 'diagnostic[1]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[1].message').to.equal("Duplicate macro 'ns1:macro3'");
    expect(diagnostic.code, 'diagnotic[1].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
    expect(jsonpathFrom(diagnostic), 'diagnostic[1].jsonpath').to.equal('macros[0].definitions[1].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[1].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[1].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[1].relatedInformation.uri').to.equal(
      rules2Editor.document.uri
    );

    diagnostic = diagnostics[2];
    expect(diagnostic, 'diagnostic[2]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[2].message').to.equal("Duplicate macro 'ns1:macro1'");
    expect(diagnostic.code, 'diagnotic[2].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
    expect(jsonpathFrom(diagnostic), 'diagnostic[2].jsonpath').to.equal('macros[1].definitions[0].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[2].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[2].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[2].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    // check rules2.json warnings
    diagnostics = (
      await waitForDiagnostics(
        rules2Editor.document.uri,
        d => d && d.length >= 1,
        'Initial ' + uriBasename(rules2Editor.document.uri) + ' duplicate macros warnings'
      )
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the expected warnings
    diagnostic = diagnostics[0];
    expect(diagnostic, 'diagnostic[0]').to.not.be.undefined;
    expect(diagnostic.message, 'diagnostic[0].message').to.equal("Duplicate macro 'ns1:macro3'");
    expect(diagnostic.code, 'diagnotic[0].code').to.equal(ERRORS.RULES_DUPLICATE_MACRO);
    expect(jsonpathFrom(diagnostic), 'diagnostic[0].jsonpath').to.equal('macros[0].definitions[0].name');
    expect(diagnostic.relatedInformation?.length, 'diagnostic[0].relatedInformation.length').to.equal(1);
    expect(diagnostic.relatedInformation?.[0].message, 'diagnostic[0].relatedInformation.message').to.equal(
      'Other usage'
    );
    expect(diagnostic.relatedInformation?.[0].location.uri, 'diagnostic[0].relatedInformation.uri').to.equal(
      rulesEditor.document.uri
    );

    // and no warnings on rules3.json
    await waitForDiagnostics(
      rules3Editor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rules3Editor.document.uri)
    );

    // fix the duplicate definition name, and all the warnings should go away
    rulesJson.macros[0].definitions[1].name = 'macro2';
    rulesJson.macros[1].namespace = 'ns2';
    await setDocumentText(rulesEditor, rulesJson);
    await waitForDiagnostics(
      rulesEditor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rulesEditor.document.uri) + ' after fixing duplicate macro names'
    );
    await waitForDiagnostics(
      rules2Editor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rules2Editor.document.uri) + ' after fixing duplicate macro names'
    );
    await waitForDiagnostics(
      rules3Editor.document.uri,
      d => d && d.length === 0,
      'No warnings on ' + uriBasename(rules3Editor.document.uri)
    );
  });

  it('shows infos on no-op macro definitions', async () => {
    const rulesJson: {
      macros: Array<{
        namespace: string;
        definitions: Array<{ name: string; returns?: string; actions?: Array<{ action: string; path: string }> }>;
      }>;
    } = {
      macros: [
        {
          namespace: 'ns1',
          definitions: [
            {
              name: 'macro1'
            },
            {
              name: 'macro2',
              actions: []
            },
            {
              name: 'valid',
              actions: [
                {
                  action: 'delete',
                  path: '$.name'
                }
              ],
              returns: ''
            }
          ]
        }
      ]
    };
    const [rulesEditor] = await createTemplateWithRules({ rulesJson, ruleType: 'appToTemplate' });
    const diagnostics = (
      await waitForDiagnostics(rulesEditor.document.uri, d => d && d.length >= 2, 'Initial no-op macros warnings')
    ).sort(sortDiagnostics);
    if (diagnostics.length !== 2) {
      expect.fail('Expected 2 initial diagnostics, got:\n' + JSON.stringify(diagnostics, undefined, 2));
    }
    // make sure we get the expected warnings
    diagnostics.forEach((diagnostic, i) => {
      expect(diagnostic, `diagnostics[${i}]`).to.not.be.undefined;
      expect(diagnostic.message, `diagnostics[${i}].message`).to.equal(
        "Macro should have a 'return' or at least one action"
      );
      expect(diagnostic.code, `diagnostics[${i}].code`).to.equal(ERRORS.RULES_NOOP_MACRO);
      expect(diagnostic.severity, `diagnostics[${i}].severity`).to.equal(vscode.DiagnosticSeverity.Information);
      expect(jsonpathFrom(diagnostic), `diagnostics[${i}].jsonpath`).to.equal(
        i === 0 ? 'macros[0].definitions[0]' : 'macros[0].definitions[1].actions'
      );
    });

    // fix them
    rulesJson.macros[0].definitions[0].returns = 'foo';
    rulesJson.macros[0].definitions[1].actions!.push({ action: 'delete', path: '$.name' });
    await setDocumentText(rulesEditor, rulesJson);
    await waitForDiagnostics(
      rulesEditor.document.uri,
      d => d && d.length === 0,
      'No warnings after fixing no-op macros'
    );
  });
});
