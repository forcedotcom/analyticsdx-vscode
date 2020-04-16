/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { telemetryService } from './telemetry';

import {
  createBlankApp,
  createTemplate,
  deleteApp,
  deleteTemplate,
  openAppInStudio,
  openDataManager,
  openStudio,
  updateTemplate
} from './commands';
import { checkAnalyticsSfdxPlugin } from './util/sfdx';

function sendTelemetryCommand(eventName: string, extensionName: string, properties?: Record<string, string>) {
  if (eventName && extensionName) {
    // Note: we're intentionally not waiting for this to finish
    telemetryService.sendTelemetryEvent(eventName, extensionName, properties).catch(console.error);
  }
}

let displayName = 'Salesforce Analytics CLI Integration';
let version = '<unknown>';

export function activate(context: vscode.ExtensionContext) {
  const extensionHRStart = process.hrtime();

  const packageJson = context.asAbsolutePath('package.json');
  try {
    const json = JSON.parse(fs.readFileSync(packageJson).toString());
    displayName = json.displayName || displayName;
    version = json.version || version;
  } catch (e) {
    console.warn(`Unable to read ${packageJson}`, e);
  }

  // if we have no workspace folders, exit
  if (!vscode.workspace.workspaceFolders) {
    console.log('No workspace, exiting extension');
    return;
  }

  // register our commands, and set them up to cleanup correctly
  context.subscriptions.push(
    vscode.commands.registerCommand('analyticsdx.app.create.blank', createBlankApp),
    vscode.commands.registerCommand('analyticsdx.app.delete', deleteApp),
    vscode.commands.registerCommand('analyticsdx.studio.open', openStudio),
    vscode.commands.registerCommand('analyticsdx.studio.open.app', openAppInStudio),
    vscode.commands.registerCommand('analyticsdx.studio.open.dataManager', openDataManager),
    vscode.commands.registerCommand('analyticsdx.template.create', createTemplate),
    vscode.commands.registerCommand('analyticsdx.template.delete', deleteTemplate),
    vscode.commands.registerCommand('analyticsdx.template.update', updateTemplate),
    // Note: analyticsdx.telemetry.send is intentionally not listed in package.json; it's only for extension
    // code to call
    vscode.commands.registerCommand('analyticsdx.telemetry.send', sendTelemetryCommand)
  );

  checkAnalyticsSfdxPlugin().catch(er => console.error('Failed to check for analytics sfdx plugin:', er));

  console.log(`${displayName} v${version} extension activated`);
  // Notify telemetry that our extension is now active
  telemetryService.sendExtensionActivationEvent(extensionHRStart).catch();
}

export function deactivate() {
  console.log(`${displayName} v${version} extension dectivated`);
  telemetryService.sendExtensionDeactivationEvent().catch();
}
