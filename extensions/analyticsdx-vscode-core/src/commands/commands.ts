/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  EmptyParametersGatherer,
  SfdxCommandlet,
  SfdxCommandletExecutor,
  SfdxWorkspaceChecker
} from '@salesforce/salesforcedx-utils-vscode/out/src';
import {
  CliCommandExecutor,
  Command,
  CommandExecution,
  CommandOutput,
  SfdxCommandBuilder
} from '@salesforce/salesforcedx-utils-vscode/out/src/cli';
import {
  CancelResponse,
  ContinueResponse,
  ParametersGatherer,
  PostconditionChecker,
  PreconditionChecker
} from '@salesforce/salesforcedx-utils-vscode/out/src/types';
import * as vscode from 'vscode';
import { nls } from '../messages';
import { getRootWorkspacePath } from '../util/rootWorkspace';

// make shared instances here that we can export for everything to use
const sfdxWorkspaceChecker = new SfdxWorkspaceChecker();
const emptyParametersGatherer = new EmptyParametersGatherer();
const emptyPreChecker: PreconditionChecker = {
  check: () => true
};

// FIXME: get something like this in the class in salesforce-vscode-core
// this is basically a copy of SfdxCommandletExecutor and SfdxCommandletWithOutput
// from there, just changing it to use a CommandOutput and return a Promise<string>
// with the stdout -- this could pretty easily be added as an option to the code in
// core
export abstract class SfdxCommandletExecutorWithOutput<T> extends SfdxCommandletExecutor<T> {
  public execute(response: ContinueResponse<T>): Promise<string> {
    const startTime = process.hrtime();
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const cancellationToken = cancellationTokenSource.token;
    const execution = new CliCommandExecutor(this.build(response.data), {
      cwd: getRootWorkspacePath()
    }).execute(cancellationToken);

    execution.processExitSubject.subscribe(() => {
      this.logMetric(execution.command.logName, startTime);
    });
    this.attachExecution(execution, cancellationTokenSource, cancellationToken);
    return new CommandOutput().getCmdResult(execution);
  }

  public abstract build(data: T): Command;
}

export class EmptyPostChecker implements PostconditionChecker<any> {
  public async check(inputs: ContinueResponse<any> | CancelResponse): Promise<ContinueResponse<any> | CancelResponse> {
    return inputs;
  }
}

const okText = nls.localize('ok');
export class DeleteObjectPostChecker<T> implements PostconditionChecker<T> {
  constructor(private readonly mesg: (t: T) => string) {}
  public async check(inputs: CancelResponse | ContinueResponse<T>): Promise<CancelResponse | ContinueResponse<T>> {
    if (inputs.type === 'CONTINUE') {
      // TODO: refactor this to a util.confirm(...) method
      const mesg = this.mesg(inputs.data);
      const selection = await vscode.window.showWarningMessage(
        mesg,
        {
          // put this right up front, otherwise it gets hidden in the corner of vscode
          modal: true
        },
        // https://github.com/Microsoft/vscode/issues/71251
        // Note: you always get a Cancel button, and for modals (at least on Mac),
        // it will always put the first item on the rhs, then Cancel left of that,
        // and then any other options left of that, which makes it impossible to do
        // a decent Yes/No confirm dialog, so we're going with Ok/Cancel
        okText
      );
      if (selection === okText) {
        return inputs;
      }
    }
    return { type: 'CANCEL' };
  }
}

export class SfdxCommandletWithOutput<T> {
  private readonly prechecker: PreconditionChecker;
  private readonly postchecker: PostconditionChecker<T>;
  private readonly gatherer: ParametersGatherer<T>;
  private readonly executor: SfdxCommandletExecutorWithOutput<T>;

  constructor(
    checker: PreconditionChecker,
    gatherer: ParametersGatherer<T>,
    executor: SfdxCommandletExecutorWithOutput<T>,
    postchecker = new EmptyPostChecker()
  ) {
    this.prechecker = checker;
    this.gatherer = gatherer;
    this.executor = executor;
    this.postchecker = postchecker;
  }

  public async run(): Promise<string> {
    if (await this.prechecker.check()) {
      let inputs = await this.gatherer.gather();
      inputs = await this.postchecker.check(inputs);
      switch (inputs.type) {
        case 'CONTINUE':
          return this.executor.execute(inputs);
        case 'CANCEL':
          if (inputs.msg) {
            vscode.window.showErrorMessage(inputs.msg);
            return Promise.reject(inputs.msg);
          }
      }
    }
    // from !prechecker.check() or !postchecker.check()
    return Promise.reject('Invalid arguments');
  }
}

export function getCommandExecutionExitCode(execution: CommandExecution): Promise<number> {
  return new Promise((resolve, reject) => {
    execution.processExitSubject.subscribe(code => {
      if (typeof code === 'number') {
        resolve(code);
      } else {
        reject(new Error(`Invalid exitCode '${code}'`));
      }
    });
  });
}

// re-export these things so our code can more easily import them from one place
export {
  emptyParametersGatherer,
  emptyPreChecker,
  sfdxWorkspaceChecker,
  CancelResponse,
  CliCommandExecutor,
  Command,
  CommandExecution,
  CommandOutput,
  ContinueResponse,
  ParametersGatherer,
  PostconditionChecker,
  PreconditionChecker,
  SfdxCommandBuilder,
  SfdxCommandlet,
  SfdxCommandletExecutor
};
