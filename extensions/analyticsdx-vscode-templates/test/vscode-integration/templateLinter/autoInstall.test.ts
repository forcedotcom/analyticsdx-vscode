/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { ERRORS } from '../../../src/constants';
import { jsonpathFrom } from '../../../src/util/vscodeUtils';
import { openFile, uriFromTestRoot, waitForDiagnostics, waveTemplatesUriPath } from '../vscodeTestUtils';

describe('TemplateLinterManager lints auto-install.json', () => {
  it('shows errors on unknown variable', async () => {
    const [doc] = await openFile(uriFromTestRoot(waveTemplatesUriPath, 'BadVariables', 'auto-install.json'));
    const filter = (d: vscode.Diagnostic) => d.code === ERRORS.AUTO_INSTALL_UNKNOWN_VARIABLE;
    const diagnostics = (
      await waitForDiagnostics(doc.uri, diagnostics => diagnostics?.some(filter), 'Unknown variable diagnostics')
    ).filter(filter);

    // make sure we just get the one one UnknownVar
    if (diagnostics.length !== 1) {
      expect.fail('Expected 1 diagnostic, got: ' + JSON.stringify(diagnostics, undefined, 2));
    }
    expect(jsonpathFrom(diagnostics[0]), 'diagnostic jsonpath').to.equal(
      'configuration.appConfiguration.values.UnknownVar'
    );
  });
});
