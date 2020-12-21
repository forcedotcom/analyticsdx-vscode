/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import childProcess = require('child_process');
import {
  Command,
  ContinueResponse,
  EmptyPostChecker,
  SfdxCommandBuilder,
  SfdxCommandletExecutorWithOutput
} from '../../../src/commands/commands';

class TestExecutorWithOutput extends SfdxCommandletExecutorWithOutput<string> {
  public build(data: string): Command {
    return new SfdxCommandBuilder().withArg(data).build();
  }
}

describe('Command Utilities', () => {
  describe('SfdxCommandletExecutorWithOutput', async () => {
    const mockSpawnLib = require('mock-spawn');
    let origSpawn: any;
    let mockSpawn: any;
    beforeEach(() => {
      origSpawn = childProcess.spawn;
      mockSpawn = mockSpawnLib();
      childProcess.spawn = mockSpawn;
    });

    afterEach(() => {
      childProcess.spawn = origSpawn;
    });

    it('Returns command output', async () => {
      const expectedOutput = JSON.stringify(
        {
          status: 0,
          result: {
            name: 'value'
          }
        },
        undefined,
        2
      );
      mockSpawn.setDefault(mockSpawn.simple(0, expectedOutput));
      const cmd = new TestExecutorWithOutput();
      const output = await cmd.execute({ type: 'CONTINUE', data: 'inputvalue' });
      expect(output).to.equal(expectedOutput);
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
