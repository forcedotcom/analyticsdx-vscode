/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { ICONS } from '../../src/constants';

describe('constants', () => {
  describe('ICONS.escape()', () => {
    it('escapes codicons', () => {
      const s = '$(error) $(warning) text';
      const updated = ICONS.escape(s);
      expect(updated).to.not.equal(s);
      expect(updated)
        .to.contain('(error)')
        .and.contain('(warning) text');
    });

    it('ignores plain text', () => {
      const s = 'some text';
      const updated = ICONS.escape(s);
      expect(updated).to.equal(s);
    });

    it('ignores undefined', () => {
      const s = undefined;
      const updated = ICONS.escape(s);
      expect(updated).to.equal(s);
    });
  });
});
