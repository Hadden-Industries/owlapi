import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isStrictDescendantPath } from "../../scripts/release-file-utils.mjs";
import { archiveEvidencePolicy } from "./archive-evidence-policy.mjs";
import {
  ARCHIVE_LIMITS,
  inspectPackageTarball,
  validateBundledPackageClaims,
} from "./archive-evidence.mjs";
import { readVerifiedBlob } from "./blob-store.mjs";
import {
  compareCodeUnits,
  sha256,
  stableJson,
  verifySha512Sri,
} from "./digests.mjs";
import { createRetainedArtifactVerifier } from "./evidence-manifest.mjs";
import { canonicalizeEvidenceBlobs } from "./evidence-shards.mjs";
import { PUBLIC_REGISTRY_ORIGIN } from "./format.mjs";
import { materialDecisions } from "./recipient-material-dispositions.mjs";
import {
  compactArchiveMaterial,
  verifyCompactArchiveMaterial,
} from "./recipient-material-compact.mjs";
import {
  archiveIdentity,
  coordinate,
  observedArchives,
  openCanonicalEvidence,
  readJsonBytes,
  sha256Pattern,
} from "./recipient-material-inputs.mjs";
import { RECIPIENT_MATERIAL_POLICY } from "./runtime-material-policy.mjs";
import { bindScanCoverage } from "./scancode.mjs";

/** Each observation has one closed material decision within its owning proof. */
export const RECIPIENT_MATERIAL_NAME = "recipient-material.json";
const repositoryDefault = fileURLToPath(new URL("../../", import.meta.url));

const blobLink = ({ bytes, path, sha256: digest, kind }) => ({
  bytes,
  path,
  sha256: digest,
  ...(kind === undefined ? {} : { kind }),
});

function evidenceFields(artifact) {
  const { tarball, archive, registrySignature, provenance, scan } = artifact;
  const state = ({ state, evidence }) => ({
    state,
    evidence: blobLink(evidence),
  });
  return {
    ...archiveIdentity(artifact),
    tarball: { bytes: tarball.bytes, sha256: tarball.sha256 },
    archive: state(archive),
    registrySignature: {
      ...state(registrySignature),
      publishedAt: registrySignature.publishedAt,
      signatures: registrySignature.signatures.map(({ keyid, sig }) => ({
        keyid,
        sig,
      })),
    },
    provenance: state(provenance),
    scan: {
      ...state(scan),
      ...(scan.execution === undefined
        ? {}
        : {
            execution: {
              perFileTimeoutSeconds: scan.execution.perFileTimeoutSeconds,
            },
          }),
    },
  };
}

/** This projection is also applied at readback so extra record fields are refused. */
function recipientArchiveRecord(artifact, archiveTarball, blobs, compact) {
  assert.equal(
    archiveTarball.kind,
    undefined,
    "Archive tarball references contain no evidence-envelope kind",
  );
  return {
    source: "RECIPIENT_ARCHIVE",
    ...evidenceFields(artifact),
    archiveTarball: blobLink(archiveTarball),
    blobs: canonicalizeEvidenceBlobs(blobs.map(blobLink)),
    compact,
  };
}

// A caller chooses its proof and trusted source roots. An input record can
// never select a filesystem path for writing or replace locked source evidence.
async function createOutputDirectory(repositoryRoot, directory) {
  assert.equal(
    typeof directory,
    "string",
    "Recipient evidence directory is required",
  );
  const parent = await realpath(dirname(resolve(directory)));
  const target = join(parent, basename(resolve(directory)));
  const canonicalRoot = await realpath(
    join(repositoryRoot, "docs", "provenance"),
  );
  assert.ok(
    target !== canonicalRoot && !isStrictDescendantPath(canonicalRoot, target),
    "Recipient evidence storage must be outside the canonical corpus",
  );
  await mkdir(target);
  return target;
}

async function inTemporaryArchiveRoot(task, keepFailure = false) {
  const root = await realpath(tmpdir());
  const temporary = await mkdtemp(join(root, "owlapi-recipient-material-"));
  assert.ok(isStrictDescendantPath(root, temporary));
  let completed = false;
  try {
    const result = await task(temporary);
    completed = true;
    return result;
  } catch (error) {
    if (keepFailure) error.retainedWorkingRoot = temporary;
    throw error;
  } finally {
    if (completed || !keepFailure)
      await rm(temporary, { recursive: true, force: true });
  }
}

async function reopenRecipientArchive({
  archiveRecord,
  store,
  occurrences,
  registryKeys,
  npmCli,
}) {
  const { archiveTarball, blobs, source, compact, ...artifact } = archiveRecord;
  assert.equal(source, "RECIPIENT_ARCHIVE");
  assert.ok(archiveTarball.bytes <= ARCHIVE_LIMITS.compressedBytes);
  assert.equal(
    archiveTarball.path,
    `blobs/sha256/${archiveTarball.sha256.slice(0, 2)}/${archiveTarball.sha256}`,
  );
  assert.ok(
    blobs.every(({ bytes }) => bytes <= ARCHIVE_LIMITS.compressedBytes),
    "Recipient archive evidence exceeds its byte limit",
  );
  const verify = createRetainedArtifactVerifier({
    blobRoot: store,
    blobs,
    registryKeys,
    requireCompleteBlobSet: true,
  });
  const { archive, scan } = await verify(artifact, occurrences);
  const tarballBytes = await readVerifiedBlob(store, archiveTarball, {
    confined: true,
  });
  verifySha512Sri(tarballBytes, artifact.integrity);
  assert.equal(archiveTarball.sha256, artifact.tarball.sha256);
  assert.equal(archiveTarball.bytes, artifact.tarball.bytes);
  const inventory = await inTemporaryArchiveRoot(async (temporary) => {
    const path = join(temporary, "archive.tgz");
    await writeFile(path, tarballBytes, { flag: "wx" });
    return inspectPackageTarball(path, artifact, {
      ...(npmCli ? { tarList: createRequire(npmCli)("tar").list } : {}),
    });
  });
  const authenticFileFacts = ({ bytes: _bytes, ...facts }) => facts;
  const retainedFileFacts = ({ blob: _blob, ...facts }) => facts;
  for (const field of [
    "archiveRoot",
    "packageIdentity",
    "packageMetadata",
    "entries",
    "duplicateEntries",
    "physicalEntryCount",
    "compressedBytes",
    "expandedBytes",
  ])
    assert.equal(
      stableJson(inventory[field]),
      stableJson(archive[field]),
      `Archive inventory differs from tarball ${field}`,
    );
  for (const field of ["bundledPackages", "evidenceFiles"])
    assert.equal(
      stableJson((inventory[field] ?? []).map(authenticFileFacts)),
      stableJson((archive[field] ?? []).map(retainedFileFacts)),
      `Archive legal evidence differs from tarball ${field}`,
    );
  const { archiveCoverage, ...findings } = scan;
  assert.equal(scan.artifactId, artifact.artifactId);
  const scannerPolicy = archiveEvidencePolicy().scanner;
  delete scannerPolicy.pythonVersion;
  for (const [setting, value] of Object.entries(scannerPolicy))
    assert.equal(
      stableJson(scan.scanner[setting]),
      stableJson(value),
      `Recipient ScanCode policy differs at ${setting}`,
    );
  assert.equal(
    stableJson(
      bindScanCoverage(findings, inventory, artifact.artifactId)
        .archiveCoverage,
    ),
    stableJson(archiveCoverage),
  );
  assert.equal(
    stableJson(compactArchiveMaterial({ archive, scan })),
    stableJson(compact),
    "Compact archive measurements differ from independently verified originals",
  );
  return { archive, scan };
}

/** Open an observation-scoped material evaluator. The caller authenticates the
 * canonical checkout and surrounding proof, replays the native resolution and
 * owns disclosure. Novel readback requires the material record's SHA-256 from
 * that proof to authenticate its original ScanCode and provenance verdicts.
 * Registry key additions come from independently trusted input. A shared store
 * deduplicates new archives. */
export async function prepareRecipientMaterial({
  repositoryRoot = repositoryDefault,
  canonicalLockfileBytes,
  evidenceDirectory,
  trustedRegistryKeySnapshot,
  npmCli,
  scancode,
  fetchImpl,
  sleep,
  downloadTarball,
  verifyPackageMetadata,
  scanArtifact,
  pacoteClient,
} = {}) {
  repositoryRoot = await realpath(repositoryRoot);
  const canonical = await openCanonicalEvidence(
    repositoryRoot,
    canonicalLockfileBytes,
  );
  const registryKeys = new Map(
    canonical.registryKeys.map((key) => [key.keyid, key]),
  );
  if (trustedRegistryKeySnapshot) {
    assert.equal(trustedRegistryKeySnapshot.schemaVersion, 1);
    assert.equal(
      trustedRegistryKeySnapshot.registryOrigin,
      PUBLIC_REGISTRY_ORIGIN,
    );
    for (const key of trustedRegistryKeySnapshot.keys) {
      if (registryKeys.has(key.keyid))
        assert.equal(
          stableJson(registryKeys.get(key.keyid)),
          stableJson(key),
          "Conflicting trusted registry key evidence",
        );
      registryKeys.set(key.keyid, key);
    }
  }
  const keys = [...registryKeys.values()];
  const canonicallyVerified = new Map();
  const collectedByStore = new Map();
  const reopenedByStore = new Map();
  let sharedOutput;

  async function evaluate({
    directory,
    resolution,
    lockfileBytes,
    reading,
    recordSha256,
    retainedBytes,
    compactReadback = false,
  }) {
    const { byArtifact, byId } = observedArchives(resolution, lockfileBytes);
    const recordPath = directory && join(directory, RECIPIENT_MATERIAL_NAME);
    const subject = {
      resolutionSha256: sha256(stableJson(resolution)),
      lockSha256: resolution.lockSha256,
      tarballSha256: resolution.tarballSha256,
    };
    const recordBytes = reading
      ? (retainedBytes ?? (await readJsonBytes(recordPath)))
      : null;
    const record = reading ? JSON.parse(recordBytes) : null;
    if (reading) {
      if (recordSha256 !== undefined)
        assert.equal(
          sha256(recordBytes),
          recordSha256,
          "Recipient material record differs from its authenticated proof digest",
        );
      assert.equal(
        stableJson(record.subject),
        stableJson(subject),
        "Material record belongs to a different recipient observation",
      );
      assert.equal(
        record.artifacts.length,
        byArtifact.size,
        "Material record archive roster differs",
      );
    }
    const claims = new Map(
      (record?.artifacts ?? []).map((artifact) => [
        artifact.artifactId,
        artifact,
      ]),
    );
    const decisions = [];
    const artifacts = [];
    for (const [artifactId, occurrences] of byArtifact) {
      const identity = byId.get(artifactId);
      const original = canonical.byCoordinate.get(coordinate(identity));
      let archiveRecord, verified;
      if (original) {
        assert.equal(
          original.artifactId,
          artifactId,
          `Contradictory canonical archive for ${coordinate(identity)}`,
        );
        if (!canonicallyVerified.has(artifactId))
          canonicallyVerified.set(
            artifactId,
            canonical.verify(original, canonical.occurrences.get(artifactId)),
          );
        verified = await canonicallyVerified.get(artifactId);
        archiveRecord = {
          source: "CANONICAL_CORPUS",
          ...evidenceFields(original),
        };
      } else {
        const store = evidenceDirectory ?? directory;
        if (reading) {
          assert.match(
            recordSha256 ?? "",
            sha256Pattern,
            "New recipient archive evidence requires its authenticated material record digest",
          );
          const claim = claims.get(artifactId);
          assert.ok(claim, "Missing recipient archive evidence");
          assert.equal(
            stableJson(archiveIdentity(claim)),
            stableJson(archiveIdentity(identity)),
            "Recipient archive identity differs",
          );
          archiveRecord = recipientArchiveRecord(
            claim,
            claim.archiveTarball,
            claim.blobs,
            claim.compact,
          );
          assert.equal(
            stableJson(archiveRecord),
            stableJson(claim),
            "Recipient archive record contains unexpected or unordered fields",
          );
          if (compactReadback) {
            verified = verifyCompactArchiveMaterial(
              archiveRecord,
              registryKeys,
            );
          } else {
            assert.ok(
              store,
              "Direct novel material readback requires authorized archive originals",
            );
            const cacheKey = `${resolve(store)}\0${sha256(stableJson(archiveRecord))}`;
            if (!reopenedByStore.has(cacheKey))
              reopenedByStore.set(
                cacheKey,
                reopenRecipientArchive({
                  archiveRecord,
                  store,
                  occurrences,
                  registryKeys: keys,
                  npmCli,
                }),
              );
            verified = await reopenedByStore.get(cacheKey);
          }
        } else {
          if (evidenceDirectory)
            sharedOutput ??= createOutputDirectory(repositoryRoot, store);
          const target = evidenceDirectory ? await sharedOutput : directory;
          const cacheKey = `${target}\0${artifactId}`;
          if (!collectedByStore.has(cacheKey))
            collectedByStore.set(
              cacheKey,
              inTemporaryArchiveRoot(async (stagingRoot) => {
                const { acquireRecipientRegistryArtifact } =
                  await import("../acquire-npm-package-evidence.mjs");
                const acquired = await acquireRecipientRegistryArtifact({
                  identity,
                  occurrences,
                  stagingRoot,
                  corpusRoot: target,
                  registryKeys: keys,
                  scancode,
                  fetchImpl,
                  sleep,
                  downloadTarball,
                  verifyPackageMetadata,
                  scanArtifact,
                  pacoteClient,
                });
                const archiveRecord = recipientArchiveRecord(
                  { ...identity, ...acquired.evidence },
                  acquired.tarballBlob,
                  acquired.blobs,
                  compactArchiveMaterial(acquired.materialEvidence),
                );
                return { archiveRecord, verified: acquired.materialEvidence };
              }, true),
            );
          ({ archiveRecord, verified } = await collectedByStore.get(cacheKey));
        }
      }
      validateBundledPackageClaims(verified.archive, occurrences);
      artifacts.push(archiveRecord);
      decisions.push(
        ...materialDecisions({
          occurrences,
          artifact: archiveRecord,
          ...verified,
          canonicalMaterials: canonical.materials.get(artifactId) ?? [],
          compactMeasurements: !original && compactReadback,
        }),
      );
    }
    artifacts.sort((left, right) =>
      compareCodeUnits(left.artifactId, right.artifactId),
    );
    decisions.sort((left, right) =>
      compareCodeUnits(left.location, right.location),
    );
    const usedKeyIds = new Set(
      artifacts.flatMap(({ registrySignature }) =>
        registrySignature.signatures.map(({ keyid }) => keyid),
      ),
    );
    const expected = {
      schemaVersion: 1,
      policy: RECIPIENT_MATERIAL_POLICY,
      archivePolicySha256: sha256(stableJson(archiveEvidencePolicy())),
      registryKeysSha256: sha256(
        stableJson(
          [...usedKeyIds]
            .sort(compareCodeUnits)
            .map((id) => registryKeys.get(id)),
        ),
      ),
      subject,
      canonicalEvidence: canonical.descriptor,
      status: decisions.some(({ reasons }) => reasons.length)
        ? "REQUIRES_HUMAN_REVIEW"
        : "PASSED",
      artifacts,
      decisions,
    };
    if (reading)
      assert.equal(
        stableJson(record),
        stableJson(expected),
        "Recipient material decision differs from independently verified evidence",
      );
    else await writeFile(recordPath, stableJson(expected), { flag: "wx" });
    return expected;
  }

  return {
    async collect({ directory, resolution, lockfileBytes }) {
      directory = await createOutputDirectory(repositoryRoot, directory);
      try {
        return await evaluate({
          directory,
          resolution,
          lockfileBytes,
          reading: false,
        });
      } catch (error) {
        // The diagnostic is safe to transport. Native failures remain in their
        // private working root and cannot masquerade as eligible observations.
        await writeFile(
          join(directory, "recipient-material-failure.json"),
          stableJson({
            schemaVersion: 1,
            status: "INCOMPLETE",
            policy: RECIPIENT_MATERIAL_POLICY,
            code: /^[A-Z][A-Z_]{1,127}$/u.test(error.code)
              ? error.code
              : "RECIPIENT_MATERIAL_INVALID",
          }),
          { flag: "wx" },
        );
        throw error;
      }
    },
    async read({ directory, resolution, lockfileBytes, recordSha256 }) {
      return evaluate({
        directory: await realpath(directory),
        resolution,
        lockfileBytes,
        reading: true,
        recordSha256,
      });
    },
    async verifyRetained({
      recordBytes,
      recordSha256,
      resolution,
      lockfileBytes,
      requireDirectNovel = false,
    }) {
      assert.ok(
        Buffer.isBuffer(recordBytes) && recordBytes.length <= 16 * 1024 * 1024,
        "Retained material requires bounded original record bytes",
      );
      assert.match(
        recordSha256 ?? "",
        sha256Pattern,
        "Retained material requires the authenticated original job record digest",
      );
      const record = await evaluate({
        resolution,
        lockfileBytes,
        reading: true,
        recordSha256,
        retainedBytes: recordBytes,
        compactReadback: !requireDirectNovel,
      });
      const novelArtifactIds = record.artifacts
        .filter(({ source }) => source === "RECIPIENT_ARCHIVE")
        .map(({ artifactId }) => artifactId);
      return {
        record,
        novelArtifactIds,
        verification:
          novelArtifactIds.length === 0
            ? "ORIGINAL_CORPUS_REVERIFIED"
            : requireDirectNovel
              ? "DIRECT_ARCHIVE_READBACK"
              : "AUTHENTICATED_COLLECTOR_METADATA",
      };
    },
  };
}

/** Retain a material decision and exact evidence for one prepared observation. */
export async function collectRecipientMaterial({
  directory,
  resolution,
  lockfileBytes,
  ...options
}) {
  return (await prepareRecipientMaterial(options)).collect({
    directory,
    resolution,
    lockfileBytes,
  });
}

/** Reopen the independently selected sources and recompute a retained decision. */
export async function readRecipientMaterial({
  directory,
  resolution,
  lockfileBytes,
  recordSha256,
  ...options
}) {
  return (await prepareRecipientMaterial(options)).read({
    directory,
    resolution,
    lockfileBytes,
    recordSha256,
  });
}

/** Check retained job-authenticated material without distributing raw archives.
 * Canonical facts and registry signatures are reverified. Novel ScanCode and
 * provenance measurements come from the trusted acquisition job. A caller
 * requiring direct novel audit must supply its independently authorized store. */
export async function verifyRetainedMaterialDecision({
  recordBytes,
  recordSha256,
  resolution,
  lockfileBytes,
  requireDirectNovel,
  ...options
}) {
  return (await prepareRecipientMaterial(options)).verifyRetained({
    recordBytes,
    recordSha256,
    resolution,
    lockfileBytes,
    requireDirectNovel,
  });
}
