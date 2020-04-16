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
  ContinueResponse,
  emptyParametersGatherer,
  PreconditionChecker,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor
} from '../commands';
import { nls } from '../messages';
import { telemetryService } from '../telemetry';
import { getRootWorkspacePath } from './rootWorkspace';

// The analytics sfdx plugin module name.
const pluginName = '@salesforce/analytics';

// The minumum version of the @salesforce/analytics plugins our extensions require for everything to work right.
const minAdxPluginVersion = '0.18.0';

export async function isSfdxInstalled(): Promise<boolean> {
  try {
    return !!(await which('sfdx'));
  } catch (e) {
    return false;
  }
}

export async function isAnalyticsSfdxPluginInstalled(): Promise<boolean> {
  // sfdx analytics --help seems to be a functioning command across all of the old versions, and it exits non-zero
  // if the plugin isn't installed
  const adxInstalledCmd = new SfdxCommandBuilder().withArg('analytics').withArg('--help');
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

export async function getAnalyticsSfdxPluginVersion(): Promise<string | undefined> {
  // since 0.7.0+, sfdx analytics --json will return adxVersion in the results field; in older versions, it would
  // succeed but return plain text
  const adxVersionCmd = new SfdxCommandBuilder().withArg('analytics').withJson();
  const execution = new CliCommandExecutor(adxVersionCmd.build(), {
    cwd: getRootWorkspacePath()
  }).execute();
  const jsonStr = await new CommandOutput().getCmdResult(execution);
  // if it might be json, try to parse it
  if (jsonStr && jsonStr.trimLeft().startsWith('{') && jsonStr.trimRight().endsWith('}')) {
    try {
      const json = JSON.parse(jsonStr);
      if (json?.status === 0) {
        return json.result?.adxVersion;
      }
    } catch (ignore) {}
  }
}

class PromptingPreChecker implements PreconditionChecker {
  constructor(
    private readonly mesg: string,
    private readonly okButton: string,
    private readonly curVersion: string | undefined,
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
      telemetryService.sendDisableAnalyticsSfdxPluginCheckEvent(this.curVersion).catch(console.error);
    }
    return selection === this.okButton;
  }
}

class InstallAdxExecutor extends SfdxCommandletExecutor<void> {
  public build() {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('install_analytics_sfdx_plugin_message'))
      .withArg('plugins:install')
      .withArg(pluginName)
      .build();
  }

  public execute(response: ContinueResponse<void>): void {
    telemetryService.sendInstallAnalyticsSfdxPluginEvent().catch(console.error);
    super.execute(response);
  }
}

// this should be the same as in package.json and test-assets/sfdx-simple/.vscode/settings.json
// Note: since the display name in config UI is based on the config name (with no way to override), it has to be like
// this to get the 'CLI' part capitalized to match the description.
const checkPluginPrefName = 'analyticsdx-vscode-core.CLI.checkForPlugin';

class UpdateSfdxPluginsExecutor extends SfdxCommandletExecutor<void> {
  constructor(private readonly curVersion: string | undefined) {
    super();
  }

  public build() {
    // installing has the same affect at updating to the latest; plugins:update didn't seem to work and can't be
    // focused to a single plugin anyways
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('update_analytics_sfdx_plugin_message'))
      .withArg('plugins:install')
      .withArg(pluginName)
      .build();
  }

  public execute(response: ContinueResponse<void>): void {
    telemetryService.sendUpdateAnalyticsSfdxPluginEvent(this.curVersion, minAdxPluginVersion).catch(console.error);
    super.execute(response);
  }
}

export async function checkAnalyticsSfdxPlugin(force = false) {
  if (!force && !vscode.workspace.getConfiguration().get<boolean>(checkPluginPrefName, true)) {
    return;
  }

  if (await isSfdxInstalled()) {
    if (await isAnalyticsSfdxPluginInstalled()) {
      const version = await getAnalyticsSfdxPluginVersion();
      console.debug(`sfdx ${pluginName}@${version} already installed`);
      if (!version || !semver.valid(version) || semver.ltr(version, minAdxPluginVersion)) {
        // old version, so prompt to do an update
        await new SfdxCommandlet(
          new PromptingPreChecker(
            nls.localize('outofdate_analytics_sfdx_plugin_message', minAdxPluginVersion),
            nls.localize('update_analytics_sfdx_plugin_button'),
            version
          ),
          emptyParametersGatherer,
          new UpdateSfdxPluginsExecutor(version)
        ).run();
      }
    } else {
      console.debug(`sfdx ${pluginName} plugin is not installed`);
      // not install, so prompt to install
      await new SfdxCommandlet(
        new PromptingPreChecker(
          nls.localize('missing_analytics_sfdx_plugin_message'),
          nls.localize('install_analytics_sfdx_plugin_button'),
          undefined
        ),
        emptyParametersGatherer,
        new InstallAdxExecutor()
      ).run();
    }
  } else {
    // salesforcefx-vscode-core already shows a message if sfdx isn't installed, so we don't need to
    console.debug(`sfdx is not installed, skipping ${pluginName} plugin check`);
  }
}
