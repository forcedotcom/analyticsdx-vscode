/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { URI_PATHS } from '../constants';
import { nls } from '../messages';
import {
  emptyParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppMetadata } from './gatherers/appGatherer';

// REVIEWME: just get the url from sfdx and open in a vscode WebViewPanel?
class OpenStudioExecutor<T> extends SfdxCommandletExecutor<T> {
  constructor(private readonly hashgen?: (t: T) => string | undefined) {
    super();
  }

  public build(data: T) {
    let path = URI_PATHS.Studio;
    const hash = this.hashgen ? this.hashgen(data) : undefined;
    if (hash) {
      path += '#' + hash;
    }
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('open_studio_cmd_message'))
      .withArg('force:org:open')
      .withArg('-p')
      .withArg(path)
      .withLogName('analytics_open_studio')
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

const openAppCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  new AppGatherer(),
  new OpenStudioExecutor<AppMetadata>(
    app => 'application/' + encodeURIComponent(app.folderid) + '/edit'
  )
);

export async function openAppInStudio() {
  await openAppCommandlet.run();
}
