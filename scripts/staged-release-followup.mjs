import { validateStagedReleaseEvidence } from "./staged-evidence.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, crc32 } from "node:zlib";
import {
  GitHubReleaseClient,
  assertDraftRelease,
  assertReleaseAssets,
  assertReleaseAssetSubset,
} from "./github-release.mjs";
import {
  readCheckpoint,
  verifyControllerDelta,
} from "./release-history-checkpoint.mjs";
import {
  hash,
  originArtifact,
  originalBytes,
  originalManifest,
  readStageJournal,
} from "./staged-release.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import { verifyLocalReleaseTag } from "./verify-release-tag.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { PACKAGE_NAME, NPM_REGISTRY } from "./package-identity.mjs";

const repo = "Hadden-Industries/owlapi";

const parse = (bytes) => JSON.parse(bytes.toString("utf8"));
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const asset = (name, bytes) => ({
  name,
  bytes: bytes.length,
  sha256: hash(bytes),
});
const single = (items, message) => {
  assert.equal(items.length, 1, message);
  return items[0];
};

export async function readStageContext(client, env, checkpoint, mode, renewal) {
  assert.equal(env.GITHUB_REPOSITORY, repo);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  const read = (name) => {
    assert.ok(
      checkpoint.files.has(name),
      "Missing signed checkpoint payload " + name,
    );
    return checkpoint.files.get(name);
  };
  const operation = parse(read("operation.json"));
  assert.equal(operation.type, mode);
  assert.match(operation.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u);
  const tag = "v" + operation.version;
  assert.match(operation.manifestSha256, /^[a-f0-9]{64}$/u);
  assert.match(operation.source, /^[a-f0-9]{40}$/u);
  assert.equal(
    renewal?.controller ?? operation.controller,
    env.GITHUB_SHA,
    "Operation requires owner approval for the executing controller",
  );
  verifyControllerDelta(
    operation.source,
    operation.controller,
    checkpoint.files,
  );
  const origin = {
    ...env,
    GITHUB_SHA: operation.source,
    QUALIFIED_VERSION: operation.version,
    QUALIFICATION_RUN: operation.qualificationRun,
    QUALIFICATION_ATTEMPT: operation.qualificationAttempt,
    MANIFEST_SHA256: operation.manifestSha256,
  };
  const { manifest, manifestBytes, candidate } = await originalManifest(
    client,
    origin,
    checkpoint,
  );
  const stageController = operation.stageController ?? manifest.commit;
  assert.match(stageController, /^[a-f0-9]{40}$/u);
  const a = await originArtifact(
    client,
    {
      runId: operation.stageRun,
      attempt: operation.stageAttempt,
      filename: ".github/workflows/stage-release.yml",
      commit: stageController,
      logical:
        "release-stage-" + operation.stageRun + "-" + operation.stageAttempt,
      stageFailure: "retention",
      requireArchivedFailure: mode === "seal",
    },
    checkpoint,
  );
  const archive = await originalBytes(client, a);
  assert.equal("sha256:" + hash(archive), a.digest);
  const files = readZipArchiveFilesWith(archive, { crc32 });
  assert.deepEqual(
    files.map((f) => f.path),
    ["journal.jsonl"],
  );
  const journal = files[0].content;
  const receipt = readStageJournal(
    journal,
    manifest,
    operation.manifestSha256,
    {
      runId: operation.stageRun,
      attempt: operation.stageAttempt,
      controller: stageController,
    },
  );
  const privateProof = parse(read("private-check.json"));
  assert.deepEqual(privateProof, {
    ...receipt,
    state: "PRIVATE_BYTES_VERIFIED",
    sha256: manifest.assets.tarball.sha256,
    integrity: manifest.integrity,
  });
  assert.equal(operation.stageId, receipt.stageId);
  const ref = await client.read("/git/ref/tags/" + tag);
  assert.equal(ref.object.type, "tag");
  assert.equal(ref.object.sha, operation.tagObject);
  const remote = await client.read("/git/tags/" + ref.object.sha);
  assert.equal(remote.object.sha, manifest.commit);
  assert.equal(remote.tag, tag);
  assert.equal(remote.verification?.verified, true);
  assert.equal(
    execFileSync("git", ["rev-parse", "refs/tags/" + tag], {
      encoding: "utf8",
    }).trim(),
    ref.object.sha,
  );
  verifyLocalReleaseTag({
    repositoryRoot: process.cwd(),
    expectedTag: tag,
    expectedCommit: manifest.commit,
    registry: parse(readFileSync("docs/provenance/release-signers.json")),
    releaseDate: new Date().toISOString().slice(0, 10),
  });
  return {
    operation,
    manifest,
    manifestBytes,
    candidate,
    journal,
    retentionFailure: a.retentionFailure,
    receipt,
    privateProof,
    read,
  };
}
export async function draft(client, ctx) {
  const { operation, manifest, read } = ctx;
  const tag = "v" + operation.version;
  const notes = read("release-notes.md").toString("utf8");
  assert.deepEqual(Object.keys(manifest.assets).sort(), [
    "checksums",
    "sbom",
    "tarball",
  ]);
  for (const item of Object.values(manifest.assets))
    assert.deepEqual(asset(item.name, read(item.name)), item);
  let release = await client.getReleaseByTag(tag);
  if (positive(operation.expectedReleaseId)) {
    assert.equal(
      release?.id,
      operation.expectedReleaseId,
      "Reconciliation needs the original draft ID",
    );
  } else {
    assert.equal(operation.expectedReleaseId, null);
    assert.equal(
      release,
      null,
      "Existing draft requires signed reconciliation",
    );
    const result = await client.write("/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: manifest.commit,
        name: "owlapi " + operation.version,
        body: notes,
        draft: true,
        prerelease: true,
        make_latest: "false",
      }),
    });
    assert.equal(
      result.state,
      "CONFIRMED",
      "Ambiguous draft creation requires owner reconciliation",
    );
    release = result.value;
  }
  assertDraftRelease(release, { tag });
  assert.equal(release.body, notes);
  assertReleaseAssetSubset({
    assets: release.assets,
    expected: Object.values(manifest.assets),
  });
  for (const item of Object.values(manifest.assets))
    if (!release.assets.some((a) => a.name === item.name))
      await upload(client, release.id, item, read(item.name));
  const observed = await client.read("/releases/" + release.id);
  assertDraftRelease(observed, { tag });
  assertReleaseAssets({
    assets: observed.assets,
    expected: Object.values(manifest.assets),
  });
  return {
    state: "DRAFT_VERIFIED",
    releaseId: release.id,
    tagObject: operation.tagObject,
    stageId: operation.stageId,
    manifestSha256: operation.manifestSha256,
  };
}
async function upload(client, id, item, bytes) {
  assert.ok(positive(id));
  assert.deepEqual(asset(item.name, bytes), item);
  const result = await client.write(
    "/releases/" + id + "/assets?name=" + encodeURIComponent(item.name),
    {
      method: "POST",
      upload: true,
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    },
  );
  assert.equal(
    result.state,
    "CONFIRMED",
    "Asset acknowledgement missing; inspect original draft",
  );
}
async function approvedDraft(client, ctx, extraAssets = []) {
  const { operation, read, manifest } = ctx;
  const tag = "v" + operation.version;
  const proof = parse(read("draft.json"));
  assert.deepEqual(proof, {
    state: "DRAFT_VERIFIED",
    releaseId: operation.releaseId,
    tagObject: operation.tagObject,
    stageId: operation.stageId,
    manifestSha256: operation.manifestSha256,
  });
  assert.ok(positive(proof.releaseId));
  const live = await client.read("/releases/" + proof.releaseId);
  assertDraftRelease(live, { tag });
  assert.equal(live.prerelease, true);
  assertReleaseAssets({
    assets: live.assets.filter(
      (a) => !extraAssets.some((extra) => extra.name === a.name),
    ),
    expected: Object.values(manifest.assets),
  });
  assert.equal(live.body, read("release-notes.md").toString("utf8"));
  assert.equal(live.name, "owlapi " + operation.version);
  if (operation.type === "before-approval") {
    const tags = parse(
      await readPublicRegistry(
        new URL(
          "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
          NPM_REGISTRY,
        ),
      ),
    );
    const observed = Object.fromEntries(
      ["pilot", "latest", "next"].map((name) => [name, tags[name] ?? null]),
    );
    assert.deepEqual(
      observed,
      ctx.receipt.before,
      "Public label changed while awaiting approval",
    );
    const latest =
      (await client.read("/releases/latest", { accept404: true }))?.id ?? null;
    assert.equal(latest, ctx.receipt.githubLatestBefore);
    return {
      state: "READY_FOR_OWNER_APPROVAL",
      releaseId: live.id,
      stageId: operation.stageId,
      manifestSha256: operation.manifestSha256,
      labels: observed,
      githubLatest: latest,
      checkedAt: new Date().toISOString(),
    };
  }
  const preapproval = read("before-approval.json");
  const verified = parse(preapproval);
  const approval = parse(read("approval.json"));
  assert.equal(approval.preapprovalSha256, hash(preapproval));
  assert.equal(verified.state, "READY_FOR_OWNER_APPROVAL");
  assert.deepEqual(
    [
      verified.releaseId,
      verified.stageId,
      verified.manifestSha256,
      verified.labels,
      verified.githubLatest,
    ],
    [
      live.id,
      operation.stageId,
      operation.manifestSha256,
      ctx.receipt.before,
      ctx.receipt.githubLatestBefore,
    ],
  );
  assert.ok(
    Date.parse(live.created_at) <= Date.parse(verified.checkedAt) &&
      Date.parse(verified.checkedAt) <= Date.parse(approval.approvedAt) &&
      Date.parse(approval.approvedAt) - Date.parse(verified.checkedAt) <=
        5 * 60 * 1000,
  );
  assert.equal(approval.stageId, operation.stageId);
  assert.equal(approval.releaseId, proof.releaseId);
  assert.equal(approval.state, "APPROVED");
  assert.ok(
    Date.parse(live.created_at) <= Date.parse(approval.approvedAt) &&
      Date.parse(approval.approvedAt) <= Date.now(),
    "Approval must follow draft creation",
  );
  return approval;
}
async function registryProof(client, ctx) {
  const approval = await approvedDraft(client, ctx);
  const { PACKAGE_VERSION } = await import("./package-identity.mjs");
  assert.equal(
    ctx.operation.version,
    PACKAGE_VERSION,
    "Use the reviewed recipient controller for the qualified package version",
  );
  const { qualifyPublicRegistry } =
    await import("./qualify-public-registry.mjs");
  const { manifest, receipt } = ctx;
  const proof = await qualifyPublicRegistry({
    candidate: { package: manifest.package, tarball: manifest.assets.tarball },
    outputPath: ".release/followup/public.json",
    stageOrigin: { ...receipt, approvedAt: approval.approvedAt },
    publication: () => ({ ...receipt, acceptedAt: approval.approvedAt }),
  });
  const matrix = JSON.parse(
    manifest.qualification.runtime_matrix.outputs.matrix,
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    "matrix=" +
      JSON.stringify(matrix) +
      "\ntarball=" +
      manifest.assets.tarball.sha256 +
      "\n",
  );
  return proof;
}
export function checkSealSettings(operationBytes, renewal, now = Date.now()) {
  const operation = parse(operationBytes);
  assert.equal(operation.type, "seal");
  if (renewal)
    assert.equal(
      renewal.operationSha256,
      hash(operationBytes),
      "Settings renewal must bind the original seal operation bytes",
    );
  const settings = (renewal ?? operation).immutableReleases;
  assert.ok(settings, "Seal settings require top-level immutableReleases");
  assert.equal(
    settings.evidence.url,
    "https://api.github.com/repos/" + repo + "/immutable-releases",
  );
  assert.equal(typeof settings.responseJson, "string");
  assert.equal(
    hash(settings.responseJson),
    settings.evidence.sha256,
    "Immutable settings response digest mismatch",
  );
  assert.equal(
    JSON.parse(settings.responseJson).enabled,
    true,
    "Immutable releases must be enabled",
  );
  const checked = Date.parse(settings.checkedAt);
  assert.ok(
    checked <= now && now - checked <= 3_600_000,
    "Immutable settings read must be at most one hour old",
  );
}
async function readSealRenewal(
  client,
  objectId,
  original,
  executingController,
) {
  const checkpoint = await readCheckpoint(client, objectId);
  const renewal = parse(checkpoint.files.get("seal-settings.json"));
  const operationBytes = original.files.get("operation.json");
  const operation = parse(operationBytes);
  assert.equal(operation.type, "seal");
  assert.equal(renewal.operationSha256, hash(operationBytes));
  assert.equal(renewal.controller ?? operation.controller, executingController);
  verifyControllerDelta(
    operation.controller,
    executingController,
    checkpoint.files,
  );
  return { ...renewal, checkpoint: checkpoint.objectId };
}
async function seal(client, ctx, checkpoint, renewal) {
  const { operation, manifest, read } = ctx;
  const operationBytes = read("operation.json");
  checkSealSettings(operationBytes, renewal);
  const tag = "v" + operation.version;
  const report = parse(read("public.json"));
  assert.equal(report.result, "PASS");
  assert.equal(report.coordinate, PACKAGE_NAME + "@" + operation.version);
  assert.equal(report.tarballSha256, manifest.assets.tarball.sha256);
  assert.equal(report.integrity, manifest.integrity);
  assert.equal(
    report.provenance.workflow,
    ".github/workflows/stage-release.yml",
  );
  assert.equal(report.provenance.runId, ctx.receipt.runId);
  assert.equal(report.provenance.runAttempt, Number(ctx.receipt.attempt));
  assert.equal(
    report.provenance.sourceCommit,
    ctx.receipt.controller ?? manifest.commit,
  );
  assert.equal(report.publication.stageId, operation.stageId);
  const a = await originArtifact(
    client,
    {
      runId: operation.publicRun,
      attempt: operation.publicAttempt,
      filename: ".github/workflows/release-registry.yml",
      commit: operation.publicController,
      logical:
        "release-registry-" +
        operation.publicRun +
        "-" +
        operation.publicAttempt,
    },
    checkpoint,
  );
  const zip = await originalBytes(client, a, 16 * 1024 * 1024);
  assert.equal("sha256:" + hash(zip), a.digest);
  const files = readZipArchiveFilesWith(zip, { crc32 });
  assert.ok(
    single(
      files.filter((f) => f.path === "public.json"),
      "Missing original registry proof",
    ).content.equals(read("public.json")),
  );
  const archiveEntries = new Map();
  for (const name of [
    "private-check.json",
    "draft.json",
    "approval.json",
    "before-approval.json",
    "operation.json",
    "public.json",
    "release-notes.md",
  ])
    archiveEntries.set(name, read(name));
  // Only the owner's explicit public inventory can cross from the private checkpoint to release assets.
  const publicIndex = parse(read("public-inventory.json"));
  assert.equal(publicIndex.manifestSha256, operation.manifestSha256);
  for (const artifact of manifest.artifacts) {
    const name = "artifact-" + artifact.id + ".zip";
    const original = read(name);
    assert.equal("sha256:" + hash(original), artifact.digest);
    assert.equal(original.length, artifact.bytes);
    assert.ok(
      publicIndex.files.includes(name),
      "Qualification archive requires disclosure review",
    );
  }
  for (const name of publicIndex.files) {
    assert.ok(!archiveEntries.has(name), "Duplicate public archive entry");
    archiveEntries.set(name, read(name));
  }
  archiveEntries.set("public-inventory.json", read("public-inventory.json"));
  const matrix = JSON.parse(
    manifest.qualification.runtime_matrix.outputs.matrix,
  );
  for (const lane of matrix.include) {
    const logical =
      "public-recipient-" +
      lane.runner +
      "-" +
      lane.node +
      "-" +
      operation.publicAttempt;
    const a = await originArtifact(
      client,
      {
        runId: operation.publicRun,
        attempt: operation.publicAttempt,
        filename: ".github/workflows/release-registry.yml",
        commit: operation.publicController,
        logical,
      },
      checkpoint,
    );
    const bytes = await originalBytes(client, a);
    assert.equal("sha256:" + hash(bytes), a.digest);
    const entries = readZipArchiveFilesWith(bytes, { crc32 });
    assert.deepEqual(
      entries.map((e) => e.path),
      ["lane.json"],
    );
    const proof = parse(entries[0].content);
    assert.deepEqual(proof.lane, lane);
    assert.deepEqual(
      [proof.commit, proof.run, proof.attempt, proof.tarballSha256],
      [
        operation.publicController,
        operation.publicRun,
        operation.publicAttempt,
        manifest.assets.tarball.sha256,
      ],
    );
    archiveEntries.set(logical + ".json", entries[0].content);
  }
  archiveEntries.set("manifest.json", ctx.manifestBytes);
  archiveEntries.set("stage-journal.jsonl", ctx.journal);
  if (ctx.retentionFailure) {
    assert.ok(!archiveEntries.has("stage-retention-failure.json"));
    archiveEntries.set(
      "stage-retention-failure.json",
      Buffer.from(JSON.stringify(ctx.retentionFailure) + "\n"),
    );
  }
  const archive = gzipSync(
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        checkpoint: checkpoint.objectId,
        files: [...archiveEntries].map(([name, bytes]) => ({
          ...asset(name, bytes),
          base64: bytes.toString("base64"),
        })),
      }),
    ),
  );
  const archiveInfo = asset(
    "hadden-industries-owlapi-" + operation.version + ".evidence.json.gz",
    archive,
  );
  const evidence = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 7,
        releaseId: operation.releaseId,
        source: manifest.commit,
        tagObject: operation.tagObject,
        stage: ctx.receipt,
        publicVerification: report,
        archive: archiveInfo,
        assets: manifest.assets,
      },
      null,
      2,
    ) + "\n",
  );
  validateStagedReleaseEvidence(parse(evidence));
  const evidenceInfo = asset(
    "hadden-industries-owlapi-" + operation.version + ".release-evidence.json",
    evidence,
  );
  const expected = [
    ...Object.values(manifest.assets),
    archiveInfo,
    evidenceInfo,
  ];
  assert.ok(
    expected.every((a) => a.bytes <= 64 * 1024 * 1024),
    "Asset exceeds immutable verification limit",
  );
  await approvedDraft(client, ctx, [archiveInfo, evidenceInfo]);
  const existing = await client.read("/releases/" + operation.releaseId);
  assertReleaseAssetSubset({ assets: existing.assets, expected });
  checkSealSettings(operationBytes, renewal);
  for (const [item, bytes] of [
    [archiveInfo, archive],
    [evidenceInfo, evidence],
  ])
    if (!existing.assets.some((a) => a.name === item.name))
      await upload(client, operation.releaseId, item, bytes);
  const draft = await client.read("/releases/" + operation.releaseId);
  assertDraftRelease(draft, { tag });
  assertReleaseAssets({ assets: draft.assets, expected });
  checkSealSettings(operationBytes, renewal);
  const record = {
    state: "SEAL_REQUESTED",
    ...(renewal ? { settingsCheckpoint: renewal.checkpoint } : {}),
    checkpoint: checkpoint.objectId,
    controller: renewal?.controller ?? operation.controller,
    notesSha256: hash(read("release-notes.md")),
    version: operation.version,
    prerelease: true,
    releaseId: operation.releaseId,
    tagObject: operation.tagObject,
    source: manifest.commit,
    assets: expected,
  };
  writeFileSync(
    ".release/followup/seal-request.json",
    JSON.stringify(record) + "\n",
    { flag: "wx", flush: true },
  );
  const result = await client.write("/releases/" + operation.releaseId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft: false,
      name: "owlapi " + operation.version,
      body: read("release-notes.md").toString("utf8"),
      prerelease: true,
      make_latest: "false",
    }),
  });
  assert.equal(
    result.state,
    "CONFIRMED",
    "Ambiguous seal requires immutable readback",
  );
  return { ...record, state: "SEALED" };
}
export async function reconcilePublishedSeal(client, request) {
  assert.equal(request.state, "SEAL_REQUESTED");
  assert.ok(positive(request.releaseId));
  const release = await client.read("/releases/" + request.releaseId);
  assert.deepEqual(
    [
      release.id,
      release.tag_name,
      release.immutable,
      release.draft,
      release.prerelease,
      release.name,
      hash(release.body),
    ],
    [
      request.releaseId,
      "v" + request.version,
      true,
      false,
      true,
      "owlapi " + request.version,
      request.notesSha256,
    ],
  );
  assertReleaseAssets({ assets: release.assets, expected: request.assets });
  return { ...request, state: "SEALED" };
}
async function recoverSeal(client, checkpoint) {
  const origin = parse(checkpoint.files.get("seal-origin.json"));
  const a = await originArtifact(
    client,
    {
      runId: origin.runId,
      attempt: origin.attempt,
      commit: origin.controller,
      filename: ".github/workflows/github-release.yml",
      logical: "github-release-" + origin.runId + "-" + origin.attempt,
      recoverSeal: true,
    },
    checkpoint,
  );
  const archive = readZipArchiveFilesWith(await originalBytes(client, a), {
    crc32,
  });
  const file = single(
    archive.filter((f) => f.path === "seal-request.json"),
    "Missing attributable seal request",
  );
  const request = parse(file.content);
  assert.equal(hash(file.content), origin.requestSha256);
  assert.deepEqual(
    [request.checkpoint, request.controller],
    [origin.checkpoint, origin.controller],
  );
  const original = await readCheckpoint(client, origin.checkpoint);
  const operation = parse(original.files.get("operation.json"));
  if (request.settingsCheckpoint)
    await readSealRenewal(
      client,
      request.settingsCheckpoint,
      original,
      request.controller,
    );
  else assert.equal(operation.controller, request.controller);
  assert.deepEqual(
    [
      operation.type,
      operation.version,
      operation.releaseId,
      operation.tagObject,
      operation.source,
    ],
    [
      "seal",
      request.version,
      request.releaseId,
      request.tagObject,
      request.source,
    ],
  );
  assert.equal(
    request.notesSha256,
    hash(original.files.get("release-notes.md")),
  );
  return reconcilePublishedSeal(client, request);
}
export async function completeRelease(client, env, checkpoint) {
  const { runGh, waitForReleaseAttestation, downloadAsset } =
    await import("./verify-immutable-release.mjs");
  const record = checkpoint.files.has("seal.json")
    ? parse(checkpoint.files.get("seal.json"))
    : await recoverSeal(client, checkpoint);
  assert.equal(record.state, "SEALED");
  assert.match(record.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u);
  const tag = "v" + record.version;
  assert.ok(positive(record.releaseId));
  const expectedNames = [
    "SHA256SUMS",
    ...[".cdx.json", ".tgz", ".release-evidence.json", ".evidence.json.gz"].map(
      (s) => "hadden-industries-owlapi-" + record.version + s,
    ),
  ];
  assert.deepEqual(
    record.assets.map((a) => a.name).sort(),
    expectedNames.sort(),
  );
  const { release } = await waitForReleaseAttestation({
    read: (path) => client.read(path),
    tag,
    tagSha: record.tagObject,
    sourceCommit: record.source,
    releaseId: record.releaseId,
    expectedAssets: record.assets,
    prerelease: record.prerelease,
  });
  await runGh(
    "gh",
    ["release", "verify", tag, "--repo", repo, "--format", "json"],
    env.GH_TOKEN,
  );
  for (const a of release.assets) {
    const file = await downloadAsset({
      repository: repo,
      token: env.GH_TOKEN,
      asset: a,
      directory: ".release/followup",
    });
    assert.equal(
      hash(readFileSync(file)),
      record.assets.find((item) => item.name === basename(file)).sha256,
    );
    await runGh(
      "gh",
      [
        "release",
        "verify-asset",
        tag,
        file,
        "--repo",
        repo,
        "--format",
        "json",
      ],
      env.GH_TOKEN,
    );
  }
  return { ...record, state: "IMMUTABLE_VERIFIED" };
}
async function main() {
  const mode = process.argv[2],
    env = process.env;
  if (mode === "check-seal-settings") {
    assert.ok(
      [4, 5].includes(process.argv.length),
      "Expected seal operation.json and optional seal-settings.json",
    );
    const operationBytes = readFileSync(process.argv[3]);
    const renewal = process.argv[4] && parse(readFileSync(process.argv[4]));
    checkSealSettings(operationBytes, renewal);
    return;
  }
  assert.equal(env.GITHUB_REPOSITORY, repo);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  const client = new GitHubReleaseClient({
    repository: repo,
    token: env.GH_TOKEN,
  });
  const checkpoint = await readCheckpoint(client, env.HISTORY_OBJECT);
  mkdirSync(".release/followup", { recursive: true });
  let result;
  if (mode === "complete")
    result = await completeRelease(client, env, checkpoint);
  else {
    const renewal =
      mode === "seal" && env.SETTINGS_OBJECT
        ? await readSealRenewal(
            client,
            env.SETTINGS_OBJECT,
            checkpoint,
            env.GITHUB_SHA,
          )
        : undefined;
    const ctx = await readStageContext(client, env, checkpoint, mode, renewal);
    if (mode === "draft") result = await draft(client, ctx);
    else if (mode === "before-approval")
      result = await approvedDraft(client, ctx);
    else if (mode === "registry") result = await registryProof(client, ctx);
    else {
      assert.equal(mode, "seal");
      result = await seal(client, ctx, checkpoint, renewal);
    }
  }
  writeFileSync(
    join(".release/followup", mode + ".json"),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
