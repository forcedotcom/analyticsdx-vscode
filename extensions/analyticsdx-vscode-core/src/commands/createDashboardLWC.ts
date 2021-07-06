/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { LightningComponentOptions, TemplateService, TemplateType } from '@salesforce/templates';
import { CreateUtil } from '@salesforce/templates/lib/utils';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { nls } from '../messages';
import { showConfirmModal } from '../util';
import { getRootWorkspacePath, hasRootWorkspace } from '../util/rootWorkspace';
import {
  CancelResponse,
  CompositeParametersGatherer,
  ContinueResponse,
  FixedValueGatherer,
  LibraryCommandletExecutor,
  ParametersGatherer,
  PostconditionChecker,
  SfdxCommandlet,
  sfdxOutputChannel,
  sfdxWorkspaceChecker
} from './commands';
import { OutputDirGatherer, OutputDirType } from './gatherers/outputDirGatherer';

type LWCTemplateType = 'analyticsDashboard' | 'analyticsDashboardWithStep';

type LWCOptions = {
  fileName: string;
  /** Relative workspace path to save the component */
  outputDir: string;
  template: LWCTemplateType;
};

class CreateDashboardLWCExecutor extends LibraryCommandletExecutor<LWCOptions> {
  constructor() {
    super(nls.localize('create_dashboard_lwc_execution_name'), 'analytics_dashboard_lwc_create', sfdxOutputChannel());
    this.showChannelOutput = false;
  }

  public async run(response: ContinueResponse<LWCOptions>): Promise<boolean> {
    try {
      const templateOptions: LightningComponentOptions = {
        outputdir: response.data.outputDir,
        componentname: response.data.fileName,
        template: response.data.template,
        type: 'lwc',
        internal: false
      };
      const result = await TemplateService.getInstance(getRootWorkspacePath()).create(
        TemplateType.LightningComponent,
        templateOptions
      );
      if (result.rawOutput) {
        sfdxOutputChannel().appendLine(result.rawOutput);
      }
      const document = await vscode.workspace.openTextDocument(
        path.join(result.outputDir, response.data.fileName, response.data.fileName + '.js')
      );
      await vscode.window.showTextDocument(document);
      return true;
    } catch (e) {
      sfdxOutputChannel().show();
      throw e;
    }
  }
}

class FileNameGatherer implements ParametersGatherer<{ fileName: string }> {
  public async gather(): Promise<CancelResponse | ContinueResponse<{ fileName: string }>> {
    const fileName = await vscode.window.showInputBox({
      prompt: nls.localize('create_dashboard_lwc_filename_prompt'),
      validateInput: v => {
        if (v) {
          try {
            // TemplateService.create() uses this method to validate the filename, throwing an error on invalid
            CreateUtil.checkInputs(v);
          } catch (e) {
            if (e instanceof Error) {
              return e.message;
            }
            throw e;
          }
        }
        return ''; // good
      }
    });
    return fileName ? { type: 'CONTINUE', data: { fileName } } : { type: 'CANCEL' };
  }
}

class LWCTemplateGather implements ParametersGatherer<{ template: LWCTemplateType }> {
  private static readonly NO_STEP = nls.localize('create_dashboard_lwc_no_has_step');
  private static readonly HAS_STEP = nls.localize('create_dashboard_lwc_has_step');

  public async gather(): Promise<CancelResponse | ContinueResponse<{ template: LWCTemplateType }>> {
    const selection = await vscode.window.showQuickPick([LWCTemplateGather.HAS_STEP, LWCTemplateGather.NO_STEP], {
      placeHolder: nls.localize('create_dashboard_lwc_template_prompt')
    });
    if (selection === LWCTemplateGather.NO_STEP) {
      return { type: 'CONTINUE', data: { template: 'analyticsDashboard' } };
    } else if (selection === LWCTemplateGather.HAS_STEP) {
      return { type: 'CONTINUE', data: { template: 'analyticsDashboardWithStep' } };
    }
    return { type: 'CANCEL' };
  }
}

class OverwritePrompt implements PostconditionChecker<LWCOptions> {
  public async check(
    inputs: ContinueResponse<LWCOptions> | CancelResponse
  ): Promise<ContinueResponse<LWCOptions> | CancelResponse> {
    if (inputs.type === 'CONTINUE') {
      const existingPath = path.join(getRootWorkspacePath(), inputs.data.outputDir, inputs.data.fileName);
      if (
        !fs.existsSync(path.join(existingPath, inputs.data.fileName + '.js')) ||
        (await showConfirmModal(nls.localize('create_dashboard_lwc_overwrite_prompt')))
      ) {
        return inputs;
      }
    }
    return { type: 'CANCEL' };
  }
}

/** A function to create a dashboard lwc, optionally prompting the user for information. Any param which is
 * unspecified or invalid will prompt the user to enter.
 * @param folderUri the folder to create the lwc in (must end in /lwc)
 * @param fileName the lwc name
 * @param template which kind of lwc to create, defaults to `analyticsDashboardWithStep`
 */
export function createDashboardLWC({
  folderUri,
  fileName,
  template
}: { folderUri?: vscode.Uri; fileName?: string; template?: LWCTemplateType } = {}): Promise<void> {
  const gatherers: Array<ParametersGatherer<any>> = [];
  gatherers.push(fileName ? new FixedValueGatherer({ fileName }) : new FileNameGatherer());

  let dirGatherer: ParametersGatherer<OutputDirType> | undefined;
  if (folderUri && folderUri.path.endsWith('/lwc') && hasRootWorkspace()) {
    const root = vscode.workspace.getWorkspaceFolder(folderUri);
    if (root) {
      let relPath = vscode.workspace.asRelativePath(folderUri, false);
      // relPath will have posix separators, so fix it for windows
      if (path.sep !== '/') {
        relPath = relPath.replace(new RegExp('/', 'g'), path.sep);
      }
      dirGatherer = new FixedValueGatherer<OutputDirType>({ outputDir: relPath });
    }
  }
  gatherers.push(dirGatherer || new OutputDirGatherer('lwc', true));

  // if both the folder and fileName are specified, then don't show a template picker either
  gatherers.push(
    template || (folderUri && fileName)
      ? new FixedValueGatherer<{ template: LWCTemplateType }>({
          template: template === 'analyticsDashboard' ? 'analyticsDashboard' : 'analyticsDashboardWithStep'
        })
      : new LWCTemplateGather()
  );

  return new SfdxCommandlet(
    sfdxWorkspaceChecker,
    new CompositeParametersGatherer<LWCOptions>(...gatherers),
    new CreateDashboardLWCExecutor(),
    // if the folder and filename are sent in, then don't prompt about overwriting
    folderUri && fileName ? undefined : new OverwritePrompt()
  ).run();
}

/** A vscode command callback function, valid from the command palette or explorer right click. */
export function createDashboardLWCCommand(folderUri?: vscode.Uri) {
  return createDashboardLWC({ folderUri });
}
