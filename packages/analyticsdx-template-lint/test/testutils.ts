/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import Ajv, { ErrorObject as AjvErrorObject, Options as AjvOptions } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { expect } from 'chai';
import * as fs from 'fs';
import { parse, ParseError, printParseErrorCode } from 'jsonc-parser';
import * as path from 'path';
import * as readdirp from 'readdirp';
import { promisify } from 'util';

/** Set an object field based on a '.'-seperated name. */
export function set(o: Record<string, unknown>, names: string, value: unknown) {
  let currentObject = o;
  names.split('.').forEach((name, i, all) => {
    if (i === all.length - 1) {
      currentObject[name] = value;
    } else {
      currentObject[name] = {};
      currentObject = currentObject[name] as Record<string, unknown>;
    }
  });
}

/** The file path to the sfdx-simple test project. */
export const sfdxTestProjectPath = path.join(__dirname, '..', '..', '..', '..', 'test-assets', 'sfdx-simple');
/** The file path to waveTemplates/ directory in the sfdx-simple test project. */
export const sfdxTestTemplatesPath = path.join(sfdxTestProjectPath, 'force-app', 'main', 'default', 'waveTemplates');

/** Convert an Ajv ParserError from jsonc-parser to a human-readable string. */
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

/** Find the diagnostics for a path-based uri */
export function getDiagnosticsForPath<Document extends { uri: string }, Diagnostic>(
  diagnostics: Map<Document, Diagnostic[]>,
  filepath: string | RegExp
): Diagnostic[] | undefined {
  for (const [doc, d] of diagnostics.entries()) {
    if (
      (typeof filepath === 'string' && doc.uri === filepath) ||
      (typeof filepath !== 'string' && filepath.test(doc.uri))
    ) {
      return d;
    }
  }
  return undefined;
}

/** Convert a map of diagnostics keyed by a document to a map keyed by the document path.
 */
export function getDiagnosticsByPath<Document extends { uri: string }, Diagnostic>(
  diagnostics: Map<Document, Diagnostic[]>
): Record<string, Diagnostic[]> {
  const m = {} as Record<string, Diagnostic[]>;
  diagnostics.forEach((d, doc) => {
    if (m[doc.uri]) {
      expect.fail(`Duplicate Document uri '${doc.uri}' found in diagnostics`);
    }
    m[doc.uri] = d;
  });
  return m;
}

function newVscodeAjv(options?: AjvOptions): Ajv {
  // we need allowUnionTypes on and strictRequired off for the anyOf's to work right w/ ajv
  const ajv = new Ajv({ allowUnionTypes: true, strictRequired: false, ...options });
  // tell ajv about the extra json-schema props that vscode supports
  ajv.addVocabulary([
    'allowComments',
    'defaultSnippets',
    'deprecationMessage',
    'doNotSuggest',
    'enumDescriptions',
    'patternErrorMessage'
  ]);
  return ajv;
}

/** Asynchronously generate a describe() testsuite for a json schema and a set of
 * test files, which should all be valid for the schema, using Ajv.
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
            const ajv = newVscodeAjv({ allErrors: true });
            const validator = ajv.compile(schema);
            const readFile = promisify(fs.readFile);

            entries.forEach(entry => {
              it(path.join(testFilesDir, entry.path), async () => {
                const json = await readFile(entry.fullPath, { encoding: 'utf-8' }).then(jsoncParse);
                const result = validator(json);
                if (!result || (validator.errors && validator.errors.length > 0)) {
                  const errorsText = betterAjvErrors(schema, json, validator.errors || [], { indent: 2 });
                  expect.fail('schema validation failed with errors:\n' + errorsText);
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

/** Create a function that uses Ajv to validate a file against a json schema, and return the resulting SchemaErrors. */
export function createRelPathValidateFn(schema: object, basedir: string): (relpath: string) => Promise<SchemaErrors> {
  return async function validate(relpath: string) {
    const ajv = newVscodeAjv({ allErrors: true });
    const validator = ajv.compile(schema);
    const json = await fs.promises.readFile(path.join(basedir, relpath), { encoding: 'utf-8' }).then(jsoncParse);
    const result = validator(json);
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
  private readonly unrecognizedErrors: AjvErrorObject[] = [];

  constructor(errors: AjvErrorObject[] | undefined | null) {
    if (errors) {
      errors.forEach(error => {
        // see https://ajv.js.org/api.html#validation-errors for details specific errors types
        if (error.keyword === 'required') {
          // this means a required field is missing
          let name = this.jsonPointerToJsonpath(error.instancePath || '') + '.' + error.params.missingProperty;
          // if it's nested, instancePath will be the parent field
          if (name.startsWith('.')) {
            name = name.substring(1);
          }
          this.missingProps.add(name);
        } else if (
          (error.keyword === 'const' ||
            error.keyword === 'pattern' ||
            error.keyword === 'oneOf' ||
            error.keyword === 'anyOf' ||
            error.keyword === 'type' ||
            error.keyword === 'enum' ||
            error.keyword === 'not' ||
            error.keyword === 'minItems' ||
            error.keyword === 'maxItems' ||
            error.keyword === 'minLength' ||
            error.keyword === 'maxLength' ||
            error.keyword === 'minimum' ||
            error.keyword === 'multipleOf') &&
          error.instancePath
        ) {
          // this means an invalid value in a field or wrong # of items in an array,
          // we'll usually get a bunch of these (with the same instancePath) per bad field
          let name = this.jsonPointerToJsonpath(error.instancePath);
          if (name.startsWith('.')) {
            name = name.substring(1);
          }
          this.invalidProps.add(name);
        } else if (error.keyword === 'additionalProperties') {
          // this means an object has a property that doesn't exist in the schema, or doesn't match the
          // patternProperties in the schema -- report this as invalid for now
          let name = this.jsonPointerToJsonpath(error.instancePath + '/' + error.params.additionalProperty);
          if (name.startsWith('.')) {
            name = name.substring(1);
          }
          this.invalidProps.add(name);
        } else if (error.keyword === 'if' && error.instancePath === '') {
          // we'll get this error if any of the top-level fields are missing, we can skip it since we
          // should also get a 'required' error with instancePath: ''
        } else {
          // add anything else to the unrecognizedErrors
          this.unrecognizedErrors.push(error);
        }
      });
    }
  }

  private jsonPointerToJsonpath(name: string): string {
    // ajv is going to give us jsonpointers like /foo/bar/1/properties/B A Z/type; this will try to convert
    // that to jsonpath style foo.bar[1].properties['B A Z'].type
    return name.split('/').reduce((path, part) => {
      // Note: this doesn't cover the full jsonpointer syntax (https://datatracker.ietf.org/doc/html/rfc6901),
      // but it should work for the current errors from our schemas during the unit tests.
      if (part) {
        if (part.match(/^[0-9]$/)) {
          path += `[${part}]`;
        } else if (part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)$/)) {
          path += (path ? '.' : '') + `${part}`;
        } else {
          path += `["${part}"]`;
        }
      }
      return path;
    }, '');
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
