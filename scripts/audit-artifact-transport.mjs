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
let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  throw new Error("Transport audit result unavailable");
}
assertReleaseAudit(
  { status: audit.status, report },
  "isolated artifact transport",
);
process.stdout.write("Isolated artifact transport advisory check passed.\n");
