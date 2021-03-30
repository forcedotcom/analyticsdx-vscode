/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { nls } from '../messages';
import {
  BaseSfdxCommandletExecutor,
  DeleteObjectPostChecker,
  SfdxCommandBuilder,
  SfdxCommandlet,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppMetadata } from './gatherers/appGatherer';

class DeleteAppExecutor extends BaseSfdxCommandletExecutor<AppMetadata> {
  public build(data: AppMetadata) {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('delete_app_cmd_message'))
      .withArg('analytics:app:delete')
      .withArg('-f')
      .withArg(data.folderid)
      .withArg('--noprompt')
      .withLogName('analytics_app_delete')
      .build();
  }
}

export function deleteApp(): Promise<void> {
  return new SfdxCommandlet(
    sfdxWorkspaceChecker,
    new AppGatherer(
      // TODO: are there apps you can't or shouldn't delete?
      undefined,
      nls.localize('delete_app_cmd_no_apps_message'),
      nls.localize('delete_app_cmd_placeholder_message')
    ),
    new DeleteAppExecutor(),
    new DeleteObjectPostChecker<AppMetadata>(app => nls.localize('delete_app_cmd_confirm_text', app.name))
  ).run();
}
