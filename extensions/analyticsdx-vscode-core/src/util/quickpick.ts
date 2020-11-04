/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { ICONS } from '../constants';

class NoItemsQuickPickItem implements vscode.QuickPickItem {
  public readonly label: string;
  constructor(icon: string, mesg: string) {
    this.label = (icon ? `$(${icon}) ` : '') + ICONS.escape(mesg);
  }

  // have it always show, no matter what's in the filter text box
  get alwaysShow() {
    return true;
  }
}

/** A single-item showQuickPick that supports showing an inline progress bar, and handles the case where no items
 * are available by being non-selectable.
 * @param itemsOrPromise the items or a promise of the items (loading bar only shown for a promise)
 * @param options regular quick pick options (canPickMany ignored), plus additional options
 * @param options.noItemsMesg the message to show when there are no items
 * @param options.loadingMesg optional message to show when loading the items (only valid when itemsOrPromise is a
 *        promise)
 * @param options.loadingErrorMesg optional message or message generator function for when the items fails to load
 *        (only valid when itemsOrPromise is a promise, defaults to noItemsMesg)
 * @returns the selected item, or undefined on cancel or no items or error loading
 */
export async function showQuickPick<T extends vscode.QuickPickItem>(
  itemsOrPromise: T[] | Promise<T[]>,
  options: vscode.QuickPickOptions & {
    noItemsMesg: string;
    loadingMesg?: string;
    loadingErrorMesg?: string | ((e: Error | any) => string);
  }
): Promise<T | undefined> {
  const qp = vscode.window.createQuickPick<T | NoItemsQuickPickItem>();
  qp.matchOnDescription = !!options.matchOnDescription;
  qp.matchOnDetail = !!options.matchOnDetail;
  qp.placeholder = options.placeHolder;
  qp.ignoreFocusOut = !!options.ignoreFocusOut;
  qp.canSelectMany = false;
  qp.enabled = false;
  if (itemsOrPromise instanceof Promise && options.loadingMesg) {
    qp.items = [new NoItemsQuickPickItem('loading~spin', options.loadingMesg)];
  }
  qp.show();
  try {
    if (itemsOrPromise instanceof Promise) {
      qp.busy = true;
    }
    try {
      const items = await itemsOrPromise;
      if (items && items.length > 0) {
        // only enable the QuickPick if there are items
        qp.enabled = true;
        qp.items = items;
      } else {
        qp.items = [new NoItemsQuickPickItem('issues', options.noItemsMesg)];
      }
    } catch (e) {
      const mesg =
        (typeof options.loadingErrorMesg === 'string' && options.loadingErrorMesg) ||
        (typeof options.loadingErrorMesg === 'function' && options.loadingErrorMesg(e));
      qp.items = [new NoItemsQuickPickItem('error', mesg || options.noItemsMesg)];
    }
    qp.busy = false;
    // wait until something's either selected or they close it
    const result = await Promise.race([
      new Promise<T | NoItemsQuickPickItem>(resolve => qp.onDidAccept(() => resolve(qp.selectedItems[0]))),
      new Promise<undefined>(resolve => qp.onDidHide(() => resolve(undefined)))
    ]);
    return !result || result instanceof NoItemsQuickPickItem ? undefined : result;
  } finally {
    qp.dispose();
  }
}
