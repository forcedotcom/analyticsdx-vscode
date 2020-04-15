/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { CommandExecution } from './commandExecutor';

export class CommandResult {
  public async getExitCode(execution: CommandExecution): Promise<number> {
    return new Promise((resolve, reject) => {
      execution.processExitSubject.subscribe(code => {
        if (typeof code === 'number') {
          resolve(code);
        } else {
          reject(new Error(`Invalid exitCode '${code}'`));
        }
      });
    });
  }
}
