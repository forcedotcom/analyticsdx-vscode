/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { getLocation, JSONPath, Location } from 'jsonc-parser';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { isValidRelpath } from './utils';

export abstract class JsonAttributeDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    const location = getLocation(document.getText(), document.offsetAt(position));
    if (
      (!token || !token.isCancellationRequested) &&
      !location.isAtPropertyKey &&
      this.isSupportedLocation(location, document, token)
    ) {
      return this.provideAttributeDefinition(location, document, position, token);
    }
    return undefined;
  }

  public abstract provideAttributeDefinition(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]>;

  public abstract isSupportedLocation(
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): boolean;
}

export class JsonAttributeRelFilePathDefinitionProvider extends JsonAttributeDefinitionProvider {
  constructor(private readonly patterns: readonly JSONPath[]) {
    super();
  }

  public provideAttributeDefinition(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Location | undefined {
    // isSupportedLocation checks that location.previousNode is set and has a string value
    const relpath: string = location.previousNode!.value;
    if (isValidRelpath(relpath)) {
      return new vscode.Location(
        document.uri.with({ path: path.join(path.dirname(document.uri.path), relpath) }),
        new vscode.Position(0, 0)
      );
    }
  }

  public isSupportedLocation(
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): boolean {
    return (
      location.previousNode &&
      location.previousNode.type === 'string' &&
      location.previousNode.value &&
      this.patterns.some(location.matches)
    );
  }
}
