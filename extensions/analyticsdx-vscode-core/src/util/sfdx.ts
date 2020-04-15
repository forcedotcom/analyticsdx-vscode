/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as semver from 'semver';
import * as vscode from 'vscode';
import * as which from 'which';
import {
  CliCommandExecutor,
  CommandOutput,
  CommandResult,
  emptyParametersGatherer,
  PreconditionChecker,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor
} from '../commands';
import { nls } from '../messages';
import { getRootWorkspacePath } from './rootWorkspace';

export async function isSfdxInstalled(): Promise<boolean> {
  try {
    return !!(await which('sfdx'));
  } catch (e) {
    return false;
  }
}

const adxInstalledCmd = new SfdxCommandBuilder().withArg('analytics').withArg('--help');

export async function isSfdxAnalyticsInstalled(): Promise<boolean> {
  const execution = new CliCommandExecutor(adxInstalledCmd.build(), {
    cwd: getRootWorkspacePath()
  }).execute();
  try {
    const code = await new CommandResult().getExitCode(execution);
    return code === 0;
  } catch (e) {
    return false;
  }
}

const adxVersionCmd = new SfdxCommandBuilder().withArg('analytics').withJson();

export async function getSfdxAnalyticsVersion(): Promise<string | undefined> {
  const execution = new CliCommandExecutor(adxVersionCmd.build(), {
    cwd: getRootWorkspacePath()
  }).execute();
  const jsonStr = await new CommandOutput().getCmdResult(execution);
  if (jsonStr) {
    const json = JSON.parse(jsonStr);
    if (json?.status === 0) {
      return json.result?.adxVersion;
    }
  }
}

class PromptingPreChecker implements PreconditionChecker {
  constructor(
    private readonly mesg: string,
    private readonly okButton: string,
    private readonly disableCheckButton = nls.localize('disable_analytics_sfdx_check_button')
  ) {}

  public async check(): Promise<boolean> {
    const selection = await vscode.window.showWarningMessage(
      this.mesg,
      { modal: false },
      this.disableCheckButton,
      this.okButton
    );
    if (selection === this.disableCheckButton) {
      vscode.workspace.getConfiguration().update(checkPluginPrefName, false, vscode.ConfigurationTarget.Workspace);
    }
    return selection === this.okButton;
  }
}

class InstallAdxExecutor extends SfdxCommandletExecutor<void> {
  public build() {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('install_analytics_sfdx_plugin_message'))
      .withArg('plugins:install')
      .withArg('@salesforce/analytics')
      .build();
  }
}

// this should be the same as in package.json and test-assets/sfdx-simple/.vscode/settings.json
// Note: since the display name in config UI is based on the config name (with no way override), it has to be like
// this to get the 'CLI' part capitalized to match the description.
const checkPluginPrefName = 'analyticsdx-vscode-core.CLI.checkForPlugin';

// This will show the warning popup, and prompt to either install the plugin or disable the check (or you can close it)
const installAdxCommandlet = new SfdxCommandlet(
  new PromptingPreChecker(
    nls.localize('missing_analytics_sfdx_plugin_message'),
    nls.localize('install_analytics_sfdx_plugin_button')
  ),
  emptyParametersGatherer,
  new InstallAdxExecutor()
);

// the minumum version of the @salesforce/analytics plugins our extensions require for everything to work right
const minAdxPluginVersion = '0.18.0';

class UpdateSfdxPluginsExecutor extends SfdxCommandletExecutor<void> {
  public build() {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('update_sfdx_plugins_message'))
      .withArg('plugins:update')
      .build();
  }
}

// this will show the warning popup, and prompt to either update the sfdx plugins or disable the check
const updatePluginsCommandlet = new SfdxCommandlet(
  new PromptingPreChecker(
    nls.localize('outofdate_analytics_sfdx_plugin_message', minAdxPluginVersion),
    nls.localize('update_sfdx_plugins_button')
  ),
  emptyParametersGatherer,
  new UpdateSfdxPluginsExecutor()
);

export async function checkSfdxAnalyticsPlugin(force = false) {
  if (!force && !vscode.workspace.getConfiguration().get<boolean>(checkPluginPrefName, true)) {
    return;
  }

  if (await isSfdxInstalled()) {
    if (await isSfdxAnalyticsInstalled()) {
      const version = await getSfdxAnalyticsVersion();
      console.debug(`sfdx @salesforce/analytics:${version} already installed`);
      if (!version || !semver.valid(version) || semver.ltr(version, minAdxPluginVersion)) {
        await updatePluginsCommandlet.run();
      }
    } else {
      console.debug('sfdx @salesforce/analytics plugin is not installed');
      await installAdxCommandlet.run();
    }
  } else {
    // salesforcefx-vscode-core already shows a message if sfdx isn't installed, so we don't need to
    console.debug('sfdx is not installed, skipping @salesforce/analytics plugin check');
  }
}
