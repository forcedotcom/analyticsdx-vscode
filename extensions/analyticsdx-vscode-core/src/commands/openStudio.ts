/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { nls } from '../messages';
import {
  emptyParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppMetadata } from './gatherers/appGatherer';

export function baseStudioPath() {
  return (
    vscode.workspace
      .getConfiguration()
      .get<string>('analyticsdx-vscode-core.studio.path')
      ?.trimLeft() || '/wave/wave.app'
  );
}

// REVIEWME: just get the url from sfdx and open in a vscode WebViewPanel?
class OpenStudioExecutor<T> extends SfdxCommandletExecutor<T> {
  constructor(
    private readonly logName = 'analytics_open_studio',
    private readonly hashgen?: (t: T) => string | undefined
  ) {
    super();
  }

  public build(data: T) {
    let path = baseStudioPath();
    const hash = this.hashgen ? this.hashgen(data) : undefined;
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
  new OpenStudioExecutor()
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
  await openDataManagerCommandlet.run();
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
  await openAppCommandlet.run();
}
