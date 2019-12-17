/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { telemetryService } from './telemetry';
import { TemplateEditingManager } from './templateEditing';
import { TemplateLinterManager } from './templateLinter';
import { Logger } from './util/logger';
import { uriDirname } from './util/vscodeUtils';

export type ExtensionType =
  | Readonly<{
      templateEditingManager: TemplateEditingManager;
      templateLinterManager: TemplateLinterManager;
      logger: Logger;
    }>
  | undefined;

export function activate(context: vscode.ExtensionContext): ExtensionType {
  const extensionHRStart = process.hrtime();

  // if we have no workspace folders, exit
  if (!vscode.workspace.workspaceFolders) {
    console.log('No workspace, exiting extension');
    return;
  }

  const config = vscode.workspace.getConfiguration('adx-templates');
  const output = config.get<boolean>('logging.enabled', false)
    ? vscode.window.createOutputChannel('Analytics DX Templates')
    : undefined;
  if (output) {
    context.subscriptions.push(output);
  }
  const logger = new Logger(output, {
    // these 2 are intentionally not available in the Settings UI and are really just for when we run tests
    // TODO: default this one to true if we're running from devmode (F5), otherwise false
    toConsole: config.get<boolean>('logging.console', true),
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
    'Analytics DX Templates Extension Activated on ' +
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
  console.log('Analytics DX Templates Extension Dectivated');
  telemetryService.sendExtensionDeactivationEvent().catch();
}
