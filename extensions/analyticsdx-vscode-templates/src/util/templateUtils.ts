/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { uriBasename, uriDirname, uriStat } from './vscodeUtils';

export { isValidVariableName } from '@salesforce/analyticsdx-template-lint';

/** Traverse up from the file until you find the template-info.json, without leaving the vscode workspace folders.
 * @return the file uri, or undefined if not found (i.e. file is not part of a template)
 */
export async function findTemplateInfoFileFor(file: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (uriBasename(file) === 'template-info.json') {
    return vscode.workspace.getWorkspaceFolder(file) ? file : undefined;
  }
  let dir = uriDirname(file);
  // don't go out of the workspace
  while (vscode.workspace.getWorkspaceFolder(dir)) {
    file = vscode.Uri.joinPath(dir, 'template-info.json');
    const stat = await uriStat(file);
    // if there's a template-info.json there, check it
    if (stat) {
      // template-info.json is in dir, make sure it's a file though
      return (stat.type & vscode.FileType.File) !== 0 ? file : undefined;
    } else {
      // otherwise, continue up the directory tree
      dir = uriDirname(dir);
    }
  }
  return undefined;
}
