import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubReleaseClient, assertReleaseAssets } from "./github-release.mjs";
import { PACKAGE_NAME, NPM_REGISTRY } from "./package-identity.mjs";
import { npmSemver } from "./npm-semver.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { readCheckpoint } from "./release-history-checkpoint.mjs";
import {
  assertPriorOperations,
  hash,
  originArtifact,
  originalBytes,
} from "./staged-release.mjs";
import { crc32 } from "node:zlib";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";

const repository = "Hadden-Industries/owlapi";
const labels = ["pilot", "latest", "next"];
const isRc = (v) => /^\d+\.\d+\.\d+-rc\.\d+$/u.test(v);
const line = (v) => v.split("-")[0];
const valid = (v) =>
  typeof v === "string" &&
  npmSemver.valid(v) === v &&
  (/^\d+\.\d+\.\d+$/u.test(v) || isRc(v));
const tagsOnly = (tags) =>
  Object.fromEntries(labels.map((k) => [k, tags[k] ?? null]));
export function planChannels(op) {
  assert.ok(
    ["promote", "preview", "close-preview", "withdraw"].includes(op.type),
  );
  assert.ok(valid(op.version));
  assert.deepEqual(Object.keys(op.before).sort(), [...labels].sort());
  assert.ok(Object.values(op.before).every((v) => v === null || valid(v)));
  const after = { ...op.before },
    stable = op.support.stable,
    preview = op.support.preview;
  assert.ok(stable === null || (valid(stable) && !isRc(stable)));
  assert.ok(preview === null || (valid(preview) && !isRc(preview)));
  let classify = false;
  if (op.type === "promote") {
    assert.ok(
      !isRc(op.version) &&
        (stable === null || npmSemver.gte(op.version, stable)),
    );
    after.latest = op.version;
    classify = true;
  } else if (op.type === "preview") {
    assert.ok(
      isRc(op.version) &&
        (stable === null ||
          (npmSemver.gt(line(op.version), stable) &&
            (preview === line(op.version) || op.openLine === true))),
    );
    if (op.before.next !== null)
      assert.ok(
        npmSemver.gt(op.version, op.before.next) ||
          op.version === op.before.next,
      );
    after.next = op.version;
  } else if (op.type === "close-preview") {
    assert.ok(stable !== null && op.version === stable);
    after.next = null;
  } else {
    assert.ok(Array.isArray(op.restore) && op.restore.length > 0);
    const seen = new Set();
    for (const { tag, target } of op.restore) {
      assert.ok(["latest", "next"].includes(tag) && !seen.has(tag));
      seen.add(tag);
      assert.equal(op.before[tag], op.version);
      if (target !== null) {
        assert.ok(valid(target) && npmSemver.lt(target, op.version));
        assert.ok(
          tag === "next" || stable === null ? isRc(target) : !isRc(target),
        );
        if (tag === "next" && stable !== null)
          assert.equal(line(target), preview);
      }
      after[tag] = target;
    }
  }
  assert.deepEqual(
    op.after,
    after,
    "Signed desired labels contradict support policy",
  );
  return { after, classify };
}
export async function applyLabels(op, { read, write, record, settled = [] }) {
  const { after } = planChannels(op);
  const current = { ...op.before };
  for (const effect of settled) {
    assert.ok(labels.includes(effect.tag));
    assert.equal(current[effect.tag], effect.before);
    assert.equal(effect.after, after[effect.tag]);
    assert.equal(effect.state, "SETTLED");
    current[effect.tag] = effect.after;
  }
  assert.deepEqual(
    tagsOnly(await read()),
    current,
    "Registry preimage changed",
  );
  for (const tag of labels.filter((k) => current[k] !== after[k])) {
    assert.deepEqual(
      tagsOnly(await read()),
      current,
      "Concurrent registry change",
    );
    const effect = { tag, before: current[tag], after: after[tag] };
    record({ ...effect, state: "REQUESTED" });
    await write(tag, after[tag]);
    record({ ...effect, state: "ACKNOWLEDGED" });
    current[tag] = after[tag];
    assert.deepEqual(
      tagsOnly(await read()),
      current,
      "Unsettled registry effect",
    );
    record({ ...effect, state: "SETTLED" });
  }
  assert.deepEqual(tagsOnly(await read()), after);
  return after;
}

async function main() {
  const mode = process.argv[2],
    env = process.env;
  assert.ok(["npm", "github", "verify"].includes(mode));
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  const client = new GitHubReleaseClient({ repository, token: env.GH_TOKEN });
  const checkpoint = await readCheckpoint(client, env.HISTORY_OBJECT);
  const bytes = checkpoint.files.get("channel-operation.json");
  const op = JSON.parse(bytes);
  const designation = JSON.parse(
    readFileSync(
      new URL("../docs/release/support-designation.json", import.meta.url),
    ),
  );
  assert.deepEqual(op.support, {
    stable: designation.stable,
    preview: designation.preview,
  });
  if (mode !== "verify")
    assert.notEqual(op.version, "0.1.0-rc.3", "Historical rc.3 is read-only");
  const operationSha256 = hash(bytes);
  const { after, classify } = planChannels(op);
  assert.match(op.operationId, /^[a-z0-9][a-z0-9-]{0,100}$/u);
  const read = async () =>
    JSON.parse(
      await readPublicRegistry(
        new URL(
          "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
          NPM_REGISTRY,
        ),
      ),
    );
  const evidence = (version) => {
    const proof = JSON.parse(
      checkpoint.files.get("immutable-" + version + ".json"),
    );
    assert.equal(proof.state, "IMMUTABLE_VERIFIED");
    assert.ok(Number.isSafeInteger(proof.releaseId));
    return proof;
  };
  async function verifiedRelease(version) {
    const proof = evidence(version),
      r = await client.read("/releases/" + proof.releaseId);
    assert.equal(r.immutable, true);
    assert.equal(r.draft, false);
    assert.equal(r.tag_name, "v" + version);
    assert.equal(
      (await client.read("/git/ref/tags/v" + version)).object.sha,
      proof.tagObject,
    );
    assertReleaseAssets({ assets: r.assets, expected: proof.assets });
    return r;
  }
  const target = await verifiedRelease(op.version);
  if (op.type === "withdraw")
    for (const { target } of op.restore)
      if (target !== null) await verifiedRelease(target);
  const githubState = async () => ({
    prerelease: (await client.read("/releases/" + target.id)).prerelease,
    latest:
      (await client.read("/releases/latest", { accept404: true }))?.id ?? null,
  });
  const desired = classify
    ? { prerelease: false, latest: target.id }
    : op.githubBefore;
  assert.deepEqual(op.githubAfter, desired);
  const dir = ".release/followup";
  mkdirSync(dir, { recursive: true });
  const journal = join(dir, "channel-journal.jsonl");
  const record = (row) =>
    appendFileSync(
      journal,
      JSON.stringify({ ...row, operationSha256 }) + "\n",
      { flush: true },
    );
  if (mode === "npm") {
    assert.equal(
      env.GITHUB_RUN_ATTEMPT,
      "1",
      "Reconcile the original operation",
    );
    assert.ok(
      env.ACTIONS_ID_TOKEN_REQUEST_TOKEN &&
        env.RUNNER_ENVIRONMENT === "github-hosted",
    );
    assert.deepEqual(await githubState(), op.githubBefore);
    const scratch = join(env.RUNNER_TEMP, "owlapi-labels");
    mkdirSync(scratch, { recursive: false });
    // A new dispatch reads all earlier writers. Each possible write needs its original persisted disposition.
    const runs = await client.read(
      "/actions/workflows/release-labels.yml/runs?per_page=100",
    );
    assert.equal(runs.workflow_runs.length, runs.total_count);
    await assertPriorOperations(client, env, checkpoint, "stage");
    let settled = [];
    for (const run of runs.workflow_runs.filter(
      (r) => String(r.id) !== env.GITHUB_RUN_ID,
    )) {
      assert.equal(run.status, "completed", "Another label operation is open");
      for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
        const jobs = await client.read(
          "/actions/runs/" +
            run.id +
            "/attempts/" +
            attempt +
            "/jobs?per_page=100",
        );
        assert.equal(jobs.total_count, jobs.jobs.length);
        if (
          jobs.jobs.some((j) =>
            j.steps.some(
              (s) =>
                s.name === "Apply approved npm labels (npm)" &&
                s.conclusion !== "skipped",
            ),
          )
        ) {
          const prior = JSON.parse(
            checkpoint.files.get("labels-" + run.id + "-" + attempt + ".json"),
          );
          assert.equal(prior.runId, String(run.id));
          assert.equal(prior.attempt, String(attempt));
          assert.ok(["SETTLED", "RECONCILED"].includes(prior.state));
          if (prior.operationSha256 === operationSha256) {
            assert.equal(
              prior.state,
              "RECONCILED",
              "Operation already settled",
            );
            assert.deepEqual(settled, [], "Ambiguous prior operation");
            assert.ok(Array.isArray(prior.effects) && prior.effects.length > 0);
            assert.ok(
              prior.effects.every(
                (e) =>
                  e.acknowledged === true &&
                  e.independentReadback === e.after &&
                  e.state === "SETTLED",
              ),
            );
            settled = prior.effects;
          }
        }
      }
    }
    const ambient = {
      PATH: env.PATH,
      HOME: scratch,
      GITHUB_ACTIONS: "true",
      NPM_CONFIG_FETCH_RETRIES: "0",
    };
    for (const [k, v] of Object.entries(env))
      if (
        k.startsWith("ACTIONS_ID_TOKEN_REQUEST_") ||
        (k.startsWith("GITHUB_") && !k.includes("TOKEN"))
      )
        ambient[k] = v;
    await applyLabels(op, {
      settled,
      read,
      record,
      write: (tag, value) =>
        execFileSync(
          "npm",
          [
            "dist-tag",
            ...(value === null
              ? ["rm", PACKAGE_NAME, tag]
              : ["add", PACKAGE_NAME + "@" + value, tag]),
            "--registry=" + NPM_REGISTRY,
          ],
          { cwd: scratch, env: ambient, timeout: 60000, stdio: "pipe" },
        ),
    });
  } else {
    const npmRun = JSON.parse(checkpoint.files.get("label-origin.json")).runId;
    const a = await originArtifact(
      client,
      {
        runId: npmRun,
        attempt: "1",
        filename: ".github/workflows/release-labels.yml",
        commit: env.GITHUB_SHA,
        logical: "release-labels-" + npmRun + "-1",
      },
      checkpoint,
    );
    const archive = await originalBytes(client, a);
    assert.equal("sha256:" + hash(archive), a.digest);
    const file = readZipArchiveFilesWith(archive, { crc32 }).filter(
      (f) => f.path === "npm.json",
    );
    assert.equal(file.length, 1);
    const handoff = JSON.parse(file[0].content);
    assert.equal(handoff.operationSha256, operationSha256);
    assert.deepEqual(handoff.tags, after);
    assert.deepEqual(tagsOnly(await read()), after);
    const changeNeeded =
      op.githubBefore.prerelease !== desired.prerelease ||
      op.githubBefore.latest !== desired.latest;
    if (mode === "verify" && changeNeeded) {
      const prior = JSON.parse(
        checkpoint.files.get("classification-origin.json"),
      );
      const evidence = await originArtifact(
        client,
        {
          runId: prior.runId,
          attempt: prior.attempt,
          commit: env.GITHUB_SHA,
          filename: ".github/workflows/release-classification.yml",
          logical:
            "release-classification-" + prior.runId + "-" + prior.attempt,
        },
        checkpoint,
      );
      const files = readZipArchiveFilesWith(
        await originalBytes(client, evidence),
        { crc32 },
      );
      const result = JSON.parse(
        files.find((f) => f.path === "github.json").content,
      );
      assert.equal(result.operationSha256, operationSha256);
      assert.equal(result.state, "SETTLED");
      assert.deepEqual(result.github, desired);
      const journal = files
        .find((f) => f.path === "channel-journal.jsonl")
        .content.toString()
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      assert.deepEqual(
        journal.map((r) => [r.state, r.releaseId, r.operationSha256]),
        [
          ["REQUESTED", target.id, operationSha256],
          ["ACKNOWLEDGED", target.id, operationSha256],
        ],
      );
    }
    if (mode === "github") {
      const current = await githubState();
      if (changeNeeded) {
        assert.ok(classify);
        assert.deepEqual(current, op.githubBefore);
        assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
        record({ state: "REQUESTED", releaseId: target.id });
        const result = await client.write("/releases/" + target.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prerelease: false, make_latest: "true" }),
        });
        assert.equal(
          result.state,
          "CONFIRMED",
          "Reconcile original GitHub request",
        );
        record({ state: "ACKNOWLEDGED", releaseId: target.id });
      }
    }
    assert.deepEqual(await githubState(), desired);
  }
  writeFileSync(
    join(dir, mode + ".json"),
    JSON.stringify({
      state: "SETTLED",
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
      operationSha256,
      tags: tagsOnly(await read()),
      releaseId: target.id,
      github: await githubState(),
    }) + "\n",
    { flag: "wx" },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
