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
  private reporter: TelemetryReporter | undefined;
  private isTelemetryEnabled: boolean;
  private setup: Promise<TelemetryService | undefined> | undefined;

  constructor() {
    this.isTelemetryEnabled = false;
  }

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

  /** Send a custom telemetry event */
  public async sendTelemetryEvent(
    eventName: string,
    extensionName: string,
    properties: {
      [key: string]: string;
    } = {}
  ) {
    await this.setupVSCodeTelemetry();
    if (this.reporter !== undefined && this.isTelemetryEnabled) {
      this.reporter.sendTelemetryEvent(eventName, Object.assign(properties || {}, { extensionName }));
    }
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

  /** Called when the user chooses to install @salesforce/analytics from our popup on startup. */
  public async sendInstallAdxPluginEvent(): Promise<void> {
    await this.setupVSCodeTelemetry();
    if (this.reporter !== undefined && this.isTelemetryEnabled) {
      this.reporter.sendTelemetryEvent('installAdxPlugin', {
        extensionName: EXTENSION_NAME
      });
    }
  }

  /** Called when the user chooses to update the sfdx plugins (because @salesforce/analytics it out of date) from our
   * popup on startup.
   */
  public async sendUpdateSfdxPluginsEvent(currentVersion: string | undefined, minVersion: string): Promise<void> {
    await this.setupVSCodeTelemetry();
    if (this.reporter !== undefined && this.isTelemetryEnabled) {
      this.reporter.sendTelemetryEvent('updateSfdxPlugins', {
        extensionName: EXTENSION_NAME,
        currentVersion: currentVersion || '',
        minVersion
      });
    }
  }

  /** Called when the user choose to stop sfdx plugin checks from the our popup on startup. */
  public async sendDisableSfdxPluginCheckEvent(currentVersion?: string): Promise<void> {
    await this.setupVSCodeTelemetry();
    if (this.reporter !== undefined && this.isTelemetryEnabled) {
      this.reporter.sendTelemetryEvent('disableSfdxPluginCheck', {
        extensionName: EXTENSION_NAME,
        currentVersion: currentVersion || ''
      });
    }
  }

  private getEndHRTime(hrstart: [number, number]): string {
    const hrend = process.hrtime(hrstart);
    return util.format('%d%d', hrend[0], hrend[1] / 1000000);
  }
}
