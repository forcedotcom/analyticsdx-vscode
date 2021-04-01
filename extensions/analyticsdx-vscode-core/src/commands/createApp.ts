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
  BaseSfdxCommandletExecutor,
  CancelResponse,
  CommandExecution,
  ContinueResponse,
  ParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandlet,
  sfdxWorkspaceChecker
} from './commands';
import { TemplateGatherer, TemplateMetadata } from './gatherers/templateGatherer';

class AppNameGatherer implements ParametersGatherer<string> {
  public async gather(): Promise<CancelResponse | ContinueResponse<string>> {
    const name = await vscode.window.showInputBox({
      prompt: nls.localize('create_app_cmd_name_prompt'),
      validateInput: input => {
        if (!input || input.trim().length <= 0) {
          return nls.localize('create_app_cmd_empty_name_message');
        } else {
          return undefined;
        }
      }
    });
    return name ? { type: 'CONTINUE', data: name.trim() } : { type: 'CANCEL' };
  }
}
const appNameGatherer = new AppNameGatherer();

// TODO: generalize the logic here to run something before and after running the cli cmd
class CreateBlankAppExecutor extends BaseSfdxCommandletExecutor<string> {
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
        vscode.window.showErrorMessage(
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
      .withArg('--async')
      .withLogName('analytics_app_create_blank')
      .build();
  }
}

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
export async function createBlankApp(): Promise<void> {
  const filepath = await mktempname();
  const commandlet = new SfdxCommandlet(sfdxWorkspaceChecker, appNameGatherer, new CreateBlankAppExecutor(filepath));
  return commandlet.run();
}

type TemplateAndName = {
  template: TemplateMetadata;
  name: string;
};

class TemplateAndNameGather implements ParametersGatherer<TemplateAndName> {
  private readonly templateGatherer = new TemplateGatherer({
    // sfdx analytics:app:create only works for 'app' templates
    filter: template => template.templatetype === 'app'
  });
  public async gather(): Promise<CancelResponse | ContinueResponse<TemplateAndName>> {
    const template = await this.templateGatherer.gather();
    if (template.type === 'CANCEL') {
      return template;
    }
    const name = await appNameGatherer.gather();
    if (name.type === 'CANCEL') {
      return name;
    }
    return {
      type: 'CONTINUE',
      data: {
        template: template.data,
        name: name.data
      }
    };
  }
}

class CreateAppExecutor extends BaseSfdxCommandletExecutor<TemplateAndName> {
  public build(data: TemplateAndName) {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('create_app_cmd_message', data.template.label || data.template.name))
      .withArg('analytics:app:create')
      .withArg('--appname')
      .withArg(data.name)
      .withArg('--templateid')
      .withArg(data.template.templateid)
      .withLogName('analytics_app_create')
      .build();
  }
}

export function createApp(): Promise<void> {
  return new SfdxCommandlet(sfdxWorkspaceChecker, new TemplateAndNameGather(), new CreateAppExecutor()).run();
}
