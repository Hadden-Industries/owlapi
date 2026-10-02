import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Install the native networking guards before loading any lifecycle consumer.
const { assertNoNetworkOperations } =
  await import("./installed-package-no-network.mjs");
const { createPublicContract } =
  await import("./import-closure/public-contract.js");
const { exerciseImportClosureStorage } = createPublicContract(
  await import("owlapi"),
);

const documents = Object.fromEntries(
  ["root", "left", "right", "leaf"].map((name) => [
    name,
    readFileSync(
      new URL(`./import-closure/fixtures/closure/${name}.ofn`, import.meta.url),
      "utf8",
    ),
  ]),
);
const { summary } = await exerciseImportClosureStorage(documents);
assertNoNetworkOperations();
assert.deepEqual(summary, {
  closureCount: 4,
  importLoadCount: 3,
  directAxiomCount: 26,
  rootAnnotationCount: 1,
  anonymousIndividualCount: 4,
  formats: ["functional", "rdfxml"],
  reloadLoaderCalls: 0,
  diagnosticCount: 0,
  retainedTargetAfterFailure: true,
  sourceReaderPreserved: true,
});
process.stdout.write(
  `Installed owlapi import-closure storage passed: ${JSON.stringify(summary)}\n`,
);
