/** Find existing release claims on the CI originals that qualification can select. */
import assert from "node:assert/strict";

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
  const ids = files.has("retention.json")
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
  return async () => {
    const commits = new Set();
    const protectedIds = new Set();
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
        assert.match(object.sha, oid);
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
    return { commits, protectedIds };
  };
}
