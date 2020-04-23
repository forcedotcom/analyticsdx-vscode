/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import { ICONS } from '../../constants';
import { nls } from '../../messages';
import {
  CancelResponse,
  ContinueResponse,
  emptyParametersGatherer,
  notificationService,
  ParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandletExecutorWithOutput,
  SfdxCommandletWithOutput,
  sfdxWorkspaceChecker
} from '../commands';

class TemplateListExecutor extends SfdxCommandletExecutorWithOutput<{}> {
  constructor(private readonly description: string) {
    super();
  }
  public build(data: {}) {
    return new SfdxCommandBuilder()
      .withDescription(this.description)
      .withArg('analytics:template:list')
      .withArg('--json')
      .withLogName('analytics_template_list')
      .build();
  }
}

// this is what the analytics:template:list's json's result items look like
export type TemplateMetadata = {
  name: string;
  // could be missing in older sfdx plugin versions
  label?: string;
  templateid: string;
  folderid: string | null;
  namespace?: string | null;
};

class TemplateQuickPickItem implements vscode.QuickPickItem {
  constructor(readonly template: TemplateMetadata) {}

  get label() {
    return ICONS.Template + ' ' + (this.template.label || this.template.name);
  }

  get description() {
    // TODO: we don't get the template description currently from the cli's json
    // but it's handy to put the id and name (if not same as label) in there for dev folks, since you type-search on it
    return (
      `[id: ${this.template.templateid}` +
      (this.template.name !== this.template.label ? `, name: ${this.template.name}` : '') +
      ']'
    );
  }
}

export class TemplateGatherer implements ParametersGatherer<TemplateMetadata> {
  constructor(
    private readonly filter?: (template: TemplateMetadata) => boolean,
    private readonly noTemplatesMesg = nls.localize('template_gatherer_def_no_templates_message'),
    private readonly placeholderMesg = nls.localize('template_gatherer_def_placeholder_message'),
    private readonly fetchMesg = nls.localize('template_gatherer_def_fetch_message')
  ) {}

  public async gather(): Promise<CancelResponse | ContinueResponse<TemplateMetadata>> {
    const templateListCommandlet = new SfdxCommandletWithOutput(
      sfdxWorkspaceChecker,
      emptyParametersGatherer,
      new TemplateListExecutor(this.fetchMesg)
    );
    const jsonStr = await templateListCommandlet.run();
    // TODO: handle bad json
    const json = jsonStr && JSON.parse(jsonStr);
    let items: TemplateQuickPickItem[] = [];
    if (json && json.result && json.result.length > 0) {
      items = (json.result as TemplateMetadata[])
        .filter(this.filter || (() => true))
        .map(template => new TemplateQuickPickItem(template));
    }
    if (items.length <= 0) {
      notificationService.showInformationMessage(this.noTemplatesMesg);
      return { type: 'CANCEL' };
    }
    const selection = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      placeHolder: this.placeholderMesg
    });
    return selection ? { type: 'CONTINUE', data: selection.template } : { type: 'CANCEL' };
  }
}
