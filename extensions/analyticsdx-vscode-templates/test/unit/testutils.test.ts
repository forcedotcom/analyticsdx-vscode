/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
import { waitFor } from '../testutils';

describe('testutils', () => {
  describe('waitFor', () => {
    it('works on immediate answer', async () => {
      const val = await waitFor(() => 'success', val => true);
      expect(val).to.be.equals('success');
    });

    it('works on delayed answer', async () => {
      let count = 0;
      const val = await waitFor(
        () => {
          if (count !== 0) {
            return 'success';
          }
          count++;
          return 'failed';
        },
        val => val === 'success',
        10,
        100
      );
      expect(val).to.be.equals('success');
    });

    it('works on delayed predicate', async () => {
      let count = 0;
      const val = await waitFor(() => 'success', () => count++ !== 0, 10, 100);
      expect(val).to.be.equals('success');
    });

    it('timeouts on no match', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(() => 'failed', () => false, 10, 100);
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('timeout');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts on error', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => {
            throw new Error('failed');
          },
          () => true,
          10,
          100,
          false // don't reject on error, so this should timeout
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('timeout');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('errors on function error', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => {
            throw new Error('expectedError');
          },
          () => true,
          10,
          100
        );
      } catch (e) {
        expect((e as Error).message, 'expected error').to.be.equals('expectedError');
        return;
      }
      expect.fail('Expected an error, got ' + val);
    });

    it('errors on predicate error', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => 'failed',
          () => {
            throw new Error('expectedError');
          },
          10,
          100
        );
      } catch (e) {
        expect((e as Error).message, 'expected error').to.be.equals('expectedError');
        return;
      }
      expect.fail('Expected an error, got ' + val);
    });
  });
});
