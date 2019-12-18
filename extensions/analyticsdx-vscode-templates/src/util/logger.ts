/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { format } from 'util';
import * as vscode from 'vscode';

/** A wrapper around an OutputChannel that will optionally prefix each line of output. */
export class PrefixingOutputChannel implements vscode.OutputChannel {
  constructor(public readonly output?: vscode.OutputChannel, public readonly prefix?: string) {}

  protected addPrefix(mesg: string): string {
    return this.prefix ? `[${this.prefix}] ${mesg}` : mesg;
  }

  get name() {
    return this.output?.name ?? this.prefix ?? '';
  }

  public append(value: string): void {
    // TODO: handle embedded newlines to add prefix
    this.output?.append(value);
  }

  public appendLine(value: string): void {
    this.output?.appendLine(this.addPrefix(value));
  }

  public clear(): void {
    this.output?.clear();
  }

  public show(preserveFocus?: boolean | undefined): void;
  public show(column?: vscode.ViewColumn | undefined, preserveFocus?: boolean | undefined): void;
  public show(column?: any, preserveFocus?: any) {
    this.output?.show(preserveFocus);
  }

  public hide(): void {
    this.output?.hide();
  }

  public dispose(): void {
    // ignore this call -- the output channel might be shared elsewhere, and the creator of the channel should
    // handle dispose()'ing it
  }
}

export type LoggerOptions = {
  prefix?: string;
  toConsole?: boolean;
};
/** A proxy for multi-plexing log output to the console and to a vscode.OutputChannel.
 * This also supports prefixing output lines.
 */
export class Logger extends PrefixingOutputChannel {
  public readonly toConsole: boolean | undefined;

  // Note: most creators of Loggers should use this method to avoid double-wrapping.
  // Generally, only the top-level Logger created index.ts should use the constructor directly
  public static from(output?: vscode.OutputChannel, options?: LoggerOptions): Logger {
    if (output && output instanceof Logger) {
      return output;
    } else {
      return new Logger(output, options);
    }
  }

  // Note: only the top-level Logger created in index.ts should really set toConsole true and have the default
  // ADX output channel
  constructor(public readonly output?: vscode.OutputChannel, { prefix, toConsole = false }: LoggerOptions = {}) {
    super(output, prefix);
    this.toConsole = toConsole;
  }

  public append(value: string): void {
    super.append(value);
    // TODO: buffer up append()'s and console.log() at newlines
  }

  public appendLine(value: string): void {
    super.appendLine(value);
    if (this.toConsole) {
      console.log(this.addPrefix(value));
    }
  }

  public log(message?: any, ...optionalParams: any[]): void {
    if (this.toConsole || this.output) {
      // format style log()
      if (typeof message === 'string') {
        message = this.addPrefix(message);
        if (this.toConsole) {
          console.log(message, ...optionalParams);
        }
        if (this.output) {
          this.output.appendLine(format(message, ...optionalParams));
        }
      } else {
        // object style log()
        if (this.toConsole) {
          if (this.prefix) {
            console.log(this.prefix, message, ...optionalParams);
          } else {
            console.log(message, ...optionalParams);
          }
        }
        if (this.output) {
          this.output.appendLine(
            this.prefix ? format(this.prefix, message, ...optionalParams) : format(message, ...optionalParams)
          );
        }
      }
    }
  }

  // TODO: add warn/error/debug/info methods to match console
}
