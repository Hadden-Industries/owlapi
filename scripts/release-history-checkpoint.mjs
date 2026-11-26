import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyLocalReleaseTag } from "./verify-release-tag.mjs";
import { REPOSITORY, REPOSITORY_GIT_URL } from "./release-identity.mjs";

const namespace = "owlapi-release-history/";
const writerKinds = ["stage", "labels", "classification", "draft", "seal"];
const resolvedReservation = [
  "SETTLED",
  "REJECTED",
  "RECONCILED_NO_PENDING_EFFECT",
];
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const hostedCheckout = () =>
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GITHUB_REPOSITORY === REPOSITORY;
const gitAt = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  });
const git = (...args) => gitAt(repositoryRoot, ...args);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const rulesPath = "/rulesets?includes_parents=true&per_page=100";
const oidPattern = /^[a-f0-9]{40}$/u;
const historyTag = /^owlapi-release-history\/[a-z0-9][a-z0-9.-]{0,100}$/u;
const validMember = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}$/u;
const maxBlobBytes = 64 * 1024 * 1024;

function localHistoryRef(ref, objectId) {
  let current;
  try {
    current = git("rev-parse", "--verify", "--quiet", ref).toString().trim();
  } catch (error) {
    if (error.status !== 1 || !hostedCheckout()) throw error;
    git(
      "fetch",
      "--depth=1",
      "--filter=blob:none",
      "--no-tags",
      "--no-recurse-submodules",
      REPOSITORY_GIT_URL,
      ref,
    );
    current = git("rev-parse", "--verify", "FETCH_HEAD").toString().trim();
    assert.equal(current, objectId, "The fetched history tag was rebound");
    git("update-ref", ref, objectId, "0".repeat(40));
  }
  assert.equal(current, objectId);
}

function historyBlob(oid, maximum = maxBlobBytes) {
  return readHistoryObject("blob", oid, maximum, git, (error) => {
    if (error.status !== 128 || !hostedCheckout()) throw error;
    // The server only serves the exact object referenced by the verified tag tree.
    git(
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      "--no-write-fetch-head",
      REPOSITORY_GIT_URL,
      oid,
    );
  });
}

function readHistoryObject(type, oid, maximum, readGit, restore) {
  let size;
  try {
    size = Number(readGit("cat-file", "-s", oid).toString().trim());
  } catch (error) {
    if (!restore)
      throw new Error(
        `Restore the original signed history Git object ${oid} before offline verification`,
        { cause: error },
      );
    restore(error);
    size = Number(readGit("cat-file", "-s", oid).toString().trim());
  }
  assert.ok(
    Number.isSafeInteger(size) && size >= 0 && size <= maximum,
    "Selected signed blob exceeds its byte limit",
  );
  return readGit("cat-file", type, oid);
}

/** Validate all signed paths and sizes before reading only the selected blobs. */
export function checkpointPayloads(index, inventory, loadBlob) {
  assert.ok([1, 2].includes(index.schemaVersion));
  assert.ok(
    Array.isArray(index.files) &&
      index.files.length > 0 &&
      index.files.length <= 200,
  );
  const declared = new Map();
  const members = new Map();
  const normalized = new Set(["checkpoint.json"]);
  const validate = (entry) => {
    assert.match(entry.name, validMember);
    assert.ok(
      !normalized.has(entry.name.toLowerCase()),
      "Duplicate checkpoint member",
    );
    normalized.add(entry.name.toLowerCase());
    assert.ok(
      Number.isSafeInteger(entry.bytes) &&
        entry.bytes >= 0 &&
        entry.bytes <= maxBlobBytes,
      "Checkpoint member exceeds its byte limit",
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/u);
  };
  for (const entry of index.files) {
    assert.equal(
      entry.disclosure,
      "PUBLIC",
      "Restricted evidence must remain in owner-controlled private storage",
    );
    validate(entry);
    declared.set(entry.name, entry);
    if (entry.parts !== undefined) {
      assert.equal(index.schemaVersion, 2);
      assert.ok(
        Array.isArray(entry.parts) &&
          entry.parts.length >= 2 &&
          entry.parts.length <= 16,
      );
      let length = 0;
      for (const part of entry.parts) {
        validate(part);
        assert.ok(part.bytes > 0);
        length += part.bytes;
        members.set(part.name, part);
      }
      assert.equal(
        length,
        entry.bytes,
        "Checkpoint parts differ from the logical member length",
      );
    } else members.set(entry.name, entry);
  }
  assert.ok(members.size <= 256, "Checkpoint has excessive physical members");
  assert.deepEqual(
    [...inventory.keys()].sort(),
    ["checkpoint.json", ...members.keys()].sort(),
    "Checkpoint inventory has missing or unexpected paths",
  );
  for (const [name, entry] of members) {
    const observed = inventory.get(name);
    assert.equal(observed.mode, "100644");
    if (observed.bytes !== undefined) assert.equal(observed.bytes, entry.bytes);
    assert.match(observed.oid, oidPattern);
  }
  const cache = new Map();
  const read = ({ name, bytes, sha256 }) => {
    const { oid } = inventory.get(name);
    const retained = cache.get(oid) ?? loadBlob(oid, bytes);
    assert.equal(retained.length, bytes);
    assert.equal(digest(retained), sha256);
    cache.set(oid, retained);
    return retained;
  };
  return {
    has: (name) => declared.has(name),
    get: (name) => {
      const entry = declared.get(name);
      if (!entry) return undefined;
      if (!entry.parts) return read(entry);
      const bytes = Buffer.concat(entry.parts.map(read), entry.bytes);
      assert.equal(
        digest(bytes),
        entry.sha256,
        "Assembled checkpoint member digest differs",
      );
      return bytes;
    },
  };
}
export function immutableRuleHasNoBypass(rule, reviewedRules) {
  if (Object.hasOwn(rule, "bypass_actors"))
    return Array.isArray(rule.bypass_actors) && rule.bypass_actors.length === 0;
  const reviewed = reviewedRules?.find((r) => r.id === rule.id);
  return Boolean(
    reviewed &&
    typeof rule.updated_at === "string" &&
    Number.isFinite(Date.parse(rule.updated_at)) &&
    reviewed.updated_at === rule.updated_at &&
    Array.isArray(reviewed.bypass_actors) &&
    reviewed.bypass_actors.length === 0,
  );
}
export function priorDisposition(checkpoint, name) {
  if (checkpoint.files.has(name)) return JSON.parse(checkpoint.files.get(name));
  const records = checkpoint.index?.dispositions;
  assert.ok(
    records && Object.hasOwn(records, name),
    "Missing signed disposition " + name,
  );
  return records[name];
}
const reservationRefs = (client, kind) =>
  client.read("/git/matching-refs/tags/" + namespace + kind + "-");

export async function unresolvedReservations(client, checkpoint) {
  for (const kind of writerKinds) {
    const refs = await reservationRefs(client, kind);
    assert.ok(Array.isArray(refs));
    for (const ref of refs) {
      const number = /-([1-9][0-9]*)$/u.exec(ref.ref)?.[1];
      assert.ok(
        number && ref.object.type === "tag" && oidPattern.test(ref.object.sha),
      );
      const name = "reservation-" + kind + "-" + number + ".json";
      if (
        !checkpoint.files.has(name) &&
        !Object.hasOwn(checkpoint.index?.dispositions ?? {}, name)
      )
        return true;
      const saved = priorDisposition(checkpoint, name);
      if (
        saved.object !== ref.object.sha ||
        !resolvedReservation.includes(saved.state)
      )
        return true;
    }
  }
  return false;
}
export async function readCheckpoint(client, objectId) {
  assert.match(objectId, oidPattern);
  const tag = await client.read("/git/tags/" + objectId);
  assert.equal(tag.sha, objectId);
  assert.match(tag.tag, historyTag);
  assert.equal(tag.object.type, "commit");
  assert.match(tag.object.sha, /^[a-f0-9]{40}$/u);
  assert.equal(tag.verification.verified, true);
  const ref = "refs/tags/" + tag.tag;
  const live = await client.read("/git/ref/tags/" + tag.tag);
  assert.equal(live.object.type, "tag");
  assert.equal(live.object.sha, objectId);
  localHistoryRef(ref, objectId);
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
  const { index, files } = openCheckpointTree(tag.object.sha, git, historyBlob);
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
      if (
        r.type === "creation" ||
        immutableRuleHasNoBypass(rule, index.rulesets)
      )
        protections.add(r.type);
  }
  assert.ok(
    ["creation", "update", "deletion"].every((r) => protections.has(r)),
    "History namespace needs protected creation and immutable refs",
  );
  assert.equal(
    (await client.read("/git/ref/tags/" + tag.tag)).object.sha,
    objectId,
  );
  return { objectId, tag: tag.tag, index, files, signer };
}

function openCheckpointTree(commit, readGit, loadBlob) {
  const inventory = new Map();
  for (const line of readGit(
    "ls-tree",
    "-rz",
    "--format=%(objectmode) %(objectname) %(path)",
    commit,
    "--",
    "evidence/",
  )
    .toString()
    .split("\0")
    .filter(Boolean)) {
    const match = /^(\d+) ([a-f0-9]{40}) evidence\/([a-zA-Z0-9._-]+)$/u.exec(
      line,
    );
    assert.ok(match, "Invalid physical checkpoint path");
    const [, mode, oid, name] = match;
    assert.ok(!inventory.has(name));
    inventory.set(name, { mode, oid });
  }
  const header = inventory.get("checkpoint.json");
  assert.equal(header?.mode, "100644");
  const index = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      loadBlob(header.oid, 2 * 1024 * 1024),
    ),
  );
  assert.equal(
    index.disclosure,
    "APPROVED_FOR_PUBLIC_GIT",
    "Only disclosure-reviewed public evidence belongs in this ref",
  );
  assert.equal(index.repository, REPOSITORY);
  return { index, files: checkpointPayloads(index, inventory, loadBlob) };
}

/** Reverify an exact checkpoint object already admitted by the immutable seal.
 * The caller owns the historical timestamp and signer registry. This route has
 * no authority to admit a new live checkpoint or fetch missing Git objects. */
export function readArchivedCheckpoint(
  objectId,
  { registry, verifiedAt, localRepository = repositoryRoot },
) {
  assert.match(objectId, oidPattern);
  const time = Date.parse(verifiedAt);
  assert.ok(
    Number.isFinite(time),
    "Missing original checkpoint verification time",
  );
  const readGit = (...args) =>
    gitAt(localRepository, "--no-replace-objects", "--no-lazy-fetch", ...args);
  const raw = readHistoryObject("tag", objectId, 64 * 1024, readGit);
  assert.equal(
    createHash("sha1").update(`tag ${raw.length}\0`).update(raw).digest("hex"),
    objectId,
    "Archived checkpoint tag object changed",
  );
  const [target, type, name, tagger, ...rest] = new TextDecoder("utf-8", {
    fatal: true,
  })
    .decode(raw)
    .split("\n\n", 1)[0]
    .split("\n");
  assert.equal(rest.length, 0);
  assert.equal(type, "type commit");
  const commit = /^object ([a-f0-9]{40})$/u.exec(target)?.[1];
  assert.ok(commit, "Invalid original checkpoint commit");
  const tag = name?.slice(4);
  assert.ok(name?.startsWith("tag "));
  assert.match(tag, historyTag);
  const seconds = Number(
    /^tagger [^\n]+ <[^<>\n]*> ([0-9]{1,12}) [+-][0-9]{4}$/u.exec(tagger)?.[1],
  );
  assert.ok(
    Number.isSafeInteger(seconds) && seconds >= 0 && seconds * 1000 <= time,
    "Archived checkpoint postdates its original verification",
  );
  const signer = verifyLocalReleaseTag({
    repositoryRoot: localRepository,
    expectedTag: tag,
    expectedCommit: commit,
    tagObject: objectId,
    registry,
    releaseDate: new Date(time).toISOString().slice(0, 10),
  });
  const { index, files } = openCheckpointTree(commit, readGit, (oid, max) =>
    readHistoryObject("blob", oid, max, readGit),
  );
  return { objectId, tag, index, files, signer };
}

/** A protected reservation survives run deletion and can authorize only one native run number. */
export async function verifyReservations(
  client,
  checkpoint,
  env,
  kind,
  { version, create = false, trackWriterTime = false, retirementSha } = {},
) {
  assert.ok(writerKinds.includes(kind));
  const number = Number(env.GITHUB_RUN_NUMBER);
  assert.ok(
    Number.isSafeInteger(number) &&
      number > 0 &&
      env.GITHUB_RUN_ATTEMPT === "1",
  );
  const versionPattern = "\\d+\\.\\d+\\.\\d+(?:-rc\\.\\d+)?";
  if (kind === "draft" || kind === "seal")
    assert.match(version, new RegExp("^" + versionPattern + "$", "u"));
  const scope =
    kind === "draft"
      ? "-" + version + (create ? "-create" : "-continue")
      : kind === "seal"
        ? "-" + version
        : "";
  const current = namespace + kind + scope + "-" + number;
  assert.equal(
    checkpoint.tag,
    current,
    "A writer needs a signed single-run reservation",
  );
  const preceding = [];
  let lastWriterAt = -Infinity;
  for (const prefix of writerKinds) {
    const refs = await reservationRefs(client, prefix);
    assert.ok(Array.isArray(refs));
    if (prefix === kind)
      assert.ok(
        refs.some(
          (r) =>
            r.ref === "refs/tags/" + current &&
            r.object.type === "tag" &&
            r.object.sha === checkpoint.objectId,
        ),
      );
    for (const ref of refs) {
      if (ref.ref === "refs/tags/" + current) continue;
      const subject =
        prefix === "draft"
          ? "(?<version>" + versionPattern + ")-(?<phase>create|continue)-"
          : prefix === "seal"
            ? "(?<version>" + versionPattern + ")-"
            : "";
      const match = new RegExp(
        "^refs/tags/" +
          namespace +
          prefix +
          "-" +
          subject +
          "(?<number>[1-9][0-9]*)$",
        "u",
      ).exec(ref.ref);
      assert.ok(match && ref.object.type === "tag");
      const other = match.groups;
      assert.ok(
        prefix !== kind || Number(other.number) !== number,
        "Another reservation addresses the same native run",
      );
      const saved = priorDisposition(
        checkpoint,
        "reservation-" + prefix + "-" + other.number + ".json",
      );
      assert.equal(saved.object, ref.object.sha);
      if (retirementSha && prefix === "labels") {
        assert.match(saved.operationSha256, /^[a-f0-9]{64}$/u);
        assert.notEqual(
          saved.operationSha256,
          retirementSha,
          "Pilot retirement requires a fresh signed operation",
        );
      }
      assert.ok(
        resolvedReservation.includes(saved.state),
        "Unresolved release reservation",
      );
      if (
        trackWriterTime &&
        ["stage", "labels", "classification"].includes(prefix)
      ) {
        if (saved.lastWriteAt === null) {
          assert.equal(saved.requestState, "NO_REQUEST");
        } else {
          const ended = Date.parse(saved.lastWriteAt);
          assert.ok(
            Number.isFinite(ended) && ended <= Date.now(),
            "Previous reservation needs the native write end time",
          );
          lastWriterAt = Math.max(lastWriterAt, ended);
        }
      }
      const firstDraft = kind === "draft" && create && other.phase === "create";
      if (
        (kind === "seal" || firstDraft) &&
        prefix === kind &&
        other.version === version
      ) {
        assert.equal(
          saved.state,
          "RECONCILED_NO_PENDING_EFFECT",
          firstDraft
            ? "First draft already reserved for this version"
            : "Seal requires reconciliation of the original request",
        );
        assert.ok(saved.origin, "Missing proof of the original writer attempt");
        preceding.push({
          number: other.number,
          objectId: saved.object,
          origin: saved.origin,
        });
      }
    }
  }
  return { preceding, lastWriterAt };
}

// These qualification and material controls changed with reconciliation.
// For already submitted stages, product, lock and rights inputs
// retain the original controller-delta boundary.
const legacyFollowupControls = new Set([
  "aggregate-consumer-runtimes",
  "browser-consumer-evidence",
  "browser-consumer-preparation",
  "build-release-candidate",
  "ci-check-coverage-command",
  "ci-consumer-evidence-verification",
  "ci-recipient-attribution",
  "ci-recipient-material-pending",
  "ci-recipient-scanner",
  "consumer-runtime-matrix",
  "consumer-runtime-tools",
  "installed-consumer-fixtures",
  "macos-material-job-selection",
  "macos-material-readmission",
  "material-record-interning",
  "owl-contract-evidence",
  "pending-mac-attempt",
  "promoted-audit-subjects",
  "promoted-release-proof",
  "public-archive-qualification",
  "public-material-packet",
  "public-recipient-admission",
  "public-recipient-plan",
  "public-reconciliation-proof",
  "qualification-advisory-binding",
  "qualification-audit-batch",
  "qualify-consumer-runtime",
  "qualify-installed-candidate",
  "qualify-owl-contract",
  "rc3-recovery-workflow",
  "recipient-material-case",
  "recipient-material-case-authority",
  "recipient-material-case-offline",
  "recipient-material-case-readmission",
  "recipient-material-case-replay",
  "recipient-material-git-source",
  "replay-ci-recipient-material",
  "run-browser-tests",
  "run-release-advisory",
  "stage-qualification-recovery",
  "standalone-portability-proof",
]);
const legacyEvidenceControls = new Set([
  "acquisition",
  "blob-store",
  "evidence-manifest",
  "recipient-material-inputs",
  "recipient-material",
]);
const isLegacyFollowupControl = (path) => {
  const match =
    /^(scripts|util\/third-party-evidence)\/([a-z0-9-]+)(?:\.test)?\.(?:mjs|js)$/u.exec(
      path,
    );
  return Boolean(
    match &&
    (match[1] === "scripts"
      ? legacyFollowupControls
      : legacyEvidenceControls
    ).has(match[2]),
  );
};

export function verifyControllerDelta(
  source,
  controller,
  files,
  { alreadySubmittedLegacyStage = false } = {},
) {
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
        [
          "scripts/github-release.mjs",
          "scripts/github-evidence-reader.mjs",
          "scripts/public-archive-verification.mjs",
          "scripts/public-audit-batch.mjs",
          "scripts/public-material-job.mjs",
          "scripts/public-recipient-observation.mjs",
          "scripts/public-reconciliation-proof.mjs",
          "scripts/public-reconciliation-proof.test.js",
          "scripts/public-registry-consumer.mjs",
          "scripts/public-registry-consumer.test.js",
          "scripts/validate-release-evidence.mjs",
          "scripts/workflow-governance.mjs",
          "scripts/workflow-governance.test.js",
        ].includes(p) ||
        /^scripts\/(staged-|release-|verify-immutable-release|public-recipient-lane|qualify-public-registry|registry-provenance)/u.test(
          p,
        ) ||
        /^docs\/(release|plans)\//u.test(p) ||
        (alreadySubmittedLegacyStage && isLegacyFollowupControl(p)),
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
