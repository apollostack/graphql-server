import gql from 'graphql-tag';
import {buildOperationContext, buildQueryPlan, QueryPlan} from '../../';
import { GraphQLError, GraphQLSchema } from "graphql";
import { getFederatedTestingSchema } from "../execution-utils";
import {optimiseEntityFetchInlineFragments} from "../../executeQueryPlan";
import {OperationContext} from "../../QueryPlan";

describe('ApolloGateway _entities optimisation', () => {
  let schema: GraphQLSchema;
  let errors: GraphQLError[];

  beforeEach(() => {
    ({ schema, errors } = getFederatedTestingSchema());
    expect(errors).toHaveLength(0);
  });


  it('removes unnecessary inline fragments', async () => {

    const query = gql`
      query {
        footballs(where: { size: { GTE: 4 } }) {
          __typename
          sku
          material
          colour
          size
        }
      }
    `;

    const context: OperationContext =
      buildOperationContext(schema, query, undefined);
    const queryPlan: QueryPlan = buildQueryPlan(context);

    // @ts-ignore
    const _entitiesFetch = queryPlan.node.nodes[1].node
    const representations = [
      {__typename: 'OutdoorFootball', upc: '200'}
    ]
    // Before optimisation
    const unoptimisedEntitiesQuery: string = "query($representations:[_Any!]!){" +
    "_entities(representations:$representations){" +
    "...on OutdoorFootball{colour}" +
    "...on IndoorFootball{colour}" +
    "...on NightFootball{colour}" +
    "...on VisuallyImpairedFootball{colour}}}"

    expect(_entitiesFetch.operation).toMatch(unoptimisedEntitiesQuery)

    // After optimisation
    const optimisedQuery: string = "query($representations:[_Any!]!){" +
      "_entities(representations:$representations){" +
      "...on OutdoorFootball{colour}}}"

    expect(optimiseEntityFetchInlineFragments(representations,
      _entitiesFetch).operation).toMatch(optimisedQuery)

  })

})
