import { ApolloServerBase, gql } from '@landingexp/apollo-server-core';
import createTestClient from '../createTestClient';

describe('createTestClient', () => {
  const typeDefs = gql`
    type Query {
      test(echo: String): String
      # this resolver uses context
      hello: String
    }

    type Mutation {
      increment: Int!
    }
  `;

  const resolvers = {
    Query: {
      test: (_, { echo }) => echo,
      hello: (_, __, { person }) => {
        return `hello ${person}`;
      },
    },
    Mutation: {
      increment: () => 1,
    },
  };

  const myTestServer = new ApolloServerBase({
    typeDefs,
    context: () => ({ person: 'tom' }),
    resolvers,
  });

  it('allows queries', async () => {
    const query = `{ test(echo: "foo") }`;
    const client = createTestClient(myTestServer);
    const res = await client.query({ query });
    expect(res.data).toEqual({ test: 'foo' });
  });

  it('allows mutations', async () => {
    const mutation = `mutation increment { increment }`;
    const client = createTestClient(myTestServer);
    const res = await client.mutate({ mutation });
    expect(res.data).toEqual({ increment: 1 });
  });

  it('allows variables to be passed', async () => {
    const query = `query test($echo: String){ test(echo: $echo) }`;
    const client = createTestClient(myTestServer);
    const res = await client.query({ query, variables: { echo: 'wow' } });
    expect(res.data).toEqual({ test: 'wow' });
  });

  it('works with generic types', async () => {
    const query = `query test($echo: String){ test(echo: $echo) }`;
    type Data = { test?: string | null; };
    type Variables = { echo: string; };
    const client = createTestClient(myTestServer);
    const res1 = await client.query<Data>({ query, variables: { echo: 'onlydata' } });
    expect(res1.data).toEqual({ test: 'onlydata' });
    const res2 = await client.query<Data, Variables>({ query, variables: { echo: 'data and variables' } });
    expect(res2.data).toEqual({ test: 'data and variables' });
  })

  it('resolves with context', async () => {
    const query = `{ hello }`;
    const client = createTestClient(myTestServer);
    const res = await client.query({ query });
    expect(res.data).toEqual({ hello: 'hello tom' });
  });

  it('allows query documents as input', async () => {
    const query = gql`
      {
        test(echo: "foo")
      }
    `;
    const client = createTestClient(myTestServer);
    const clientRes = await client.query({ query });
    expect(clientRes.data).toEqual({ test: 'foo' });

    const mutation = gql`
      mutation increment {
        increment
      }
    `;
    const mutationRes = await client.mutate({ mutation });
    expect(mutationRes.data).toEqual({ increment: 1 });
  });
});
