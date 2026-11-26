/** Preserve the protected stage's independently admitted qualification decision through sealing. */
import assert from "node:assert/strict";
import { canonicalJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

const digest = /^[a-f0-9]{64}$/u;
const fields = (value, names) =>
  value &&
  typeof value === "object" &&
  Object.keys(value).length === names.length &&
  names.every((name) => Object.hasOwn(value, name));
const positive = (value) => Number.isSafeInteger(value) && value > 0;

export function qualificationSubjectsSha256(entries) {
  return sha256Buffer(
    Buffer.from(
      canonicalJson(
        entries.map(({ subject, source }) => ({ subject, source })),
      ),
    ),
  );
}

export function assertQualificationAdvisory(marker) {
  assert.ok(
    fields(marker, [
      "verifiedAt",
      "policySha256",
      "subjectsSha256",
      "descriptor",
    ]),
    "Missing or invalid qualification advisory marker",
  );
  const { verifiedAt, policySha256, subjectsSha256, descriptor } = marker;
  assert.ok(
    typeof verifiedAt === "string" &&
      Number.isFinite(Date.parse(verifiedAt)) &&
      new Date(verifiedAt).toISOString() === verifiedAt,
    "Invalid qualification advisory verification time",
  );
  assert.ok(digest.test(policySha256) && digest.test(subjectsSha256));
  assert.ok(
    fields(descriptor, [
      "artifactId",
      "artifactDigest",
      "jobId",
      "signatureSha256",
      "statementSha256",
    ]),
  );
  assert.ok(
    positive(descriptor.artifactId) &&
      positive(descriptor.jobId) &&
      /^sha256:[a-f0-9]{64}$/u.test(descriptor.artifactDigest),
  );
  assert.ok(
    digest.test(descriptor.signatureSha256) &&
      digest.test(descriptor.statementSha256),
  );
  return marker;
}

export function qualificationAdvisoryMarker({
  decision,
  descriptor,
  verificationTime,
}) {
  return assertQualificationAdvisory({
    verifiedAt: new Date(verificationTime).toISOString(),
    policySha256: decision.policySha256,
    subjectsSha256: qualificationSubjectsSha256(decision.subjects),
    descriptor,
  });
}
