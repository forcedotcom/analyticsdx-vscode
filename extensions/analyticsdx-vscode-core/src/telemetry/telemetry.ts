/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { TelemetryService as BaseTelemetryService } from '@salesforce/salesforcedx-utils-vscode/out/src';
import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';

export class TelemetryService {
  private static instance: TelemetryService;

  constructor(private readonly delegate: BaseTelemetryService = new BaseTelemetryService()) {}

  /** Get the singleton instance of this, tied to the default singleton of the underlying telemetry service */
  public static getInstance() {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService(BaseTelemetryService.getInstance());
    }
    return TelemetryService.instance;
  }

  public initializeService(context: vscode.ExtensionContext, aiKey: string, version: string): Promise<void> {
    return this.delegate.initializeService(context, EXTENSION_NAME, aiKey, version);
  }

  /** Send a custom telemetry event */
  public async sendTelemetryEvent(
    eventName: string,
    extensionName: string,
    properties: { [key: string]: string } = {}
  ): Promise<void> {
    this.delegate.sendEventData(eventName, Object.assign(properties || {}, { extensionName }));
  }

  public async sendExtensionActivationEvent(hrstart: [number, number]): Promise<void> {
    this.delegate.sendExtensionActivationEvent(hrstart);
  }

  public async sendExtensionDeactivationEvent(): Promise<void> {
    this.delegate.sendExtensionDeactivationEvent();
  }

  /** Called when the user chooses to install @salesforce/analytics from our popup on startup. */
  public async sendInstallAnalyticsSfdxPluginEvent(): Promise<void> {
    this.delegate.sendEventData('installAnalyticsSfdxPlugin', {
      extensionName: EXTENSION_NAME
    });
  }

  /** Called when the user chooses to update the @salesforce/analytics plugin (because it's out of date) from our
   * popup on startup.
   */
  public async sendUpdateAnalyticsSfdxPluginEvent(
    currentVersion: string | undefined,
    minVersion: string
  ): Promise<void> {
    this.delegate.sendEventData('updateAnalyticsSfdxPlugin', {
      extensionName: EXTENSION_NAME,
      currentVersion: currentVersion || '',
      minVersion
    });
  }

  /** Called when the user choose to stop sfdx plugin checks from the our popup on startup. */
  public async sendDisableAnalyticsSfdxPluginCheckEvent(currentVersion: string | undefined): Promise<void> {
    this.delegate.sendEventData('disableAnalyticsSfdxPluginCheck', {
      extensionName: EXTENSION_NAME,
      currentVersion: currentVersion || ''
    });
  }
}
