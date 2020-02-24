/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { getLocation, Location } from 'jsonc-parser';
import * as vscode from 'vscode';
import { codeCompletionUsedTelemetryCommand } from '../telemetry';
import { uriDirname, uriReaddir } from './vscodeUtils';

export function newCompletionItem(
  text: string,
  range?: vscode.Range,
  kind?: vscode.CompletionItemKind,
  detail?: string,
  insertText?: string | vscode.SnippetString
) {
  const item = new vscode.CompletionItem(text);
  item.range = range;
  item.kind = kind || vscode.CompletionItemKind.Value;
  item.insertText = insertText ? insertText : text;
  item.detail = detail;
  return item;
}

export function newFilepathCompletionItem(
  path: string,
  range?: vscode.Range,
  insertText?: string | vscode.SnippetString
): vscode.CompletionItem {
  // since we might be wrapping the path in "'s (so it inserts correctly into the json-editor's word range),
  // we have to set the item.details to the path or the editor won't show the file-type specific icon correctly;
  // the editor seems to try the label, which could be '"foo.json"' (which it doesn't like), and then will next
  // look at the details
  return newCompletionItem(path, range, vscode.CompletionItemKind.File, path, insertText);
}

type InsertInfo = { range?: vscode.Range; startText?: string; endText?: string };

type SupportsLocationFunction = (
  location: Location,
  document: vscode.TextDocument,
  token: vscode.CancellationToken,
  context: vscode.CompletionContext
) => boolean;

/**
 * A delegate to JsonAttributeCompletionItemProvider, to support handling sets of attribute-paths -> completion sets
 * in a constructor.
 */
export type JsonAttributeCompletionItemProviderDelegate = {
  /**
   * Tell if the specified attribute location is valid for this delegate.
   * If undefined, then this can potentially support any attribute location.
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   */
  supported?: SupportsLocationFunction;

  /**
   * Compute the potential completion items for the attribute location.
   * The insertText on the items should not include the outer json-attributes double-quotes; those will be
   * included automatically if needed by the location.
   * This should only be called if {@link JsonAttributeCompletionItemProviderDelegate#supported} is undefined or return true.
   * @param range the computed insert range (undefined to use the default vscode range for insertion)
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   * @returns the set of completion items (or undefined or empty if the attribute is not supported).
   */
  items: (
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) => vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList>;
};

/**
 * Construct a json attribute completion provider delegate that returns completion items of files paths, relative
 * to the document's file's directory.
 * @param delegate the delegate functions to use.
 */
export function newRelativeFilepathDelegate(delegate: {
  /** Tell if the specific json attribute location is supported, or undefined to support any attribute */
  supported?: SupportsLocationFunction;
  /** The filepath filter, to control the document-dir-relative paths to include */
  filter?: (relpath: string, document: vscode.TextDocument, location: Location) => boolean;
}): JsonAttributeCompletionItemProviderDelegate {
  return {
    supported: delegate.supported,
    items: async (
      range: vscode.Range | undefined,
      location: Location,
      document: vscode.TextDocument,
      token: vscode.CancellationToken
    ) => {
      const dir = uriDirname(document.uri);
      // search for files under the same directory as the document
      const entries = await uriReaddir(
        dir,
        ([path, fileType]) =>
          // only include files that match the filter
          (fileType & vscode.FileType.File) !== 0 && (!delegate.filter || delegate.filter(path, document, location))
      );
      return entries.map(([path]) => {
        const item = newFilepathCompletionItem(path, range);
        // send telemetry when someone uses a relpath code completion item
        item.command = codeCompletionUsedTelemetryCommand(item.label, 'relpath', location.path, document.uri);
        return item;
      });
    }
  };
}

/**
 * Handle doing appropriate json attribute completion text replacements.
 *
 * The implementation here will use the delegates to compute the completion items.
 * Subclasses can override {@link #isSupportedAttributeLocation} and {@link #provideAttributeCompletionItems} to
 * as needed, to either not use the delegate pattern or at augment it; those methods should be override symmetrically.
 *
 * In general, you should initialize only 1 item provider to run against a file at a time, to avoid parsing
 * the json multiple times in different provider instances.
 */
export class JsonAttributeCompletionItemProvider implements vscode.CompletionItemProvider {
  protected delegates: JsonAttributeCompletionItemProviderDelegate[];

  constructor(...delegates: JsonAttributeCompletionItemProviderDelegate[]) {
    this.delegates = delegates || [];
  }

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionList> {
    const location = getLocation(document.getText(), document.offsetAt(position));
    if (
      (!token || !token.isCancellationRequested) &&
      !location.isAtPropertyKey &&
      this.isSupportedAttributeLocation(location, document, token, context)
    ) {
      const info = this.computeInsertInfo(location, document, position, token, context);
      if (info && (!token || !token.isCancellationRequested)) {
        const results = this.provideAttributeCompletionItems(info.range, location, document, token, context);
        // if we don't need to pre/append text or no matches, just return that
        if ((!info.startText && !info.endText) || !results) {
          return results;
        } else {
          // otherwise, update the insertTexts in the items to return
          return Promise.resolve(results).then(items => {
            return wrapItemsTexts(items, info.startText, info.endText);
          });
        }
      }
    }
    return undefined;
  }

  /**
   * Compute the potential completion items for the attribute location.
   * The insertText on the items should not include the outer json-attributes double-quotes; those will be
   * included automatically if needed by the location.
   * @param range the computed insert range (undefined to use the default vscode range for insertion)
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   * @returns the set of completion items (or undefined or empty if the attribute is not supported).
   */
  public provideAttributeCompletionItems(
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionList> {
    let all = Promise.resolve(new vscode.CompletionList([], false));

    this.delegates.forEach(delegate => {
      if (!delegate.supported || delegate.supported(location, document, token, context)) {
        const results = delegate.items(range, location, document, token, context);
        if (results) {
          // if we got results from the delegate, add those to the outer list
          all = all.then(list => {
            return Promise.resolve(results).then(items => {
              if (items) {
                if (items instanceof vscode.CompletionList) {
                  list.items.push(...items.items);
                  list.isIncomplete = list.isIncomplete || items.isIncomplete;
                } else {
                  // CompletionItem[]
                  list.items.push(...items);
                }
              }
              return list;
            });
          });
        }
      }
    });
    return all;
  }

  /**
   * Tell if the specified attribute location is valid for the provider.
   * Subclasses can override here to if they want to fail-fast.
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   */
  public isSupportedAttributeLocation(
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): boolean {
    // check if any of the delegates say they support the location
    return this.delegates.some(
      delegate => !delegate.supported || delegate.supported(location, document, token, context)
    );
  }

  /** Compute the appropriate insert information range for the attribute and location and cursor position.
   * Subclases can override the default behavior here, particularly if they want to detect and intra-attribute-value
   * code completions (i.e. not replacing the whole attribute).
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   * @return the insert range, or undefined for the default vscode code-completion behavior, and any pre/postfix
   *         insertion text (typically quotes).
   */
  public computeInsertInfo(
    location: Location,
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): InsertInfo {
    // by default, use the json-editor's word boundary at the position (which will typically be from the start
    // double-quote to the end double-quote); when we do that, it includes replacing the quotes, so we need to
    // have the generated item include the quotes for everything to work like folks expect it (and with how all
    // of the other json code-completing seems to work).
    return {
      range: document.getWordRangeAtPosition(position) || new vscode.Range(position, position),
      startText: '"',
      endText: '"'
    };
  }
}

function wrapItemText(item: vscode.CompletionItem, startText?: string, endText?: string): vscode.CompletionItem {
  if (startText) {
    if (item.insertText) {
      if (item.insertText instanceof vscode.SnippetString) {
        item.insertText.value = startText + (item.insertText.value || '');
      } else {
        item.insertText = startText + item.insertText;
      }
    }
    item.label = startText + (item.label || '');
  }
  if (endText) {
    if (item.insertText) {
      if (item.insertText instanceof vscode.SnippetString) {
        item.insertText.value = (item.insertText.value || '') + endText;
      } else {
        item.insertText = item.insertText + endText;
      }
    }
    item.label = (item.label || '') + endText;
  }

  return item;
}

function wrapItemsTexts<T extends vscode.CompletionItem[] | vscode.CompletionList | undefined | null>(
  items: T,
  startText?: string,
  endText?: string
): T {
  if (!items) {
    return items;
  }
  if (items instanceof vscode.CompletionList) {
    items.items = wrapItemsTexts(items.items, startText, endText);
    return items;
  }
  return (items as vscode.CompletionItem[]).map(item => wrapItemText(item, startText, endText)) as T;
}
