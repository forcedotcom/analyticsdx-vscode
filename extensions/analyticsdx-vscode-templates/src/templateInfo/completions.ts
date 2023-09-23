/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { matchJsonNodesAtPattern } from '@salesforce/analyticsdx-template-lint';
import { Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { codeCompletionUsedTelemetryCommand } from '../telemetry';
import { JsonCompletionItemProviderDelegate, newCompletionItem } from '../util/completions';

/** Provide completion items for a dataModelObject dataset field, from the datasetFiles' names. */
export class DMODatasetCompletionItemProviderDelegate implements JsonCompletionItemProviderDelegate {
  public isSupportedLocation(location: Location) {
    return !location.isAtPropertyKey && location.matches(['dataModelObjects', '*', 'dataset']);
  }

  public getItems(range: vscode.Range | undefined, location: Location, document: vscode.TextDocument) {
    // read the names from the datasetFiles in the same template-info.json file
    const tree = parseTree(document.getText());
    return [
      // uniquify those names
      ...new Set(
        matchJsonNodesAtPattern(
          tree,
          ['datasetFiles', '*', 'name'],
          nameNode => typeof nameNode.value === 'string' && nameNode.value
        ).map(nameNode => nameNode.value as string)
      )
    ].map(name => {
      const item = newCompletionItem(name, range, vscode.CompletionItemKind.EnumMember);
      item.command = codeCompletionUsedTelemetryCommand(item.label, 'dataset', location.path, document.uri);
      return item;
    });
  }
}
