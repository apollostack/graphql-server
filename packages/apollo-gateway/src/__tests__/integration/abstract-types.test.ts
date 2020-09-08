import gql from 'graphql-tag';
import { execute } from '../execution-utils';

import { astSerializer, queryPlanSerializer } from '../../snapshotSerializers';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

it('handles an abstract type from the base service', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        upc
        name
        price
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({
    product: {
      upc,
      name: 'Table',
      price: '899',
    },
  });

  expect(queryPlan).toCallService('product');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                upc
                __typename
                isbn
                price
              }
              ... on OutdoorFootball {
                upc
                name
                price
              }
              ... on IndoorFootball {
                upc
                name
                price
              }
              ... on Furniture {
                upc
                name
                price
              }
              ... on NightFootball {
                upc
                name
                price
              }
              ... on VisuallyImpairedFootball {
                upc
                name
                price
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "books") {
            {
              ... on Book {
                __typename
                isbn
              }
            } =>
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            }
          },
        },
        Flatten(path: "product") {
          Fetch(service: "product") {
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            } =>
            {
              ... on Book {
                name
              }
            }
          },
        },
      },
    }
  `);
});

it('can request fields on extended interfaces', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        inStock
      }
    }
  `;

  const upc = '1';

  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({ product: { inStock: true } });
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('inventory');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                __typename
                isbn
              }
              ... on OutdoorFootball {
                __typename
                sku
              }
              ... on IndoorFootball {
                __typename
                sku
              }
              ... on Furniture {
                __typename
                sku
              }
              ... on NightFootball {
                __typename
                sku
              }
              ... on VisuallyImpairedFootball {
                __typename
                sku
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "inventory") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on OutdoorFootball {
                __typename
                sku
              }
              ... on IndoorFootball {
                __typename
                sku
              }
              ... on Furniture {
                __typename
                sku
              }
              ... on NightFootball {
                __typename
                sku
              }
              ... on VisuallyImpairedFootball {
                __typename
                sku
              }
            } =>
            {
              ... on Furniture {
                inStock
              }
            }
          },
        },
      },
    }
  `);
});

it('can request fields on extended types that implement an interface', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        inStock
        ... on Furniture {
          isHeavy
        }
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({ product: { inStock: true, isHeavy: false } });
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('inventory');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                __typename
                isbn
              }
              ... on OutdoorFootball {
                __typename
                sku
              }
              ... on IndoorFootball {
                __typename
                sku
              }
              ... on Furniture {
                __typename
                sku
              }
              ... on NightFootball {
                __typename
                sku
              }
              ... on VisuallyImpairedFootball {
                __typename
                sku
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "inventory") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on OutdoorFootball {
                __typename
                sku
              }
              ... on IndoorFootball {
                __typename
                sku
              }
              ... on Furniture {
                __typename
                sku
              }
              ... on NightFootball {
                __typename
                sku
              }
              ... on VisuallyImpairedFootball {
                __typename
                sku
              }
            } =>
            {
              ... on Furniture {
                inStock
                isHeavy
              }
            }
          },
        },
      },
    }
  `);
});

it('prunes unfilled type conditions', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        inStock
        ... on Furniture {
          isHeavy
        }
        ... on Book {
          isCheckedOut
        }
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({ product: { inStock: true, isHeavy: false } });
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('inventory');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                __typename
                isbn
              }
              ... on OutdoorFootball {
                __typename
                sku
              }
              ... on IndoorFootball {
                __typename
                sku
              }
              ... on Furniture {
                __typename
                sku
              }
              ... on NightFootball {
                __typename
                sku
              }
              ... on VisuallyImpairedFootball {
                __typename
                sku
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "inventory") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on OutdoorFootball {
                __typename
                sku
              }
              ... on IndoorFootball {
                __typename
                sku
              }
              ... on Furniture {
                __typename
                sku
              }
              ... on NightFootball {
                __typename
                sku
              }
              ... on VisuallyImpairedFootball {
                __typename
                sku
              }
            } =>
            {
              ... on Furniture {
                inStock
                isHeavy
              }
            }
          },
        },
      },
    }
  `);
});

it('fetches interfaces returned from other services', async () => {
  const query = `#graphql
    query GetUserAndProducts {
      me {
        reviews {
          product {
            price
            ... on Book {
              title
            }
          }
        }
      }
    }
  `;

  const { data, queryPlan } = await execute({
    query,
  });

  expect(data).toEqual({
    me: {
      reviews: [
        { product: { price: '899' } },
        { product: { price: '1299' } },
        { product: { price: '49', title: 'Design Patterns' } },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "accounts") {
          {
            me {
              __typename
              id
            }
          }
        },
        Flatten(path: "me") {
          Fetch(service: "reviews") {
            {
              ... on User {
                __typename
                id
              }
            } =>
            {
              ... on User {
                reviews {
                  product {
                    __typename
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
                  }
                }
              }
            }
          },
        },
        Parallel {
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "product") {
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
                  price
                }
                ... on Furniture {
                  price
                }
              }
            },
          },
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "books") {
              {
                ... on Book {
                  __typename
                  isbn
                }
              } =>
              {
                ... on Book {
                  title
                }
              }
            },
          },
        },
      },
    }
  `);
});

it('fetches composite fields from a foreign type casted to an interface [@provides field]', async () => {
  const query = `#graphql
    query GetUserAndProducts {
      me {
        reviews {
          product {
            price
            ... on Book {
              name
            }
          }
        }
      }
    }
  `;

  const { data, queryPlan } = await execute({
    query,
  });

  expect(data).toEqual({
    me: {
      reviews: [
        { product: { price: '899' } },
        { product: { price: '1299' } },
        { product: { price: '49', name: 'Design Patterns (1995)' } },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "accounts") {
          {
            me {
              __typename
              id
            }
          }
        },
        Flatten(path: "me") {
          Fetch(service: "reviews") {
            {
              ... on User {
                __typename
                id
              }
            } =>
            {
              ... on User {
                reviews {
                  product {
                    __typename
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
                  }
                }
              }
            }
          },
        },
        Parallel {
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "product") {
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
                  price
                }
                ... on Furniture {
                  price
                }
              }
            },
          },
          Sequence {
            Flatten(path: "me.reviews.@.product") {
              Fetch(service: "books") {
                {
                  ... on Book {
                    __typename
                    isbn
                  }
                } =>
                {
                  ... on Book {
                    __typename
                    isbn
                    title
                    year
                  }
                }
              },
            },
            Flatten(path: "me.reviews.@.product") {
              Fetch(service: "product") {
                {
                  ... on Book {
                    __typename
                    isbn
                    title
                    year
                  }
                } =>
                {
                  ... on Book {
                    name
                  }
                }
              },
            },
          },
        },
      },
    }
  `);
});

it('allows for extending an interface from another service with fields', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        reviews {
          body
        }
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({
    product: {
      reviews: [{ body: 'Love it!' }, { body: 'Prefer something else.' }],
    },
  });

  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
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
            }
          }
        },
        Flatten(path: "product") {
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
              ... on Furniture {
                reviews {
                  body
                }
              }
            }
          },
        },
      },
    }
  `);
});

describe('unions', () => {
  it('handles unions from the same service', async () => {
    const query = `#graphql
      query GetUserAndProducts {
        me {
          reviews {
            product {
              price
              ... on Furniture {
                brand {
                  ... on Ikea {
                    asile
                  }
                  ... on Amazon {
                    referrer
                  }
                }
              }
            }
          }
        }
      }
    `;

    const { data, queryPlan } = await execute({
      query,
    });

    expect(data).toEqual({
      me: {
        reviews: [
          { product: { price: '899', brand: { asile: 10 } } },
          {
            product: {
              price: '1299',
              brand: { referrer: 'https://canopy.co' },
            },
          },
          { product: { price: '49' } },
        ],
      },
    });

    expect(queryPlan).toCallService('accounts');
    expect(queryPlan).toCallService('reviews');
    expect(queryPlan).toCallService('product');
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "accounts") {
            {
              me {
                __typename
                id
              }
            }
          },
          Flatten(path: "me") {
            Fetch(service: "reviews") {
              {
                ... on User {
                  __typename
                  id
                }
              } =>
              {
                ... on User {
                  reviews {
                    product {
                      __typename
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
                    }
                  }
                }
              }
            },
          },
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "product") {
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
                  price
                }
                ... on Furniture {
                  price
                  brand {
                    __typename
                    ... on Ikea {
                      asile
                    }
                    ... on Amazon {
                      referrer
                    }
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  it("doesn't expand interfaces with inline type conditions if all possibilities are fufilled by one service", async () => {
    const query = `#graphql
      query GetProducts {
        topProducts {
          name
        }
      }
    `;

    const { queryPlan, errors } = await execute({ query }, [
      {
        name: 'products',
        typeDefs: gql`
          extend type Query {
            topProducts: [Product]
          }

          interface Product {
            name: String
          }

          type Shoe implements Product {
            name: String
          }

          type Car implements Product {
            name: String
          }
        `,
      },
    ]);

    expect(errors).toBeUndefined();
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "products") {
          {
            topProducts {
              __typename
              name
            }
          }
        },
      }
    `);
  });

  // FIXME: turn back on when extending unions is supported in composition
  it.todo('fetches unions across services');
  // async () => {
  //   const query = gql`
  //     query GetUserAndProducts {
  //       me {
  //         account {
  //           ... on LibraryAccount {
  //             library {
  //               name
  //             }
  //           }
  //           ... on SMSAccount {
  //             number
  //           }
  //         }
  //       }
  //     }
  //   `;

  //   const { data, queryPlan } = await execute(
  //     {
  //       query,
  //     },
  //   );

  //   expect(data).toEqual({
  //     me: {
  //       account: {
  //         library: {
  //           name: 'NYC Public Library',
  //         },
  //       },
  //     },
  //   });

  //   expect(queryPlan).toCallService('accounts');
  //   expect(queryPlan).toCallService('books');
  // });
});
