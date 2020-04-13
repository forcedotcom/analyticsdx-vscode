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
  SfdxCommandletExecutor,
  SfdxCommandletExecutorWithOutput,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppMetadata } from './gatherers/appGatherer';

export function baseStudioPath() {
  return (
    vscode.workspace
      .getConfiguration()
      .get<string>('adx-core.studio.path')
      ?.trimLeft() || '/wave/wave.app'
  );
}

// REVIEWME: just get the url from sfdx and open in a vscode WebViewPanel?

// This will have sfdx print the url, which this will read and use with vscode.env.openExternal().
// This is for when running in web mode (Visual Studio Online).
// Note: I can't seem to get Studio urls that use a # to work when going through sfdx -> Uri.parse() ->
// openExternal() -> frontdoor.jsp -> retURL, something in there seems to double-encode the query params in a way
// which the server then doesn't double-decode correctly, and it gets a 404 from the server since the # in the
// url ends up as a literal %23 instead of the original #.
// Since the Studio UI is going to move to /-based url navigation in a near future release (where /'s do seem to work
// fine), we can update things to always use openExternal() in the future, and for now just not support our #-url-based
// commands in web mode.
class OpenExternalStudioExecutor<T> extends SfdxCommandletExecutorWithOutput<T> {
  constructor(private readonly logName = 'analytics_open_studio') {
    super();
  }

  public build(data: T) {
    let path = baseStudioPath();
    // if they put a #hash in the path in the config, chop that off since it won't work anyways
    path = path.replace(/#.*$/, '');
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
      }
    }
    return jsonStr;
  }
}

// This has sfdx open the url, which only works in desktop mode
class OpenStudioExecutor<T> extends SfdxCommandletExecutor<T> {
  constructor(
    private readonly logName = 'analytics_open_studio',
    private readonly hashgen?: (t: T) => string | undefined
  ) {
    super();
  }

  public build(data: T) {
    let path = baseStudioPath();
    const hash = this.hashgen?.(data);
    if (hash) {
      // if they put a #hash in the path in the config, chop that off to put this hash on
      path = path.replace(/#.*$/, '');
      path += '#' + hash;
    }
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('open_studio_cmd_message'))
      .withArg('force:org:open')
      .withArg('-p')
      .withArg(path)
      .withLogName(this.logName)
      .build();
  }
}

const openStudioCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  emptyParametersGatherer,
  vscode.env.uiKind === vscode.UIKind.Web ? new OpenExternalStudioExecutor() : new OpenStudioExecutor()
);

export async function openStudio() {
  await openStudioCommandlet.run();
}

const openDataManagerCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  emptyParametersGatherer,
  new OpenStudioExecutor('analytics_open_dataManager', () => 'dataManager')
);

export async function openDataManager() {
  if (vscode.env.uiKind !== vscode.UIKind.Web) {
    await openDataManagerCommandlet.run();
  }
}

const openAppCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  new AppGatherer(),
  new OpenStudioExecutor<AppMetadata>(
    'analytics_open_app_in_studio',
    app => 'application/' + encodeURIComponent(app.folderid) + '/edit'
  )
);

export async function openAppInStudio() {
  if (vscode.env.uiKind !== vscode.UIKind.Web) {
    await openAppCommandlet.run();
  }
}
