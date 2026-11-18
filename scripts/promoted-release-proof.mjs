/** Compact evidence handed to the release aggregate after a successful CI admission. */
import assert from "node:assert/strict";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from "./package-identity.mjs";
import { isDeepStrictEqual } from "node:util";

const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
const hex = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const id = (value) => Number.isSafeInteger(value) && value > 0;
const archivalArtifact = (artifact) => ({
  id: artifact.id,
  name: artifact.name,
  digest: artifact.digest,
  bytes: artifact.size_in_bytes,
  expiresAt: artifact.expires_at,
});
const execution = (run, receipt) => ({
  runId: run.id,
  attempt: run.run_attempt,
  event: run.event,
  providerHead: run.head_sha,
  snapshot: receipt.snapshot,
});

export function projectPromotedCi(result, matrixSha256) {
  const { landed, main, source, qualifiedPackage: pack } = result;
  return {
    schemaVersion: 1,
    repositoryId: source.run.repository.id,
    landed,
    main: {
      ...execution(main.run, main.receipt),
      receipt: archivalArtifact(main.artifact),
    },
    build: {
      ...execution(source.run, source.receipt),
      receipt: archivalArtifact(source.artifact),
      producingAttempt: pack.attempt,
      producerJob: pack.producerJob,
      checks: Object.fromEntries(
        Object.entries(source.receipt.checks).map(([key, check]) => [
          key,
          check.original,
        ]),
      ),
    },
    candidate: archivalArtifact(pack.candidate),
    packageProof: archivalArtifact(pack.proof),
    assets: pack.assets,
    package: pack.package,
    packedConfig: pack.packedConfig,
    integrity: pack.integrity,
    evidence: pack.evidence,
    advisoryObservations: pack.advisoryObservations,
    policySha256: source.receipt.policySha256,
    matrixSha256,
  };
}

/** Validate the release job output again before making it part of a manifest. */
export function assertPromotedCi(
  evidence,
  { commit, matrixSha256, now = Date.now(), version = PACKAGE_VERSION },
) {
  assert.equal(evidence.schemaVersion, 1, "Unknown CI evidence projection");
  assert.ok(id(evidence.repositoryId));
  const { landed, main, build } = evidence;
  assert.ok(
    sha(commit) &&
      landed.commit === commit &&
      sha(landed.tree) &&
      sha(landed.workflow) &&
      Array.isArray(landed.parents) &&
      landed.parents.every(sha) &&
      isDeepStrictEqual(main.snapshot, landed),
    "CI projection does not bind the landed checkout",
  );
  assert.equal(main.providerHead, commit);
  assert.ok(["push", "workflow_dispatch"].includes(main.event));
  assert.ok(
    ["pull_request", "push", "workflow_dispatch"].includes(build.event),
  );
  assert.ok(sha(build.snapshot.commit) && sha(build.providerHead));
  assert.deepEqual(
    [build.snapshot.tree, build.snapshot.workflow, build.snapshot.parents],
    [landed.tree, landed.workflow, landed.parents],
  );
  if (build.event === "pull_request") {
    assert.equal(landed.parents.length, 2);
    assert.equal(build.providerHead, landed.parents[1]);
  } else {
    assert.deepEqual(build.snapshot, landed);
    assert.equal(build.runId, main.runId);
    assert.equal(build.attempt, main.attempt);
    assert.equal(build.providerHead, commit);
  }
  for (const value of [
    main.runId,
    main.attempt,
    build.runId,
    build.attempt,
    build.producingAttempt,
    build.producerJob,
  ])
    assert.ok(id(value));
  assert.ok(build.producingAttempt <= build.attempt);
  for (const artifact of [
    main.receipt,
    build.receipt,
    evidence.candidate,
    evidence.packageProof,
  ]) {
    assert.ok(
      id(artifact.id) &&
        id(artifact.bytes) &&
        typeof artifact.name === "string" &&
        /^sha256:[0-9a-f]{64}$/u.test(artifact.digest) &&
        Date.parse(artifact.expiresAt) > now,
      "A required original artifact is expired or invalid",
    );
  }
  assert.ok(hex(evidence.policySha256));
  assert.ok(hex(matrixSha256));
  assert.equal(evidence.matrixSha256, matrixSha256);
  for (const [key, filename] of Object.entries({
    tarball: PACKAGE_FILE_STEM + "-" + version + ".tgz",
    sbom: PACKAGE_FILE_STEM + "-" + version + ".cdx.json",
    checksums: "SHA256SUMS",
  })) {
    const member = evidence.assets[key];
    assert.ok(
      member?.name === filename && id(member.bytes) && hex(member.sha256),
    );
  }
  assert.deepEqual(evidence.package, {
    name: PACKAGE_NAME,
    version,
  });
  assert.match(evidence.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/u);
  const observations = evidence.advisoryObservations;
  for (const name of ["root", "transport", "recipient"]) {
    const audit = observations?.[name];
    assert.ok(
      audit?.high === 0 &&
        audit.critical === 0 &&
        hex(audit.lockSha256) &&
        hex(audit.manifestSha256) &&
        hex(audit.reportSha256) &&
        Date.parse(audit.observedAt) <= now &&
        now - Date.parse(audit.observedAt) <= 24 * 60 * 60_000,
      "An exact-graph current advisory observation is missing",
    );
  }
  assert.equal(
    observations.recipient.lockSha256,
    evidence.evidence["lockless-consumer-package-lock.json"]?.sha256,
    "Recipient advisory observation has different inputs",
  );
  return evidence;
}
