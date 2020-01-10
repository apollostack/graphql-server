import { def, trace } from "./pattern";
import { str, int } from "./ref";
import refSerializer from "../snapshotSerializers/refSerializer";

expect.addSnapshotSerializer(refSerializer);

describe("patterns — ", () => {
  it("trace(plan) returns all bonds linked by plan()", () => {
    const name = str`cute lil ref`();
    const count = int`tiny count`();
    const delta = trace(() => {
      // You can call scalar refs to define them
      name`greeting`("hello world");

      // Or use `def` explicitly (here shown with a key)
      def`with a key`(name)(name);

      // You can omit keys, although doing so means the
      // defs will change every time the plan is evaluated.
      def(count)(10);

      // Calls also work without keys.
      count(1);
    });

    expect(delta).toMatchInlineSnapshot(`
      Array [
        Object {
          "bond": Object {
            "key": DepKey {
              "deps": Array [],
              "site": Array [
                "greeting",
              ],
            },
            "rval": "hello world",
            "state": Object {
              "def": "hello world",
              "ref": cute lil ref <string> (pattern.test.ts:9:21),
            },
            "type": "def",
          },
          "mut": "add",
        },
        Object {
          "bond": Object {
            "key": DepKey {
              "deps": Array [],
              "site": Array [
                "with a key",
              ],
            },
            "rval": cute lil ref <string> (pattern.test.ts:9:21),
            "state": Object {
              "def": cute lil ref <string> (pattern.test.ts:9:21),
              "ref": cute lil ref <string> (pattern.test.ts:9:21),
            },
            "type": "def",
          },
          "mut": "add",
        },
        Object {
          "bond": Object {
            "key": DepKey {
              "deps": Array [],
              "site": Array [],
            },
            "rval": 10,
            "state": Object {
              "def": 10,
              "ref": tiny count <int> (pattern.test.ts:10:22),
            },
            "type": "def",
          },
          "mut": "add",
        },
        Object {
          "bond": Object {
            "key": DepKey {
              "deps": Array [],
              "site": Array [],
            },
            "rval": 1,
            "state": Object {
              "def": 1,
              "ref": tiny count <int> (pattern.test.ts:10:22),
            },
            "type": "def",
          },
          "mut": "add",
        },
      ]
    `);
  });
});
