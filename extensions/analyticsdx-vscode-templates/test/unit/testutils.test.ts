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
      const val = await waitFor(
        () => 'success',
        val => true
      );
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
        {
          pauseMs: 10,
          timeoutMs: 100
        }
      );
      expect(val).to.be.equals('success');
    });

    it('works on delayed predicate', async () => {
      let count = 0;
      const val = await waitFor(
        () => 'success',
        () => count++ !== 0,
        { pauseMs: 10, timeoutMs: 100 }
      );
      expect(val).to.be.equals('success');
    });

    it('timeouts on no match', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => 'failed',
          () => false,
          { pauseMs: 10, timeoutMs: 100 }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('timeout');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts with custom message', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => 'failed',
          () => false,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: 'Custom message'
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('Custom message');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts with custom message function', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => 'failed',
          () => false,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: result => `Custom message, result: ${result}`
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('Custom message, result: failed');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('still timeouts on error in custom message function', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => 'failed',
          () => false,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: result => {
              throw new Error('timeoutMessage error');
            }
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals(
          'timeout (error in timeoutMessage function: Error: timeoutMessage error)'
        );
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
          {
            pauseMs: 10,
            timeoutMs: 100,
            rejectOnError: false // don't reject on error, so this should timeout
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('timeout');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts on error with custom message function', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => {
            throw new Error('failed');
          },
          () => true,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: result => `Custom message, result: ${result}`,
            rejectOnError: false // don't reject on error, so this should timeout
          }
        );
      } catch (e) {
        // on an error, the value in the timeoutMessage should be undefined
        expect((e as Error).message, 'timeout error message').to.be.equals('Custom message, result: undefined');
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
          {
            pauseMs: 10,
            timeoutMs: 100
          }
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
          {
            pauseMs: 10,
            timeoutMs: 100
          }
        );
      } catch (e) {
        expect((e as Error).message, 'expected error').to.be.equals('expectedError');
        return;
      }
      expect.fail('Expected an error, got ' + val);
    });
  });

  describe('waitFor (Promises)', () => {
    it('works on immediate answer', async () => {
      const val = await waitFor(
        () => Promise.resolve('success'),
        val => true
      );
      expect(val).to.be.equals('success');
    });

    it('awaits answer', async () => {
      const val = await waitFor(
        () =>
          new Promise((resolve, reject) => {
            setTimeout(() => resolve('success'), 50);
          }),
        val => true,
        {
          pauseMs: 10,
          timeoutMs: 100
        }
      );
      expect(val).to.be.equals('success');
    });

    it('works on delayed answer', async () => {
      let count = 0;
      const val = await waitFor(
        () => {
          if (count !== 0) {
            return Promise.resolve('success');
          }
          count++;
          return Promise.resolve('failed');
        },
        val => val === 'success',
        {
          pauseMs: 10,
          timeoutMs: 100
        }
      );
      expect(val).to.be.equals('success');
    });

    it('works on delayed predicate', async () => {
      let count = 0;
      const val = await waitFor(
        () => Promise.resolve('success'),
        () => count++ !== 0,
        { pauseMs: 10, timeoutMs: 100 }
      );
      expect(val).to.be.equals('success');
    });

    it('timeouts on no match', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.resolve('failed'),
          () => false,
          { pauseMs: 10, timeoutMs: 100 }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('timeout');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts with custom message', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.resolve('failed'),
          () => false,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: 'Custom message'
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('Custom message');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts with custom message function', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.resolve('failed'),
          () => false,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: result => `Custom message, result: ${result}`
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('Custom message, result: failed');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('still timeouts on error in custom message function', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.resolve('failed'),
          () => false,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: result => {
              throw new Error('timeoutMessage error');
            }
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals(
          'timeout (error in timeoutMessage function: Error: timeoutMessage error)'
        );
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts on error', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.reject(new Error('failed')),
          () => true,
          {
            pauseMs: 10,
            timeoutMs: 100,
            rejectOnError: false // don't reject on error, so this should timeout
          }
        );
      } catch (e) {
        expect((e as Error).message, 'timeout error message').to.be.equals('timeout');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('timeouts on error with custom message function', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.reject(new Error('failed')),
          () => true,
          {
            pauseMs: 10,
            timeoutMs: 100,
            timeoutMessage: result => `Custom message, result: ${result}`,
            rejectOnError: false // don't reject on error, so this should timeout
          }
        );
      } catch (e) {
        // on an error, the value in the timeoutMessage should be undefined
        expect((e as Error).message, 'timeout error message').to.be.equals('Custom message, result: undefined');
        expect((e as Error).name, 'timeout error name').to.be.equals('timeout');
        return;
      }
      expect.fail('Expected a timeout, got ' + val);
    });

    it('errors on function error', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () => Promise.reject(new Error('expectedError')),
          () => true,
          {
            pauseMs: 10,
            timeoutMs: 100
          }
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
          () => Promise.resolve('failed'),
          () => {
            throw new Error('expectedError');
          },
          {
            pauseMs: 10,
            timeoutMs: 100
          }
        );
      } catch (e) {
        expect((e as Error).message, 'expected error').to.be.equals('expectedError');
        return;
      }
      expect.fail('Expected an error, got ' + val);
    });

    it('awaits function error', async () => {
      let val: string | undefined;
      try {
        val = await waitFor(
          () =>
            new Promise((resolve, reject) => {
              setTimeout(() => reject(new Error('expectedError')), 50);
            }),
          val => true,
          {
            pauseMs: 10,
            timeoutMs: 100
          }
        );
      } catch (e) {
        expect((e as Error).message, 'expected error').to.be.equals('expectedError');
        return;
      }
      expect.fail('Expected an error, got ' + val);
    });
  });
});
