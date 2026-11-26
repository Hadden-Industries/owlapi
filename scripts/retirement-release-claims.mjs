/** Find existing release claims on the CI originals that qualification can select. */
import assert from "node:assert/strict";
import { releaseJobs } from "./release-audit-job.mjs";

const oid = /^[a-f0-9]{40}$/u;
const history = "owlapi-release-history/";
const versionTag = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function historyClaims(tag, files) {
  const commits = [];
  for (const [file, field, required] of [
    ["stage-intent.json", "commit", /^owlapi-release-history\/stage-/u],
    ["operation.json", "source", /^owlapi-release-history\/(?:draft|seal)-/u],
  ]) {
    if (!files.has(file)) {
      assert.ok(!required.test(tag), "Release reservation lacks " + file);
      continue;
    }
    const source = JSON.parse(files.get(file))[field];
    assert.match(source, oid, "Unidentified release source in " + file);
    commits.push(source);
  }
  // originalManifest can reopen a qualification from its archived native origin after the Actions run disappears.
  for (const name of files.keys()) {
    const origin =
      /^origin-([1-9]\d*)-([1-9]\d*)-release-qualification-\1-\2\.json$/u.exec(
        name,
      );
    if (!origin) continue;
    const { run } = JSON.parse(files.get(name));
    assert.ok(
      run?.path === ".github/workflows/release.yml" &&
        String(run.id) === origin[1] &&
        String(run.run_attempt) === origin[2],
      "Invalid archived release qualification origin",
    );
    assert.match(
      run.head_sha,
      oid,
      "Unidentified archived qualification source",
    );
    commits.push(run.head_sha);
  }
  const hasRetention = files.has("retention.json");
  assert.ok(
    hasRetention ||
      !/^owlapi-release-history\/retention-[0-9a-f]{40}$/u.test(tag),
    "Retention checkpoint lacks retention.json",
  );
  const ids = hasRetention
    ? JSON.parse(files.get("retention.json")).protectedIds
    : [];
  assert.ok(
    Array.isArray(ids) && ids.every((id) => Number.isSafeInteger(id) && id > 0),
    "Invalid protected artifact IDs in release history",
  );
  return { commits, ids };
}

/** Observe live ref names before every effect. Only immutable object contents can be reused between inspections. */
export function createReleaseClaimReader(
  read,
  readHistoryFiles,
  readVersionTags,
) {
  const historyObjects = new Map();
  const versions = new Map();
  const observed = new Map();
  return async () => {
    const commits = new Set();
    const protectedIds = new Set();
    const stageReservations = new Set();
    const names = new Set();
    const pendingTags = new Map();
    for (const prefix of [history, "v"]) {
      const refs = await read("/git/matching-refs/tags/" + prefix);
      assert.ok(Array.isArray(refs), "Incomplete release refs");
      for (const { ref, object } of refs) {
        assert.ok(
          typeof ref === "string" &&
            ref.startsWith("refs/tags/" + prefix) &&
            !names.has(ref),
          "Unexpected or duplicate release ref",
        );
        names.add(ref);
        const tag = ref.slice("refs/tags/".length);
        if (prefix === "v" && !versionTag.test(tag)) continue;
        const stage = /^owlapi-release-history\/stage-([1-9]\d*)$/u.exec(tag);
        if (stage) stageReservations.add(Number(stage[1]));
        assert.match(object.sha, oid);
        assert.ok(
          !observed.has(ref) || observed.get(ref) === object.sha,
          "Observed release ref moved",
        );
        observed.set(ref, object.sha);
        if (prefix === history) {
          assert.equal(object.type, "tag", "Invalid release history ref");
          if (!historyObjects.has(ref))
            historyObjects.set(
              ref,
              historyClaims(tag, await readHistoryFiles(tag, object.sha)),
            );
          const claim = historyObjects.get(ref);
          for (const commit of claim.commits) commits.add(commit);
          for (const id of claim.ids) protectedIds.add(id);
        } else if (object.type === "commit") {
          commits.add(object.sha);
        } else {
          assert.equal(object.type, "tag", "Unidentified version tag target");
          if (versions.has(object.sha)) commits.add(versions.get(object.sha));
          else pendingTags.set(tag, object.sha);
        }
      }
    }
    if (pendingTags.size) {
      const tags = [...pendingTags].map(([tag, objectId]) => ({
        tag,
        objectId,
      }));
      for (const { tag, objectId, commit } of await readVersionTags(tags)) {
        assert.ok(
          pendingTags.has(tag) && pendingTags.get(tag) === objectId,
          "Unexpected version tag object",
        );
        assert.match(commit, oid);
        pendingTags.delete(tag);
        versions.set(objectId, commit);
        commits.add(commit);
      }
      assert.equal(pendingTags.size, 0, "Incomplete version tag inventory");
    }
    assert.ok(
      [...observed.keys()].every((ref) => names.has(ref)),
      "Observed release ref disappeared",
    );
    return { commits, protectedIds, stageReservations };
  };
}

/** Native stage runs witness lost reservations even when their controller differs from the qualified source. */
export async function latestUnattributedStage(
  client,
  stages,
  reservations,
  skippedAttempts,
  oldestOriginal,
) {
  let latest = -Infinity;
  for (const run of stages) {
    if (reservations.has(run.run_number)) continue;
    if (
      !Number.isSafeInteger(run.run_number) ||
      run.run_number < 1 ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1 ||
      run.status !== "completed"
    )
      return Infinity;
    const started = Date.parse(run.created_at);
    const updated = Date.parse(run.updated_at);
    // GitHub can report completion to the nearest second. A later original could not have been submitted by this run.
    const end =
      Number.isFinite(started) && Number.isFinite(updated) && started <= updated
        ? Math.floor(updated / 1000) * 1000 + 999
        : Infinity;
    if (end < oldestOriginal || end <= latest) continue;
    const possibleAttempts =
      run.run_attempt - (run.conclusion === "skipped" ? 1 : 0);
    for (let attempt = 1; attempt <= possibleAttempts; attempt++) {
      const key = run.id + ":" + attempt + ":" + run.head_sha;
      if (skippedAttempts.has(key)) continue;
      const jobs = await releaseJobs(client, run.id, attempt);
      const matches = jobs.filter((job) => job.name === "stage");
      const [job] = matches;
      const steps = job?.steps?.filter(
        (step) => step.name === "Stage the admitted tarball",
      );
      const skipped =
        matches.length === 1 &&
        job.run_id === run.id &&
        job.run_attempt === attempt &&
        job.head_sha === run.head_sha &&
        job.status === "completed" &&
        (job.conclusion === "skipped" ||
          (steps?.length === 1 && steps[0].conclusion === "skipped"));
      if (!skipped) {
        latest = end;
        break;
      }
      skippedAttempts.add(key);
    }
  }
  return latest;
}

/** Release admission can reuse only the exact second parent of a two-parent landing. Cache immutable Git objects, never PR state. */
export function createClaimedPullHeadReader(readCommits) {
  const byCommit = new Map();
  return async (commits) => {
    const heads = new Set();
    const missing = new Set();
    for (const sha of commits) {
      assert.match(sha, oid);
      if (!byCommit.has(sha)) missing.add(sha);
    }
    if (missing.size) {
      const records = await readCommits([...missing]);
      assert.ok(Array.isArray(records), "Incomplete claimed Git commit batch");
      for (const commit of records) {
        assert.ok(
          missing.delete(commit?.sha) && Array.isArray(commit.parents),
          "Incomplete claimed Git commit",
        );
        for (const parent of commit.parents)
          assert.match(parent.sha, oid, "Invalid parent of claimed Git commit");
        byCommit.set(
          commit.sha,
          commit.parents.length === 2 ? commit.parents[1].sha : null,
        );
      }
      assert.equal(missing.size, 0, "Incomplete claimed Git commit batch");
    }
    for (const sha of commits) {
      const prHead = byCommit.get(sha);
      if (prHead) heads.add(prHead);
    }
    return heads;
  };
}
