/** Refresh advisories against the reviewed root, transport and original recipient locks. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import { NPM_REGISTRY, PACKAGE_NAME } from "./release-identity.mjs";
import { flattenNpmGraph } from "./npm-production-graph.mjs";
import {
  assertReleaseAudit,
  RELEASE_AUDIT_ARGS,
} from "./release-audit-policy.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readNpmJson = (npmCli, cwd, deadline, args) => {
  const remaining = Math.floor(deadline - performance.now());
  assert.ok(remaining > 0, "Current package audit deadline elapsed");
  const audit = spawnSync(
    process.execPath,
    [
      npmCli,
      ...args,
      "--package-lock-only",
      "--omit=dev",
      "--json",
      "--ignore-scripts",
      "--registry=" + NPM_REGISTRY,
      "--fetch-retries=0",
    ],
    {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      timeout: Math.min(45_000, remaining),
    },
  );
  if (audit.error) throw audit.error;
  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    throw new Error("npm did not return a complete JSON observation");
  }
  return { status: audit.status, report };
};

/** Historical lock bytes are passed in memory. The temporary root is only for npm. */
export function refreshReleaseAudits(
  recipientLockBytes,
  identities,
  {
    repositoryRoot = process.cwd(),
    deadline = performance.now() + 150_000,
    audit,
    readGraph,
    now = Date.now,
  } = {},
) {
  const read =
    !audit || !readGraph
      ? (() => {
          const { npmCli } = selectNpmCliForVersion({
            expectedNpm: CI_RUNTIME.npm,
            candidates: findNpmCliCandidates(),
            observeVersion: observeNpmVersion,
          });
          return (root, args) => readNpmJson(npmCli, root, deadline, args);
        })()
      : undefined;
  const runAudit = audit ?? ((root) => read(root, RELEASE_AUDIT_ARGS));
  const lock = JSON.parse(recipientLockBytes);
  const recipient = lock.packages?.[""];
  assert.ok(
    recipient && typeof recipient === "object" && !Array.isArray(recipient),
    "Original recipient lock has no root",
  );
  const scratch = mkdtempSync(join(resolve(tmpdir()), "owlapi-release-audit-"));
  assert.ok(isStrictDescendantPath(resolve(tmpdir()), scratch));
  try {
    writeFileSync(join(scratch, "package-lock.json"), recipientLockBytes, {
      flag: "wx",
    });
    writeFileSync(join(scratch, "package.json"), JSON.stringify(recipient), {
      flag: "wx",
    });
    const graph = (readGraph ?? ((root) => read(root, ["ls", "--all"])))(
      scratch,
    );
    assert.equal(
      graph.status,
      0,
      "Native npm could not load the retained recipient lock",
    );
    assert.deepEqual(
      flattenNpmGraph(graph.report?.dependencies?.owlapi, PACKAGE_NAME),
      identities,
      "The retained recipient lock has a different production graph",
    );
    const audited = {};
    for (const [name, root] of Object.entries({
      root: repositoryRoot,
      transport: join(repositoryRoot, "tooling/artifact-transport"),
      recipient: scratch,
    })) {
      const paths = ["package.json", "package-lock.json"].map((file) =>
        join(root, file),
      );
      const digests = paths.map((path) => sha(readFileSync(path)));
      const { status, report } = runAudit(root);
      const counts = assertReleaseAudit(
        { status, report },
        `${name} production graph`,
      );
      assert.deepEqual(
        paths.map((path) => sha(readFileSync(path))),
        digests,
        `npm audit changed the frozen ${name} inputs`,
      );
      audited[name] = {
        lockSha256: digests[1],
        manifestSha256: digests[0],
        reportSha256: sha(JSON.stringify(report)),
        high: counts.high,
        critical: counts.critical,
        observedAt: new Date(now()).toISOString(),
      };
    }
    assert.equal(audited.recipient.lockSha256, sha(recipientLockBytes));
    return audited;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
