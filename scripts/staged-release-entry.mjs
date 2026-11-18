/** Record a native no-request failure even if the publisher cannot be loaded. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

assert.equal(process.argv[2], "stage");
const env = process.env;
assert.equal(env.GITHUB_ACTIONS, "true");
assert.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
assert.equal(env.GITHUB_REPOSITORY, "Hadden-Industries/owlapi");
assert.equal(env.GITHUB_REF, "refs/heads/main");
assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
assert.match(env.GITHUB_RUN_ID, /^[1-9][0-9]*$/u);
assert.match(env.GITHUB_SHA, /^[a-f0-9]{40}$/u);
assert.match(env.MANIFEST_SHA256, /^[a-f0-9]{64}$/u);
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(resolve(env.GITHUB_WORKSPACE), workspace);

let controller;
try {
  controller = await import("./staged-release.mjs");
} catch (error) {
  const directory = join(workspace, ".release", "stage");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "journal.jsonl"),
    JSON.stringify({
      state: "NO_REQUEST",
      runId: env.GITHUB_RUN_ID,
      attempt: env.GITHUB_RUN_ATTEMPT,
      controller: env.GITHUB_SHA,
      manifestSha256: env.MANIFEST_SHA256,
    }) + "\n",
    { flag: "wx", flush: true },
  );
  throw error;
}
await controller.runStagedRelease();
