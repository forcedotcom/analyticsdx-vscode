/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { TelemetryService as BaseTelemetryService } from '@salesforce/salesforcedx-utils-vscode/out/src';
import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';

class VscodeBaseTelemetryService extends BaseTelemetryService {
  private extensionMode: vscode.ExtensionMode | undefined = undefined;

  public override initializeService(
    context: vscode.ExtensionContext,
    extensionName: string,
    aiKey: string,
    version: string
  ): Promise<void> {
    this.extensionMode = context.extensionMode;
    return super.initializeService(context, extensionName, aiKey, version);
  }

  public override isTelemetryEnabled(): Promise<boolean> {
    if (this.extensionMode === vscode.ExtensionMode.Production) {
      return super.isTelemetryEnabled();
    }
    return Promise.resolve(false);
  }
}

export class TelemetryService {
  private static instance: TelemetryService;

  private sentTemplateEditingConfiguredEvent = -1;

  constructor(private readonly delegate: BaseTelemetryService = new VscodeBaseTelemetryService()) {}

  public static getInstance() {
    if (!TelemetryService.instance) {
      if (!((BaseTelemetryService as any).instance instanceof VscodeBaseTelemetryService)) {
        const base = new VscodeBaseTelemetryService();
        (BaseTelemetryService as any).instance = base;
      }
      TelemetryService.instance = new TelemetryService(BaseTelemetryService.getInstance());
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
