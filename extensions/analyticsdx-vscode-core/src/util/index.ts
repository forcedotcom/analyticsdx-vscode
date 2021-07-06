/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as vscode from 'vscode';
import { nls } from '../messages';

export const okText = nls.localize('ok');

/** Show a confirmation modal dialog to the user.
 * @param mesg the message to show.
 * @return true if accepted, false if not.
 */
export async function showConfirmModal(mesg: string): Promise<boolean> {
  const selection = await vscode.window.showWarningMessage(
    mesg,
    {
      // put this right up front, otherwise it gets hidden in the corner of vscode
      modal: true
    },
    // https://github.com/Microsoft/vscode/issues/71251
    // Note: you always get a Cancel button, and for modals (at least on Mac),
    // it will always put the first item on the rhs, then Cancel left of that,
    // and then any other options left of that, which makes it impossible to do
    // a decent Yes/No confirm dialog, so we're going with Ok/Cancel
    okText
  );
  return selection === okText;
}
