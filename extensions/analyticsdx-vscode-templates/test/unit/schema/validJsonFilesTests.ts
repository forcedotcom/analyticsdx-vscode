/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { generateJsonSchemaValidFilesTestSuite } from '../../testutils';

// create describe() testsuites for each of our json schema and the associated valid files json testfiles
const suites = [] as Array<Promise<any>>;

suites.push(
  import('../../../schemas/template-info-schema.json').then(schema =>
    generateJsonSchemaValidFilesTestSuite(
      schema,
      'template-info-schema.json',
      __dirname,
      'testfiles',
      'template-info',
      'valid'
    )
  )
);

suites.push(
  import('../../../schemas/folder-schema.json').then(schema =>
    generateJsonSchemaValidFilesTestSuite(schema, 'folder-schema.json', __dirname, 'testfiles', 'folder', 'valid')
  )
);

suites.push(
  import('../../../schemas/auto-install-schema.json').then(schema =>
    generateJsonSchemaValidFilesTestSuite(
      schema,
      'auto-install-schema.json',
      __dirname,
      'testfiles',
      'auto-install',
      'valid'
    )
  )
);

suites.push(
  import('../../../schemas/rules-schema.json').then(schema =>
    generateJsonSchemaValidFilesTestSuite(schema, 'rules-schema.json', __dirname, 'testfiles', 'rules', 'valid')
  )
);

suites.push(
  import('../../../schemas/ui-schema.json').then(schema =>
    generateJsonSchemaValidFilesTestSuite(schema, 'ui-schema.json', __dirname, 'testfiles', 'ui', 'valid')
  )
);
suites.push(
  import('../../../schemas/variables-schema.json').then(schema =>
    generateJsonSchemaValidFilesTestSuite(schema, 'variables-schema.json', __dirname, 'testfiles', 'variables', 'valid')
  )
);

// Run them when everything's loaded
// tslint:disable-next-line: no-floating-promises
Promise.all(suites).then(run);
