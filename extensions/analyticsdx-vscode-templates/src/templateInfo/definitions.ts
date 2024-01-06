/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { matchJsonNodesAtPattern } from '@salesforce/analyticsdx-template-lint';
import { Location, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { locationMatches } from '../util/jsoncUtils';
import { rangeForNode } from '../util/vscodeUtils';
import { JsonAttributeDefinitionProvider } from './../util/definitions';

/** Provider definition support for dataModelObjects' dataset fields to the corresponding datasetFiles name. */
export class DMODatasetDefinitionProvider extends JsonAttributeDefinitionProvider {
  public provideAttributeDefinition(location: Location, document: vscode.TextDocument) {
    // this should be a non-empty string as per isSupportedLocation()
    const datasetName = location.previousNode!.value as string;
    const tree = parseTree(document.getText());
    const nameNode = matchJsonNodesAtPattern(tree, ['datasetFiles', '*', 'name']).find(n => n.value === datasetName);
    if (nameNode) {
      return new vscode.Location(document.uri, rangeForNode(nameNode, document));
    }
  }

  public isSupportedLocation(location: Location): boolean {
    return (
      !location.isAtPropertyKey &&
      location.previousNode?.type === 'string' &&
      location.previousNode.value &&
      locationMatches(location, ['dataModelObjects', '*', 'dataset'])
    );
  }
}
