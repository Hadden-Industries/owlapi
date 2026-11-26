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
export function createReleaseClaimReader(read, readHistoryFiles) {
  const objects = new Map();
  const observed = new Map();
  return async () => {
    const commits = new Set();
    const protectedIds = new Set();
    const stageReservations = new Set();
    const names = new Set();
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
        const key = ref + "@" + object.sha;
        if (!objects.has(key)) {
          let claims;
          if (prefix === history) {
            assert.equal(object.type, "tag", "Invalid release history ref");
            claims = historyClaims(
              tag,
              await readHistoryFiles(tag, object.sha),
            );
          } else {
            let subject = object;
            if (object.type === "tag") {
              const annotated = await read("/git/tags/" + object.sha);
              assert.equal(annotated.sha, object.sha);
              subject = annotated.object;
            }
            assert.equal(
              subject.type,
              "commit",
              "Unidentified version tag target",
            );
            assert.match(subject.sha, oid);
            claims = { commits: [subject.sha], ids: [] };
          }
          objects.set(key, claims);
        }
        const claim = objects.get(key);
        for (const commit of claim.commits) commits.add(commit);
        for (const id of claim.ids) protectedIds.add(id);
      }
    }
    assert.ok(
      [...observed.keys()].every((ref) => names.has(ref)),
      "Observed release ref disappeared",
    );
    return { commits, protectedIds, stageReservations };
  };
}

/** Native stage runs witness lost reservations even when their controller differs from the qualified source. */
export async function hasUnattributedStage(
  client,
  stages,
  reservations,
  skippedAttempts,
) {
  for (const run of stages) {
    if (reservations.has(run.run_number)) continue;
    if (
      !Number.isSafeInteger(run.run_number) ||
      run.run_number < 1 ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1 ||
      run.status !== "completed"
    )
      return true;
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const key = run.id + ":" + attempt + ":" + run.head_sha;
      if (skippedAttempts.has(key)) continue;
      const jobs = await releaseJobs(client, run.id, attempt);
      const matches = jobs.filter((job) => job.name === "stage");
      const [job] = matches;
      if (
        matches.length !== 1 ||
        job.run_id !== run.id ||
        job.run_attempt !== attempt ||
        job.head_sha !== run.head_sha ||
        job.status !== "completed"
      )
        return true;
      if (job.conclusion !== "skipped") {
        const steps = job.steps?.filter(
          (step) => step.name === "Stage the admitted tarball",
        );
        if (steps?.length !== 1 || steps[0].conclusion !== "skipped")
          return true;
      }
      skippedAttempts.add(key);
    }
  }
  return false;
}

/** Release admission can reuse only the exact second parent of a two-parent landing. Cache immutable Git objects, never PR state. */
export function createClaimedPullHeadReader(read) {
  const byCommit = new Map();
  return async (commits) => {
    const heads = new Set();
    for (const sha of commits) {
      assert.match(sha, oid);
      if (!byCommit.has(sha)) {
        const commit = await read("/git/commits/" + sha);
        assert.ok(
          commit?.sha === sha && Array.isArray(commit.parents),
          "Incomplete claimed Git commit",
        );
        for (const parent of commit.parents)
          assert.match(parent.sha, oid, "Invalid parent of claimed Git commit");
        byCommit.set(
          sha,
          commit.parents.length === 2 ? commit.parents[1].sha : null,
        );
      }
      const prHead = byCommit.get(sha);
      if (prHead) heads.add(prHead);
    }
    return heads;
  };
}
