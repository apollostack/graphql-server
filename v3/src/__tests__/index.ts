import { ApolloServer, gql } from "../index";
import { GraphQLSchemaModule } from "../types";

const testModule: GraphQLSchemaModule = {
  typeDefs: gql`
    type Book {
      title: String
      author: String
    }

    type Query {
      books: [Book]
    }
  `,
  resolvers: {
    Query: {
      books: () => [
        {
          title: "Harry Potter and the Chamber of Secrets",
          author: "J.K. Rowling"
        },
        {
          title: "Jurassic Park",
          author: "Michael Crichton"
        }
      ]
    }
  },
};

describe("ApolloServer", () => {
  it("can execute a query", async () => {
    const operation = await (new ApolloServer({
      modules: [testModule],
    })).executeOperation({
      request: {
        query: 'query GetBooks { books { author } }',
      },
    });

    expect(operation).toHaveProperty(['data', 'books', 0, 'author']);
    expect(operation).toHaveProperty('errors', undefined);
  });
});
