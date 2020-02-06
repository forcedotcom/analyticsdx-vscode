/*
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { expect } from 'chai';
// need to use native path fs and path calls for this unit test for reading files
import { promises as fs } from 'fs';
import { findNodeAtLocation, Node as JsonNode, parseTree } from 'jsonc-parser';
import * as path from 'path';
import { jsonPathToString } from '../../../src/util/jsoncUtils';
import { jsonpathSearch } from '../../../src/util/jsonpath';

// tslint:disable:no-unused-expression
describe('jsonpath jsonpathSearch()', () => {
  let dataflowText: string;
  let dataflow: JsonNode;
  before(async () => {
    dataflowText = await fs.readFile(
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        '..',
        'test-assets',
        'sfdx-simple',
        'jsonpathTest',
        'SalesAnalyticsDataflow.json'
      ),
      { encoding: 'utf-8' }
    );
    dataflow = parseTree(dataflowText);
  });

  [
    // simple search
    { count: 1, jsonpath: '$.workflowDefinition.Opportunities_No_Products' },
    // field ref'ed by []
    { count: 1, jsonpath: "$.workflowDefinition.Join_OpportunityOwner.parameters['left']" },
    // array item ref'ed by index
    {
      count: 1,
      jsonpath: '$.workflowDefinition.Opportunity_Custom_Filter_Flag.parameters.computedFields[0].saqlExpression'
    },
    // attribute search against array values
    {
      count: 6,
      jsonpath:
        "$.workflowDefinition.*.parameters.right_select[?(@=='OpportunityTeam.UserId' || @=='OpportunityTeam.User.Name' || @=='OpportunityTeam.TeamMemberRole')]"
    },
    // attribute search for objects
    {
      count: 23,
      jsonpath:
        "$.workflowDefinition..[?(@.action=='sfdcDigest')].parameters.fields[?(@.name=='CreatedDate'||@.name=='CloseDate'||@.name=='LastModifiedDate'||@.name=='LastActivityDate'||@.name=='ActivityDate')]"
    }
    // ,
    // // TODO: test for ones that don't work with the current 'jsonpath' module:
    // {
    //   count: 1,
    //   jsonpath: "$.workflowDefinition.*.parameters[?(@.source=='Join_AccountOwner_AccountTeam')].source"
    // },
    // {
    //   count: 7,
    //   jsonpath:
    //     '$..[?(@.right_select[1]=~/.*StageName.*/ || @.right_select[7]=~/.*StageName.*/ || @.right_select[8]=~/.*StageName.*/)].right_select'
    // },
    // {
    //   count: 5,
    //   jsonpath: '$..[?(@.right_select[1]=~/.*[$][{]Variables.Customer.fieldName[}].*/)].right_select'
    // },
    // {
    //   count: 1,
    //   jsonpath: '$.workflowDefinition..[?(@.parameters.source=~ /^.*Lead.*$/i)]'
    // }
    // FIXME: test for [0:] style jsonpath
  ].forEach(({ count, jsonpath }) => {
    it(`finds ${count} matches for ${jsonpath}`, () => {
      const locations = jsonpathSearch(jsonpath, dataflowText);
      expect(locations.length, 'count').to.equal(count);
      // make sure each returned value can be found in the object
      locations.forEach(location => {
        expect(findNodeAtLocation(dataflow, location), `matched ${jsonPathToString(location)} node`).to.be.not
          .undefined;
      });
    });
  });

  // FIXME: test for selectPropertyNode
  // FIXME: test for mulitple files
});
