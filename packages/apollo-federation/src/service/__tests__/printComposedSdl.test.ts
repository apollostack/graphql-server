import { fixtures } from 'apollo-federation-integration-testsuite';
import { composeAndValidate } from '../../composition';
import { parse, print, GraphQLError, visit, StringValueNode } from 'graphql';

describe('printComposedSdl', () => {
  let composedSdl: string, errors: GraphQLError[];

  beforeAll(() => {
    // composeAndValidate calls `printComposedSdl` to return `composedSdl`
    ({ composedSdl, errors } = composeAndValidate(fixtures));
  });

  it('composes without errors', () => {
    expect(errors).toHaveLength(0);
  });

  it('produces a parseable output', () => {
    expect(() => parse(composedSdl)).not.toThrow();
  });

  it('prints a fully composed schema correctly', () => {
    expect(composedSdl).toMatchInlineSnapshot(`
      "schema
        @graph(name: \\"accounts\\", url: \\"https://accounts.api.com\\")
        @graph(name: \\"books\\", url: \\"https://books.api.com\\")
        @graph(name: \\"documents\\", url: \\"https://documents.api.com\\")
        @graph(name: \\"inventory\\", url: \\"https://inventory.api.com\\")
        @graph(name: \\"product\\", url: \\"https://product.api.com\\")
        @graph(name: \\"reviews\\", url: \\"https://reviews.api.com\\")
        @graph(name: \\"colour-footballs\\", url: \\"https://colour-footballs.api.com\\")
        @composedGraph(version: 1)
      {
        query: Query
        mutation: Mutation
      }

      directive @composedGraph(version: Int!) on SCHEMA

      directive @graph(name: String!, url: String!) on SCHEMA

      directive @owner(graph: String!) on OBJECT

      directive @key(fields: String!, graph: String!) on OBJECT

      directive @resolve(graph: String!) on FIELD_DEFINITION

      directive @provides(fields: String!) on FIELD_DEFINITION

      directive @requires(fields: String!) on FIELD_DEFINITION

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String
      }

      union Body = Image | Text

      type Book implements Product
        @owner(graph: \\"books\\")
        @key(fields: \\"{ isbn }\\", graph: \\"books\\")
        @key(fields: \\"{ isbn }\\", graph: \\"inventory\\")
        @key(fields: \\"{ isbn }\\", graph: \\"product\\")
        @key(fields: \\"{ isbn }\\", graph: \\"reviews\\")
      {
        isbn: String!
        title: String
        year: Int
        similarBooks: [Book]!
        metadata: [MetadataOrError]
        inStock: Boolean @resolve(graph: \\"inventory\\")
        isCheckedOut: Boolean @resolve(graph: \\"inventory\\")
        upc: String! @resolve(graph: \\"product\\")
        sku: String! @resolve(graph: \\"product\\")
        name(delimeter: String = \\" \\"): String @resolve(graph: \\"product\\") @requires(fields: \\"{ title year }\\")
        price: String @resolve(graph: \\"product\\")
        details: ProductDetailsBook @resolve(graph: \\"product\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
        relatedReviews: [Review!]! @resolve(graph: \\"reviews\\") @requires(fields: \\"{ similarBooks { isbn } }\\")
      }

      union Brand = Ikea | Amazon

      type Car implements Vehicle
        @owner(graph: \\"product\\")
        @key(fields: \\"{ id }\\", graph: \\"product\\")
        @key(fields: \\"{ id }\\", graph: \\"reviews\\")
      {
        id: String!
        description: String
        price: String
        retailPrice: String @resolve(graph: \\"reviews\\") @requires(fields: \\"{ price }\\")
      }

      type Error {
        code: Int
        message: String
      }

      interface Football {
        upc: String!
        sku: String!
        material: String
        size: Int
        colour: String
      }

      input Football_Where {
        size: Int_Where
      }

      type Furniture implements Product
        @owner(graph: \\"product\\")
        @key(fields: \\"{ upc }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"inventory\\")
        @key(fields: \\"{ upc }\\", graph: \\"reviews\\")
      {
        upc: String!
        sku: String!
        name: String
        price: String
        brand: Brand
        metadata: [MetadataOrError]
        details: ProductDetailsFurniture
        inStock: Boolean @resolve(graph: \\"inventory\\")
        isHeavy: Boolean @resolve(graph: \\"inventory\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
      }

      type Ikea {
        asile: Int
      }

      type Image {
        name: String!
        attributes: ImageAttributes!
      }

      type ImageAttributes {
        url: String!
      }

      type IndoorFootball implements Product & Football
        @owner(graph: \\"product\\")
        @key(fields: \\"{ upc }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"inventory\\")
        @key(fields: \\"{ upc }\\", graph: \\"reviews\\")
        @key(fields: \\"{ upc }\\", graph: \\"colour-footballs\\")
      {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        inStock: Boolean @resolve(graph: \\"inventory\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
        colour: String @resolve(graph: \\"colour-footballs\\")
      }

      input Int_Where {
        \\"\\"\\"Greater than Int\\"\\"\\"
        GTE: Int
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library
        @owner(graph: \\"books\\")
        @key(fields: \\"{ id }\\", graph: \\"books\\")
        @key(fields: \\"{ id }\\", graph: \\"accounts\\")
      {
        id: ID!
        name: String
        userAccount(id: ID! = 1): User @resolve(graph: \\"accounts\\") @requires(fields: \\"{ name }\\")
      }

      union MetadataOrError = KeyValue | Error

      type Mutation {
        login(username: String!, password: String!): User @resolve(graph: \\"accounts\\")
        reviewProduct(upc: String!, body: String!): Product @resolve(graph: \\"reviews\\")
        updateReview(review: UpdateReviewInput!): Review @resolve(graph: \\"reviews\\")
        deleteReview(id: ID!): Boolean @resolve(graph: \\"reviews\\")
      }

      type Name {
        first: String
        last: String
      }

      type NightFootball implements Product & Football
        @owner(graph: \\"product\\")
        @key(fields: \\"{ upc }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"inventory\\")
        @key(fields: \\"{ upc }\\", graph: \\"reviews\\")
        @key(fields: \\"{ upc }\\", graph: \\"colour-footballs\\")
      {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        batteries: String
        inStock: Boolean @resolve(graph: \\"inventory\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
        colour: String @resolve(graph: \\"colour-footballs\\")
      }

      type OutdoorFootball implements Product & Football
        @owner(graph: \\"product\\")
        @key(fields: \\"{ upc }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"inventory\\")
        @key(fields: \\"{ upc }\\", graph: \\"reviews\\")
        @key(fields: \\"{ upc }\\", graph: \\"colour-footballs\\")
      {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        inStock: Boolean @resolve(graph: \\"inventory\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
        colour: String @resolve(graph: \\"colour-footballs\\")
        heavy: Boolean @resolve(graph: \\"colour-footballs\\") @requires(fields: \\"{ weight }\\")
      }

      type PasswordAccount
        @owner(graph: \\"accounts\\")
        @key(fields: \\"{ email }\\", graph: \\"accounts\\")
      {
        email: String!
      }

      interface Product {
        upc: String!
        sku: String!
        name: String
        price: String
        details: ProductDetails
        inStock: Boolean
        reviews: [Review]
      }

      interface ProductDetails {
        country: String
      }

      type ProductDetailsBook implements ProductDetails {
        country: String
        pages: Int
      }

      type ProductDetailsFurniture implements ProductDetails {
        country: String
        color: String
      }

      type Query {
        user(id: ID!): User @resolve(graph: \\"accounts\\")
        me: User @resolve(graph: \\"accounts\\")
        book(isbn: String!): Book @resolve(graph: \\"books\\")
        books: [Book] @resolve(graph: \\"books\\")
        library(id: ID!): Library @resolve(graph: \\"books\\")
        body: Body! @resolve(graph: \\"documents\\")
        product(upc: String): Product @resolve(graph: \\"product\\")
        vehicle(id: String!): Vehicle @resolve(graph: \\"product\\")
        topProducts(first: Int = 5): [Product] @resolve(graph: \\"product\\")
        topCars(first: Int = 5): [Car] @resolve(graph: \\"product\\")
        footballs(upc: String, where: Football_Where): [Football] @resolve(graph: \\"product\\")
        outdoorFootballs(upc: String, where: Football_Where): [OutdoorFootball] @resolve(graph: \\"product\\")
        indoorFootballs(upc: String, where: Football_Where): [IndoorFootball] @resolve(graph: \\"product\\")
        topReviews(first: Int = 5): [Review] @resolve(graph: \\"reviews\\")
      }

      type Review
        @owner(graph: \\"reviews\\")
        @key(fields: \\"{ id }\\", graph: \\"reviews\\")
      {
        id: ID!
        body(format: Boolean = false): String
        author: User @provides(fields: \\"{ username }\\")
        product: Product
        metadata: [MetadataOrError]
      }

      type SMSAccount
        @owner(graph: \\"accounts\\")
        @key(fields: \\"{ number }\\", graph: \\"accounts\\")
      {
        number: String
      }

      type Text {
        name: String!
        attributes: TextAttributes!
      }

      type TextAttributes {
        bold: Boolean
        text: String
      }

      union Thing = Car | Ikea

      input UpdateReviewInput {
        id: ID!
        body: String
      }

      type User
        @owner(graph: \\"accounts\\")
        @key(fields: \\"{ id }\\", graph: \\"accounts\\")
        @key(fields: \\"{ username name { first last } }\\", graph: \\"accounts\\")
        @key(fields: \\"{ id }\\", graph: \\"inventory\\")
        @key(fields: \\"{ id }\\", graph: \\"product\\")
        @key(fields: \\"{ id }\\", graph: \\"reviews\\")
      {
        id: ID!
        name: Name
        username: String
        birthDate(locale: String): String
        account: AccountType
        metadata: [UserMetadata]
        goodDescription: Boolean @resolve(graph: \\"inventory\\") @requires(fields: \\"{ metadata { description } }\\")
        vehicle: Vehicle @resolve(graph: \\"product\\")
        thing: Thing @resolve(graph: \\"product\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
        numberOfReviews: Int! @resolve(graph: \\"reviews\\")
        goodAddress: Boolean @resolve(graph: \\"reviews\\") @requires(fields: \\"{ metadata { address } }\\")
      }

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type Van implements Vehicle
        @owner(graph: \\"product\\")
        @key(fields: \\"{ id }\\", graph: \\"product\\")
        @key(fields: \\"{ id }\\", graph: \\"reviews\\")
      {
        id: String!
        description: String
        price: String
        retailPrice: String @resolve(graph: \\"reviews\\") @requires(fields: \\"{ price }\\")
      }

      interface Vehicle {
        id: String!
        description: String
        price: String
        retailPrice: String
      }

      type VisuallyImpairedFootball implements Product & Football
        @owner(graph: \\"product\\")
        @key(fields: \\"{ upc }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"product\\")
        @key(fields: \\"{ sku }\\", graph: \\"inventory\\")
        @key(fields: \\"{ upc }\\", graph: \\"reviews\\")
        @key(fields: \\"{ upc }\\", graph: \\"colour-footballs\\")
      {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        inStock: Boolean @resolve(graph: \\"inventory\\")
        reviews: [Review] @resolve(graph: \\"reviews\\")
        colour: String @resolve(graph: \\"colour-footballs\\")
      }
      "
    `);
  });

  it('fieldsets are parseable', () => {
    const parsedCsdl = parse(composedSdl);
    const fieldSets: string[] = [];

    // Collect all args with the 'fields' name (from @key, @provides, @requires directives)
    visit(parsedCsdl, {
      Argument(node) {
        if (node.name.value === 'fields') {
          fieldSets.push((node.value as StringValueNode).value);
        }
      },
    });

    // Ensure each found 'fields' arg is graphql parseable
    fieldSets.forEach((unparsed) => {
      expect(() => parse(unparsed)).not.toThrow();
    });
  });
});
