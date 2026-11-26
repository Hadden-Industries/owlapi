import { expect, jest, test } from "@jest/globals";

const git = jest.fn();
jest.unstable_mockModule("node:child_process", () => ({
  ...jest.requireActual("node:child_process"),
  execFileSync: git,
}));
const { verifyControllerDelta } =
  await import("./release-history-checkpoint.mjs");

const source = "a".repeat(40);
const controller = "b".repeat(40);
const claimsReader = "scripts/retirement-release-claims.mjs";

test.each([
  ["the exact reviewed retention change", [claimsReader], [claimsReader], true],
  [
    "an additional product change",
    [claimsReader, "package.json"],
    [claimsReader, "package.json"],
    false,
  ],
  ["an incomplete owner approval", [claimsReader], [], false],
])("controller recovery checks %s", (_case, changed, approved, allowed) => {
  git.mockImplementation((program, args) => {
    expect(program).toBe("git");
    if (args[0] === "merge-base") {
      expect(args).toEqual(["merge-base", "--is-ancestor", source, controller]);
      return Buffer.alloc(0);
    }
    expect(args).toEqual([
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      source,
      controller,
    ]);
    return Buffer.from([...changed, ""].join("\0"));
  });
  const approval = {
    source,
    controller,
    paths: approved,
    decision: "OWNER_REVIEWED_CONTROL_ONLY",
  };
  const files = new Map([["controller-delta.json", JSON.stringify(approval)]]);
  const verify = () => verifyControllerDelta(source, controller, files);
  if (allowed) expect(verify).not.toThrow();
  else expect(verify).toThrow();
});
