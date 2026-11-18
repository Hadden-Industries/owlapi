import { readWorkflowRuns } from "./github-evidence-reader.mjs";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync, spawnSync } from "node:child_process";
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
import {
  readPublicRegistry,
  RegistryReadError,
} from "./public-registry-read.mjs";
import {
  historicalEvidenceName,
  isHistoricalRelease,
  readHistoricalRelease,
} from "./historical-release-evidence.mjs";
import {
  readCheckpoint,
  verifyReservations,
  priorDisposition,
} from "./release-history-checkpoint.mjs";
import {
  assertPriorOperations,
  queuedFirstAttempt,
  hash,
  originArtifact,
  originalBytes,
} from "./staged-release.mjs";
import { crc32 } from "node:zlib";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";

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
    [
      "promote",
      "preview",
      "close-preview",
      "withdraw",
      "retire-pilot",
    ].includes(op.type),
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
  } else if (op.type === "retire-pilot") {
    assert.equal(
      stable,
      op.version,
      "Pilot retirement requires the designated stable release",
    );
    assert.equal(op.before.latest, stable);
    assert.ok(valid(op.retiredVersion));
    assert.ok([null, op.retiredVersion].includes(op.before.pilot));
    after.pilot = null;
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
async function waitForLabelReadback({ before, after, read, now, sleep }) {
  const deadline = now() + 300_000;
  let interval = 1_000;
  while (now() < deadline) {
    let retryAfter = 0;
    try {
      const observed = tagsOnly(
        await read({
          attempts: 1,
          timeoutMs: Math.min(15_000, deadline - now()),
        }),
      );
      if (now() >= deadline) break;
      if (isDeepStrictEqual(observed, after)) return;
      assert.deepEqual(observed, before, "Conflicting registry effect");
    } catch (error) {
      if (!(error instanceof RegistryReadError && error.transient)) throw error;
      retryAfter = error.retryAfterMs;
    }
    await sleep(
      Math.max(0, Math.min(deadline - now(), Math.max(interval, retryAfter))),
    );
    interval = Math.min(15_000, interval * 2);
  }
  throw new Error(
    "Acknowledged registry effect remains unsettled after five minutes",
  );
}

export async function applyLabels(
  op,
  {
    read,
    write,
    record,
    settled = [],
    now = () => performance.now(),
    sleep = delay,
  },
) {
  const { after } = planChannels(op);
  const current = { ...op.before };
  for (const effect of settled) {
    assert.ok(labels.includes(effect.tag) && effect.before !== effect.after);
    assert.equal(current[effect.tag], effect.before);
    assert.equal(effect.after, after[effect.tag]);
    assert.equal(effect.state, "SETTLED");
    current[effect.tag] = effect.after;
  }
  const initial = tagsOnly(await read());
  if (op.type === "retire-pilot" && initial.pilot === null) {
    assert.deepEqual(initial, after, "Registry preimage changed");
    return after;
  }
  assert.deepEqual(initial, current, "Registry preimage changed");
  for (const tag of labels.filter((k) => current[k] !== after[k])) {
    assert.deepEqual(
      tagsOnly(await read()),
      current,
      "Concurrent registry change",
    );
    const effect = { tag, before: current[tag], after: after[tag] };
    record({ ...effect, state: "REQUESTED" });
    const acknowledgement = await write(tag, after[tag]);
    assert.equal(
      String(acknowledgement).trim(),
      (effect.after === null ? "-" : "+") +
        tag +
        ": " +
        PACKAGE_NAME +
        "@" +
        (effect.after ?? effect.before),
      "Missing native npm mutation acknowledgement",
    );
    record({
      ...effect,
      state: "ACKNOWLEDGED",
      acknowledgement: String(acknowledgement).trim(),
    });
    const expected = { ...current, [tag]: after[tag] };
    await waitForLabelReadback({
      before: current,
      after: expected,
      read,
      now,
      sleep,
    });
    current[tag] = after[tag];
    record({ ...effect, state: "SETTLED" });
  }
  return after;
}

export async function verifiedChannelRelease(client, checkpoint, version) {
  const historical = isHistoricalRelease(version);
  const proof = historical
    ? readHistoricalRelease(
        version,
        checkpoint.files.get(historicalEvidenceName(version)),
      )
    : JSON.parse(checkpoint.files.get("immutable-" + version + ".json"));
  if (!historical) assert.equal(proof.state, "IMMUTABLE_VERIFIED");
  assert.equal(proof.version, version);
  assert.ok(Number.isSafeInteger(proof.releaseId) && proof.releaseId > 0);
  const release = await client.read("/releases/" + proof.releaseId);
  assert.equal(release.id, proof.releaseId);
  assert.equal(release.immutable, true);
  assert.equal(release.draft, false);
  if (historical)
    assert.equal(
      release.prerelease,
      true,
      "Historical RC classification changed",
    );
  assert.equal(release.tag_name, "v" + version);
  const ref = await client.read("/git/ref/tags/v" + version);
  assert.equal(ref.object.type, "tag");
  assert.equal(ref.object.sha, proof.tagObject);
  assertReleaseAssets({ assets: release.assets, expected: proof.assets });
  return release;
}

const pilotEndpoint =
  NPM_REGISTRY +
  "-/package/" +
  PACKAGE_NAME.replace("/", "%2f") +
  "/dist-tags/pilot";
const npmStep = "Apply approved npm labels (npm)";
const refusalPrefix = "owlapi-pilot-refusal ";

export function nativePilotRefusal(error) {
  if (
    !Number.isSafeInteger(error?.status) ||
    error.status <= 0 ||
    error.signal !== null ||
    error.code !== undefined ||
    error.error
  )
    return null;
  try {
    const native = JSON.parse(error.stdout)?.error;
    if (native?.code !== "E401" || typeof native.summary !== "string")
      return null;
    const match = /^401 Unauthorized - DELETE (\S+)(?: - [\s\S]*)?$/u.exec(
      native.summary,
    );
    if (match?.[1] !== pilotEndpoint) return null;
    return {
      npmCode: "E401",
      exitStatus: error.status,
      httpStatus: 401,
      method: "DELETE",
      endpoint: pilotEndpoint,
    };
  } catch {
    return null;
  }
}

export function verifyPilotRefusalLog({ bytes, step, proof, operationSha256 }) {
  assert.ok(
    Buffer.isBuffer(bytes) &&
      bytes.length <= 4 * 1024 * 1024 &&
      bytes.at(-1) === 10,
    "Missing or incomplete original job log",
  );
  assert.equal(step.name, npmStep);
  assert.equal(step.status, "completed");
  assert.equal(step.conclusion, "failure");
  const start = Date.parse(step.started_at),
    end = Date.parse(step.completed_at);
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end >= start);
  const lines = new TextDecoder("utf-8", { fatal: true })
    .decode(bytes)
    .split(/\r?\n/u);
  const recorded = lines.filter((line) => line.includes(refusalPrefix));
  // GitHub also prints the run command, but the controller's marker occurs only in its output.
  assert.equal(
    recorded.length,
    1,
    "The original npm refusal log is missing or ambiguous",
  );
  const [line] = recorded;
  const index = line.indexOf(" ");
  const time = Date.parse(line.slice(0, index));
  // REST step timestamps have second precision and log prefixes may have fractions.
  assert.ok(
    time >= start && time < end + 1000,
    "Refusal lies outside the native npm step",
  );
  assert.ok(line.slice(index + 1).startsWith(refusalPrefix));
  assert.deepEqual(JSON.parse(line.slice(index + 1 + refusalPrefix.length)), {
    operationSha256,
    ...proof,
  });
  return hash(bytes);
}

async function observePilotRefusal(client, env, checkpoint, origin, read) {
  assert.match(origin.runId, /^[1-9]\d{0,15}$/u);
  assert.equal(origin.attempt, "1");
  const original = await readCheckpoint(client, origin.checkpoint);
  const decision = original.files.get("channel-operation.json");
  const op = JSON.parse(decision);
  const operationSha256 = hash(decision);
  assert.equal(origin.operationSha256, operationSha256);
  assert.equal(op.type, "retire-pilot");
  planChannels(op);
  assert.equal(op.controller, origin.controller);
  const path = "/actions/runs/" + origin.runId + "/attempts/1";
  const logical = "release-labels-" + origin.runId + "-1";
  const retained = checkpoint.files.get(
    "origin-" + origin.runId + "-1-" + logical + ".json",
  );
  const saved = retained && JSON.parse(retained);
  const readOriginal = async (path, fallback) => {
    try {
      return await client.read(path);
    } catch (error) {
      if (fallback && [404, 410].includes(error.httpStatus)) return fallback;
      throw error;
    }
  };
  const run = await readOriginal(path, saved?.run);
  assert.equal(original.tag, "owlapi-release-history/labels-" + run.run_number);
  assert.equal(String(run.id), origin.runId);
  assert.equal(run.run_attempt, 1);
  assert.equal(run.conclusion, "failure");
  const artifacts = await originArtifact(
    client,
    {
      runId: origin.runId,
      attempt: "1",
      filename: ".github/workflows/release-labels.yml",
      commit: origin.controller,
      logical,
      refusedLabel: true,
    },
    checkpoint,
  );
  const files = readZipArchiveFilesWith(
    await originalBytes(client, artifacts),
    {
      crc32,
      expectedNames: new Set(["channel-journal.jsonl"]),
    },
  );
  assert.equal(files.length, 1, "No native retirement journal");
  const journal = files[0].content;
  assert.equal(hash(journal), origin.journalSha256);
  const rows = journal.toString("utf8").trimEnd().split("\n").map(JSON.parse);
  assert.equal(rows.length, 2, "Original retirement effect is ambiguous");
  const { diagnostic, ...refused } = rows[1];
  const intent = {
    tag: "pilot",
    before: op.retiredVersion,
    after: null,
    operationSha256,
  };
  assert.deepEqual(rows[0], { ...intent, state: "REQUESTED" });
  assert.deepEqual(refused, { ...intent, state: "OUTCOME_UNKNOWN" });
  assert.deepEqual(diagnostic, {
    npmCode: "E401",
    exitStatus: 1,
    httpStatus: 401,
    method: "DELETE",
    endpoint: pilotEndpoint,
  });
  const jobs = await readOriginal(path + "/jobs?per_page=100", saved?.jobs);
  assert.equal(jobs.total_count, 1);
  assert.equal(jobs.jobs.length, 1);
  const [job] = jobs.jobs;
  assert.deepEqual(
    [
      job.name,
      String(job.run_id),
      job.run_attempt,
      job.head_sha,
      job.status,
      job.conclusion,
    ],
    ["npm", origin.runId, 1, origin.controller, "completed", "failure"],
  );
  assert.ok(Number.isSafeInteger(job.id) && job.id > 0);
  const steps = job.steps.filter((step) => step.name === npmStep);
  assert.equal(steps.length, 1);
  const savedLog = checkpoint.files.get(
    "label-refusal-" + origin.runId + "-1.log",
  );
  if (savedLog) {
    assert.match(origin.logSha256, /^[a-f0-9]{64}$/u);
    assert.equal(hash(savedLog), origin.logSha256);
  }
  const logSha256 = verifyPilotRefusalLog({
    bytes:
      savedLog ??
      execFileSync(
        "gh",
        ["api", "repos/" + repository + "/actions/jobs/" + job.id + "/logs"],
        { env, timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      ),
    step: steps[0],
    proof: diagnostic,
    operationSha256,
  });
  if (read)
    assert.deepEqual(
      tagsOnly(await read()),
      op.before,
      "Original refusal no longer matches the preimage",
    );
  return {
    runId: origin.runId,
    attempt: "1",
    operationSha256,
    state: "REQUEST_REFUSED",
    jobId: job.id,
    logSha256,
    stepCompletedAt: steps[0].completed_at,
  };
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
  if (op.type === "retire-pilot") {
    assert.notEqual(mode, "github", "Pilot retirement has no GitHub writer");
    if (mode === "npm") assert.equal(op.controller, env.GITHUB_SHA);
  }
  if (mode !== "verify")
    await verifyReservations(
      client,
      checkpoint,
      env,
      mode === "npm" ? "labels" : "classification",
      {
        retirementSha: op.type === "retire-pilot" ? hash(bytes) : undefined,
      },
    );
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
    assert.ok(
      !isHistoricalRelease(op.version),
      "Historical releases are read-only",
    );
  const operationSha256 = hash(bytes);
  const { after, classify } = planChannels(op);
  assert.match(op.operationId, /^[a-z0-9][a-z0-9-]{0,100}$/u);
  const read = async (options) =>
    JSON.parse(
      await readPublicRegistry(
        new URL(
          "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
          NPM_REGISTRY,
        ),
        options,
      ),
    );
  const verifiedRelease = (version) =>
    verifiedChannelRelease(client, checkpoint, version);
  const target = await verifiedRelease(op.version);
  if (op.type === "retire-pilot") {
    assert.equal(target.prerelease, false);
    assert.deepEqual(op.githubBefore, { prerelease: false, latest: target.id });
    await verifiedRelease(op.retiredVersion);
  }
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
    : { ...op.githubBefore };
  let classificationId = target.id;
  if (
    op.type === "withdraw" &&
    !isRc(op.version) &&
    op.githubBefore.latest === target.id
  ) {
    const restore = op.restore.find((r) => r.tag === "latest");
    assert.ok(
      restore,
      "Production withdrawal needs an explicit latest disposition",
    );
    if (restore.target !== null) {
      const previous = await verifiedRelease(restore.target);
      assert.equal(previous.prerelease, false);
      classificationId = previous.id;
      desired.latest = previous.id;
    }
  }
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
  if (
    mode === "verify" &&
    op.type === "retire-pilot" &&
    checkpoint.files.has("label-refusal-origin.json")
  ) {
    const origin = JSON.parse(
      checkpoint.files.get("label-refusal-origin.json"),
    );
    assert.equal(origin.operationSha256, operationSha256);
    assert.deepEqual(await githubState(), op.githubBefore);
    const observed = await observePilotRefusal(
      client,
      env,
      checkpoint,
      origin,
      read,
    );
    writeFileSync(join(dir, "verify.json"), JSON.stringify(observed) + "\n", {
      flag: "wx",
    });
    return;
  }
  let observedTags;
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
    const runs = await readWorkflowRuns(
      (path) => client.read(path),
      "release-labels.yml",
    );
    await assertPriorOperations(client, env, checkpoint, "stage");
    for (const kind of ["draft", "seal", "classification"])
      await assertPriorOperations(client, env, checkpoint, kind);
    const settled = [];
    for (const run of runs.filter((r) => String(r.id) !== env.GITHUB_RUN_ID)) {
      if (queuedFirstAttempt(run, env)) continue;
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
          const prior = priorDisposition(
            checkpoint,
            "labels-" + run.id + "-" + attempt + ".json",
          );
          assert.equal(prior.runId, String(run.id));
          assert.equal(prior.attempt, String(attempt));
          if (prior.state === "REQUEST_REFUSED") {
            assert.notEqual(
              prior.operationSha256,
              operationSha256,
              "A refused operation needs a fresh signed decision",
            );
            const observed = await observePilotRefusal(
              client,
              env,
              checkpoint,
              prior.origin,
            );
            assert.deepEqual(prior, { ...observed, origin: prior.origin });
            continue;
          }
          assert.ok(["SETTLED", "RECONCILED"].includes(prior.state));
          if (prior.operationSha256 === operationSha256) {
            assert.equal(
              prior.state,
              "RECONCILED",
              "Operation already settled",
            );
            assert.ok(Array.isArray(prior.effects) && prior.effects.length > 0);
            assert.ok(
              prior.effects.every(
                (e) =>
                  e.acknowledged === true &&
                  e.independentReadback === e.after &&
                  e.state === "SETTLED",
              ),
            );
            settled.push(...prior.effects);
          }
        }
      }
    }
    const ambient = {
      PATH: env.PATH,
      HOME: scratch,
      GITHUB_ACTIONS: "true",
      NPM_CONFIG_FETCH_RETRIES: "0",
      NPM_CONFIG_USERCONFIG: join(scratch, "user.npmrc"),
      NPM_CONFIG_GLOBALCONFIG: join(scratch, "global.npmrc"),
    };
    for (const config of [
      ambient.NPM_CONFIG_USERCONFIG,
      ambient.NPM_CONFIG_GLOBALCONFIG,
    ])
      writeFileSync(config, "", { flag: "wx" });
    for (const [k, v] of Object.entries(env))
      if (
        k.startsWith("ACTIONS_ID_TOKEN_REQUEST_") ||
        (k.startsWith("GITHUB_") && !k.includes("TOKEN"))
      )
        ambient[k] = v;
    const { npmCli } = selectNpmCliForVersion({
      expectedNpm: CI_RUNTIME.npm,
      candidates: findNpmCliCandidates(),
      observeVersion: observeNpmVersion,
    });
    assert.deepEqual(await githubState(), op.githubBefore);
    observedTags = await applyLabels(op, {
      settled,
      read,
      record,
      write: (tag, value) => {
        const result = spawnSync(
          process.execPath,
          [
            npmCli,
            "dist-tag",
            ...(value === null
              ? ["rm", PACKAGE_NAME, tag]
              : ["add", PACKAGE_NAME + "@" + value, tag]),
            "--registry=" + NPM_REGISTRY,
            "--fetch-retries=0",
            ...(op.type === "retire-pilot" ? ["--json"] : []),
          ],
          {
            cwd: scratch,
            env: ambient,
            timeout: 60000,
            encoding: "utf8",
            stdio: "pipe",
            maxBuffer: 256 * 1024,
          },
        );
        if (result.status === 0) return result.stdout;
        if (op.type === "retire-pilot") {
          const diagnostic = nativePilotRefusal(result);
          if (diagnostic) {
            record({
              tag,
              before: op.retiredVersion,
              after: null,
              state: "OUTCOME_UNKNOWN",
              diagnostic,
            });
            process.stderr.write(
              refusalPrefix +
                JSON.stringify({ operationSha256, ...diagnostic }) +
                "\n",
            );
          }
        }
        throw Error("Original npm request must be reconciled");
      },
    });
  } else {
    const labelOrigin = JSON.parse(checkpoint.files.get("label-origin.json"));
    const npmRun = labelOrigin.runId;
    assert.match(labelOrigin.commit, /^[a-f0-9]{40}$/u);
    const a = await originArtifact(
      client,
      {
        runId: npmRun,
        attempt: "1",
        filename: ".github/workflows/release-labels.yml",
        commit: labelOrigin.commit,
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
          commit: prior.commit,
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
          ["REQUESTED", classificationId, operationSha256],
          ["ACKNOWLEDGED", classificationId, operationSha256],
        ],
      );
    }
    if (mode === "github") {
      if (changeNeeded) {
        for (const kind of ["stage", "draft", "seal", "labels"])
          await assertPriorOperations(client, env, checkpoint, kind, {
            excludeRun: kind === "labels" ? String(npmRun) : undefined,
          });
        await assertPriorOperations(
          client,
          { ...env, OPERATION_SHA256: operationSha256 },
          checkpoint,
          "classification",
        );
        assert.ok(classify || classificationId !== target.id);
        assert.deepEqual(
          tagsOnly(await read()),
          after,
          "Guarded npm labels moved during classification admission",
        );
        assert.deepEqual(await githubState(), op.githubBefore);
        assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
        record({ state: "REQUESTED", releaseId: classificationId });
        const result = await client.write("/releases/" + classificationId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prerelease: false, make_latest: "true" }),
        });
        assert.equal(
          result.state,
          "CONFIRMED",
          "Reconcile original GitHub request",
        );
        record({ state: "ACKNOWLEDGED", releaseId: classificationId });
      }
    }
    assert.deepEqual(await githubState(), desired);
    observedTags = tagsOnly(await read());
    assert.deepEqual(
      observedTags,
      after,
      "Guarded npm labels moved during completion",
    );
  }
  writeFileSync(
    join(dir, mode + ".json"),
    JSON.stringify({
      state: "SETTLED",
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
      operationSha256,
      tags: observedTags,
      releaseId: target.id,
      github: await githubState(),
    }) + "\n",
    { flag: "wx" },
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
