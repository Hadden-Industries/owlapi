import { readFileSync } from "node:fs";
import { refreshReviewFacts } from "./refresh-review-facts.mjs";

const records = [
  ["thirdParty", "./provenance/third-party-material.json"],
  ["rights", "./provenance/rights-inventory.json"],
  ["dependencies", "./dependency-governance.json"],
  ["scopedName", "./provenance/scoped-package-name-review.json"],
];
const read = (path) =>
  JSON.parse(readFileSync(new URL(`../docs/${path}`, import.meta.url)));
const thirdPartyDigest = read("./provenance/third-party-material.json").review
  .factsSha256;
test.each(records)(
  "%s retains an unchanged review but clears human attestation on changed facts or encoding",
  (kind, path) => {
    const document = read(path);
    Object.assign(document.review, {
      status: "REVIEWED",
      reviewer: "Synthetic reviewer",
      reviewedOn: "2026-10-12",
      capacity: "Synthetic test",
      conclusion: "Synthetic approval",
    });
    const previous = structuredClone(document.review);
    refreshReviewFacts(kind, document, { write: true, thirdPartyDigest });
    expect(document.review).toEqual(previous);
    document.review.digestAlgorithm = "old-insertion-order";
    expect(() =>
      refreshReviewFacts(kind, document, { thirdPartyDigest }),
    ).toThrow("migration");
    refreshReviewFacts(kind, document, { write: true, thirdPartyDigest });
    expect(document.review).toMatchObject({
      status: "PENDING_HUMAN_REVIEW",
      reviewer: null,
      reviewedOn: null,
      capacity: null,
      conclusion: null,
      digestAlgorithm: "sha256-sorted-json-v1",
    });
    if (kind === "scopedName") document.purpose += " changed";
    else document.package.version = "99.0.0";
    expect(() =>
      refreshReviewFacts(kind, document, { thirdPartyDigest }),
    ).toThrow("refresh required");
  },
);
test("check mode rejects a stale stored inventory binding without silently repairing it", () => {
  const document = read("./provenance/rights-inventory.json");
  document.externalDependencies.inventoryFactsSha256 = "0".repeat(64);
  const before = structuredClone(document);
  expect(() =>
    refreshReviewFacts("rights", document, { thirdPartyDigest }),
  ).toThrow("binding is stale");
  expect(document).toEqual(before);
  refreshReviewFacts("rights", document, { write: true, thirdPartyDigest });
  expect(document.externalDependencies.inventoryFactsSha256).toBe(
    thirdPartyDigest,
  );
});
