/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import * as vscode from 'vscode';
import { ICONS } from '../../constants';
import { nls } from '../../messages';
import { showQuickPick } from '../../util/quickpick';
import {
  CancelResponse,
  ContinueResponse,
  emptyParametersGatherer,
  ParametersGatherer,
  SfdxCommandBuilder,
  SfdxCommandletExecutorWithOutput,
  SfdxCommandletWithOutput,
  sfdxWorkspaceChecker
} from '../commands';

type TemplateListExecutorOptions = { includeEmbedded?: boolean; includeSfdc?: boolean };
class TemplateListExecutor extends SfdxCommandletExecutorWithOutput<{}> {
  private readonly includeEmbedded: boolean;
  private readonly includeSfdc: boolean;
  constructor(
    private readonly description: string,
    { includeEmbedded = false, includeSfdc = false }: TemplateListExecutorOptions = {}
  ) {
    super();
    this.includeEmbedded = includeEmbedded;
    this.includeSfdc = includeSfdc;
  }
  public build(data: {}) {
    let builder = new SfdxCommandBuilder()
      .withDescription(this.description)
      .withLogName('analytics_template_list')
      .withArg('analytics:template:list')
      .withArg('--json');
    if (this.includeEmbedded) {
      builder = builder.withArg('-e');
    }
    if (this.includeSfdc) {
      builder = builder.withArg('-a');
    }
    return builder.build();
  }
}

// this is what the analytics:template:list's json's result items look like
export type TemplateMetadata = {
  name: string;
  // could be missing in older sfdx plugin versions
  label?: string;
  templateid: string;
  templatetype: 'app' | 'embeddedapp' | 'dashboard' | 'lens' | string;
  folderid: string | null;
  namespace?: string | null;
};

export class TemplateQuickPickItem implements vscode.QuickPickItem {
  constructor(readonly template: TemplateMetadata) {}

  get label() {
    return `${ICONS.Template} ${ICONS.escape(this.template.label || this.template.name)}`;
  }

  get description() {
    // TODO: we don't get the template description currently from the cli's json
    // but it's handy to put the id and name (if not same as label) in there for dev folks, since you type-search on it
    return (
      `[id: ${ICONS.escape(this.template.templateid)}` +
      (this.template.name !== this.template.label ? `, name: ${ICONS.escape(this.template.name)}` : '') +
      ']'
    );
  }
}

type TemplateFilter = (template: TemplateMetadata) => boolean;
export type TemplateGatherOptions = TemplateListExecutorOptions & {
  filter?: TemplateFilter;
  noTemplatesMesg?: string;
  placeholderMesg?: string;
  fetchMesg?: string;
};
export class TemplateGatherer implements ParametersGatherer<TemplateMetadata> {
  private readonly filter?: TemplateFilter;
  private readonly includeEmbedded: boolean;
  private readonly includeSfdc: boolean;
  private noTemplatesMesg: string;
  private placeholderMesg: string;
  private fetchMesg: string;
  constructor({
    filter,
    includeEmbedded = false,
    includeSfdc = false,
    noTemplatesMesg = nls.localize('template_gatherer_def_no_templates_message'),
    placeholderMesg = nls.localize('template_gatherer_def_placeholder_message'),
    fetchMesg = nls.localize('template_gatherer_def_fetch_message')
  }: TemplateGatherOptions = {}) {
    this.filter = filter;
    this.includeEmbedded = includeEmbedded;
    this.includeSfdc = includeSfdc;
    this.noTemplatesMesg = noTemplatesMesg;
    this.placeholderMesg = placeholderMesg;
    this.fetchMesg = fetchMesg;
  }

  public async loadQuickPickItems(): Promise<TemplateQuickPickItem[]> {
    const templateListCommandlet = new SfdxCommandletWithOutput(
      sfdxWorkspaceChecker,
      emptyParametersGatherer,
      new TemplateListExecutor(this.fetchMesg, { includeEmbedded: this.includeEmbedded, includeSfdc: this.includeSfdc })
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
    return items;
  }

  public async gather(): Promise<CancelResponse | ContinueResponse<TemplateMetadata>> {
    const selection = await showQuickPick(this.loadQuickPickItems(), {
      noItemsMesg: this.noTemplatesMesg,
      loadingMesg: this.fetchMesg,
      matchOnDescription: true,
      placeHolder: this.placeholderMesg
    });
    return selection ? { type: 'CONTINUE', data: selection.template } : { type: 'CANCEL' };
  }
}
