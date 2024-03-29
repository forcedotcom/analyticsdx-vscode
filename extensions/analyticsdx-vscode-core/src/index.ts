/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';

import {
  createApp,
  createBlankApp,
  createDashboardLWCCommand,
  createTemplate,
  deleteApp,
  deleteTemplate,
  openAppInStudio,
  openDataManager,
  openStudio,
  updateTemplate,
  updateTemplateFromApp
} from './commands';
import { EXTENSION_NAME } from './constants';
import { telemetryService } from './telemetry';
import { checkAnalyticsSfdxPlugin } from './util/sfdx';

function sendTelemetryCommand(eventName: string, extensionName: string, properties?: Record<string, string>) {
  if (eventName && extensionName) {
    // Note: we're intentionally not waiting for this to finish
    telemetryService.sendTelemetryEvent(eventName, extensionName, properties).catch(console.error);
  }
}

let displayName = 'Salesforce Analytics CLI Integration';
let version = '<unknown>';

export async function activate(context: vscode.ExtensionContext) {
  const extensionHRStart = process.hrtime();

  const packageJson = context.extension.packageJSON;
  displayName = packageJson?.displayName || displayName;
  version = packageJson?.version || version;
  const aiKey = packageJson?.aiKey;
  if (typeof aiKey === 'string' && aiKey) {
    await telemetryService.initializeService(context, aiKey, version);
  } else {
    console.warn(`Missing aiKey in ${EXTENSION_NAME} package.json, telemetry is disabled`);
  }

  // if we have no workspace folders, exit
  if (!vscode.workspace.workspaceFolders) {
    console.log('No workspace, exiting extension');
    return;
  }

  // register our commands, and set them up to cleanup correctly
  context.subscriptions.push(
    vscode.commands.registerCommand('analyticsdx.app.create.blank', createBlankApp),
    vscode.commands.registerCommand('analyticsdx.app.create', createApp),
    vscode.commands.registerCommand('analyticsdx.app.delete', deleteApp),
    vscode.commands.registerCommand('analyticsdx.dashboard.lwc.create', createDashboardLWCCommand),
    vscode.commands.registerCommand('analyticsdx.studio.open', openStudio),
    vscode.commands.registerCommand('analyticsdx.studio.open.app', openAppInStudio),
    vscode.commands.registerCommand('analyticsdx.studio.open.dataManager', openDataManager),
    vscode.commands.registerCommand('analyticsdx.template.create', createTemplate),
    vscode.commands.registerCommand('analyticsdx.template.delete', deleteTemplate),
    vscode.commands.registerCommand('analyticsdx.template.update', updateTemplate),
    vscode.commands.registerCommand('analyticsdx.template.updateFromApp', updateTemplateFromApp),
    // Note: analyticsdx.telemetry.send is intentionally not listed in package.json; it's only for extension
    // code to call
    vscode.commands.registerCommand('analyticsdx.telemetry.send', sendTelemetryCommand)
  );

  checkAnalyticsSfdxPlugin().catch(er => console.error('Failed to check for analytics sfdx plugin:', er));

  console.log(`${displayName} v${version} extension activated`);
  // Notify telemetry that our extension is now active
  telemetryService.sendExtensionActivationEvent(extensionHRStart).catch(console.error);
}

export function deactivate() {
  console.log(`${displayName} v${version} extension dectivated`);
  telemetryService.sendExtensionDeactivationEvent().catch();
}
