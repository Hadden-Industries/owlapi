import { describe, expect, test } from "@jest/globals";
import { consumerRuntimeFixture } from "./consumer-runtime-fixture.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";

const fixturePolicy = () => ({
  ...structuredClone(CI_RUNTIME),
  minimums: ["22.0.0", "26.0.0"],
  node: { 22: "22.4.1", 26: "26.7.2" },
  canonicalNodeMajor: "26",
});

describe("shared offline consumer runtime fixtures", () => {
  test("retains distinct minimum, reference and synthetic newer-patch coverage", () => {
    const { matrix } = consumerRuntimeFixture({ policy: fixturePolicy() });
    expect(matrix.selections).toEqual([
      { minimum: "22.0.0", reference: "22.4.1", latest: "22.4.2" },
      { minimum: "26.0.0", reference: "26.7.2", latest: "26.7.3" },
    ]);
  });

  test("preserves the aggregate proof's latest-equals-reference case", () => {
    const { matrix } = consumerRuntimeFixture({
      policy: fixturePolicy(),
      newerPatches: false,
    });
    expect(matrix.selections).toEqual([
      { minimum: "22.0.0", reference: "22.4.1", latest: "22.4.1" },
      { minimum: "26.0.0", reference: "26.7.2", latest: "26.7.2" },
    ]);
  });

  test("follows a changed reference without a copied patch list", () => {
    const policy = fixturePolicy();
    policy.node[26] = "26.8.4";
    const { releases, matrix } = consumerRuntimeFixture({ policy });
    expect(matrix.selections[1]).toEqual({
      minimum: "26.0.0",
      reference: "26.8.4",
      latest: "26.8.5",
    });
    expect(releases).toContainEqual({ version: "v26.8.4" });
    expect(releases).toContainEqual({ version: "v26.8.5" });
    expect(releases).not.toContainEqual({ version: "v26.7.2" });
  });

  test("mutations cannot change another fixture or the supplied policy", () => {
    const policy = fixturePolicy();
    const originalPolicy = structuredClone(policy);
    const first = consumerRuntimeFixture({ policy });
    const second = consumerRuntimeFixture({ policy });
    const originalSecond = structuredClone(second);
    first.releases[0].version = "v0.0.0";
    first.releases.pop();
    first.matrix.selections[0].reference = "0.0.0";
    first.matrix.include[0].runner = "foreign";
    first.matrix.include.pop();
    expect(policy).toEqual(originalPolicy);
    expect(second).toEqual(originalSecond);
  });
});
