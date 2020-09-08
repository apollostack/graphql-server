import { fixtures } from 'apollo-federation-integration-testsuite';
import { composeAndValidate } from '../../composition';
import { printSchema } from '../printFederatedSchema';

describe('printFederatedSchema', () => {
  const { schema, errors } = composeAndValidate(fixtures);

  it('composes without errors', () => {
    expect(errors).toHaveLength(0);
  });

  it('prints a fully composed schema correctly', () => {
    expect(printSchema(schema)).toMatchInlineSnapshot(`
      "directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      union AccountType = PasswordAccount | SMSAccount

      type Amazon {
        referrer: String
      }

      union Body = Image | Text

      type Book implements Product @key(fields: \\"isbn\\") {
        isbn: String!
        title: String
        year: Int
        similarBooks: [Book]!
        metadata: [MetadataOrError]
        inStock: Boolean
        isCheckedOut: Boolean
        upc: String!
        sku: String!
        name(delimeter: String = \\" \\"): String @requires(fields: \\"title year\\")
        price: String
        details: ProductDetailsBook
        reviews: [Review]
        relatedReviews: [Review!]! @requires(fields: \\"similarBooks { isbn }\\")
      }

      union Brand = Ikea | Amazon

      type Car implements Vehicle @key(fields: \\"id\\") {
        id: String!
        description: String
        price: String
        retailPrice: String @requires(fields: \\"price\\")
      }

      type Error {
        code: Int
        message: String
      }

      interface Football @key(fields: \\"upc\\") {
        upc: String!
        sku: String!
        material: String
        size: Int
        colour: String
      }

      input Football_Where {
        size: Int_Where
      }

      type Furniture implements Product @key(fields: \\"sku\\") @key(fields: \\"upc\\") {
        upc: String!
        sku: String!
        name: String
        price: String
        brand: Brand
        metadata: [MetadataOrError]
        details: ProductDetailsFurniture
        inStock: Boolean
        isHeavy: Boolean
        reviews: [Review]
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

      type IndoorFootball implements Product & Football @key(fields: \\"sku\\") @key(fields: \\"upc\\") {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        inStock: Boolean
        reviews: [Review]
        colour: String
      }

      input Int_Where {
        \\"\\"\\"Greater than Int\\"\\"\\"
        GTE: Int
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Library @key(fields: \\"id\\") {
        id: ID!
        name: String
        userAccount(id: ID! = 1): User @requires(fields: \\"name\\")
      }

      union MetadataOrError = KeyValue | Error

      type Mutation {
        login(username: String!, password: String!): User
        reviewProduct(upc: String!, body: String!): Product
        updateReview(review: UpdateReviewInput!): Review
        deleteReview(id: ID!): Boolean
      }

      type Name {
        first: String
        last: String
      }

      type NightFootball implements Product & Football @key(fields: \\"sku\\") @key(fields: \\"upc\\") {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        batteries: String
        inStock: Boolean
        reviews: [Review]
        colour: String
      }

      type OutdoorFootball implements Product & Football @key(fields: \\"sku\\") @key(fields: \\"upc\\") {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        inStock: Boolean
        reviews: [Review]
        colour: String
        heavy: Boolean @requires(fields: \\"weight\\")
      }

      type PasswordAccount @key(fields: \\"email\\") {
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
        user(id: ID!): User
        me: User
        book(isbn: String!): Book
        books: [Book]
        library(id: ID!): Library
        body: Body!
        product(upc: String): Product
        vehicle(id: String!): Vehicle
        topProducts(first: Int = 5): [Product]
        topCars(first: Int = 5): [Car]
        footballs(upc: String, where: Football_Where): [Football]
        outdoorFootballs(upc: String, where: Football_Where): [OutdoorFootball]
        indoorFootballs(upc: String, where: Football_Where): [IndoorFootball]
        topReviews(first: Int = 5): [Review]
      }

      type Review @key(fields: \\"id\\") {
        id: ID!
        body(format: Boolean = false): String
        author: User @provides(fields: \\"username\\")
        product: Product
        metadata: [MetadataOrError]
      }

      type SMSAccount @key(fields: \\"number\\") {
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

      type User @key(fields: \\"id\\") @key(fields: \\"username name { first last }\\") {
        id: ID!
        name: Name
        username: String
        birthDate(locale: String): String
        account: AccountType
        metadata: [UserMetadata]
        goodDescription: Boolean @requires(fields: \\"metadata { description }\\")
        vehicle: Vehicle
        thing: Thing
        reviews: [Review]
        numberOfReviews: Int!
        goodAddress: Boolean @requires(fields: \\"metadata { address }\\")
      }

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type Van implements Vehicle @key(fields: \\"id\\") {
        id: String!
        description: String
        price: String
        retailPrice: String @requires(fields: \\"price\\")
      }

      interface Vehicle {
        id: String!
        description: String
        price: String
        retailPrice: String
      }

      type VisuallyImpairedFootball implements Product & Football @key(fields: \\"sku\\") @key(fields: \\"upc\\") {
        upc: String!
        sku: String!
        name: String
        price: String
        weight: Int
        details: ProductDetails
        material: String
        size: Int
        inStock: Boolean
        reviews: [Review]
        colour: String
      }
      "
    `);
  });
});
