/** Reuse the signed history checkpoint and the package's existing rights identity. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import {
  priorDisposition,
  readCheckpoint,
} from "./release-history-checkpoint.mjs";
import { PACKAGE_NAME, REPOSITORY_URL } from "./release-identity.mjs";
import { selectAuthorizedSigner } from "./release-signers.mjs";
import { REVIEW_DIGEST_ALGORITHM, reviewFactsDigest } from "./review-facts.mjs";
import { recipientMaterialDisposition } from "./recipient-material-case.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const readPolicy = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url)));
const approved = new WeakMap();

/** A valid release signature establishes identity. The independent, trusted
 * rights inventory must identify the same person as the project's rights owner. */
export function assertRecipientMaterialDisposition(
  original,
  checkpoint,
  {
    rights = readPolicy("../docs/provenance/rights-inventory.json"),
    signers = readPolicy("../docs/provenance/release-signers.json"),
    date = new Date().toISOString().slice(0, 10),
  } = {},
) {
  assert.equal(original.packet.origin.scope, "GITHUB_ACTIONS");
  const signer = selectAuthorizedSigner(signers, {
    fingerprint: checkpoint.signer.fingerprint,
    releaseDate: date,
  });
  assert.equal(signer.id, checkpoint.signer.signerId);
  assert.equal(rights.package.name, PACKAGE_NAME);
  assert.equal(rights.package.repository, REPOSITORY_URL);
  assert.equal(rights.review.digestAlgorithm, REVIEW_DIGEST_ALGORITHM);
  assert.equal(rights.review.factsSha256, reviewFactsDigest("rights", rights));
  const identity = `https://github.com/${signer.githubIdentity}`;
  const source = rights.materialClasses.find(
    ({ id }) => id === "package-owned-source-and-metadata",
  );
  assert.ok(
    rights.contributors.length === 1 &&
      rights.contributors[0].identity === identity &&
      rights.contributors[0].name === signer.naturalPersonName &&
      source?.relationship === "PROJECT_OWNED" &&
      source.source === REPOSITORY_URL &&
      source.rightsHolder ===
        `${signer.naturalPersonName} for his contributions`,
    "The checkpoint signer has no established recipient material rights authority",
  );
  const authority = {
    capacity: "PROJECT_RIGHTS_OWNER",
    signerId: signer.id,
    fingerprint: signer.fingerprint,
    identity,
    rightsFactsSha256: rights.review.factsSha256,
  };
  const name = `recipient-material-${original.caseSha256}.json`;
  const signed = priorDisposition(checkpoint, name);
  assert.ok(
    jsonEquals(signed, recipientMaterialDisposition(original, authority)),
    "Signed rights disposition does not accept the exact recipient material case",
  );
  return { checkpoint: checkpoint.objectId, name, authority };
}

/** Only this reader may turn an authenticated rights decision into replay input. */
export async function authorizeRecipientMaterialReplay(
  client,
  original,
  checkpointObject,
) {
  assert.match(
    checkpointObject ?? "",
    /^[a-f0-9]{40}$/u,
    "An authenticated recipient material rights disposition is required",
  );
  const checkpoint = await readCheckpoint(client, checkpointObject);
  const authorization = Object.freeze(
    assertRecipientMaterialDisposition(original, checkpoint),
  );
  approved.set(authorization, { original, caseSha256: original.caseSha256 });
  return authorization;
}

export function assertAuthorizedRecipientMaterialReplay(
  authorization,
  original,
) {
  const verified = approved.get(authorization);
  assert.ok(
    verified?.original === original &&
      verified?.caseSha256 === original.caseSha256 &&
      sha256Buffer(Buffer.from(stableJson(original.packet))) ===
        original.caseSha256,
    "An authenticated recipient material rights disposition is required",
  );
}
