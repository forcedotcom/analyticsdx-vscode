/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { ERRORS } from '../../src/constants';

describe('constants', () => {
  describe('ERRORS', () => {
    it('has no duplicate error codes', () => {
      // errorCode -> [fieldNames with that value]
      const dups = Object.keys(ERRORS).reduce((map, errorName) => {
        const errorCode = (ERRORS as Record<string, string>)[errorName];
        const names = map.get(errorCode) || [];
        names.push(errorName);
        map.set(errorCode, names);
        return map;
      }, new Map<string, string[]>());
      // delete non-duplicate codes
      dups.forEach((names, code) => {
        if (names.length <= 1) {
          dups.delete(code);
        }
      });
      if (dups.size >= 1) {
        let mesg = '';
        dups.forEach((names, code) => {
          if (mesg.length > 0) {
            mesg += ', ';
          }
          mesg += `'${code}' -> [${names.join(', ')}]`;
        });
        expect.fail(`Found duplicate error code(s) reference by more than one field: ${mesg}`);
      }
    });
  });
});
