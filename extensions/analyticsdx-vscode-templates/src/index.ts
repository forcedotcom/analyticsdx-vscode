/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { EXTENSION_NAME } from './constants';
import { telemetryService } from './telemetry';
import { TemplateEditingManager } from './templateEditing';
import { TemplateLinterManager } from './templateLinter';
import { Logger } from './util/logger';
import { isRunningInDevMode, uriDirname } from './util/vscodeUtils';

let displayName = 'Salesforce Analytics - App Templates';
let version = '<unknown';
export type ExtensionType =
  | Readonly<{
      templateEditingManager: TemplateEditingManager;
      templateLinterManager: TemplateLinterManager;
      logger: Logger;
    }>
  | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionType> {
  const extensionHRStart = process.hrtime();

  // if we have no workspace folders, exit
  if (!vscode.workspace.workspaceFolders) {
    console.log('No workspace, exiting extension');
    return;
  }

  const packageJson = context.extension.packageJSON;
  displayName = packageJson?.displayName || displayName;
  version = packageJson?.version || version;
  const aiKey = packageJson?.aiKey;
  if (typeof aiKey === 'string' && aiKey) {
    await telemetryService.initializeService(context, aiKey, version);
  } else {
    console.warn(`Missing aiKey in ${EXTENSION_NAME} package.json, telemetry is disabled`);
  }

  const config = vscode.workspace.getConfiguration('analyticsdx-vscode-templates');
  const output = config.get<boolean>('logging.enabled', false)
    ? vscode.window.createOutputChannel('Analytics - App Templates')
    : undefined;
  if (output) {
    context.subscriptions.push(output);
  }
  const logger = new Logger(output, {
    // these 2 are intentionally not available in the Settings UI and are really just for when we run tests.
    // default console output to true if we're running from devmode (F5), otherwise false
    toConsole: config.get<boolean>('logging.console', isRunningInDevMode()),
    prefix: config.get<string>('logging.prefix')
  });

  const templateEditingManager = new TemplateEditingManager(context, logger);
  const templateLinterManager = new TemplateLinterManager((doc, tree) => {
    const dir = uriDirname(doc.uri);
    templateEditingManager.setParsedTemplateInfo(dir, tree);
  }, logger);

  context.subscriptions.push(templateEditingManager.start());
  context.subscriptions.push(templateLinterManager.start());

  logger.log(
    `${displayName} v${version} extension activated on ` +
      vscode.workspace.workspaceFolders.map(f => f.uri.toString()).join(', ')
  );
  // Notify telemetry that our extension is now active
  telemetryService.sendExtensionActivationEvent(extensionHRStart).catch();

  return Object.freeze({
    templateEditingManager,
    templateLinterManager,
    logger
  });
}

export function deactivate() {
  console.log(`${displayName} v${version} extension dectivated`);
  telemetryService.sendExtensionDeactivationEvent().catch();
}
