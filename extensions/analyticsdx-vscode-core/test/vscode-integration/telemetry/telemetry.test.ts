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
  public secrets!: vscode.ExtensionContext['secrets'];
  public extensionUri!: vscode.ExtensionContext['extensionUri'];
  public environmentVariableCollection!: vscode.ExtensionContext['environmentVariableCollection'];
  public storageUri: vscode.ExtensionContext['storageUri'];
  public globalStorageUri!: vscode.ExtensionContext['globalStorageUri'];
  public logUri!: vscode.ExtensionContext['logUri'];
  public extension!: vscode.ExtensionContext['extension'];
  public subscriptions = [];
  public workspaceState!: vscode.ExtensionContext['workspaceState'];
  public globalState!: vscode.ExtensionContext['globalState'];
  public extensionPath = 'extensionPath';
  public asAbsolutePath(relativePath: string): string {
    return relativePath;
  }
  public storagePath = 'storagePath';
  public globalStoragePath = 'globalStoragePath';
  public logPath = 'logPath';

  constructor(public extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Production) {}
}

describe('TelemetryService', () => {
  let sandbox: sinon.SinonSandbox;
  let sendEvent: sinon.SinonSpy<any, void>;

  let telemetryService: TelemetryService;

  async function initTelemetryService({
    isTelemetryEnabled = true,
    isDevMode = false,
    extensionMode = vscode.ExtensionMode.Production
  }: { isTelemetryEnabled?: boolean; isDevMode?: boolean; extensionMode?: vscode.ExtensionMode } = {}) {
    // machineId is only looked at during initializeService so we can't change it later to any affect
    sandbox.stub(vscode.env, 'machineId').get(() => (isDevMode ? 'someValue.machineId' : '123456'));
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
    await telemetryService.initializeService(new MockExtensionContext(extensionMode), 'aiKey', '0.0.1');
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

  [vscode.ExtensionMode.Development, vscode.ExtensionMode.Test].forEach(mode => {
    it(`should not send telemetry data for extensionMode ${vscode.ExtensionMode[mode]}`, async () => {
      await initTelemetryService({ extensionMode: mode });
      await telemetryService.sendExtensionActivationEvent([1, 700]);
      sinon.assert.notCalled(sendEvent);
    });
  });

  it('should send correct data format on sendTelemetryEvent', async () => {
    await initTelemetryService();
    const props = { foo: 'bar' };
    await telemetryService.sendTelemetryEvent('testEventName', 'testExtensionName', props);
    sinon.assert.calledOnce(sendEvent);

    const expectedData = { extensionName: 'testExtensionName', ...props };
    sinon.assert.calledWith(sendEvent, 'testEventName', expectedData);
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

  it('should send correct data format on sendInstallAnalyticsSfdxPluginEvent', async () => {
    await initTelemetryService();
    await telemetryService.sendInstallAnalyticsSfdxPluginEvent();
    sinon.assert.calledOnce(sendEvent);
    sinon.assert.calledWith(sendEvent, 'installAnalyticsSfdxPlugin');
  });

  it('should send correct data format on sendUpdateAnalyticsSfdxPluginEvent', async () => {
    await initTelemetryService();
    await telemetryService.sendUpdateAnalyticsSfdxPluginEvent('1', '2');
    sinon.assert.calledOnce(sendEvent);
    const expectedData = {
      extensionName: EXTENSION_NAME,
      currentVersion: '1',
      minVersion: '2'
    };
    sinon.assert.calledWith(sendEvent, 'updateAnalyticsSfdxPlugin', expectedData);
  });

  it('should send correct data on format sendDisableAnalyticsSfdxPluginCheckEvent', async () => {
    await initTelemetryService();
    await telemetryService.sendDisableAnalyticsSfdxPluginCheckEvent(undefined);
    sinon.assert.calledOnce(sendEvent);
    const expectedData = {
      extensionName: EXTENSION_NAME,
      currentVersion: ''
    };
    sinon.assert.calledWith(sendEvent, 'disableAnalyticsSfdxPluginCheck', expectedData);
  });
});
