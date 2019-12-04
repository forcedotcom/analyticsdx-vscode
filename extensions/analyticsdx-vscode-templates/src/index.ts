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
import { uriDirname } from './util/vscodeUtils';

export type ExtensionType =
  | {
      templateEditingManager: TemplateEditingManager;
      templateLinterManager: TemplateLinterManager;
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
  const templateLinterManager = new TemplateLinterManager((doc, tree) => {
    const dir = uriDirname(doc.uri);
    templateEditingManager.setParsedTemplateInfo(dir, tree);
  });

  context.subscriptions.push(templateEditingManager.start());
  context.subscriptions.push(templateLinterManager.start());

  console.log('Analytics DX Templates Extension Activated');
  // Notify telemetry that our extension is now active
  telemetryService.sendExtensionActivationEvent(extensionHRStart).catch();

  return {
    templateEditingManager,
    templateLinterManager
  };
}

export function deactivate() {
  console.log('Analytics DX Templates Extension Dectivated');
  telemetryService.sendExtensionDeactivationEvent().catch();
}
