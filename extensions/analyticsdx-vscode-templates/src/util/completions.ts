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

type SupportsDocumentFunction = (document: vscode.TextDocument, context: vscode.CompletionContext) => boolean;
type SupportsLocationFunction = (location: Location, context: vscode.CompletionContext) => boolean;

/**
 * A delegate to JsonCompletionItemProvider, to support handling sets of attribute-paths -> completion sets
 * in a constructor.
 */
export type JsonCompletionItemProviderDelegate<T extends vscode.CompletionItem = vscode.CompletionItem> = {
  /**
   * Tell if the specified document is valid for this delegate.
   * If undefined, then this can potentially support any document.
   * @param document the json document.
   * @param context code completion context.
   */
  isSupportedDocument?: SupportsDocumentFunction;

  /**
   * Tell if the specified attribute location is valid for this delegate.
   * If undefined, then this can potentially support any attribute location.
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   */
  isSupportedLocation?: SupportsLocationFunction;

  /**
   * Compute the potential completion items for the attribute location.
   * If the insertText on an item is not a vscode.SnippetString, then the label and insertText should not include the outer
   * json-attributes double-quotes -- those will be included automatically if needed by the location.
   * If the insertText is a vscode.SnippetText, the label and insertText be used as-is (so it should deal with adding
   * double-quotes appropriately).
   * This should only be called if {@link JsonCompletionItemProviderDelegate#supported} and
   * {@link JsonCompletionItemProviderDelegate#supported} are both undefined or both return true.
   * @param range the computed insert range (undefined to use the default vscode range for insertion)
   * @param location the location in the json; this will be at an attribute value position, use location.path to check the attribute path.
   * @param document the json document.
   * @param token code completion cancellation token.
   * @param context code completion context.
   * @returns the set of completion items (or undefined or empty if the attribute is not supported).
   */
  getItems: (
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) => vscode.ProviderResult<T[] | vscode.CompletionList<T>>;
};

/**
 * Construct a json attribute completion provider delegate that returns completion items of files paths, relative
 * to the document's file's directory.
 * @param delegate the delegate functions to use.
 */
export function newRelativeFilepathDelegate(delegate: {
  /** Tell if the specific document is supported, or undefined to support any document */
  isSupportedDocument?: SupportsDocumentFunction;
  /** Tell if the specific json attribute location is supported, or undefined to support any attribute */
  isSupportedLocation?: SupportsLocationFunction;
  /** The filepath filter, to control the document-dir-relative paths to include */
  filter?: (relpath: string, document: vscode.TextDocument, location: Location) => boolean;
}): JsonCompletionItemProviderDelegate {
  return {
    isSupportedDocument: delegate.isSupportedDocument,
    isSupportedLocation: delegate.isSupportedLocation,
    getItems: async (
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
 * In general, you should initialize only 1 item provider to run against a file matcher at a time, to avoid parsing
 * the json multiple times in different provider instances.
 */
export class JsonCompletionItemProvider<T extends vscode.CompletionItem = vscode.CompletionItem>
  implements vscode.CompletionItemProvider<T> {
  private delegates: Array<JsonCompletionItemProviderDelegate<T>>;

  constructor(...delegates: Array<JsonCompletionItemProviderDelegate<T>>) {
    this.delegates = delegates || [];
  }

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionList<T>> {
    let delegates = this.delegatesByDocument(this.delegates, document, context);
    if (delegates.length > 0) {
      const location = getLocation(document.getText(), document.offsetAt(position));
      if (!token || !token.isCancellationRequested) {
        delegates = this.delegatesByLocation(delegates, location, context);
        if (delegates.length > 0) {
          const results = this.provideDelegateCompletionItems(
            delegates,
            document.getWordRangeAtPosition(position) || new vscode.Range(position, position),
            location,
            document,
            token,
            context
          );
          return Promise.resolve(results).then(items => {
            return wrapItemsTexts(items, '"', '"');
          });
        }
      }
    }
    return undefined;
  }

  private provideDelegateCompletionItems(
    delegates: Array<JsonCompletionItemProviderDelegate<T>>,
    range: vscode.Range | undefined,
    location: Location,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionList<T>> {
    let all = Promise.resolve(new vscode.CompletionList<T>([], false));

    delegates.forEach(delegate => {
      const results = delegate.getItems(range, location, document, token, context);
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
    });
    return all;
  }

  private delegatesByDocument(
    delegates: Array<JsonCompletionItemProviderDelegate<T>>,
    document: vscode.TextDocument,
    context: vscode.CompletionContext
  ) {
    return delegates.filter(
      delegate => !delegate.isSupportedDocument || delegate.isSupportedDocument(document, context)
    );
  }

  private delegatesByLocation(
    delegates: Array<JsonCompletionItemProviderDelegate<T>>,
    location: Location,
    context: vscode.CompletionContext
  ): Array<JsonCompletionItemProviderDelegate<T>> {
    return delegates.filter(
      delegate => !delegate.isSupportedLocation || delegate.isSupportedLocation(location, context)
    );
  }
}

function wrapItemText<T extends vscode.CompletionItem = vscode.CompletionItem>(
  item: T,
  startText?: string,
  endText?: string
): T {
  if (!(item.insertText instanceof vscode.SnippetString)) {
    if (startText) {
      if (item.insertText) {
        item.insertText = startText + item.insertText;
      }
      item.label = startText + (item.label || '');
    }
    if (endText) {
      if (item.insertText) {
        item.insertText = item.insertText + endText;
      }
      item.label = (item.label || '') + endText;
    }
  }

  return item;
}

function wrapItemsTexts<
  L extends T[] | vscode.CompletionList<T> | undefined | null,
  T extends vscode.CompletionItem = vscode.CompletionItem
>(items: L, startText?: string, endText?: string): L {
  if (!items || (!startText && !endText)) {
    return items;
  }
  if (items instanceof vscode.CompletionList) {
    items.items = wrapItemsTexts(items.items, startText, endText);
    return items;
  }
  return (items as T[]).map(item => wrapItemText(item, startText, endText)) as L;
}
