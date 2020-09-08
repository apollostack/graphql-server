import gql from 'graphql-tag';
import { execute } from '../execution-utils';
import { astSerializer, queryPlanSerializer } from '../../snapshotSerializers';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('value types', () => {
  it('resolves value types within their respective services', async () => {
    const query = `#graphql
      fragment Metadata on MetadataOrError {
        ... on KeyValue {
          key
          value
        }
        ... on Error {
          code
          message
        }
      }

      query ProducsWithMetadata {
        topProducts(first: 10) {
          upc
          ... on Book {
            metadata {
              ...Metadata
            }
          }
          ... on Furniture {
            metadata {
              ...Metadata
            }
          }
          reviews {
            metadata {
              ...Metadata
            }
          }
        }
      }
    `;

    const { data, errors, queryPlan } = await execute({
      query,
    });

    expect(errors).toBeUndefined();

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "product") {
            {
              topProducts(first: 10) {
                __typename
                ... on Book {
                  upc
                  __typename
                  isbn
                }
                ... on OutdoorFootball {
                  upc
                  __typename
                }
                ... on IndoorFootball {
                  upc
                  __typename
                }
                ... on Furniture {
                  upc
                  metadata {
                    __typename
                    ... on KeyValue {
                      key
                      value
                    }
                    ... on Error {
                      code
                      message
                    }
                  }
                  __typename
                }
                ... on NightFootball {
                  upc
                  __typename
                }
                ... on VisuallyImpairedFootball {
                  upc
                  __typename
                }
              }
            }
          },
          Parallel {
            Flatten(path: "topProducts.@") {
              Fetch(service: "books") {
                {
                  ... on Book {
                    __typename
                    isbn
                  }
                } =>
                {
                  ... on Book {
                    metadata {
                      __typename
                      ... on KeyValue {
                        key
                        value
                      }
                      ... on Error {
                        code
                        message
                      }
                    }
                  }
                }
              },
            },
            Flatten(path: "topProducts.@") {
              Fetch(service: "reviews") {
                {
                  ... on Book {
                    __typename
                    isbn
                  }
                  ... on OutdoorFootball {
                    __typename
                    upc
                  }
                  ... on IndoorFootball {
                    __typename
                    upc
                  }
                  ... on Furniture {
                    __typename
                    upc
                  }
                  ... on NightFootball {
                    __typename
                    upc
                  }
                  ... on VisuallyImpairedFootball {
                    __typename
                    upc
                  }
                } =>
                {
                  ... on Book {
                    reviews {
                      metadata {
                        __typename
                        ... on KeyValue {
                          key
                          value
                        }
                        ... on Error {
                          code
                          message
                        }
                      }
                    }
                  }
                  ... on OutdoorFootball {
                    reviews {
                      metadata {
                        __typename
                        ... on KeyValue {
                          key
                          value
                        }
                        ... on Error {
                          code
                          message
                        }
                      }
                    }
                  }
                  ... on Furniture {
                    reviews {
                      metadata {
                        __typename
                        ... on KeyValue {
                          key
                          value
                        }
                        ... on Error {
                          code
                          message
                        }
                      }
                    }
                  }
                }
              },
            },
          },
        },
      }
    `);

    const [furniture, , , , book] = data!.topProducts;

    // Sanity check, referenceable ID
    expect(furniture.upc).toEqual('1');
    // Value type resolves from the correct service
    expect(furniture.metadata[0]).toEqual({
      key: 'Condition',
      value: 'excellent',
    });

    // Value type from a different service (reviews) also resolves correctly
    expect(furniture.reviews[0].metadata[0]).toEqual({
      code: 418,
      message: "I'm a teapot",
    });

    // Sanity check, referenceable ID
    expect(book.upc).toEqual('0136291554');
    // Value type as a union resolves correctly
    expect(book.metadata).toEqual([
      {
        key: 'Condition',
        value: 'used',
      },
      {
        code: 401,
        message: 'Unauthorized',
      },
    ]);

    expect(queryPlan).toCallService('product');
    expect(queryPlan).toCallService('books');
    expect(queryPlan).toCallService('reviews');
  });

  it('resolves @provides fields on value types correctly via contrived example', async () => {
    const firstService = {
      name: 'firstService',
      typeDefs: gql`
        extend type Query {
          valueType: ValueType
        }

        type ValueType {
          id: ID!
          user: User! @provides(fields: "id name")
        }

        extend type User @key(fields: "id") {
          id: ID! @external
          name: String! @external
        }
      `,
      resolvers: {
        Query: {
          valueType() {
            return { id: '123', user: { id: '1', name: 'trevor' } };
          },
        },
      },
    };

    const secondService = {
      name: 'secondService',
      typeDefs: gql`
        extend type Query {
          otherValueType: ValueType
        }

        type ValueType {
          id: ID!
          user: User! @provides(fields: "id name")
        }

        extend type User @key(fields: "id") {
          id: ID! @external
          name: String! @external
        }
      `,
      resolvers: {
        Query: {
          otherValueType() {
            return { id: '456', user: { id: '2', name: 'james' } };
          },
        },
      },
    };

    const userService = {
      name: 'userService',
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          name: String!
          address: String!
        }
      `,
      resolvers: {
        User: {
          __resolveReference(user: any) {
            return user.id === '1'
              ? { id: '1', name: 'trevor', address: '123 Abc St' }
              : { id: '2', name: 'james', address: '456 Hello St.' };
          },
        },
      },
    };

    const query = `#graphql
      query Hello {
        valueType {
          id
          user {
            id
            name
            address
          }
        }
        otherValueType {
          id
          user {
            id
            name
            address
          }
        }
      }
    `;

    const { data, errors, queryPlan } = await execute(
      {
        query,
      },
      [firstService, secondService, userService],
    );

    expect(errors).toBeUndefined();
    expect(queryPlan).toCallService('firstService');
    expect(queryPlan).toCallService('secondService');
    expect(queryPlan).toCallService('userService');
    expect(data).toMatchInlineSnapshot(`
      Object {
        "otherValueType": Object {
          "id": "456",
          "user": Object {
            "address": "456 Hello St.",
            "id": "2",
            "name": "james",
          },
        },
        "valueType": Object {
          "id": "123",
          "user": Object {
            "address": "123 Abc St",
            "id": "1",
            "name": "trevor",
          },
        },
      }
    `);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Parallel {
          Sequence {
            Fetch(service: "firstService") {
              {
                valueType {
                  id
                  user {
                    id
                    name
                    __typename
                  }
                }
              }
            },
            Flatten(path: "valueType.user") {
              Fetch(service: "userService") {
                {
                  ... on User {
                    __typename
                    id
                  }
                } =>
                {
                  ... on User {
                    address
                  }
                }
              },
            },
          },
          Sequence {
            Fetch(service: "secondService") {
              {
                otherValueType {
                  id
                  user {
                    id
                    name
                    __typename
                  }
                }
              }
            },
            Flatten(path: "otherValueType.user") {
              Fetch(service: "userService") {
                {
                  ... on User {
                    __typename
                    id
                  }
                } =>
                {
                  ... on User {
                    address
                  }
                }
              },
            },
          },
        },
      }
    `);
  });
});
