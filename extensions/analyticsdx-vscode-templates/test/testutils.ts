/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import * as Ajv from 'ajv';
import { expect } from 'chai';
import * as fs from 'fs';
import { parse, ParseError, printParseErrorCode } from 'jsonc-parser';
import * as path from 'path';
import * as readdirp from 'readdirp';
import { promisify } from 'util';

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
  func: () => T,
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
    function check() {
      let val: T | undefined;
      try {
        val = func();
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
    check();
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

/** Asynchronously generate a describe() testsuite for a json schema and a set of
 * test files, which should all be valid for the schema.
 * @param schema the json schema (as a json object)
 * @param schemaName the name of the schema (for the describe()'s name)
 * @param basedir the base directory (typically __dirname)
 * @param testFilesPath the path to the test files, relative to basedir
 * @return a promise of the testsuite, use .then(run) to hook it up to mocha's execution
 */
export function generateJsonSchemaValidFilesTestSuite(
  schema: object,
  schemaName: string,
  basedir: string,
  ...testFilesPath: string[]
) {
  const testFilesDir = path.join(...testFilesPath);
  const dir = path.join(basedir, testFilesDir);
  // find all the files under the directory, and make a test for each that verifies it's schema valid
  // Note: for the run() to work, this needs the --delay on _mocha in the test:unit script in package.json
  return (
    readdirp
      .promise(dir, { type: 'files' })
      .then(entries => {
        // make a testsuite that just fails if we didn't find any test files
        if (entries.length <= 0) {
          return describe(schemaName + ' validation test', () => {
            it('missing test files', () => {
              expect.fail('No files found under ' + basedir);
            });
          });
        } else {
          // we have to make the describe() in the async callback so that it works w/ run() and --delay in mocha
          return describe(schemaName + ' validates files', () => {
            const ajv = new Ajv({ allErrors: true });
            const validator = ajv.compile(schema);
            const readFile = promisify(fs.readFile);

            entries.forEach(entry => {
              it(path.join(testFilesDir, entry.path), async () => {
                const json = await readFile(entry.fullPath, { encoding: 'utf-8' }).then(jsoncParse);
                const result = await validator(json);
                if (!result || (validator.errors && validator.errors.length > 0)) {
                  expect.fail(
                    'schema validation failed with errors:\n' + ajv.errorsText(validator.errors, { separator: ',\n' })
                  );
                }
              });
            });
          });
        }
      })
      // make a testsuite that fails if we get an error find test files
      .catch(error => {
        return Promise.resolve(
          describe(schemaName + ' validation test', () => {
            it('error loading test files', () => {
              expect.fail('' + error);
            });
          })
        );
      })
  );
}

export function createRelPathValidateFn(schema: object, basedir: string): (relpath: string) => Promise<SchemaErrors> {
  const ajv = new Ajv({ allErrors: true });
  const validator = ajv.compile(schema);
  const readFile = promisify(fs.readFile);

  return async function validate(relpath: string) {
    const json = await readFile(path.join(basedir, relpath), { encoding: 'utf-8' }).then(jsoncParse);
    const result = await validator(json);
    if (result || !validator.errors || validator.errors.length <= 0) {
      expect.fail('Expected validation errors on ' + relpath);
    }
    return new SchemaErrors(validator.errors);
  };
}
/** Helper class for processing Ajv errors from doing schema validation. */
export class SchemaErrors {
  private readonly missingProps = new Set<string>();
  private readonly invalidProps = new Set<string>();
  private readonly unrecognizedErrors: Ajv.ErrorObject[] = [];

  constructor(errors: Ajv.ErrorObject[] | undefined | null) {
    if (errors) {
      errors.forEach(error => {
        if (error.keyword === 'required') {
          // this means a required field is missing
          let name =
            this.cleanDataPath(error.dataPath || '') + '.' + (error.params as Ajv.RequiredParams).missingProperty;
          // if it's nested, dataPath will be the parent field
          if (name.startsWith('.')) {
            name = name.substring(1);
          }
          this.missingProps.add(name);
        } else if (
          (error.keyword === 'const' ||
            error.keyword === 'pattern' ||
            error.keyword === 'oneOf' ||
            error.keyword === 'type' ||
            error.keyword === 'enum' ||
            error.keyword === 'not' ||
            error.keyword === 'minItems' ||
            error.keyword === 'maxItems' ||
            error.keyword === 'minLength' ||
            error.keyword === 'maxLength') &&
          error.dataPath
        ) {
          // this means an invalid value in a field or wrong # of items in an array,
          // we'll usually get a bunch of these (with the same dataPath) per bad field
          let name = this.cleanDataPath(error.dataPath);
          if (name.startsWith('.')) {
            name = name.substring(1);
          }
          this.invalidProps.add(name);
        } else if (error.keyword === 'additionalProperties') {
          // this means an object has a property that doesn't exist in the schema -- report this as invalid for now
          let name = this.cleanDataPath(error.dataPath);
          if (name.startsWith('.')) {
            name = name.substring(1);
          }
          if (name) {
            name += '.';
          }
          name += (error.params as Ajv.AdditionalPropertiesParams).additionalProperty;
          this.invalidProps.add(name);
        } else if (error.keyword === 'if' && error.dataPath === '') {
          // we'll get this error if any of the top-level fields are missing, we can skip it since we
          // should also get a 'required' error with dataPath: ''
        } else {
          // add anything else to the unrecognizedErrors
          this.unrecognizedErrors.push(error);
        }
      });
    }
  }

  private cleanDataPath(name: string): string {
    // for some errors, Ajv will give us dataPaths like "['foo'].bar.properties['baz'].type"; this will try to convert
    // that to foo.bar.properties.baz.type (assuming 'foo' and 'baz' are valid unqouted javascript ids)
    return name.replace(/\['([a-zA-Z_][a-zA-Z0-9_]*)'\]/g, '.$1');
  }

  public expectMissingProps(exact: boolean, ...names: string[]) {
    const notMissing: string[] = [];
    const extra: string[] = [];
    names.forEach(name => {
      if (!this.missingProps.has(name)) {
        notMissing.push(name);
      }
    });
    if (exact) {
      this.missingProps.forEach(name => {
        if (!names.includes(name)) {
          extra.push(name);
        }
      });
    }
    if (notMissing.length > 0 && extra.length > 0) {
      expect.fail(
        'Expected these properties to reported as missing: [' +
          notMissing.join(', ') +
          '], but not these: [' +
          extra.join(', ') +
          ']'
      );
    } else if (notMissing.length > 0) {
      expect.fail('Expected these properties to reported as missing: ' + notMissing.join(', '));
    } else if (extra.length > 0) {
      expect.fail('Expected these properties to not be reported as missing: ' + extra.join(', '));
    }
  }

  public expectNoMissingProps() {
    this.expectMissingProps(true);
  }

  public expectInvalidProps(exact: boolean, ...names: string[]) {
    const notInvalid: string[] = [];
    const extra: string[] = [];
    names.forEach(name => {
      if (!this.invalidProps.has(name)) {
        notInvalid.push(name);
      }
    });
    if (exact) {
      this.invalidProps.forEach(name => {
        if (!names.includes(name)) {
          extra.push(name);
        }
      });
    }
    if (notInvalid.length > 0 && extra.length > 0) {
      expect.fail(
        'Expected these properties to reported as invalid: [' +
          notInvalid.join(', ') +
          '], but not these: [' +
          extra.join(', ') +
          ']'
      );
    } else if (notInvalid.length > 0) {
      expect.fail('Expected these properties to reported as invalid: ' + notInvalid.join(', '));
    } else if (extra.length > 0) {
      expect.fail('Expected these properties to not be reported as invalid: ' + extra.join(', '));
    }
  }

  public expectNoInvalidProps() {
    this.expectInvalidProps(true);
  }

  public expectNoUnrecognizedErrors() {
    if (this.unrecognizedErrors.length > 0) {
      expect.fail('Expected no unrecognized errors:\n' + JSON.stringify(this.unrecognizedErrors, undefined, 2));
    }
  }
}
