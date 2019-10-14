/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { ContinueResponse, EmptyPostChecker } from '../../../src/commands/commands';

describe('Command Utilities', () => {
  describe.skip('SfdxCommandletExecutorWithOutput', async () => {
    it.skip('Returns command output', () => {
      // TODO: implement
    });
  });

  describe('EmptyPostChecker', () => {
    it('Always returns the inputs', async () => {
      const checker = new EmptyPostChecker();
      const inputs: ContinueResponse<any> = {
        type: 'CONTINUE',
        data: {
          foo: 'bar'
        }
      };
      const output = await checker.check(inputs);
      expect(output).to.be.equal(inputs);
    });
  });
});
