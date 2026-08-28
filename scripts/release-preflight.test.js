import { assertReleasePreflight } from "./release-preflight.mjs";

const manifest = {
  name: "owlapi",
  version: "0.1.0-alpha.0",
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org/",
    tag: "next",
  },
};

const publication = {
  enabled: true,
  mode: "DIRECT_BOOTSTRAP",
  coordinate: "owlapi@0.1.0-alpha.0",
  channel: "next",
  reason: "npm requires an existing package before trusted-publisher setup.",
  reviewedOn: "2026-08-28",
};

const accepted = {
  sourceRef: "refs/heads/main",
  checkoutHead: "a".repeat(40),
  capturedSha: "a".repeat(40),
  remoteMain: "a".repeat(40),
  canonicalTagLookupStatus: 1,
  manifest,
  publication,
};

describe("release preflight", () => {
  test("accepts the reviewed direct-bootstrap release boundary", () => {
    expect(assertReleasePreflight(accepted)).toEqual({
      result: "PASS",
      sourceCommit: "a".repeat(40),
      sourceRef: "refs/heads/main",
      canonicalTagAbsent: "v0.1.0-alpha.0",
      publicationEnabled: true,
      publicationMode: "DIRECT_BOOTSTRAP",
      coordinate: "owlapi@0.1.0-alpha.0",
      channel: "next",
    });
  });

  test.each([
    [
      "a disabled publication boundary",
      { publication: { ...publication, enabled: false, mode: "UNRESOLVED" } },
    ],
    ["a non-main dispatch", { sourceRef: "refs/heads/release/0.1.0-alpha.0" }],
    [
      "a checkout different from the captured commit",
      { checkoutHead: "b".repeat(40) },
    ],
    [
      "a dispatch different from current origin/main",
      { remoteMain: "b".repeat(40) },
    ],
    ["an existing canonical tag", { canonicalTagLookupStatus: 0 }],
    ["an indeterminate tag lookup", { canonicalTagLookupStatus: 2 }],
    [
      "an unreviewed publication mode",
      { publication: { ...publication, reviewedOn: null } },
    ],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      assertReleasePreflight({ ...accepted, ...override }),
    ).toThrow();
  });
});
