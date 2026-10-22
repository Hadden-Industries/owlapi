import { describe, expect, test } from "@jest/globals";
import semver from "semver";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  qualificationMatrix,
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";

const releases = () =>
  [
    ...new Set([
      ...CI_RUNTIME.minimums,
      ...Object.values(CI_RUNTIME.node).flatMap((reference) => [
        reference,
        semver.inc(reference, "patch"),
      ]),
    ]),
  ].map((version) => ({ version: `v${version}` }));

describe("frozen consumer runtime admission", () => {
  test("includes every floor, fresh latest patch and distinct reference on every declared platform", () => {
    const matrix = qualificationMatrix(releases());
    for (const minimum of CI_RUNTIME.minimums) {
      const reference = CI_RUNTIME.node[semver.major(minimum)];
      expect(matrix.selections).toContainEqual({
        minimum,
        reference,
        latest: semver.inc(reference, "patch"),
      });
      for (const platform of CI_RUNTIME.consumerPlatforms)
        for (const node of [minimum, reference, semver.inc(reference, "patch")])
          expect(matrix.include).toContainEqual({ ...platform, node });
    }
    expect(validateFrozenMatrix(matrix)).toEqual(matrix);
  });
  test.each([
    "missing",
    "duplicate",
    "unexpected-platform",
    "policy",
    "selection",
  ])(
    "rejects %s lane evidence instead of accepting a smaller matrix",
    (mutation) => {
      const matrix = qualificationMatrix(releases());
      if (mutation === "missing") matrix.include.pop();
      if (mutation === "duplicate") matrix.include.push(matrix.include[0]);
      if (mutation === "unexpected-platform") matrix.include[0].arch = "other";
      if (mutation === "policy") matrix.policySha256 = "0".repeat(64);
      if (mutation === "selection") matrix.selections[0].minimum = "0.0.0";
      expect(() => validateFrozenMatrix(matrix)).toThrow();
    },
  );
  test("a newly released patch changes the exact proof identity", () => {
    const previous = qualificationMatrix(releases());
    const next = qualificationMatrix([
      ...releases(),
      { version: `v${semver.inc(previous.selections[0].latest, "patch")}` },
    ]);
    expect(runtimeDigest(next)).not.toBe(runtimeDigest(previous));
  });
});
