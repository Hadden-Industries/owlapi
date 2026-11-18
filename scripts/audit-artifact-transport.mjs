import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  assertReleaseAudit,
  RELEASE_AUDIT_ARGS,
} from "./release-audit-policy.mjs";

const npmCli = process.env.npm_execpath;
assert.ok(
  npmCli,
  "Run the isolated transport audit through its named npm script",
);

const audit = spawnSync(
  process.execPath,
  [
    npmCli,
    ...RELEASE_AUDIT_ARGS,
    "--prefix",
    "tooling/artifact-transport",
    "--package-lock-only",
    "--json",
  ],
  { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, windowsHide: true },
);
if (audit.error) throw audit.error;
if (audit.stderr) process.stderr.write(audit.stderr);
assertReleaseAudit(
  { status: audit.status, report: JSON.parse(audit.stdout) },
  "isolated artifact transport",
);
process.stdout.write(audit.stdout);
