import { readReleaseSecurity } from "./release-qualification-manifest.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32 } from "node:zlib";
import { matchesLogicalArtifact } from "../tooling/artifact-transport/identity.mjs";
import {
  readRunArtifacts,
  readWorkflowRuns,
} from "./github-evidence-reader.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import {
  readCheckpoint,
  verifyReservations,
  priorDisposition,
} from "./release-history-checkpoint.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  NPM_REGISTRY,
  releaseChannel,
} from "./package-identity.mjs";

const repo = "Hadden-Industries/owlapi";
const registry = NPM_REGISTRY;
const stageWorkflow = ".github/workflows/stage-release.yml";
const id = (value) => {
  assert.match(String(value), /^[1-9]\d{0,15}$/u);
  return String(value);
};
export const hash = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
const json = (bytes) => JSON.parse(bytes.toString("utf8"));
export function checkStageBytes(bytes, manifest) {
  assert.equal(bytes.length, manifest.assets.tarball.bytes);
  assert.equal(
    hash(bytes),
    manifest.assets.tarball.sha256,
    "Candidate SHA-256 mismatch",
  );
  assert.equal(
    "sha512-" + hash(bytes, "sha512", "base64"),
    manifest.integrity,
    "Candidate npm integrity mismatch",
  );
}
function subject(manifest) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.repository, repo);
  assert.equal(manifest.workflow, ".github/workflows/release.yml");
  assert.equal(manifest.package.name, PACKAGE_NAME);
  assert.match(
    manifest.package.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/u,
  );
  assert.equal(
    releaseChannel(manifest.package.version),
    "pilot",
    "Historical package cannot enter staged publication",
  );
  assert.deepEqual(manifest.packedConfig, {
    access: "public",
    registry,
    tag: "pilot",
  });
  assert.match(manifest.commit, /^[a-f0-9]{40}$/u);
}
export function verifyPrivateStage({
  manifest,
  receipt,
  view,
  bytes,
  manifestSha256,
}) {
  subject(manifest);
  assert.equal(receipt.state, "STAGED");
  assert.equal(receipt.manifestSha256, manifestSha256);
  assert.equal(receipt.commit, manifest.commit);
  assert.equal(receipt.stageId, view.id);
  assert.match(view.id, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu);
  assert.deepEqual(
    [view.packageName, view.version, view.tag],
    [PACKAGE_NAME, manifest.package.version, receipt.channel],
  );
  assert.ok(["pilot", "latest"].includes(view.tag));
  checkStageBytes(bytes, manifest);
  assert.equal(view.shasum, hash(bytes, "sha1"));
  return {
    ...receipt,
    state: "PRIVATE_BYTES_VERIFIED",
    sha256: hash(bytes),
    integrity: manifest.integrity,
  };
}
export async function originArtifact(
  client,
  {
    runId,
    attempt,
    filename,
    commit,
    logical,
    artifactId,
    recoverSeal = false,
  },
  checkpoint,
) {
  id(runId);
  id(attempt);
  const receiptName =
    "origin-" + runId + "-" + attempt + "-" + logical + ".json";
  const retained = checkpoint?.files.get(receiptName);
  const saved = retained && json(retained);
  const readAvailable = async (path) => {
    try {
      return await client.read(path);
    } catch (error) {
      if (saved && [404, 410].includes(error.httpStatus)) return null;
      throw error;
    }
  };
  const liveRun = await readAvailable(
    "/actions/runs/" + runId + "/attempts/" + attempt,
  );
  const run = liveRun ?? saved?.run;
  assert.ok(run, "Missing original run record");
  if (recoverSeal) {
    assert.equal(filename, ".github/workflows/github-release.yml");
    assert.ok(["success", "failure", "cancelled"].includes(run.conclusion));
  }
  assert.equal(run.repository.full_name, repo);
  assert.equal(run.head_repository.full_name, repo);
  assert.deepEqual(
    [
      String(run.id),
      String(run.run_attempt),
      run.path,
      run.event,
      run.head_branch,
      run.head_sha,
      run.status,
      run.conclusion,
    ],
    [
      String(runId),
      String(attempt),
      filename,
      "workflow_dispatch",
      "main",
      commit,
      "completed",
      recoverSeal ? run.conclusion : "success",
    ],
    "Unqualified original run or attempt",
  );
  const inventory = liveRun
    ? await (async () => {
        try {
          return await readRunArtifacts((path) => client.read(path), runId);
        } catch (e) {
          if (saved && [404, 410].includes(e.httpStatus)) return [];
          throw e;
        }
      })()
    : [];
  const matches = inventory.filter((a) =>
    matchesLogicalArtifact(a.name, logical, {
      run: runId,
      attempt,
      legacy: false,
    }),
  );
  assert.ok(matches.length <= 1, "Ambiguous original artifact");
  const pointer = matches[0] ?? saved?.artifact;
  assert.ok(pointer, "Missing original artifact");
  const current = await readAvailable("/actions/artifacts/" + id(pointer.id));
  const a = current ?? saved?.artifact;
  assert.equal(a.id, pointer.id);
  assert.equal(a.name, pointer.name);
  assert.equal(
    a.digest,
    pointer.digest,
    "Contradictory native artifact digest",
  );
  assert.equal(
    a.size_in_bytes,
    pointer.size_in_bytes,
    "Contradictory native artifact size",
  );
  assert.ok(
    matchesLogicalArtifact(a.name, logical, {
      run: runId,
      attempt,
      legacy: false,
    }),
  );
  if (current && !matches.length)
    assert.equal(current.expired, true, "Live original contradicts inventory");
  if (saved) {
    assert.equal(saved.artifact.id, a.id);
    assert.equal(saved.artifact.digest, a.digest);
  }
  assert.equal(a.workflow_run?.id, run.id);
  assert.equal(a.workflow_run.head_sha, commit);
  if (!current || a.expired) {
    const bytes = checkpoint?.files.get("artifact-" + a.id + ".zip");
    assert.ok(
      bytes && "sha256:" + hash(bytes) === a.digest,
      "Missing or altered retained original ZIP",
    );
    return validate({ ...a, archivedBytes: bytes });
  }
  return validate(a);
  function validate(a) {
    if (artifactId) assert.equal(String(a.id), id(artifactId));
    assert.match(a.digest, /^sha256:[0-9a-f]{64}$/u);
    return a;
  }
}
export async function originalBytes(
  client,
  artifact,
  maximum = 16 * 1024 * 1024,
) {
  const bytes =
    artifact.archivedBytes ??
    (await downloadReleaseArtifact(client, artifact, maximum));
  assert.ok(bytes.length <= maximum);
  assert.equal("sha256:" + hash(bytes), artifact.digest);
  return bytes;
}
export async function originalManifest(client, env, checkpoint) {
  const a = await originArtifact(
    client,
    {
      runId: env.QUALIFICATION_RUN,
      attempt: env.QUALIFICATION_ATTEMPT,
      filename: ".github/workflows/release.yml",
      commit: env.GITHUB_SHA,
      logical:
        "release-qualification-" +
        env.QUALIFICATION_RUN +
        "-" +
        env.QUALIFICATION_ATTEMPT,
    },
    checkpoint,
  );
  const archive = await originalBytes(client, a);
  assert.equal("sha256:" + hash(archive), a.digest);
  const files = readZipArchiveFilesWith(archive, { crc32 });
  assert.deepEqual(
    files.map((f) => f.path),
    ["manifest.json"],
  );
  const bytes = files[0].content;
  assert.equal(hash(bytes), env.MANIFEST_SHA256);
  const manifest = json(bytes);
  subject(manifest);
  assert.deepEqual(
    [manifest.runId, manifest.attempt, manifest.commit],
    [env.QUALIFICATION_RUN, env.QUALIFICATION_ATTEMPT, env.GITHUB_SHA],
  );
  assert.equal(
    manifest.package.version,
    env.QUALIFIED_VERSION ?? PACKAGE_VERSION,
  );
  const candidate = await originArtifact(
    client,
    {
      runId: manifest.runId,
      attempt: manifest.attempt,
      filename: manifest.workflow,
      commit: manifest.commit,
      logical:
        "hadden-industries-owlapi-" +
        manifest.package.version +
        "-candidate-" +
        manifest.runId +
        "-" +
        manifest.attempt,
      artifactId: manifest.candidateId,
    },
    checkpoint,
  );
  assert.equal(candidate.digest, "sha256:" + manifest.candidateDigest);
  return { manifest, candidate, manifestBytes: bytes };
}
export async function stageOnce({
  manifest,
  bytes,
  path,
  channel,
  before,
  env,
  journal,
  command,
}) {
  subject(manifest);
  assert.ok(["pilot", "latest"].includes(channel), "Unapproved stage channel");
  checkStageBytes(bytes, manifest);
  const common = {
    schemaVersion: 1,
    package: PACKAGE_NAME,
    version: manifest.package.version,
    channel,
    before,
    githubLatestBefore:
      env.GITHUB_LATEST_BEFORE === "null"
        ? null
        : Number(env.GITHUB_LATEST_BEFORE),
    commit: manifest.commit,
    manifestSha256: env.MANIFEST_SHA256,
    qualificationRun: manifest.runId,
    qualificationAttempt: manifest.attempt,
    workflow: stageWorkflow,
    runId: id(env.GITHUB_RUN_ID),
    attempt: id(env.GITHUB_RUN_ATTEMPT),
  };
  const record = (item) =>
    appendFileSync(journal, JSON.stringify({ ...common, ...item }) + "\n", {
      flush: true,
    });
  writeFileSync(journal, "", { flag: "wx" });
  record({ state: "REQUESTED" });
  try {
    const response = json(
      command([
        "stage",
        "publish",
        path,
        "--ignore-scripts",
        "--access=public",
        "--tag=" + channel,
        "--provenance",
        "--json",
        "--registry=" + registry,
      ]),
    );
    assert.deepEqual(Object.keys(response), [PACKAGE_NAME]);
    const item = response[PACKAGE_NAME];
    assert.deepEqual(
      [item.name, item.version, item.integrity],
      [PACKAGE_NAME, manifest.package.version, manifest.integrity],
    );
    assert.match(item.stageId, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu);
    const receipt = { state: "STAGED", stageId: item.stageId };
    record(receipt);
    return { ...common, ...receipt };
  } catch (error) {
    record({ state: "OUTCOME_UNKNOWN" });
    throw error;
  }
}
export async function assertPriorOperations(client, env, checkpoint, kind) {
  const workflows = {
    stage: ["stage-release.yml", "Stage the admitted tarball"],
    labels: ["release-labels.yml", "Apply approved npm labels (npm)"],
    classification: [
      "release-classification.yml",
      "Settle release classification (github)",
    ],
  };
  const [workflow, step] = workflows[kind];
  const prior = await readWorkflowRuns((path) => client.read(path), workflow);
  for (const run of prior.filter((r) => String(r.id) !== env.GITHUB_RUN_ID)) {
    assert.ok(
      run.status === "completed",
      "Concurrent or unresolved stage request",
    );
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const jobs = await client.read(
        "/actions/runs/" +
          id(run.id) +
          "/attempts/" +
          attempt +
          "/jobs?per_page=100",
      );
      assert.equal(jobs.jobs.length, jobs.total_count);
      const writes = jobs.jobs
        .flatMap((j) => j.steps ?? [])
        .filter((s) => s.name === step && !["skipped"].includes(s.conclusion));
      if (writes.length) {
        const disposition = priorDisposition(
          checkpoint,
          kind + "-" + run.id + "-" + attempt + ".json",
        );
        assert.equal(disposition.runId, String(run.id));
        assert.equal(disposition.attempt, String(attempt));
        assert.ok(
          (kind === "stage"
            ? ["REJECTED", "IMMUTABLE_VERIFIED", "WITHDRAWN"]
            : ["RECONCILED", "SETTLED"]
          ).includes(disposition.state),
        );
        if (kind === "classification" && env.OPERATION_SHA256)
          assert.notEqual(
            disposition.operationSha256,
            env.OPERATION_SHA256,
            "Reconcile original classification",
          );
        if (kind === "stage" && env.MANIFEST_SHA256)
          assert.notEqual(
            disposition.manifestSha256,
            env.MANIFEST_SHA256,
            "Existing request requires original reconciliation",
          );
      }
    }
  }
}
async function preflight(client, env) {
  assert.equal(env.GITHUB_REPOSITORY, repo);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(
    env.GITHUB_RUN_ATTEMPT,
    "1",
    "Reruns must reconcile original history",
  );
  assert.equal(
    (await client.read("/git/ref/heads/main")).object.sha,
    env.GITHUB_SHA,
  );
  assert.equal(
    await client.read("/git/ref/tags/v" + PACKAGE_VERSION, { accept404: true }),
    null,
    "Canonical tag already exists",
  );
  const resp = await fetch(
    registry + encodeURIComponent(PACKAGE_NAME) + "/" + PACKAGE_VERSION,
    { redirect: "error", signal: AbortSignal.timeout(15000) },
  );
  await resp.body?.cancel();
  assert.equal(resp.status, 404, "Coordinate must be unused");
  const checkpoint = await readCheckpoint(client, env.HISTORY_OBJECT);
  await verifyReservations(client, checkpoint, env, "stage");
  const intent = json(checkpoint.files.get("stage-intent.json"));
  assert.deepEqual(
    [
      intent.commit,
      intent.version,
      intent.run,
      intent.attempt,
      intent.manifestSha256,
      intent.channel,
    ],
    [
      env.GITHUB_SHA,
      PACKAGE_VERSION,
      env.QUALIFICATION_RUN,
      env.QUALIFICATION_ATTEMPT,
      env.MANIFEST_SHA256,
      env.RELEASE_CHANNEL,
    ],
  );
  assert.deepEqual(
    intent.writerCutover,
    {
      directPublishDisabled: true,
      legacyWritersDisabled: true,
      stageBindingVerified: true,
      protectedEnvironmentVerified: true,
    },
    "Owner provider readback is required",
  );
  assert.equal(intent.rights, "ACCEPTED");
  assert.equal(intent.benchmark, "ACCEPTED");
  assert.ok(
    intent.githubLatestBefore === null ||
      Number.isSafeInteger(intent.githubLatestBefore),
  );
  assert.equal(
    (await client.read("/releases/latest", { accept404: true }))?.id ?? null,
    intent.githubLatestBefore,
  );
  assert.equal(intent.tarballSha256, env.QUALIFIED_TARBALL_SHA256);
  await assertPriorOperations(client, env, checkpoint, "stage");
  await assertPriorOperations(client, env, checkpoint, "labels");
  const control = json(
    readFileSync(
      new URL("../docs/release/publication-control.json", import.meta.url),
    ),
  );
  for (const path of [
    "docs/provenance/rights-inventory.json",
    "docs/provenance/third-party-material.json",
    "docs/provenance/scoped-package-name-review.json",
  ])
    assert.equal(
      json(readFileSync(new URL("../" + path, import.meta.url))).review.status,
      "REVIEWED",
      path + " requires human review",
    );
  assert.equal(
    json(
      readFileSync(
        new URL(
          "../tooling/artifact-transport/rights-review.json",
          import.meta.url,
        ),
      ),
    ).reviewStatus,
    "REVIEWED",
  );
  assert.equal(control.enabled, true);
  assert.equal(control.mode, "OIDC_STAGED");
  assert.equal(control.coordinate, PACKAGE_NAME + "@" + PACKAGE_VERSION);
  return intent;
}
async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "verify-private") {
    assert.equal(
      args.length,
      5,
      "Expected manifest, manifest SHA-256, stage journal, native view JSON, downloaded tarball",
    );
    const [manifestPath, digest, journal, viewPath, tarball] = args;
    const bytes = readFileSync(manifestPath);
    assert.equal(hash(bytes), digest);
    const rows = readFileSync(journal, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      rows.map((row) => row.state),
      ["REQUESTED", "STAGED"],
    );
    const report = verifyPrivateStage({
      manifest: json(bytes),
      receipt: rows[1],
      view: json(readFileSync(viewPath)),
      bytes: readFileSync(tarball),
      manifestSha256: digest,
    });
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  assert.ok(["admit", "stage"].includes(mode));
  const env = process.env;
  const client = new GitHubReleaseClient({
    repository: repo,
    token: env.GH_TOKEN,
  });
  const { manifest, candidate } = await originalManifest(client, env);
  const intent = await preflight(client, {
    ...env,
    QUALIFIED_TARBALL_SHA256: manifest.assets.tarball.sha256,
  });
  if (mode === "admit") {
    appendFileSync(env.GITHUB_OUTPUT, "artifact_id=" + id(candidate.id) + "\n");
    return;
  }
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.ok(
    env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  );
  const path = resolve("candidate", manifest.assets.tarball.name);
  assert.equal(
    manifest.assets.tarball.name,
    "hadden-industries-owlapi-" + PACKAGE_VERSION + ".tgz",
  );
  assert.ok(lstatSync(path).isFile());
  const scratch = resolve(env.RUNNER_TEMP, "owlapi-stage");
  mkdirSync(scratch, { recursive: false });
  const clean = {
    PATH: env.PATH,
    HOME: scratch,
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: env.GITHUB_EVENT_NAME,
    RUNNER_ENVIRONMENT: env.RUNNER_ENVIRONMENT,
  };
  for (const [k, v] of Object.entries(env))
    if (
      (k.startsWith("GITHUB_") && !k.includes("TOKEN")) ||
      k.startsWith("ACTIONS_ID_TOKEN_REQUEST_")
    )
      clean[k] = v;
  clean.NPM_CONFIG_USERCONFIG = join(scratch, "empty.npmrc");
  writeFileSync(clean.NPM_CONFIG_USERCONFIG, "", { flag: "wx" });
  clean.NPM_CONFIG_FETCH_RETRIES = "0";
  const journalDirectory = resolve(env.GITHUB_WORKSPACE, ".release/stage");
  mkdirSync(journalDirectory, { recursive: true });
  const tags = json(
    await readPublicRegistry(
      new URL(
        "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
        registry,
      ),
    ),
  );
  const before = Object.fromEntries(
    ["pilot", "latest", "next"].map((tag) => [tag, tags[tag] ?? null]),
  );
  assert.deepEqual(
    before,
    intent.before,
    "Public tag preimages changed after owner approval",
  );
  await readReleaseSecurity({
    read: (path) => client.read(path),
    commit: manifest.commit,
  });
  await stageOnce({
    manifest,
    before,
    bytes: readFileSync(path),
    path,
    channel: env.RELEASE_CHANNEL,
    env: {
      ...env,
      GITHUB_LATEST_BEFORE: JSON.stringify(intent.githubLatestBefore),
    },
    journal: join(journalDirectory, "journal.jsonl"),
    command: (args) =>
      execFileSync("npm", args, {
        cwd: scratch,
        env: clean,
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
