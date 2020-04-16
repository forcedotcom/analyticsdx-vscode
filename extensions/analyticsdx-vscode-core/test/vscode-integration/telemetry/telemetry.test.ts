/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { assert, match, SinonStub, stub } from 'sinon';
import TelemetryReporter from 'vscode-extension-telemetry';
import { EXTENSION_NAME } from '../../../src/constants';
import { TelemetryService } from '../../../src/telemetry/telemetry';

describe('TelemetryService', () => {
  let reporter: TelemetryReporter;
  let sendEvent: SinonStub<any>;

  beforeEach(() => {
    reporter = new TelemetryReporter('salesforcedx-vscode', 'v1', 'test567890');
    sendEvent = stub(reporter, 'sendTelemetryEvent');
  });

  afterEach(async () => {
    sendEvent.restore();
    await reporter.dispose();
  });

  it('should send telemetry data', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, true);

    await telemetryService.sendExtensionActivationEvent([0, 678]);
    assert.calledOnce(sendEvent);
  });

  it('should not send telemetry data when telemetry disabled', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, false);

    await telemetryService.sendExtensionActivationEvent([1, 700]);
    assert.notCalled(sendEvent);
  });

  it('should not send telemetry data when no reporter', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(undefined, true);

    await telemetryService.sendExtensionActivationEvent([1, 700]);
    assert.notCalled(sendEvent);
  });

  it('should send correct data format on sendExtensionActivationEvent', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, true);

    await telemetryService.sendExtensionActivationEvent([1, 700]);
    assert.calledOnce(sendEvent);

    const expectedData = {
      extensionName: EXTENSION_NAME,
      startupTime: match.string
    };
    assert.calledWith(sendEvent, 'activationEvent', match(expectedData));
  });

  it('should send correct data format on sendExtensionDeactivationEvent', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, true);

    await telemetryService.sendExtensionDeactivationEvent();
    assert.calledOnce(sendEvent);

    const expectedData = {
      extensionName: EXTENSION_NAME
    };
    assert.calledWith(sendEvent, 'deactivationEvent', expectedData);
  });

  it('should send correct data on sendInstallAdxPluginEvent', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, true);

    await telemetryService.sendInstallAdxPluginEvent();
    assert.calledOnce(sendEvent);
    assert.calledWith(sendEvent, 'installAdxPlugin');
  });

  it('should send correct data on sendUpdateSfdxPluginsEvent', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, true);

    await telemetryService.sendUpdateSfdxPluginsEvent(undefined, '2');
    assert.calledOnce(sendEvent);
    const expectedData = {
      extensionName: EXTENSION_NAME,
      currentVersion: '',
      minVersion: '2'
    };
    assert.calledWith(sendEvent, 'updateSfdxPlugins', expectedData);
  });

  it('should send correct data on sendDisableSfdxPluginCheckEvent', async () => {
    const telemetryService = TelemetryService.getInstance();
    telemetryService.initializeService(reporter, true);

    await telemetryService.sendDisableSfdxPluginCheckEvent();
    assert.calledOnce(sendEvent);
    const expectedData = {
      extensionName: EXTENSION_NAME,
      currentVersion: ''
    };
    assert.calledWith(sendEvent, 'disableSfdxPluginCheck', expectedData);
  });
});
