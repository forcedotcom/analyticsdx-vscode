/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { parse, ParseError, printParseErrorCode } from 'jsonc-parser';

/**
 * Wait for the specified function to match against the predicate
 * @param func the fuction to call
 * @param predicate the predicate to match
 * @param pauseMs the pause between checks in ms.
 * @param timeoutMs the timeout, the returned promise will be rejected after this amount of time; the resulting Error
 *        will have a name of 'timeout'
 * @param rejectOnError true to reject the promise on any thrown error, false to continue.
 * @returns the return value from the matched call to the function.
 */
export function waitFor<T>(
  func: () => T | Promise<T>,
  predicate: (val: T) => boolean | undefined,
  {
    pauseMs = 300,
    timeoutMs = 5000,
    rejectOnError = true,
    timeoutMessage = 'timeout'
  }: {
    pauseMs?: number;
    timeoutMs?: number;
    rejectOnError?: boolean;
    timeoutMessage?: string | ((lastval: T | undefined) => string);
  } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = new Date().getTime();
    // call the func and check against predicate, will schedule itself if it doesn't resolve/reject
    async function check() {
      let val: T | undefined;
      try {
        val = await func();
        if (predicate(val)) {
          resolve(val);
          return;
        }
      } catch (e) {
        if (rejectOnError) {
          reject(e);
          return;
        }
      }
      // check for timeout
      if (new Date().getTime() - start >= timeoutMs) {
        const msg =
          typeof timeoutMessage === 'string'
            ? timeoutMessage
            : (() => {
                // still do the timeout reject(), even if timeoutMessage() fails
                try {
                  return timeoutMessage(val);
                } catch (e) {
                  return `timeout (error in timeoutMessage function: ${e})`;
                }
              })();
        const e = new Error(msg ?? 'timeout');
        e.name = 'timeout';
        reject(e);
        return;
      }
      // schedule this to run again
      setTimeout(check, pauseMs);
    }
    check().catch(reject);
  });
}

/** Convert a ParserError from jsonc-parser to a human-readable string. */
export function parseErrorToString(e: ParseError, text?: string): string {
  return (
    printParseErrorCode(e.error) +
    '[offset=' +
    e.offset +
    (text ? `, text="${text.substring(e.offset, e.offset + e.length)}"` : '') +
    ']'
  );
}

/** Parse json w/ comments to an object. */
export function jsoncParse(text: string, ignoreErrors = false): any {
  const errors: ParseError[] = [];
  const json = parse(text, errors, { disallowComments: false, allowTrailingComma: false });
  if (!ignoreErrors && errors.length > 0) {
    throw new Error(
      `JSONC parse failed with ${errors.length} error(s): ` + errors.map(e => parseErrorToString(e, text)).join(', ')
    );
  }
  return json;
}
