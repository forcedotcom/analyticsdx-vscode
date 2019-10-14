/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

// FIXME: get vscode-core to add these functions to its api
// This is a copy of salesforcedx-vscode-core/src/util/rootWorkspace.ts, since that's
// currently inaccessible to dependent extension
import { workspace, WorkspaceFolder } from 'vscode';

export function hasRootWorkspace(ws: typeof workspace = workspace) {
  return ws && ws.workspaceFolders && ws.workspaceFolders.length > 0;
}

export function getRootWorkspace(): WorkspaceFolder {
  return hasRootWorkspace()
    ? workspace.workspaceFolders![0]
    : ({} as WorkspaceFolder);
}

export function getRootWorkspacePath(): string {
  return getRootWorkspace().uri ? getRootWorkspace().uri.fsPath : '';
}
