import gql from 'graphql-tag';
import { GraphQLSchemaValidationError } from 'apollo-graphql';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { DocumentNode, GraphQLSchema, GraphQLError, Kind } from 'graphql';

import { QueryPlan } from '../..';
import { buildQueryPlan, buildOperationContext, BuildQueryPlanOptions } from '../buildQueryPlan';
import { getFederatedTestingSchema } from './execution-utils';

const buildQueryPlanFeature = loadFeature(
  './packages/apollo-gateway/src/__tests__/build-query-plan.feature'
);


const features = [
  buildQueryPlanFeature
];

const fs = require('fs')


var file = fs.createWriteStream('/Users/jemrayfield/cukes.txt');

features.forEach((feature) => {
  defineFeature(feature, (test) => {
    feature.scenarios.forEach((scenario) => {
      test(scenario.title, async ({ given, when, then }) => {
        let query: DocumentNode;
        let queryPlan: QueryPlan;
        let options: BuildQueryPlanOptions = { autoFragmentization: false };

        const { schema, errors } = getFederatedTestingSchema();

        if (errors && errors.length > 0) {
          throw new GraphQLSchemaValidationError(errors);
        }

        const givenQuery = () => {
          given(/^query$/im, (operation: string) => {
            query = gql(operation)
          })
        }

        const whenUsingAutoFragmentization = () => {
          when(/using autofragmentization/i, () => {
            options = { autoFragmentization: true };
          })
        }

        const thenQueryPlanShouldBe = () => {
          then(/^query plan$/i, (expectedQueryPlan: string) => {
            queryPlan = buildQueryPlan(
              buildOperationContext(schema, query, undefined),
              options
            );

            // write out the query plan..
            file.write(JSON.stringify(queryPlan))

            const parsedExpectedPlan = JSON.parse(expectedQueryPlan);

            expect(JSON.parse(JSON.stringify(queryPlan))).toEqual(parsedExpectedPlan);
          })
        }

        // step over each defined step in the .feature and execute the correct
        // matching step fn defined above
        scenario.steps.forEach(({ stepText }) => {
          const title = stepText.toLocaleLowerCase();
          if (title === "query") givenQuery();
          else if (title === "using autofragmentization") whenUsingAutoFragmentization();
          else if (title === "query plan") thenQueryPlanShouldBe();
          else throw new Error(`Unrecognized steps used in "build-query-plan.feature"`);
        });
      });
    });
  });
})





