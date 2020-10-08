/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { nls } from '../messages';
import {
  DeleteObjectPostChecker,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  sfdxWorkspaceChecker
} from './commands';
import { TemplateGatherer, TemplateMetadata } from './gatherers/templateGatherer';

class DeleteTemplateExecutor extends SfdxCommandletExecutor<TemplateMetadata> {
  public build(data: TemplateMetadata) {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('delete_template_cmd_message'))
      .withArg('analytics:template:delete')
      .withArg('-t')
      .withArg(data.templateid)
      .withArg('--noprompt')
      .withLogName('analytics_template_delete')
      .build();
  }
}

const deleteTemplateCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  new TemplateGatherer({
    // you can only delete templates that don't have an associated app
    filter: template => !template.folderid,
    includeEmbedded: true,
    noTemplatesMesg: nls.localize('delete_template_cmd_no_templates_message'),
    placeholderMesg: nls.localize('delete_template_cmd_placeholder_message')
  }),
  new DeleteTemplateExecutor(),
  new DeleteObjectPostChecker<TemplateMetadata>(template =>
    nls.localize('delete_template_cmd_confirm_text', template.label || template.name)
  )
);

export async function deleteTemplate() {
  await deleteTemplateCommandlet.run();
}
