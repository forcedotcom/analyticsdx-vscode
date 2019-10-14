/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

type DisposableLike = { dispose: () => any };

/** A base class disposable that's a proxy for a list of disposables. */
export abstract class Disposable {
  constructor(protected readonly disposables = [] as DisposableLike[]) {}

  public dispose() {
    this.disposables.forEach(Disposable.safeDispose);
    this.disposables.length = 0;
  }

  public static safeDispose(disposable: DisposableLike) {
    try {
      disposable.dispose();
    } catch (e) {
      console.warn(e);
    }
  }
}
