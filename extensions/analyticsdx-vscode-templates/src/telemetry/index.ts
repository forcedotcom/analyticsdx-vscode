/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { JSONPath } from 'jsonc-parser';
import * as vscode from 'vscode';
import { EXTENSION_NAME } from '../constants';
import { jsonPathToString } from '../util/jsoncUtils';
import { jsonpathFrom, uriBasename } from '../util/vscodeUtils';
import { TelemetryService } from './telemetry';

export const telemetryService = TelemetryService.getInstance();

function createTelemetryCommand(
  eventName: string,
  baseArgs: Record<string, string>,
  otherArgs?: Record<string, string>
): vscode.Command {
  const args: Record<string, string> = otherArgs ? Object.assign({}, otherArgs) : {};
  Object.assign(args, baseArgs);
  return {
    command: 'analyticsdx.telemetry.send',
    title: 'Sending telemetry',
    arguments: [eventName, EXTENSION_NAME, args]
  };
}

/** Create a Command that will send a quickFixUsed telemetry event. */
export function quickFixUsedTelemetryCommand(
  title: string,
  jsonPathOrDiagnostic: string | vscode.Diagnostic,
  fileNameOrUri: string | vscode.Uri,
  code = typeof jsonPathOrDiagnostic !== 'string' ? jsonPathOrDiagnostic.code : undefined,
  otherArgs?: Record<string, string>
): vscode.Command {
  const jsonPath = typeof jsonPathOrDiagnostic === 'string' ? jsonPathOrDiagnostic : jsonpathFrom(jsonPathOrDiagnostic);
  return createTelemetryCommand(
    'quickFixUsed',
    {
      title,
      code: code ? code.toString() : '',
      jsonPath: jsonPath ?? '',
      fileName: typeof fileNameOrUri === 'string' ? fileNameOrUri : uriBasename(fileNameOrUri)
    },
    otherArgs
  );
}

/** Create a Command that will send a codeCompletionUsed telemetry event. */
export function codeCompletionUsedTelemetryCommand(
  label: string,
  type: string,
  jsonPath: string | JSONPath,
  fileNameOrUri: string | vscode.Uri,
  otherArgs?: Record<string, string>
): vscode.Command {
  return createTelemetryCommand(
    'codeCompletionUsed',
    {
      label,
      type,
      jsonPath: typeof jsonPath === 'string' ? jsonPath : jsonPathToString(jsonPath),
      fileName: typeof fileNameOrUri === 'string' ? fileNameOrUri : uriBasename(fileNameOrUri)
    },
    otherArgs
  );
}
