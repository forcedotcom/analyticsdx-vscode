/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { SfdxProject } from '@salesforce/core';
import { JsonArray, JsonMap } from '@salesforce/ts-types';
import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import * as which from 'which';
import {
  BaseSfdxCommandletExecutor,
  CliCommandExecutor,
  CommandOutput,
  ContinueResponse,
  emptyParametersGatherer,
  getCommandExecutionExitCode,
  PreconditionChecker,
  SfdxCommandBuilder,
  SfdxCommandlet
} from '../commands';
import { nls } from '../messages';
import { telemetryService } from '../telemetry';
import { getRootWorkspacePath, hasRootWorkspace } from './rootWorkspace';

// The analytics sfdx plugin module name.
const pluginName = '@salesforce/analytics';

// The minumum version of the @salesforce/analytics plugins our extensions require for everything to work right,
// and that we want folks to be at.
const minAdxPluginVersion = '1.4.15';

export async function isSfdxInstalled(): Promise<boolean> {
  try {
    return !!(await which('sfdx', { nothrow: true }));
  } catch (e) {
    return false;
  }
}

// turn off any telemetry for thess call, since we're just seeing if it's installed and not really using it
const NO_TELEMTRY_ENV = {
  SFDX_DISABLE_TELEMETRY: 'true',
  // this used to be the env to turn on off telemetry, just in case they have an old sfdx base install
  SFDX_DISABLE_INSIGHTS: 'true'
};

export async function isAnalyticsSfdxPluginInstalled(): Promise<boolean> {
  // analtyics:template:list has been in the plugin since the 1st released version
  const adxInstalledCmd = new SfdxCommandBuilder().withArg('which').withArg('analytics:template:list');
  const execution = new CliCommandExecutor(adxInstalledCmd.build(), {
    cwd: getRootWorkspacePath(),
    env: NO_TELEMTRY_ENV
  }).execute();
  try {
    const code = await getCommandExecutionExitCode(execution);
    return code === 0;
  } catch (e) {
    return false;
  }
}

export async function getAnalyticsSfdxPluginVersion(): Promise<string | undefined> {
  // since 0.7.0+, sfdx analytics --json will return adxVersion in the results field; in older versions, it would
  // either succeed but return plain text, or do the prompt for a matching command which will timeout into the
  // catch block
  const adxVersionCmd = new SfdxCommandBuilder().withArg('analytics').withJson();
  const execution = new CliCommandExecutor(adxVersionCmd.build(), {
    cwd: getRootWorkspacePath(),
    env: NO_TELEMTRY_ENV
  }).execute();
  try {
    const jsonStr = await new CommandOutput().getCmdResult(execution);
    // if it might be json, try to parse it
    if (jsonStr && jsonStr.trimStart().startsWith('{') && jsonStr.trimEnd().endsWith('}')) {
      const json = JSON.parse(jsonStr);
      if (json?.status === 0) {
        return json.result?.adxVersion;
      }
    }
  } catch (ignore) {}
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

class InstallAdxExecutor extends BaseSfdxCommandletExecutor<{}> {
  public build() {
    return new SfdxCommandBuilder()
      .withDescription(nls.localize('install_analytics_sfdx_plugin_message'))
      .withArg('plugins:install')
      .withArg(pluginName)
      .build();
  }

  public execute(response: ContinueResponse<{}>): void {
    telemetryService.sendInstallAnalyticsSfdxPluginEvent().catch(console.error);
    super.execute(response);
  }
}

// this should be the same as in package.json and test-assets/sfdx-simple/.vscode/settings.json
// Note: since the display name in config UI is based on the config name (with no way to override), it has to be like
// this to get the 'CLI' part capitalized to match the description.
const checkPluginPrefName = 'analyticsdx-vscode-core.CLI.checkForPlugin';

class UpdateSfdxPluginsExecutor extends BaseSfdxCommandletExecutor<{}> {
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

  public execute(response: ContinueResponse<{}>): void {
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

export const NO_ROOT_WORKSPACE_PATH_ERROR = 'NoRootWorkspacePath';
export const NO_PACKAGE_DIRECTORY_PATHS_FOUND_ERROR = 'NoPackageDirectoryPathsFound';
export const NO_PACKAGE_DIRECTORY_FOUND_ERROR = 'NoPackageDirectoryFound';

/** Read the sfdx-project.json for a workspace.
 * @param rootWorkspacePath the workspace path, defaults to `getRootWorkspacePath()`
 */
export function getSfdxProject(rootWorkspacePath?: string): Promise<SfdxProject> {
  if (!rootWorkspacePath) {
    if (hasRootWorkspace()) {
      rootWorkspacePath = getRootWorkspacePath();
    } else {
      const error = new Error();
      error.name = NO_ROOT_WORKSPACE_PATH_ERROR;
      throw error;
    }
  }

  return SfdxProject.resolve(rootWorkspacePath);
}

/** Get the packageDirectories paths, in order.
 * @param rootWorkspacePath the workspace path, defaults to `getRootWorkspacePath()`
 * @return the paths (relative to rootWorkspacePath, with platform-native seperators)
 */
export async function getPackageDirectoryPaths(rootWorkspacePath?: string): Promise<string[]> {
  // SfdxProject.getPackageDirectories() does some internal validation that requires at least 1
  // entry to have a "default": true field, but the schema for sfdx-project.json doesn't require that and some
  // older sfdx-project.json's won't have it; this bypasses that.
  const dirs = (await getSfdxProject(rootWorkspacePath)).getSfdxProjectJson().get('packageDirectories') as JsonArray;
  if (dirs) {
    let paths: string[] = [];
    dirs.forEach(dir => {
      let dirpath = (dir as JsonMap)?.path;
      if (dirpath && typeof dirpath === 'string') {
        dirpath = dirpath.trim();
        if (dirpath.startsWith(path.sep)) {
          dirpath = dirpath.substring(1);
        }
        if ((dir as JsonMap).default) {
          paths = [dirpath].concat(paths);
        } else {
          paths.push(dirpath);
        }
      }
    });
    if (paths.length === 0) {
      const error = new Error();
      error.name = NO_PACKAGE_DIRECTORY_PATHS_FOUND_ERROR;
      throw error;
    }
    return paths;
  } else {
    const error = new Error();
    error.name = NO_PACKAGE_DIRECTORY_FOUND_ERROR;
    throw error;
  }
}
