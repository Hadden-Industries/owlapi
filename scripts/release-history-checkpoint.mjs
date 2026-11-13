import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyLocalReleaseTag } from "./verify-release-tag.mjs";

const namespace = "owlapi-release-history/";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) =>
  execFileSync("git", args, {
    cwd: repositoryRoot,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30000,
    windowsHide: true,
  });
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rulesPath = "/rulesets?includes_parents=true&per_page=100";
export async function readCheckpoint(client, objectId) {
  assert.match(objectId, /^[a-f0-9]{40}$/u);
  const tag = await client.read("/git/tags/" + objectId);
  assert.equal(tag.sha, objectId);
  assert.match(tag.tag, /^owlapi-release-history\/[a-z0-9][a-z0-9-]{0,100}$/u);
  assert.equal(tag.object.type, "commit");
  assert.match(tag.object.sha, /^[a-f0-9]{40}$/u);
  assert.equal(tag.verification.verified, true);
  const ref = "refs/tags/" + tag.tag;
  const live = await client.read("/git/ref/tags/" + tag.tag);
  assert.equal(live.object.sha, objectId);
  assert.equal(git("rev-parse", ref).toString().trim(), objectId);
  const signers = JSON.parse(
    readFileSync(
      new URL("../docs/provenance/release-signers.json", import.meta.url),
    ),
  );
  const signer = verifyLocalReleaseTag({
    repositoryRoot,
    expectedTag: tag.tag,
    expectedCommit: tag.object.sha,
    registry: signers,
    releaseDate: new Date().toISOString().slice(0, 10),
  });
  const rulesets = await client.read(rulesPath);
  assert.ok(Array.isArray(rulesets) && rulesets.length < 100);
  const protections = new Set();
  for (const summary of rulesets.filter(
    (item) => item.target === "tag" && item.enforcement === "active",
  )) {
    const rule = await client.read("/rulesets/" + Number(summary.id));
    const condition = rule.conditions?.ref_name;
    if (
      !condition?.include?.includes("refs/tags/" + namespace + "*") ||
      condition.exclude?.length ||
      Object.keys(rule.conditions).length !== 1
    )
      continue;
    for (const r of rule.rules)
      if (r.type === "creation" || rule.bypass_actors?.length === 0)
        protections.add(r.type);
  }
  assert.ok(
    ["creation", "update", "deletion"].every((r) => protections.has(r)),
    "History namespace needs protected creation and immutable refs",
  );
  const root = tag.object.sha + ":evidence/";
  const index = JSON.parse(git("show", root + "checkpoint.json"));
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.repository, "Hadden-Industries/owlapi");
  assert.ok(
    Array.isArray(index.files) &&
      index.files.length > 0 &&
      index.files.length <= 200,
  );
  const inventory = git(
    "ls-tree",
    "-r",
    "--format=%(objectmode) %(path)",
    tag.object.sha,
    "--",
    "evidence/",
  )
    .toString()
    .trimEnd()
    .split("\n");
  assert.deepEqual(
    inventory.sort(),
    [
      "100644 evidence/checkpoint.json",
      ...index.files.map((e) => "100644 evidence/" + e.name),
    ].sort(),
  );
  const files = new Map();
  for (const entry of index.files) {
    assert.match(entry.name, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}$/u);
    assert.ok(!files.has(entry.name));
    const bytes = git("show", root + entry.name);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(digest(bytes), entry.sha256);
    files.set(entry.name, bytes);
  }
  assert.equal(
    (await client.read("/git/ref/tags/" + tag.tag)).object.sha,
    objectId,
  );
  return { objectId, index, files, signer };
}
