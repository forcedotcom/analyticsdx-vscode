/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  findNodeAtOffset,
  getLocation,
  getNodePath,
  JSONPath,
  modify as jsonModify,
  Node as JsonNode,
  parseTree
} from 'jsonc-parser';
import * as vscode from 'vscode';
import { quickFixUsedTelemetryCommand } from '../telemetry';
import { findPropertyNodeFor, jsonPathToString, pathPartsAreEquals } from './jsoncUtils';
import { findEditorForDocument, getFormattingOptionsForEditor, jsonEditsToWorkspaceEdit } from './vscodeUtils';

// TODO: refactor this into a controller (which does the parse) and delegates,
// to avoid parsing the json multiple times and to register only one action provider
export class RemoveJsonPropertyCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  /** Create a workspace edit that will remove the specified json node (property and value)
   * @param path the json path to the node to remove
   * @param document the json document
   */
  public static createRemoveJsonPropertyWorkspaceEdit(
    path: JSONPath,
    document: vscode.TextDocument
  ): vscode.WorkspaceEdit | undefined {
    const formattingOptions = getFormattingOptionsForEditor(findEditorForDocument(document));
    // this should delete it, plus take care of leading/trailing commas
    const edits = jsonModify(document.getText(), path, undefined, { formattingOptions });
    return jsonEditsToWorkspaceEdit(edits, document, new vscode.WorkspaceEdit());
  }

  /** The json paths to properties that will be offered to delete. */
  protected paths: JSONPath[];

  constructor(...paths: JSONPath[]) {
    this.paths = paths;
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const root = parseTree(document.getText());
    const node = root && findNodeAtOffset(root, document.offsetAt(range.start));

    for (const path of this.paths) {
      if ((!token || !token.isCancellationRequested) && node && this.isSupportedAttributeNode(node, path)) {
        const propNode = findPropertyNodeFor(node, path);
        if (propNode) {
          const jsonPathStr = jsonPathToString(path);
          const fix = new vscode.CodeAction(`Remove ${jsonPathStr}`, vscode.CodeActionKind.QuickFix);
          fix.edit = RemoveJsonPropertyCodeActionProvider.createRemoveJsonPropertyWorkspaceEdit(path, document);
          // send telemetry when someone uses a quick fix
          fix.command = quickFixUsedTelemetryCommand(fix.title, jsonPathStr, document.uri);
          return [fix];
        }
      }
    }
    return undefined;
  }

  /**
   * Tell if the specified attribute location is valid for the provider.
   * Subclasses can override here to if they want to fail-fast.
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   */
  public isSupportedAttributeNode(node: JsonNode, path: JSONPath): boolean {
    const nodePath = getNodePath(node);
    return pathPartsAreEquals(path, nodePath);
  }
}

/** Remove the json property in the document for an associated diagnostic. */
export class RemoveJsonPropertyDiagnosticCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  /** The set of diagnostic codes to match on */
  public readonly codes: Set<string>;

  constructor(...codes: string[]) {
    this.codes = new Set(codes);
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];
    for (const d of context.diagnostics) {
      if (typeof d.code === 'string' && this.codes.has(d.code)) {
        // use the diagnostic's range start, which should give the property node in the json
        const location = getLocation(document.getText(), document.offsetAt(d.range.start));
        const jsonPathStr = jsonPathToString(location.path);
        const fix = new vscode.CodeAction(
          `Remove ${jsonPathStr}`,
          RemoveJsonPropertyDiagnosticCodeActionProvider.providedCodeActionKinds[0]
        );
        fix.edit = RemoveJsonPropertyCodeActionProvider.createRemoveJsonPropertyWorkspaceEdit(location.path, document);
        fix.command = quickFixUsedTelemetryCommand(fix.title, jsonPathStr, document.uri);
        actions.push(fix);
      }
    }

    return actions;
  }
}
