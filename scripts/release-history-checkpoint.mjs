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
  assert.equal(
    index.disclosure,
    "APPROVED_FOR_PUBLIC_GIT",
    "Only disclosure-reviewed public evidence belongs in this ref",
  );
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
    assert.equal(
      entry.disclosure,
      "PUBLIC",
      "Restricted evidence must remain in owner-controlled private storage",
    );
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
  return { objectId, tag: tag.tag, index, files, signer };
}

/** A protected reservation survives run deletion and can authorize only one native run number. */
export async function verifyReservations(client, checkpoint, env, kind) {
  const kinds = ["stage", "labels", "classification"];
  assert.ok(kinds.includes(kind));
  const number = Number(env.GITHUB_RUN_NUMBER);
  assert.ok(
    Number.isSafeInteger(number) &&
      number > 0 &&
      env.GITHUB_RUN_ATTEMPT === "1",
  );
  const current = namespace + kind + "-" + number;
  assert.equal(
    checkpoint.tag,
    current,
    "A writer needs a signed single-run reservation",
  );
  for (const prefix of kinds) {
    const refs = await client.read(
      "/git/matching-refs/tags/" + namespace + prefix + "-",
    );
    assert.ok(Array.isArray(refs));
    if (prefix === kind)
      assert.ok(
        refs.some(
          (r) =>
            r.ref === "refs/tags/" + current &&
            r.object.sha === checkpoint.objectId,
        ),
      );
    for (const ref of refs) {
      if (ref.ref === "refs/tags/" + current) continue;
      const match = new RegExp(
        "^refs/tags/" + namespace + prefix + "-([1-9][0-9]*)$",
        "u",
      ).exec(ref.ref);
      assert.ok(match && ref.object.type === "tag");
      const saved = JSON.parse(
        checkpoint.files.get(
          "reservation-" + prefix + "-" + match[1] + ".json",
        ),
      );
      assert.equal(saved.object, ref.object.sha);
      assert.ok(
        ["SETTLED", "REJECTED", "RECONCILED_NO_PENDING_EFFECT"].includes(
          saved.state,
        ),
        "Unresolved release reservation",
      );
    }
  }
}

export function verifyControllerDelta(source, controller, files) {
  for (const oid of [source, controller]) assert.match(oid, /^[a-f0-9]{40}$/u);
  if (source === controller) return;
  git("merge-base", "--is-ancestor", source, controller);
  const paths = git(
    "diff",
    "--no-renames",
    "--name-only",
    "-z",
    source,
    controller,
  )
    .toString()
    .split("\0")
    .filter(Boolean);
  assert.ok(
    paths.every(
      (p) =>
        /^\.github\/(workflows|actions)\//u.test(p) ||
        /^scripts\/(staged-|release-|verify-immutable-release|public-recipient-lane|qualify-public-registry|registry-provenance)/u.test(
          p,
        ) ||
        /^docs\/(release|plans)\//u.test(p),
    ),
    "Controller delta includes product or unreviewed paths",
  );
  const approval = JSON.parse(files.get("controller-delta.json"));
  assert.deepEqual(approval, {
    source,
    controller,
    paths,
    decision: "OWNER_REVIEWED_CONTROL_ONLY",
  });
}
