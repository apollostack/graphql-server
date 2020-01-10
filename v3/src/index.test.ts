import { Apollo, gql, Schema } from ".";

const Books = () => Schema`Books Schema`({
  typeDefs: gql`
    type Book {
      title: String
      author: String
    }

    extend type Query {
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
  }
})

const Authors = () => Schema`Authors Schema`({
  typeDefs: gql`
    type Author {
      name: String
      nationality: String
    }

    extend type Query {
      authors: [Author]
    }
  `,
  resolvers: {
    Query: {
      authors: () => [
        {
          name: "J.K. Rowling",
          nationality: "British"
        },
        {
          name: "Michael Crichton",
          nationality: "American"
        }
      ]
    }
  }
})

describe("ApolloServer", () => {
  it("can execute a query", async () => {
    const server = await Apollo(() => {
      Books();
    });

    const operation = await server.executeOperation({
      query: "query GetBooks { books { author } }"
    });

    expect(operation).toHaveProperty(["data", "books", 0, "author"]);
    expect(operation).toHaveProperty("errors", undefined);
  });

  it("can merge modules", async () => {
    const server = await Apollo(() => {
      Books();
      Authors();
    });

    const authors = await server.executeOperation({
      query: "query GetAuthors { authors { name nationality } }"
    });

    expect(authors).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "authors": Array [
            Object {
              "name": "J.K. Rowling",
              "nationality": "British",
            },
            Object {
              "name": "Michael Crichton",
              "nationality": "American",
            },
          ],
        },
        "errors": undefined,
        "extensions": undefined,
      }
    `);

    const titles = await server.executeOperation({
      query: "query GetBooks { books { title } }"
    });

    expect(titles).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "books": Array [
            Object {
              "title": "Harry Potter and the Chamber of Secrets",
            },
            Object {
              "title": "Jurassic Park",
            },
          ],
        },
        "errors": undefined,
        "extensions": undefined,
      }
    `);
  });
});
