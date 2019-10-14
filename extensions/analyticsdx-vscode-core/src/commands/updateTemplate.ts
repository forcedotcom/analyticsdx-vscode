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
import {
  TemplateGatherer,
  TemplateMetadata
} from './gatherers/templateGatherer';

class UpdateTemplateExecutor extends SfdxCommandletExecutor<TemplateMetadata> {
  public build(data: TemplateMetadata) {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('update_template_cmd_message'))
      .withArg('analytics:template:update')
      .withArg('-t')
      .withArg(data.templateid)
      .withArg('-f')
      .withArg(data.folderid)
      .withLogName('analytics_template_update')
      .build();
  }
}

const updateTemplateCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  // only show templates that have an associated app
  new TemplateGatherer(
    template => !!template.folderid,
    nls.localize('update_template_cmd_no_apps_message'),
    nls.localize('update_template_cmd_placeholder_message')
  ),
  new UpdateTemplateExecutor()
);

export async function updateTemplate() {
  await updateTemplateCommandlet.run();
}
