import { ApolloServerBase } from '../ApolloServer';
import gql from 'graphql-tag';

const typeDefs = gql`
  type Query {
    hello: String
  }
`;

describe('ApolloServerBase dataSources', () => {
  it('initializes synchronous datasources from a datasource creator function', async () => {
    const initialize = jest.fn();

    const server = new ApolloServerBase({
      typeDefs,
      resolvers: {
        Query: {
          hello() {
            return 'world';
          }
        }
      },
      dataSources: () => ({ x: { initialize }, y: { initialize } })
    });

    await server.executeOperation({ query: "query { hello }"});

    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('initializes all async and sync datasources before calling resolvers', async () => {
    const INITIALIZE = "datasource initializer call";
    const METHOD_CALL = "datasource method call";

    const expectedCallOrder = [
      INITIALIZE,
      INITIALIZE,
      INITIALIZE,
      METHOD_CALL
    ];

    const actualCallOrder: string[] = [];

    const server = new ApolloServerBase({
      typeDefs,
      resolvers: {
        Query: {
          hello(_, __, context) {
            context.dataSources.x.getData();
            return "world";
          }
        },
      },
      dataSources: () => ({
        x: {
          initialize() {
            return Promise.resolve().then(
              () => { actualCallOrder.push(INITIALIZE); }
            );
          },
          getData() { actualCallOrder.push(METHOD_CALL); }
        },
        y: {
          initialize() {
            return new Promise(res => {
              setTimeout(() => {
                actualCallOrder.push(INITIALIZE);
                res();
              }, 0);
            });
          },
        },
        z: {
          initialize() { actualCallOrder.push(INITIALIZE); }
        }
      })
    });

    await server.executeOperation({ query: "query { hello }"});

    expect(actualCallOrder).toEqual(expectedCallOrder);
  });

  it('initializes datasources from an asynchronous datasource creator function', async () => {
    const initialize = jest.fn();

    const server = new ApolloServerBase({
      typeDefs,
      resolvers: {
        Query: {
          hello() {
            return 'world';
          }
        }
      },
      dataSources: async () => ({ x: { initialize }, y: { initialize } })
    });

    await server.executeOperation({ query: "query { hello }"});

    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('makes datasources available on resolver contexts', async () => {
    const message = 'hi from dataSource';
    const getData = jest.fn(() => message);

    const server = new ApolloServerBase({
      typeDefs,
      resolvers: {
        Query: {
          hello(_, __, context) {
            return context.dataSources.x.getData();
          }
        },
      },
      dataSources: () => ({ x: { initialize() {}, getData } })
    });

    const res = await server.executeOperation({ query: "query { hello }"});

    expect(getData).toHaveBeenCalled();
    expect(res.data?.hello).toBe(message);
  });
});
