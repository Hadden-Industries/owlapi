import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson, jsonEquals, stableJson } from "./canonical-json.mjs";
import { runInNewContext } from "node:vm";
import {
  sourceFingerprint,
  assertReviewedConsumerSources,
  REVIEWED_CONSUMER_SOURCES,
} from "./consumer-source-snapshot.mjs";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import { REVIEW_DIGEST_ALGORITHM, reviewFactsDigest } from "./review-facts.mjs";

const reverseMembers = (value) =>
  Array.isArray(value)
    ? value.map(reverseMembers)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([key, entry]) => [key, reverseMembers(entry)]),
        )
      : value;

describe("semantic JSON identity", () => {
  test("comparison ignores realms and member order while retaining values and array order", () => {
    const foreign = runInNewContext("({ b: [{ y: 2, x: 1 }], a: true })");
    const local = { a: true, b: [{ x: 1, y: 2 }] };
    expect(jsonEquals(foreign, local)).toBe(true);
    expect(jsonEquals(foreign, { ...local, a: false })).toBe(false);
    expect(jsonEquals(["a", "b"], ["b", "a"])).toBe(false);
    expect(() => jsonEquals({ missing: undefined }, {})).toThrow(TypeError);
  });
  test("has stable encodings independent of nested member order, including numeric keys", () => {
    const input = { z: [{ b: 2, a: 1 }, null], 2: "two", 10: "ten" };
    expect(canonicalJson(input)).toBe(
      '{"10":"ten","2":"two","z":[{"a":1,"b":2},null]}',
    );
    expect(canonicalJson(reverseMembers(input))).toBe(canonicalJson(input));
    expect(stableJson({ b: 2, a: { z: 1, y: 2 } })).toBe(
      '{\n  "a": {\n    "y": 2,\n    "z": 1\n  },\n  "b": 2\n}\n',
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
  test.each([
    NaN,
    Infinity,
    undefined,
    { x: undefined },
    [undefined],
    new Array(1),
    new Date(),
  ])("rejects non-JSON input %p instead of losing facts", (value) => {
    expect(() => stableJson(value)).toThrow(TypeError);
  });
  test("rejects cycles and preserves the existing primitive string fingerprint", () => {
    const cycle = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow(/cycle/u);
    expect(sourceFingerprint("YWJj")).toBe(
      createHash("sha256").update('"YWJj"').digest("hex"),
    );
  });
  test.each([sourceFingerprint, evidenceFingerprint])(
    "semantic fingerprints accept member permutations and detect changed facts",
    (fingerprint) => {
      const facts = {
        host: { os: "Windows", arch: "X64" },
        policy: {
          rules: [
            { name: "a", enabled: true },
            { name: "b", enabled: false },
          ],
        },
      };
      expect(fingerprint(reverseMembers(facts))).toBe(fingerprint(facts));
      const changed = structuredClone(facts);
      changed.policy.rules[0].enabled = false;
      expect(fingerprint(changed)).not.toBe(fingerprint(facts));
      const reorderedArray = structuredClone(facts);
      reorderedArray.policy.rules.reverse();
      expect(fingerprint(reorderedArray)).not.toBe(fingerprint(facts));
    },
  );
  test("accepts serialized reordered consumer pins with their original new-format digests", () => {
    const reordered = JSON.parse(
      JSON.stringify(reverseMembers(REVIEWED_CONSUMER_SOURCES)),
    );
    expect(() =>
      assertReviewedConsumerSources(reordered, REVIEWED_CONSUMER_SOURCES),
    ).not.toThrow();
    reordered.snapshots[0].sources[0].blob = "0".repeat(40);
    expect(() =>
      assertReviewedConsumerSources(reordered, REVIEWED_CONSUMER_SOURCES),
    ).toThrow();
  });
  test.each([
    ["rights", "../docs/provenance/rights-inventory.json"],
    ["thirdParty", "../docs/provenance/third-party-material.json"],
    ["dependencies", "../docs/dependency-governance.json"],
    ["scopedName", "../docs/provenance/scoped-package-name-review.json"],
  ])(
    "%s review digest survives recursive permutations and binds actual facts",
    (kind, file) => {
      const document = JSON.parse(readFileSync(new URL(file, import.meta.url)));
      expect(document.review.digestAlgorithm).toBe(REVIEW_DIGEST_ALGORITHM);
      expect(reviewFactsDigest(kind, reverseMembers(document))).toBe(
        document.review.factsSha256,
      );
      const changed = structuredClone(document);
      if (kind === "scopedName") changed.purpose += " changed";
      else changed.package.version = "99.0.0";
      expect(reviewFactsDigest(kind, changed)).not.toBe(
        document.review.factsSha256,
      );
    },
  );
  test("preserves the archived qualification summary encoding and identity", () => {
    const document = JSON.parse(
      readFileSync(
        new URL(
          "../docs/release/pre-registry-git-equivalence.json",
          import.meta.url,
        ),
      ),
    );
    const summary = Object.fromEntries(
      Object.entries(document).filter(
        ([key]) =>
          !["$schema", "qualificationSummarySha256", "review"].includes(key),
      ),
    );
    expect(
      `sha256:${createHash("sha256").update(canonicalJson(summary)).digest("hex")}`,
    ).toBe(document.qualificationSummarySha256);
  });
});
