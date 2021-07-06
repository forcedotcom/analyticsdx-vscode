/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as glob from 'glob';
import * as path from 'path';
import * as vscode from 'vscode';
import { nls } from '../../messages';
import { getRootWorkspacePath } from '../../util/rootWorkspace';
import { getPackageDirectoryPaths } from '../../util/sfdx';
import { CancelResponse, ContinueResponse, ParametersGatherer } from '../commands';

export type OutputDirType = { outputDir: string };

/** Prompts to pick a valid folder in the sfdx packge directories in the workspace for file creation.
 * The returned output folder will use platform-native seperators.
 */
export class OutputDirGatherer implements ParametersGatherer<OutputDirType> {
  public static readonly defaultOutput = path.join('main', 'default');
  public static readonly customDirOption = `$(file-directory) ${nls.localize('outputdir_gatherer_custom_dir_prompt')}`;

  /** Constructor.
   * @param typeDir the default directory name for the file type.
   * @param typeDirRequired true if the directory name is required for file creation.
   */
  constructor(private readonly typeDir: string, private readonly typeDirRequired?: boolean) {}

  public async gather(): Promise<CancelResponse | ContinueResponse<OutputDirType>> {
    let packageDirs: string[] = [];
    try {
      packageDirs = await getPackageDirectoryPaths();
    } catch (e) {
      if (e.name !== 'NoPackageDirectoryPathsFound' && e.name !== 'NoPackageDirectoriesFound') {
        throw e;
      }
    }

    let dirOptions = this.getDefaultOptions(packageDirs);
    let outputDir = await this.showMenu(dirOptions);

    if (outputDir === OutputDirGatherer.customDirOption) {
      dirOptions = this.getCustomDirs(packageDirs, getRootWorkspacePath());
      outputDir = await this.showMenu(dirOptions);
    }

    return outputDir ? { type: 'CONTINUE', data: { outputDir } } : { type: 'CANCEL' };
  }

  protected getDefaultOptions(packageDirs: string[]): string[] {
    const options = packageDirs.map(dir => path.join(dir, OutputDirGatherer.defaultOutput, this.typeDir));
    options.push(OutputDirGatherer.customDirOption);
    return options;
  }

  protected getCustomDirs(packageDirs: string[], rootPath: string): string[] {
    const packages = packageDirs.length > 1 ? `{${packageDirs.join(',')}}` : packageDirs[0];
    return new glob.GlobSync(path.join(rootPath, packages, '**', path.sep)).found.map(value => {
      const relativePath = path.relative(rootPath, path.join(value, path.sep));
      return path.join(relativePath, this.typeDirRequired && !relativePath.endsWith(this.typeDir) ? this.typeDir : '');
    });
  }

  protected async showMenu(options: string[]): Promise<string | undefined> {
    return await vscode.window.showQuickPick(options, {
      placeHolder: nls.localize('outputdir_gatherer_dir_prompt')
    } as vscode.QuickPickOptions);
  }
}
