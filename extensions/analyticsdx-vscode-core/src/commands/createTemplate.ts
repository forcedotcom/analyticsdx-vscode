/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { nls } from '../messages';
import {
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppMetadata } from './gatherers/appGatherer';

class CreateTemplateExecutor extends SfdxCommandletExecutor<AppMetadata> {
  public build(data: AppMetadata) {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('create_template_cmd_message'))
      .withArg('analytics:template:create')
      .withArg('-f')
      .withArg(data.folderid)
      .withLogName('analytics_template_create')
      .build();
  }
}

const createTemplateCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  // only show apps that don't have a template yet
  new AppGatherer(
    app => !app.templateSourceId,
    nls.localize('create_template_cmd_no_templates_message'),
    nls.localize('create_template_cmd_placeholder_message')
  ),
  new CreateTemplateExecutor()
);

export async function createTemplate() {
  await createTemplateCommandlet.run();
}
