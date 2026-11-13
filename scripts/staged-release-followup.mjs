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
} from "./github-release.mjs";
import { readCheckpoint } from "./release-history-checkpoint.mjs";
import {
  hash,
  originArtifact,
  originalBytes,
  originalManifest,
} from "./staged-release.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import { verifyLocalReleaseTag } from "./verify-release-tag.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";

const repo = "Hadden-Industries/owlapi";
const tag = "v" + PACKAGE_VERSION;
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

export async function readStageContext(client, env, checkpoint, mode) {
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
  assert.equal(operation.version, PACKAGE_VERSION);
  assert.match(operation.manifestSha256, /^[a-f0-9]{64}$/u);
  const origin = {
    ...env,
    QUALIFICATION_RUN: operation.qualificationRun,
    QUALIFICATION_ATTEMPT: operation.qualificationAttempt,
    MANIFEST_SHA256: operation.manifestSha256,
  };
  const { manifest, manifestBytes, candidate } = await originalManifest(
    client,
    origin,
    checkpoint,
  );
  const a = await originArtifact(
    client,
    {
      runId: operation.stageRun,
      attempt: operation.stageAttempt,
      filename: ".github/workflows/stage-release.yml",
      commit: manifest.commit,
      logical:
        "release-stage-" + operation.stageRun + "-" + operation.stageAttempt,
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
  const rows = journal
    .toString()
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    rows.map((r) => r.state),
    ["REQUESTED", "STAGED"],
  );
  const receipt = rows[1];
  assert.deepEqual(
    [
      receipt.commit,
      receipt.manifestSha256,
      receipt.runId,
      receipt.attempt,
      receipt.qualificationRun,
      receipt.qualificationAttempt,
    ],
    [
      manifest.commit,
      operation.manifestSha256,
      operation.stageRun,
      operation.stageAttempt,
      manifest.runId,
      manifest.attempt,
    ],
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
    receipt,
    privateProof,
    read,
  };
}
async function draft(client, ctx) {
  const { operation, manifest, read } = ctx;
  assert.equal(operation.expectedReleaseId, null);
  assert.equal(
    await client.getReleaseByTag(tag),
    null,
    "Draft exists; reconcile its original ID",
  );
  const result = await client.write("/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: manifest.commit,
      name: "owlapi " + PACKAGE_VERSION,
      body: read("release-notes.md").toString("utf8"),
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
  const release = result.value;
  assertDraftRelease(release, { tag });
  for (const item of Object.values(manifest.assets))
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
async function approvedDraft(client, ctx) {
  const { operation, read, manifest } = ctx;
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
    assets: live.assets,
    expected: Object.values(manifest.assets),
  });
  const approval = parse(read("approval.json"));
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
async function seal(client, ctx, checkpoint) {
  const { operation, manifest, read } = ctx;
  const report = parse(read("public.json"));
  assert.equal(report.result, "PASS");
  assert.equal(report.coordinate, PACKAGE_NAME + "@" + PACKAGE_VERSION);
  assert.equal(report.tarballSha256, manifest.assets.tarball.sha256);
  assert.equal(report.integrity, manifest.integrity);
  assert.equal(
    report.provenance.workflow,
    ".github/workflows/stage-release.yml",
  );
  assert.equal(report.provenance.runId, ctx.receipt.runId);
  assert.equal(report.provenance.runAttempt, Number(ctx.receipt.attempt));
  assert.equal(report.provenance.sourceCommit, manifest.commit);
  assert.equal(report.publication.stageId, operation.stageId);
  const a = await originArtifact(
    client,
    {
      runId: operation.publicRun,
      attempt: operation.publicAttempt,
      filename: ".github/workflows/release-registry.yml",
      commit: manifest.commit,
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
  await approvedDraft(client, ctx);
  const archiveEntries = new Map();
  for (const name of [
    "private-check.json",
    "draft.json",
    "approval.json",
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
        commit: manifest.commit,
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
        manifest.commit,
        operation.publicRun,
        operation.publicAttempt,
        manifest.assets.tarball.sha256,
      ],
    );
    archiveEntries.set(logical + ".json", entries[0].content);
  }
  archiveEntries.set("manifest.json", ctx.manifestBytes);
  archiveEntries.set("stage-journal.jsonl", ctx.journal);
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
    "hadden-industries-owlapi-" + PACKAGE_VERSION + ".evidence.json.gz",
    archive,
  );
  const evidence = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 6,
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
  const evidenceInfo = asset(
    "hadden-industries-owlapi-" + PACKAGE_VERSION + ".release-evidence.json",
    evidence,
  );
  await upload(client, operation.releaseId, archiveInfo, archive);
  await upload(client, operation.releaseId, evidenceInfo, evidence);
  const expected = [
    ...Object.values(manifest.assets),
    archiveInfo,
    evidenceInfo,
  ];
  const draft = await client.read("/releases/" + operation.releaseId);
  assertDraftRelease(draft, { tag });
  assertReleaseAssets({ assets: draft.assets, expected });
  const result = await client.write("/releases/" + operation.releaseId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft: false,
      prerelease: true,
      make_latest: "false",
    }),
  });
  assert.equal(
    result.state,
    "CONFIRMED",
    "Ambiguous seal requires immutable readback",
  );
  return {
    state: "SEALED",
    releaseId: operation.releaseId,
    tagObject: operation.tagObject,
    source: manifest.commit,
    assets: expected,
  };
}
export async function completeRelease(client, env, checkpoint) {
  const { runGh, waitForReleaseAttestation, downloadAsset } =
    await import("./verify-immutable-release.mjs");
  const record = parse(checkpoint.files.get("seal.json"));
  assert.equal(record.state, "SEALED");
  assert.ok(positive(record.releaseId));
  const expectedNames = [
    "SHA256SUMS",
    ...[".cdx.json", ".tgz", ".release-evidence.json", ".evidence.json.gz"].map(
      (s) => "hadden-industries-owlapi-" + PACKAGE_VERSION + s,
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
    const ctx = await readStageContext(client, env, checkpoint, mode);
    if (mode === "draft") result = await draft(client, ctx);
    else if (mode === "registry") result = await registryProof(client, ctx);
    else {
      assert.equal(mode, "seal");
      result = await seal(client, ctx, checkpoint);
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
