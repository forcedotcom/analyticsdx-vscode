/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import * as tmp from 'tmp';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { nls } from '../messages';
import {
  CancelResponse,
  CommandExecution,
  ContinueResponse,
  notificationService,
  ParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  sfdxWorkspaceChecker
} from './commands';

// TODO: generalize the logic here to run something before and after running the cli cmd
class CreateBlankAppExecutor extends SfdxCommandletExecutor<string> {
  constructor(private readonly filepath: string) {
    super();
  }

  // override this to delete the tmp file when done
  protected attachExecution(
    execution: CommandExecution,
    cancellationTokenSource: vscode.CancellationTokenSource,
    cancellationToken: vscode.CancellationToken
  ) {
    super.attachExecution(execution, cancellationTokenSource, cancellationToken);
    // wait until the cli call is finished, and try to delete the tmp file
    execution.processExitSubject.subscribe(() => {
      // just let it run async, and we don't really care it fails -- node
      // docs say to just do the unlink and handle/ignore the ENOENT error
      fs.unlink(this.filepath, err => {});
    });
  }

  // override this to create the tmp file and run the cli after that
  public execute(response: ContinueResponse<string>): void {
    const appJson = {
      label: response.data,
      assetIcon: '16.png'
    };
    // write the tmp file
    fs.writeFile(this.filepath, JSON.stringify(appJson), {}, err => {
      // if that failed, show an error message to user
      if (err) {
        notificationService.showErrorMessage(
          nls.localize('create_blank_app_cmd_tmp_file_error_text', this.filepath, err.message || err)
        );
      } else {
        // success, run the cli
        super.execute(response);
      }
    });
  }

  public build(data: string) {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('create_blank_app_cmd_message'))
      .withArg('analytics:app:create')
      .withArg('-f')
      .withArg(this.filepath)
      .withLogName('analytics_app_create_blank')
      .build();
  }
}

class AppNameGatherer implements ParametersGatherer<string> {
  public async gather(): Promise<CancelResponse | ContinueResponse<string>> {
    const name = await vscode.window.showInputBox({
      prompt: nls.localize('create_blank_app_cmd_name_prompt'),
      validateInput: input => {
        if (!input || input.trim().length <= 0) {
          return nls.localize('create_blank_app_cmd_empty_name_message');
        } else {
          return undefined;
        }
      }
    });
    return name ? { type: 'CONTINUE', data: name.trim() } : { type: 'CANCEL' };
  }
}
const appNameGatherer = new AppNameGatherer();

// async function to return a tmp file name for putting the app json into
const mktempname: () => Promise<string> = promisify(callback => {
  tmp.tmpName(
    {
      prefix: 'adx-blank-app-',
      postfix: '.json'
    },
    callback
  );
});
export async function createBlankApp() {
  const filepath = await mktempname();
  const commandlet = new SfdxCommandlet(sfdxWorkspaceChecker, appNameGatherer, new CreateBlankAppExecutor(filepath));
  await commandlet.run();
}
