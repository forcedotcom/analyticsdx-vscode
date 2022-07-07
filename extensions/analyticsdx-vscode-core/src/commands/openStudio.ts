/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { nls } from '../messages';
import {
  ContinueResponse,
  emptyParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutorWithOutput,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppMetadata } from './gatherers/appGatherer';

export function baseStudioPath() {
  return (
    vscode.workspace.getConfiguration().get<string>('analyticsdx-vscode-core.studio.path')?.trimStart() || '/analytics/'
  );
}

// This will have sfdx print the url, which this will read and use with vscode.env.openExternal() so that
// it works in Code Builder (and Github Codespaces).

class OpenOrgPathExecutor<T> extends SfdxCommandletExecutorWithOutput<T> {
  constructor(
    // this value should not start with /
    private readonly pathgen: string | ((data: T) => string),
    private readonly logName: string,
    private readonly commandDescription: string
  ) {
    super();
  }

  public build(data: T) {
    let path = typeof this.pathgen === 'string' ? this.pathgen : this.pathgen(data);
    // #'s in the url don't work when going through sfdx -> Uri.parse() -> openExternal() -> frontdoor.jsp -> retURL,
    // something in there seems to double-encode the query params in a way which the server then doesn't double-decode
    // correctly, and it gets a 404 from the server since the # in the url ends up as a literal %23 instead of the
    // original #, so just get rid of that for now
    path = path.replace(/#.*$/, '');
    return new SfdxCommandBuilder()
      .withDescription(this.commandDescription)
      .withArg('force:org:open')
      .withArg('-r')
      .withArg('-p')
      .withArg(path)
      .withLogName(this.logName)
      .withJson()
      .build();
  }

  public async execute(response: ContinueResponse<T>): Promise<string> {
    const jsonStr = await super.execute(response);
    if (jsonStr) {
      const json = JSON.parse(jsonStr);
      if (json?.status === 0 && json?.result?.url) {
        const uri = vscode.Uri.parse(json.result.url as string);
        vscode.env.openExternal(uri);
        return uri.toString();
      }
    }
    throw new Error(nls.localize('open_studio_cmd_error'));
  }
}

class OpenStudioExecutor<T> extends OpenOrgPathExecutor<T> {
  constructor(
    // this value should not start with /
    routegen: string | ((data: T) => string),
    logName = 'analytics_open_studio'
  ) {
    super(
      (data: T) => {
        let path = baseStudioPath();
        const route = typeof routegen === 'string' ? routegen : routegen(data);
        if (path.indexOf('%s') >= 0) {
          path = path.replace('%s', route);
        } else {
          if (!path.endsWith('/')) {
            path += '/';
          }
          path += route;
        }
        return path;
      },
      logName,
      nls.localize('open_studio_cmd_message')
    );
  }
}

export function openStudio(): Promise<void> {
  return new SfdxCommandlet(sfdxWorkspaceChecker, emptyParametersGatherer, new OpenStudioExecutor('home')).run();
}

export function openDataManager(): Promise<void> {
  return new SfdxCommandlet(
    sfdxWorkspaceChecker,
    emptyParametersGatherer,
    new OpenOrgPathExecutor(
      '/lightning/n/standard-AnalyticsDataManager',
      'analytics_open_dataManager',
      nls.localize('open_data_manager_cmd_message')
    )
  ).run();
}

export function openAppInStudio(): Promise<void> {
  return new SfdxCommandlet(
    sfdxWorkspaceChecker,
    new AppGatherer(),
    new OpenStudioExecutor<AppMetadata>(
      app => 'application/' + encodeURIComponent(app.folderid) + '/edit',
      'analytics_open_app_in_studio'
    )
  ).run();
}
