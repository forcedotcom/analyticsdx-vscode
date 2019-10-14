/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { posix as path } from 'path';
import * as vscode from 'vscode';
import { telemetryService } from './telemetry';
import { TemplateEditingManager } from './templateEditing';
import { TemplateLinter } from './templateLinter';

export type ExtensionType =
  | {
      templateEditingManager: TemplateEditingManager;
      templateLinter: TemplateLinter;
    }
  | undefined;

export function activate(context: vscode.ExtensionContext): ExtensionType {
  const extensionHRStart = process.hrtime();

  // if we have no workspace folders, exit
  if (!vscode.workspace.workspaceFolders) {
    console.log('No workspace, exiting extension');
    return;
  }

  const templateEditingManager = new TemplateEditingManager(context);
  const templateLinter = new TemplateLinter((doc, tree) => {
    const dir = doc.uri.with({ path: path.dirname(doc.uri.path) });
    templateEditingManager.setParsedTemplateInfo(dir, tree);
  });

  context.subscriptions.push(templateEditingManager.start());
  context.subscriptions.push(templateLinter.start());

  console.log('Analytics DX Templates Extension Activated');
  // Notify telemetry that our extension is now active
  telemetryService.sendExtensionActivationEvent(extensionHRStart).catch();

  return {
    templateEditingManager,
    templateLinter
  };
}

export function deactivate() {
  console.log('Analytics DX Templates Extension Dectivated');
  telemetryService.sendExtensionDeactivationEvent().catch();
}
