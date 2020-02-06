/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { findNodeAtLocation, findNodeAtOffset, getNodePath, Node as JsonNode, parseTree } from 'jsonc-parser';
import * as vscode from 'vscode';
import { PathNameLabel, TemplateDirEditing } from '../templateEditing';
import { isValidRelpath } from '../util/utils';
import { calculateJsonpathAgainst } from '../util/vscodeUtils';
import { isUriUnder, uriRelPath } from '../util/vscodeUtils';

class AppliesTo {
  // this uses undefined to mean missing/null/non-string/'*' (i.e. match any value)
  constructor(public readonly type?: string, public readonly name?: string, public readonly label?: string) {}

  public matches(type: string, name: string | undefined, label: string | undefined): boolean {
    return (
      (this.type === undefined || this.type.toLowerCase() === type.toLocaleLowerCase()) &&
      (this.name === undefined || this.name.toLowerCase() === name?.toLocaleLowerCase()) &&
      (this.label === undefined || this.label.toLowerCase() === label?.toLocaleLowerCase())
    );
  }

  public static fromNodes(nodes: JsonNode[]): AppliesTo[] {
    const appliesTos: AppliesTo[] = [];
    nodes.forEach(n => {
      const a = this.from(n);
      if (a) {
        appliesTos.push(a);
      }
    });
    return appliesTos;
  }

  public static from(node: JsonNode): AppliesTo | undefined {
    if (node.type === 'object') {
      const type = findNodeAtLocation(node, ['type']);
      const name = findNodeAtLocation(node, ['name']);
      const label = findNodeAtLocation(node, ['label']);
      return new AppliesTo(
        // normalize missing, literal null, non-string, and '*' to undefined
        type?.type === 'string' && typeof type.value === 'string' && type.value !== '*' ? type.value : undefined,
        name?.type === 'string' && typeof name.value === 'string' && name.value !== '*' ? name.value : undefined,
        label?.type === 'string' && typeof label.value === 'string' && label.value !== '*' ? label.value : undefined
      );
    }
    return undefined;
  }
}

/** Show the matching json nodes in the template files for a rule action's json path. */
// TODO: if offset is in an appliesTo[*], return the files for the appliesTo instance
// TODO: if the offset is otherwise in a rule, return the files for all the appliesTo's
// Note: if we end up with mulitple ReferenceProviders for templates files, we should
// refactor this into a master (which does the parse) and delegates,
// to avoid parsing the json multiple times and to register only one provider for rules.
export class RulesJsonPathReferenceFinder implements vscode.ReferenceProvider {
  constructor(private readonly templateDirEditing: TemplateDirEditing) {}

  public provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location[]> {
    // make sure it's a rules in our template folder
    if (!this.isRulesDocument(document.uri)) {
      return undefined;
    }

    const root = parseTree(document.getText());
    const actionNode = this.getActionNodeForOffset(root, document.offsetAt(position));
    if (actionNode) {
      const actionType = findNodeAtLocation(actionNode, ['action']);
      if (actionType?.value === 'replace') {
        // TODO: do a text search
      } else {
        const jsonpath = findNodeAtLocation(actionNode, ['path']);
        if (jsonpath?.type === 'string' && typeof jsonpath.value === 'string' && jsonpath.value) {
          // action {} -> [] -> "actions": [] -> rule {}
          const files = this.getFilesForRuleAppliesTo(actionNode.parent?.parent?.parent);
          if ((!token || !token.isCancellationRequested) && files && files.length > 0) {
            return calculateJsonpathAgainst(jsonpath.value, files, actionType?.value === 'delete');
          }
        }
      }
    }
    return undefined;
  }

  private isRulesDocument(file: vscode.Uri): boolean {
    if (this.templateDirEditing.rulesDefinitionPaths && isUriUnder(this.templateDirEditing.dir, file)) {
      for (const relpath of this.templateDirEditing.rulesDefinitionPaths.values()) {
        if (file.path.endsWith('/' + relpath)) {
          return true;
        }
      }
    }
    return false;
  }

  private getActionNodeForOffset(root: JsonNode, offset: number): JsonNode | undefined {
    const node = findNodeAtOffset(root, offset);
    if (node) {
      const nodePath = getNodePath(node);
      // see if we're at or inside a rule action in the rules array
      if (
        nodePath &&
        nodePath[0] === 'rules' &&
        typeof nodePath[1] === 'number' &&
        nodePath[2] === 'actions' &&
        typeof nodePath[3] === 'number'
      ) {
        // return the rule action object, even if they selected a field within the action
        const action = nodePath.length === 4 ? node : findNodeAtLocation(root, nodePath.slice(0, 4));
        return action?.type === 'object' ? action : undefined;
      }
    }
    return undefined;
  }

  private getFilesForRuleAppliesTo(rule: JsonNode | undefined): vscode.Uri[] | undefined {
    if (rule) {
      const appliesToNodes = findNodeAtLocation(rule, ['appliesTo']);
      if (appliesToNodes?.type === 'array' && appliesToNodes.children && appliesToNodes.children.length > 0) {
        // check the files currently listed in the template against the rule's appliesTo(s)
        const appliesTos = AppliesTo.fromNodes(appliesToNodes.children);
        const relPaths = new Set<string>();
        this.addValidMatchingPaths(this.templateDirEditing.dashboardPaths, relPaths, appliesTos, 'dashboard');
        this.addValidMatchingPaths(this.templateDirEditing.lensPaths, relPaths, appliesTos, 'lens');
        this.addValidMatchingPaths(this.templateDirEditing.schemaPaths, relPaths, appliesTos, 'schema');
        this.addValidMatchingPaths(this.templateDirEditing.dataflowPaths, relPaths, appliesTos, 'workflow');
        this.addValidMatchingPaths(this.templateDirEditing.xmdPaths, relPaths, appliesTos, 'xmd');
        // convert the relpaths to uris
        return Array.from(relPaths.values()).map(p => uriRelPath(this.templateDirEditing.dir, p));
      }
    }
    return undefined;
  }

  private addValidMatchingPaths(
    srcPaths: Set<PathNameLabel> | undefined,
    destPaths: Set<string>,
    appliesTos: AppliesTo[],
    type: string
  ) {
    srcPaths?.forEach(p => {
      if (isValidRelpath(p.path) && appliesTos.some(a => a.matches(type, p.name, p.label))) {
        destPaths.add(p.path);
      }
    });
  }
}
