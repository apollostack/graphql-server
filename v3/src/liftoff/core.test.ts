import { Core } from "./core";
import { str, int, obj, func } from "./ref";
import { def } from "./pattern";

const USER_SCHEMA = {
  typeDefs: `
    type User {
      uid: String
      name: String
    }
  `,
  resolvers: {
    User() {
      return { uid: "0", name: "root" };
    }
  }
};

const PRODUCT_SCHEMA = {
  typeDefs: `
    type Product {
      id: Integer
      title: String
    }
  `,
  resolvers: {
    Product() {
      return { id: 0, title: "A sock" };
    }
  }
};

const MAX_CONNECTIONS_DEFAULT = 1024;
const SERVICE_NAME = "Example Service";

describe("the core", () => {
  const serviceName = str`Name of the service`();
  const maxConnections = int`Maximum connections`(MAX_CONNECTIONS_DEFAULT);
  const preprocess = func<(input: string) => string>`Query preprocessor`();
  const Schema = obj<{ typeDefs: string; resolvers: any }>`GraphQL Schema`();

  const core = new Core(() => {
    def(Schema)(PRODUCT_SCHEMA);
    def(serviceName)(SERVICE_NAME);
    def(Schema)(USER_SCHEMA);
  });

  describe(".once", () => {
    it("returns an array of all ref definitions", async () => {
      expect(await core.once(Schema)).toEqual([PRODUCT_SCHEMA, USER_SCHEMA]);
    });

    it("returns the defaultValue if the ref was never defined", async () => {
      expect(await core.once(maxConnections)).toEqual([
        MAX_CONNECTIONS_DEFAULT
      ]);
    });
  });

  describe(".only", () => {
    it(`returns with the ref's only defined value`, async () => {
      expect(await core.only(serviceName)).toBe(SERVICE_NAME);
    });

    it("throws if the ref is not defined", () =>
      expect(core.only(preprocess)).rejects.toMatchInlineSnapshot(
        `[Error: Query preprocessor <function> (core.test.ts:39:53) was never defined]`
      ));

    it("throws if the ref is defined multiple times", () =>
      expect(core.only(Schema)).rejects.toThrow(
        /was defined 2 times:[^(]*\(core\.test\.ts:43:5[^(]*\(core\.test\.ts:45:5/
      ))
  });
});
