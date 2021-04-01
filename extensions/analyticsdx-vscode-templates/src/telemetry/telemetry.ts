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

  private readonly delegate: BaseTelemetryService;
  private sentTemplateEditingConfiguredEvent = -1;

  constructor() {
    this.delegate = new BaseTelemetryService();
  }

  public static getInstance() {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  public initializeService(context: vscode.ExtensionContext, aiKey: string, version: string): Promise<void> {
    return this.delegate.initializeService(context, EXTENSION_NAME, aiKey, version);
  }

  public async sendExtensionActivationEvent(hrstart: [number, number]): Promise<void> {
    this.delegate.sendExtensionActivationEvent(hrstart);
  }

  public async sendExtensionDeactivationEvent(): Promise<void> {
    this.delegate.sendExtensionDeactivationEvent();
  }

  public async sendTemplateEditingConfigured(dir: vscode.Uri) {
    // only send this on the first template being opened per day, since, right now, we really only want to know if someone
    // actually opened and used the template editing at all (vs. the extension start message, which will pretty much
    // always happens so it really just tracks installs), and we don't want to flood appinsights with gobs of messages.
    const now = Date.now();
    if (this.sentTemplateEditingConfiguredEvent <= 0 || now - this.sentTemplateEditingConfiguredEvent > 86400000) {
      this.sentTemplateEditingConfiguredEvent = now;
      this.delegate.sendEventData('templateOpenedInSession', { extensionName: EXTENSION_NAME });
    }
  }
}
