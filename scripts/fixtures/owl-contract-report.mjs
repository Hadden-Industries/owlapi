/** Protocol fixtures from an actual retained-package native run on 2026-10-06.
 * Execution identity is supplied by each admission test; this is not a CI receipt. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  REVIEWED_CONSUMER_SOURCES,
  OWL_CONTRACT_INVENTORY_SHA256,
  owlContractFixtureSha256,
} from "../owl-contract-evidence.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../package-identity.mjs";
export const nativeContractText = readFileSync(
  new URL("./owl-contract-native-live.ndjson", import.meta.url),
  "utf8",
);
export const contractReport = (
  identity = { runId: 100, runAttempt: 2, commit: "c".repeat(40) },
  {
    workflow = "CI",
    artifact = { id: 702, digest: `sha256:${"f".repeat(64)}` },
    tarballSha256 = "e".repeat(64),
  } = {},
) => ({
  schemaVersion: 1,
  check: "owl_contract",
  result: "PASS",
  identity: { workflow, ...identity },
  candidate: {
    package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
    tarballSha256,
    artifact,
  },
  consumerSources: JSON.parse(JSON.stringify(REVIEWED_CONSUMER_SOURCES)),
  inventorySha256: OWL_CONTRACT_INVENTORY_SHA256,
  fixtureSha256: owlContractFixtureSha256(),
  nativeReportSha256: createHash("sha256")
    .update(nativeContractText)
    .digest("hex"),
  assertions: nativeContractText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line)),
});
