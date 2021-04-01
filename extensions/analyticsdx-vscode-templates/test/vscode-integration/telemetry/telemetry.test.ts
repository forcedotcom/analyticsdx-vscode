/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  TelemetryReporter,
  TelemetryService as BaseTelemetryService
} from '@salesforce/salesforcedx-utils-vscode/out/src';
import * as appInsights from 'applicationinsights';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../../../src/constants';
import { TelemetryService } from '../../../src/telemetry/telemetry';

class MockExtensionContext implements vscode.ExtensionContext {
  public subscriptions: Array<{ dispose(): any }> = [];
  public workspaceState!: vscode.Memento;
  public globalState!: vscode.Memento;
  public extensionPath: string = 'extensionPath';
  public asAbsolutePath(relativePath: string): string {
    return relativePath;
  }
  public storagePath = 'storagePath';
  public globalStoragePath = 'globalStoragePath';
  public logPath = 'logPath';
}

describe('TelemetryService', () => {
  let sandbox: sinon.SinonSandbox;
  let sendEvent: sinon.SinonSpy<any, void>;

  let telemetryService: TelemetryService;

  async function initTelemetryService({
    isTelemetryEnabled = true,
    isDevMode = false
  }: { isTelemetryEnabled?: boolean; isDevMode?: boolean } = {}) {
    // machineId is only looked at during initializeService so we can't change it later to any affect
    if (!isDevMode) {
      sandbox.stub(vscode.env, 'machineId').get(() => '123456');
    }
    sandbox.stub(BaseTelemetryService.prototype, 'isTelemetryEnabled').returns(Promise.resolve(isTelemetryEnabled));

    sandbox.stub(BaseTelemetryService.prototype, 'checkCliTelemetry').returns(Promise.resolve(true));
    sendEvent = sandbox.spy(TelemetryReporter.prototype, 'sendTelemetryEvent');

    // make these no-op in case anything accidently gets through
    sandbox.stub(TelemetryReporter.prototype, 'sendExceptionEvent');
    sandbox.stub(appInsights.TelemetryClient.prototype, 'trackEvent');
    sandbox.stub(appInsights.TelemetryClient.prototype, 'trackException');
    sandbox.stub(appInsights.TelemetryClient.prototype, 'flush').callsFake(options => {
      // need to call the callback for TelemetryReporter.dispose() to finish
      options?.callback?.('foo');
    });

    telemetryService = new TelemetryService();
    await telemetryService.initializeService(new MockExtensionContext(), 'aiKey', '0.0.1');
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should not send telemetry data when telemetry disabled', async () => {
    await initTelemetryService({ isTelemetryEnabled: false });
    await telemetryService.sendExtensionActivationEvent([1, 700]);
    sinon.assert.notCalled(sendEvent);
  });

  it('should not send telemetry data when in dev mode', async () => {
    await initTelemetryService({ isDevMode: true });
    await telemetryService.sendExtensionActivationEvent([1, 700]);
    sinon.assert.notCalled(sendEvent);
  });

  it('should send correct data format on sendExtensionActivationEvent', async () => {
    await initTelemetryService();
    await telemetryService.sendExtensionActivationEvent([1, 700]);
    sinon.assert.calledOnce(sendEvent);

    const expectedData = { extensionName: EXTENSION_NAME };
    const expectedMeasurements = { startupTime: sinon.match.number };
    sinon.assert.calledWith(sendEvent, 'activationEvent', expectedData, expectedMeasurements);
  });

  it('should send correct data format on sendExtensionDeactivationEvent', async () => {
    await initTelemetryService();
    await telemetryService.sendExtensionDeactivationEvent();
    sinon.assert.calledOnce(sendEvent);

    const expectedData = { extensionName: EXTENSION_NAME };
    sinon.assert.calledWith(sendEvent, 'deactivationEvent', expectedData);
  });

  it('should send correct data format on sendTemplateEditingConfigured only once per day', async () => {
    await initTelemetryService();

    await telemetryService.sendTemplateEditingConfigured(vscode.Uri.file('.'));
    sinon.assert.calledOnce(sendEvent);

    const expectedData = { extensionName: EXTENSION_NAME };
    sinon.assert.calledWith(sendEvent, 'templateOpenedInSession', expectedData);

    // a 2nd immediate call to the service shouldn't result in a call to the reporter
    await telemetryService.sendTemplateEditingConfigured(vscode.Uri.file('./foo'));
    sinon.assert.calledOnce(sendEvent);

    // mock that it's a day in the future
    const now = Date.now();
    sandbox.stub(Date, 'now').returns(now + 90000000);
    // so a second call should go through to the reporter
    await telemetryService.sendTemplateEditingConfigured(vscode.Uri.file('./bar'));
    sinon.assert.calledTwice(sendEvent);
  });
});
