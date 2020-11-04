/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { nls } from '../messages';
import { showQuickPick } from '../util/quickpick';
import {
  CancelResponse,
  ContinueResponse,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  sfdxWorkspaceChecker
} from './commands';
import { AppGatherer, AppQuickPickItem } from './gatherers/appGatherer';
import { TemplateGatherer, TemplateMetadata } from './gatherers/templateGatherer';

class UpdateTemplateExecutor extends SfdxCommandletExecutor<TemplateMetadata> {
  constructor(private readonly description: string) {
    super();
  }

  public build(data: TemplateMetadata) {
    return (
      new SfdxCommandBuilder()
        .withDescription(this.description)
        .withArg('analytics:template:update')
        .withArg('-t')
        .withArg(data.templateid)
        .withArg('-f')
        // the filter in the TemplateGather should make sure it has a folderid
        .withArg(data.folderid!)
        .withLogName('analytics_template_update')
        .build()
    );
  }
}

const updateTemplateCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  new TemplateGatherer({
    // only show templates that have an associated app
    filter: template => !!template.folderid,
    includeEmbedded: true,
    noTemplatesMesg: nls.localize('update_template_cmd_no_templates_message'),
    placeholderMesg: nls.localize('update_template_cmd_placeholder_message')
  }),
  new UpdateTemplateExecutor(nls.localize('update_template_cmd_message'))
);

export async function updateTemplate() {
  await updateTemplateCommandlet.run();
}

class TemplateAndFolderGatherer extends TemplateGatherer {
  public async gather(): Promise<CancelResponse | ContinueResponse<TemplateMetadata>> {
    // get all the templates and the apps that came from templates at the same time, and have the user pick a template
    const [templateResponse, allAppItems] = await Promise.all([
      super.gather(),
      new AppGatherer(app => !!app.templateSourceId).loadQuickPickItems()
    ]);
    if (templateResponse.type === 'CANCEL') {
      return templateResponse;
    }

    // find the current app for the template (if any), and any apps that came from that template
    let currentAppItem: AppQuickPickItem | undefined = undefined;
    const matchingAppItems: AppQuickPickItem[] = [];
    for (const item of allAppItems) {
      if (templateResponse.data.folderid && item.app.folderid === templateResponse.data.folderid) {
        currentAppItem = item;
      } else if (item.app.templateSourceId === templateResponse.data.templateid) {
        matchingAppItems.push(item);
      }
    }

    // TODO: add an option to create a new app from the template and use that as the source app

    // put the template's current app first in the list so it's the default selection
    if (currentAppItem) {
      currentAppItem.detail = nls.localize('update_template_from_app_cmd_current_app_details');
      matchingAppItems.unshift(currentAppItem);
    }
    const appResponse = await showQuickPick(matchingAppItems, {
      noItemsMesg: nls.localize('update_template_from_app_cmd_no_apps_message'),
      matchOnDescription: true,
      placeHolder: nls.localize('app_gatherer_def_placeholder_message'),
      matchOnDetail: true
    });
    if (!appResponse) {
      return { type: 'CANCEL' };
    }

    // set the selected folderid onto the TemplateMetadata to pass to the executor
    templateResponse.data.folderid = appResponse.app.folderid;
    return { type: 'CONTINUE', data: templateResponse.data };
  }
}

const updateTemplateFromAppCommandlet = new SfdxCommandlet(
  sfdxWorkspaceChecker,
  new TemplateAndFolderGatherer({
    includeEmbedded: true,
    noTemplatesMesg: nls.localize('update_template_from_app_cmd_no_templates_message'),
    placeholderMesg: nls.localize('update_template_from_app_cmd_placeholder_message')
  }),
  new UpdateTemplateExecutor(nls.localize('update_template_from_app_cmd_message'))
);

export async function updateTemplateFromApp() {
  await updateTemplateFromAppCommandlet.run();
}
