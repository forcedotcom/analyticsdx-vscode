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

/** Base class for providing definition support on fields in a json file. */
export abstract class JsonAttributeDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
    if (this.isSupportedDocument(document)) {
      const location = getLocation(document.getText(), document.offsetAt(position));
      if ((!token || !token.isCancellationRequested) && this.isSupportedLocation(location)) {
        return this.provideAttributeDefinition(location, document, position, token);
      }
    }
    return undefined;
  }

  /** Provide the definition or definition links.
   * Called if isSupportedDocument() and isSupportedLocation return true.
   */
  public abstract provideAttributeDefinition(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]>;

  /** Check if this provider supports the specified document.
   * Defaults to return true; subclasses can override return false to avoid parsing the file.
   */
  public isSupportedDocument(document: vscode.TextDocument): boolean {
    return true;
  }

  /** Check if the provider supports the specified location in the document.
   * Called if isSupportedDocument() return true.
   */
  public abstract isSupportedLocation(location: Location): boolean;
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

  public isSupportedLocation(location: Location): boolean {
    return (
      !location.isAtPropertyKey &&
      location.previousNode &&
      location.previousNode.type === 'string' &&
      location.previousNode.value &&
      this.patterns.some(location.matches)
    );
  }
}
