/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  CompositeParametersGatherer,
  EmptyParametersGatherer,
  LibraryCommandletExecutor,
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
import { showConfirmModal } from '../util';
import { getRootWorkspacePath } from '../util/rootWorkspace';

// make shared instances here that we can export for everything to use
const sfdxWorkspaceChecker = new SfdxWorkspaceChecker();
const emptyParametersGatherer = new EmptyParametersGatherer();
const emptyPreChecker: PreconditionChecker = {
  check: () => true
};

let cachedOutputChannel: vscode.OutputChannel | undefined;
export function sfdxOutputChannel(): vscode.OutputChannel {
  // create the channel lazily to speed up extension activation
  if (!cachedOutputChannel) {
    cachedOutputChannel = vscode.window.createOutputChannel('Analytics - CLI');
  }
  return cachedOutputChannel;
}

/** Return a fixed value. */
export class FixedValueGatherer<T> implements ParametersGatherer<T> {
  constructor(private readonly value: T) {}
  public gather(): Promise<ContinueResponse<T>> {
    return Promise.resolve({ type: 'CONTINUE', data: this.value });
  }
}

/** Base sfdx executor with our preferred output channel settings.
 * Use this instead of using SfdxCommandletExecutor directly.
 */
export abstract class BaseSfdxCommandletExecutor<T> extends SfdxCommandletExecutor<T> {
  // processExitSubject handler to show the output channel on error (if so configured in constructor)
  private readonly showChannelOutputOnError: ((exitCode: number | undefined) => void) | undefined;

  // default to using our shared cli channel, not automatically showing it, and always showing it if there's an error
  constructor({
    channel = sfdxOutputChannel(),
    showChannelOutput = false,
    showChannelOutputOnError = true
  }: { channel?: vscode.OutputChannel; showChannelOutput?: boolean; showChannelOutputOnError?: boolean } = {}) {
    super(channel);
    this.showChannelOutput = showChannelOutput;

    if (channel && showChannelOutputOnError) {
      this.showChannelOutputOnError = exitCode => {
        if (exitCode !== 0) {
          channel?.show();
        }
      };
    }
  }

  public abstract build(data: T): Command;

  protected attachExecution(
    execution: CommandExecution,
    cancellationTokenSource: vscode.CancellationTokenSource,
    cancellationToken: vscode.CancellationToken
  ): void {
    super.attachExecution(execution, cancellationTokenSource, cancellationToken);
    execution.processExitSubject.subscribe(this.showChannelOutputOnError);
  }
}

// FIXME: get something like this in the class in salesforce-vscode-core
// this is basically a copy of SfdxCommandletExecutor and SfdxCommandletWithOutput
// from there, just changing it to use a CommandOutput and return a Promise<string>
// with the stdout -- this could pretty easily be added as an option to the code in
// core
export abstract class SfdxCommandletExecutorWithOutput<T> extends BaseSfdxCommandletExecutor<T> {
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
}

export class EmptyPostChecker implements PostconditionChecker<any> {
  public async check(inputs: ContinueResponse<any> | CancelResponse): Promise<ContinueResponse<any> | CancelResponse> {
    return inputs;
  }
}

export class DeleteObjectPostChecker<T> implements PostconditionChecker<T> {
  constructor(private readonly mesg: (t: T) => string) {}
  public async check(inputs: CancelResponse | ContinueResponse<T>): Promise<CancelResponse | ContinueResponse<T>> {
    if (inputs.type === 'CONTINUE') {
      if (showConfirmModal(this.mesg(inputs.data))) {
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
  CompositeParametersGatherer,
  ContinueResponse,
  LibraryCommandletExecutor,
  ParametersGatherer,
  PostconditionChecker,
  PreconditionChecker,
  SfdxCommandBuilder,
  SfdxCommandlet
};
