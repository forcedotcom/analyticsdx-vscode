/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as util from 'util';
import * as vscode from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EXTENSION_NAME } from '../constants';
import { waitForDX } from '../dxsupport/waitForDX';

export class TelemetryService {
  private static instance: TelemetryService;
  // Note: in dev mode, reporter will be undefined, even if isTelemetryEnabled is true; that's by design in the
  // salesforcedx-vscode-core extension
  private reporter: TelemetryReporter | undefined;
  private isTelemetryEnabled = false;
  private sentTemplateEditingConfiguredEvent = false;
  private setup: Promise<TelemetryService | undefined> | undefined;

  constructor() {}

  public static getInstance() {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  public async setupVSCodeTelemetry() {
    // if its already set up
    if (this.reporter) {
      return Promise.resolve(this);
    }
    if (!this.setup) {
      this.setup = waitForDX(true)
        .then((coreDependency: vscode.Extension<any>) => {
          coreDependency.exports.telemetryService.showTelemetryMessage();

          this.initializeService(
            coreDependency.exports.telemetryService.getReporter(),
            coreDependency.exports.telemetryService.isTelemetryEnabled()
          );
          return this;
        })
        .catch(err => {
          return undefined;
        });
    }
    return this.setup;
  }

  public initializeService(reporter: TelemetryReporter | undefined, isTelemetryEnabled: boolean): void {
    this.isTelemetryEnabled = isTelemetryEnabled;
    this.reporter = reporter;
  }

  public async sendExtensionActivationEvent(hrstart: [number, number]): Promise<void> {
    await this.setupVSCodeTelemetry();
    if (this.reporter !== undefined && this.isTelemetryEnabled) {
      const startupTime = this.getEndHRTime(hrstart);
      this.reporter.sendTelemetryEvent('activationEvent', {
        extensionName: EXTENSION_NAME,
        startupTime
      });
    }
  }

  public async sendExtensionDeactivationEvent(): Promise<void> {
    await this.setupVSCodeTelemetry();
    if (this.reporter !== undefined && this.isTelemetryEnabled) {
      this.reporter.sendTelemetryEvent('deactivationEvent', {
        extensionName: EXTENSION_NAME
      });
    }
  }

  public async sendTemplateEditingConfigured(dir: vscode.Uri) {
    // only send this on the first template being opened, since, right now, we really only want to know if someone
    // actually opened and used the template editing at all (vs. the extension start message, which will pretty much
    // always happens so it really just tracks installs), and we don't want to flood appinsights with gobs of messages.
    if (!this.sentTemplateEditingConfiguredEvent) {
      this.sentTemplateEditingConfiguredEvent = true;
      await this.setupVSCodeTelemetry();
      if (this.reporter !== undefined && this.isTelemetryEnabled) {
        this.reporter.sendTelemetryEvent('templateOpenedInSession', {
          extensionName: EXTENSION_NAME
        });
      }
    }
  }

  private getEndHRTime(hrstart: [number, number]): string {
    const hrend = process.hrtime(hrstart);
    return util.format('%d%d', hrend[0], hrend[1] / 1000000);
  }
}
