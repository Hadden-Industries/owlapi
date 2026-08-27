import { parseVerifierArguments } from "./verify-npm-package-evidence.mjs";

describe("offline npm package evidence verifier CLI", () => {
  it("accepts no arguments because repository evidence paths are fixed", () => {
    expect(parseVerifierArguments([])).toEqual({});
  });

  it.each([["--write"], ["--manifest"], ["unexpected"]])(
    "rejects the unsupported argument %s",
    (argument) => {
      expect(() => parseVerifierArguments([argument])).toThrow(
        /does not accept arguments/iu,
      );
    },
  );
});
