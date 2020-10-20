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
    vscode.workspace
      .getConfiguration()
      .get<string>('analyticsdx-vscode-core.studio.path')
      ?.trimLeft() || '/analytics/'
  );
}

// REVIEWME: just get the url from sfdx and open in a vscode WebViewPanel?

// This will have sfdx print the url, which this will read and use with vscode.env.openExternal() so that
// it works in Code Builder (and Github Codespaces).

class OpenStudioExecutor<T> extends SfdxCommandletExecutorWithOutput<T> {
  constructor(
    // this value should not start with /
    private readonly routegen: string | ((data: T) => string),
    private readonly logName = 'analytics_open_studio'
  ) {
    super();
  }

  public build(data: T) {
    let path = baseStudioPath();
    const route = typeof this.routegen === 'string' ? this.routegen : this.routegen(data);
    if (path.indexOf('%s') >= 0) {
      path = path.replace('%s', route);
    } else {
      if (!path.endsWith('/')) {
        path += '/';
      }
      path += route;
    }
    // #'s in the url don't work when going through sfdx -> Uri.parse() -> openExternal() -> frontdoor.jsp -> retURL,
    // something in there seems to double-encode the query params in a way which the server then doesn't double-decode
    // correctly, and it gets a 404 from the server since the # in the url ends up as a literal %23 instead of the
    // original #, so just get rid of that for now
    path.replace(/#.*$/, '');
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('open_studio_cmd_message'))
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

const openStudioCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  emptyParametersGatherer,
  new OpenStudioExecutor('home')
);

export async function openStudio() {
  await openStudioCommandlet.run();
}

const openDataManagerCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  emptyParametersGatherer,
  new OpenStudioExecutor('dataManager', 'analytics_open_dataManager')
);

export async function openDataManager() {
  await openDataManagerCommandlet.run();
}

const openAppCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  new AppGatherer(),
  new OpenStudioExecutor<AppMetadata>(
    app => 'application/' + encodeURIComponent(app.folderid) + '/edit',
    'analytics_open_app_in_studio'
  )
);

export async function openAppInStudio() {
  await openAppCommandlet.run();
}
