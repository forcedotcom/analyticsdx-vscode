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

class AppListExecutor extends SfdxCommandletExecutorWithOutput<{}> {
  constructor(private readonly description: string) {
    super();
  }

  public build(data: {}) {
    return new SfdxCommandBuilder()
      .withDescription(this.description)
      .withArg('analytics:app:list')
      .withArg('--json')
      .withLogName('analytics_app_list')
      .build();
  }
}

// this is what the analytics:app:list's json's result items look like
export type AppMetadata = {
  // these appear to always be there
  name: string;
  label: string;
  folderid: string;
  status: string;
  // but this is only there if it doesn't have an associated template yet
  templateSourceId?: string | null;
};

class AppQuickPickItem implements vscode.QuickPickItem {
  constructor(readonly app: AppMetadata) {}

  get label() {
    return `${ICONS.App} ${ICONS.escape(this.app.label || this.app.name)}`;
  }

  get description() {
    // TODO: we don't get the app description currently from the cli's json
    // but it's handy to put the id and name in there for dev folks, since you type-search on it
    return (
      `[id: ${ICONS.escape(this.app.folderid)}` +
      (this.app.name !== this.app.label ? `, name: ${ICONS.escape(this.app.name)}` : '') +
      ']'
    );
  }
}

export class AppGatherer implements ParametersGatherer<AppMetadata> {
  constructor(
    private readonly filter?: (app: AppMetadata) => boolean,
    private readonly noAppsMesg = nls.localize('app_gatherer_def_no_apps_message'),
    private readonly placeholderMesg = nls.localize('app_gatherer_def_placeholder_message'),
    private readonly fetchMesg = nls.localize('app_gatherer_def_fetch_message')
  ) {}

  public async gather(): Promise<CancelResponse | ContinueResponse<AppMetadata>> {
    const appListCommandlet = new SfdxCommandletWithOutput(
      sfdxWorkspaceChecker,
      emptyParametersGatherer,
      new AppListExecutor(this.fetchMesg)
    );
    const jsonStr = await appListCommandlet.run();
    // TODO: handle bad json
    const json = jsonStr && JSON.parse(jsonStr);
    let items: AppQuickPickItem[] = [];
    if (json && json.result && json.result.length > 0) {
      items = (json.result as AppMetadata[]).filter(this.filter || (() => true)).map(app => new AppQuickPickItem(app));
    }
    if (items.length <= 0) {
      notificationService.showInformationMessage(this.noAppsMesg);
      return { type: 'CANCEL' };
    }
    const selection = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      placeHolder: this.placeholderMesg
    });
    return selection ? { type: 'CONTINUE', data: selection.app } : { type: 'CANCEL' };
  }
}
