/** Explicit migration of current mutable review digests; historical records stay in Git. */
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import { pathToFileURL } from "node:url";
import {
  REVIEW_DIGEST_ALGORITHM,
  reviewFactsDigest,
} from "../scripts/review-facts.mjs";

export function refreshReviewFacts(
  kind,
  document,
  { write = false, thirdPartyDigest } = {},
) {
  if (kind === "rights") {
    if (!thirdPartyDigest)
      throw new Error("Third-party facts digest is required");
    if (
      document.externalDependencies.inventoryFactsSha256 !== thirdPartyDigest
    ) {
      if (!write) throw new Error("Stored third-party facts binding is stale");
      document.externalDependencies.inventoryFactsSha256 = thirdPartyDigest;
    }
  }
  const unchanged =
    document.review.digestAlgorithm === REVIEW_DIGEST_ALGORITHM &&
    document.review.factsSha256 === reviewFactsDigest(kind, document);
  if (!unchanged) {
    if (!write)
      throw new Error("Review digest migration or facts refresh required");
    document.review.status = "PENDING_HUMAN_REVIEW";
    for (const key of [
      "reviewer",
      "reviewedOn",
      "capacity",
      "conclusion",
      "authority",
    ])
      if (key in document.review) document.review[key] = null;
    if (kind === "scopedName")
      document.decision.outcome = "PENDING_HUMAN_REVIEW";
    document.review.digestAlgorithm = REVIEW_DIGEST_ALGORITHM;
    document.review.factsSha256 = reviewFactsDigest(kind, document);
  }
  return document;
}

async function main() {
  const write = process.argv.slice(2).includes("--write");
  if (process.argv.slice(2).some((arg) => arg !== "--write"))
    throw new Error("Only --write is supported");
  const records = [
    ["thirdParty", "docs/provenance/third-party-material.json"],
    ["rights", "docs/provenance/rights-inventory.json"],
    ["dependencies", "docs/dependency-governance.json"],
    ["scopedName", "docs/provenance/scoped-package-name-review.json"],
  ];
  for (const [kind, path] of records) {
    const file = new URL(`../${path}`, import.meta.url);
    const document = JSON.parse(readFileSync(file, "utf8"));
    let thirdPartyDigest;
    if (kind === "rights") {
      const inventory = JSON.parse(
        readFileSync(
          new URL(
            "../docs/provenance/third-party-material.json",
            import.meta.url,
          ),
        ),
      );
      thirdPartyDigest = inventory.review.factsSha256;
    }
    refreshReviewFacts(kind, document, { write, thirdPartyDigest });
    if (write)
      writeFileSync(
        file,
        await format(`${JSON.stringify(document, null, 2)}\n`, {
          parser: "json-stringify",
        }),
      );
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
