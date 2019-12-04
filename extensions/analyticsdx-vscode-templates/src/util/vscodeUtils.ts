/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Node as JsonNode } from 'jsonc-parser';
import { posix as path } from 'path';
import * as vscode from 'vscode';
import { isSameUriPath, isUriPathUnder, isWhitespaceChar } from './utils';

/**
 * Scan lines from the document until it reaches a stopping character.
 * @param document the document
 * @param stopAt a function that returns true when this should stop reading
 * @param start the starting position, or the beginning of the document
 * @return the end position and the last character read (which might not be a stopAt char if this reaches the end of
 *         the document).
 */
export function scanLinesUntil(
  document: vscode.TextDocument,
  stopAt: (ch: string) => boolean,
  start?: vscode.Position
): { end: vscode.Position; ch: string | undefined } {
  let lineAdjust = 0;
  const startLine = start ? start.line : 0;
  let character = start ? start.character : 0;
  let ch: string | undefined;
  // read from the end of the last line of the range, until the predicate says to stop
  readline: for (; startLine + lineAdjust < document.lineCount; lineAdjust++) {
    const text = document.lineAt(startLine + lineAdjust).text;
    let i = character;
    for (; i < text.length; i++) {
      ch = text.charAt(i);
      if (stopAt(ch)) {
        character = i; // save off the line index, and break
        break readline;
      }
    }
    character = 0; // reset to beginning of next line
    ch = undefined;
  }
  return { end: document.validatePosition(new vscode.Position(startLine + lineAdjust, character)), ch };
}

/**
 * Calculate the document range that covers the specified json node.
 * @param node the node to cover
 * @param document the text document
 * @param includeExtras true to include a trailing (or leading if no trailing) whitespace, comma, and new line(s)
 *                      in the range.
 */
export function rangeForNode(node: JsonNode, document: vscode.TextDocument, includeExtras = false): vscode.Range {
  const start = document.positionAt(node.offset);
  let end = document.positionAt(node.offset + node.length);

  if (includeExtras) {
    // move past the node closer to the first non-whitespace char
    let adjusted = scanLinesUntil(document, ch => !isWhitespaceChar(ch), end);
    // if we found a comma after the node, read past any whitespace to the next text
    // REVIEWME: should we stop at the end of this line? That's what the 'remove' quickfix for unused typescript methods
    // does, whereas this way will also remove following empty lines
    if (adjusted.ch === ',') {
      adjusted = scanLinesUntil(document, ch => !isWhitespaceChar(ch), adjusted.end.translate({ characterDelta: 1 }));
      end = adjusted.end;
    }
    // TODO: if we don't find a trailing comma, look for a leading comma above, since the node should be the last
    // property in the parent object
  }
  return new vscode.Range(start, end);
}

export function isUriUnder(parent: vscode.Uri, file: vscode.Uri): boolean {
  return file.scheme === parent.scheme && file.authority === parent.authority && isUriPathUnder(parent.path, file.path);
}

export function isSameUri(uri1: vscode.Uri, uri2: vscode.Uri): boolean {
  return uri1.scheme === uri2.scheme && uri1.authority === uri2.authority && isSameUriPath(uri1.path, uri2.path);
}

/** Get the the basename of the path of a uri. */
export function uriBasename(uri: vscode.Uri): string {
  return path.basename(uri.path);
}

/** Create a new uri with a path that is the dirname of the uri. */
export function uriDirname(uri: vscode.Uri): vscode.Uri {
  return uri.with({ path: path.dirname(uri.path) });
}

/** Stat a uri, return undefined if it doesn't exist in the vscode filesystem. */
export async function uriStat(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
  try {
    return await vscode.workspace.fs.stat(uri);
  } catch (e) {
    // supposedly, stat() can only throw NotFound FileSystemErrors
    if (e instanceof vscode.FileSystemError) {
      return undefined;
    }
    throw e;
  }
}

/** uriReaddir() filter predicate function
 * @param entry relative-path to file and fileType
 * @return true to include, false to exclude from results
 */
type ReaddirFilter = (entry: [string, vscode.FileType]) => boolean;

/**
 * Find files and directories under the specified directory uri.
 * @param root the root directory uri
 * @param filter an optional filter function (true to include in the results, false to not)
 * @param recurse true (default) to recurse into subdirectories
 * @return an Array of relative-path and file type information for each found file/dir
 */
// TODO: controls for not-recursing into a folder, for skipping symlinked-folders, for having a max-depth
export function uriReaddir(
  root: vscode.Uri,
  filter?: ReaddirFilter,
  recurse = true
): Promise<Array<[string, vscode.FileType]>> {
  return _uriReaddir(root, '', recurse, filter);
}

async function _uriReaddir(
  dir: vscode.Uri,
  reldir: string,
  recurse: boolean,
  filter?: ReaddirFilter
): Promise<Array<[string, vscode.FileType]>> {
  const found = await vscode.workspace.fs.readDirectory(dir);
  let results = Promise.resolve([] as Array<[string, vscode.FileType]>);
  found.forEach(([name, fileType]) => {
    if (!filter || _filterReaddirEntry([name, fileType], dir, reldir, filter)) {
      results = results.then(all => {
        all.push([reldir ? path.join(reldir, name) : name, fileType]);
        return all;
      });
    }
    if (recurse && (fileType & vscode.FileType.Directory) !== 0) {
      const p = _uriReaddir(
        dir.with({ path: path.join(dir.path, name) }),
        reldir ? path.join(reldir, name) : name,
        recurse,
        filter
      );
      // let the recursion run, combining the results in order
      results = Promise.all([results, p]).then(([all, descendants]) => {
        all.push(...descendants);
        return all;
      });
    }
  });
  return results;
}

function _filterReaddirEntry(
  [name, fileType]: [string, vscode.FileType],
  dir: vscode.Uri,
  reldir: string,
  filter: ReaddirFilter
): boolean {
  return filter([reldir ? path.join(reldir, name) : name, fileType]);
}
