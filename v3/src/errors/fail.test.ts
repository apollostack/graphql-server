import { fail } from "./fail";

describe("fail", () => {
  describe("returns a failure mode", () => {
    const E_EXAMPLE = fail("EXAMPLE");

    it("with a static code", () => {
      expect(E_EXAMPLE.code).toBe("EXAMPLE");
    });

    it("which can create() errors", () => {
      expect(E_EXAMPLE().create()).toBeInstanceOf(Error);
    });

    describe("which accepts messages", () => {
      const E_EXAMPLE = fail("EXAMPLE");
      it("as template strings", () => {
        const E_EXAMPLE_TEMPLATE = E_EXAMPLE.msg`Something went wrong`;
        expect(E_EXAMPLE_TEMPLATE().create().message).toMatchInlineSnapshot(
          `"Something went wrong"`
        );
      });

      it("as plain strings", () => {
        const E_EXAMPLE_STRING = E_EXAMPLE.msg("A plain string");
        expect(E_EXAMPLE_STRING().create().message).toMatchInlineSnapshot(
          `"A plain string"`
        );
      });

      it("as formatters, adjusting its required props", () => {
        const E_EXAMPLE_FORMAT = E_EXAMPLE.msg(
          (props: { cause: string }) => `What went wrong: ${props.cause}`
        );
        expect(
          E_EXAMPLE_FORMAT({ cause: "Something." }).create().message
        ).toMatchInlineSnapshot(`"What went wrong: Something."`);
      });
    });
  });

  describe("extends existing classes", () => {
    class ClientRateExceededExampleError extends Error {
      constructor(public maxRate: number, public client: string) {
        super("Rate exceeded.");
      }
    }

    const E_TOO_FAST = fail("TOO_FAST", ClientRateExceededExampleError);

    it("has the provided code", () => {
      expect(E_TOO_FAST.code).toBe("TOO_FAST");
    });

    it("creates errors, taking the constructor params", () => {
      const fail = E_TOO_FAST(100, "a-client");
      expect(fail).toMatchInlineSnapshot(`
        FailureElement {
          "messages": Array [],
          "mode": [Function],
          "params": Array [
            100,
            "a-client",
          ],
        }
      `);
    });

    it("takes formatters that also receive the constructor params", () => {
      expect(
        E_TOO_FAST.msg(
          (maxRate: number, client: string) =>
            `Client ${client} exceeded ${maxRate}`
        )(500, "some-client").create().message
      ).toMatchInlineSnapshot(`"Client some-client exceeded 500"`);
    });

    it("takes multiple formatters", () => {
      expect(
        E_TOO_FAST.msg((r: number, c: string) => `Client ${c} exceeded ${r}`)
          .msg((r: number) => `Rate was ${r}`)(500, "some-client")
          .create().message
      ).toMatchInlineSnapshot(`
        "Client some-client exceeded 500

        Rate was 500"
      `);
    });
  });
});
