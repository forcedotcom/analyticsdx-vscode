/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { uriStat } from '../../src/util/vscodeUtils';
import {
  closeAllEditors,
  createTempTemplate,
  getTemplateLinterManager,
  waitForTemplateLinterManagerIsQuiet
} from './vscodeTestUtils';

/** Tests for vscodeTestUtils, to make sure these methods will work for the other tests. */
// tslint:disable:no-unused-expression
describe('vscodeTestUtils', () => {
  let tmpdir: vscode.Uri | undefined;
  beforeEach(closeAllEditors);
  afterEach(async () => {
    await closeAllEditors();
    // delete the temp folder
    if (tmpdir && (await uriStat(tmpdir))) {
      await vscode.workspace.fs.delete(tmpdir, { recursive: true, useTrash: false });
    }
    tmpdir = undefined;
  });

  it('waitForTemplateLinterManagerIsQuiet()', async () => {
    // this should eventually go quiet since there shouldn't be any opening or typing going on initially
    let isQuiet = await waitForTemplateLinterManagerIsQuiet(await getTemplateLinterManager());
    expect(isQuiet, 'isQuiet').to.be.true;

    // kick off making and opening a new template, but don't just yet wait for it to finish
    const opener = createTempTemplate(true);

    // the linter quiet should go to false (meaning it should be linting)
    try {
      isQuiet = await waitForTemplateLinterManagerIsQuiet(await getTemplateLinterManager(), false);
      expect(isQuiet, 'isQuiet').to.be.false;
    } finally {
      // always grab the tmpdir, so it'll be cleaned up in afterEach(0)
      try {
        [tmpdir] = await opener;
      } catch (e) {
        // print any error from the opener, but let any error from the try block be what propagates out
        console.error(e);
      }
    }

    // and it should eventually go back to quiet
    isQuiet = await waitForTemplateLinterManagerIsQuiet(await getTemplateLinterManager(), true);
    expect(isQuiet, 'isQuiet').to.be.true;
  });
});
