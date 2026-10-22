/** Shared action entry for immutable uploads and logical-coordinate collection. */
import * as core from "@actions/core";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { hashBytes, policy, selectArtifactGroups } from "./identity.mjs";
import { freezePayload } from "./payload.mjs";
import { collectArtifacts } from "./collection.mjs";
import { retainArtifact } from "./transport.mjs";
import { createSdkAdapter } from "./sdk-adapter.mjs";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());
let temporary;
let phase = "prepare";
const collect = core.getInput("mode") === "collect";
const deadline =
  performance.now() +
  (collect
    ? policy.collectionDeadlineMilliseconds
    : policy.deadlineMilliseconds);
try {
  temporary = await mkdtemp(join(process.env.RUNNER_TEMP, "owlapi-artifact-"));
  // Both local action descriptors reference this one reproducible bundle directory.
  const worker = join(import.meta.dirname, "sdk-worker.mjs");
  const adapter = createSdkAdapter({ worker, temporary });
  const run = process.env.GITHUB_RUN_ID;
  const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (collect) {
    phase = "select-logical-artifacts";
    const controls = { deadline, signal: controller.signal };
    const groups = selectArtifactGroups(await adapter.list(controls), {
      name: core.getInput("name"),
      pattern: core.getInput("pattern"),
      run,
      attempt,
    });
    await collectArtifacts({
      adapter,
      groups,
      workspace: process.env.GITHUB_WORKSPACE,
      path: core.getInput("path", { required: true }),
      temporary,
      exact: Boolean(core.getInput("name")),
      controls,
      report: (event) => core.info(JSON.stringify(event)),
      onPhase: (value) => {
        phase = value;
      },
    });
  } else {
    phase = "freeze-payload";
    const logical = core.getInput("name", { required: true });
    const snapshot = await freezePayload({
      paths: core.getInput("path", { required: true }),
      workspace: process.env.GITHUB_WORKSPACE,
      destination: join(temporary, "snapshot"),
      signal: controller.signal,
      deadline,
    });
    phase = "retain-frozen-payload";
    const result = await retainArtifact({
      adapter,
      deadline,
      snapshot,
      scope: {
        logical,
        run,
        attempt,
        producer: hashBytes(`${process.env.GITHUB_JOB}\n${logical}`).slice(
          0,
          16,
        ),
        invocation: randomUUID().replaceAll("-", ""),
      },
      options: {
        retentionDays: Number(core.getInput("retention-days")),
        compressionLevel: Number(
          core.getInput("compression-level") || policy.defaultCompressionLevel,
        ),
      },
      signal: controller.signal,
      sleep: (milliseconds, signal) =>
        sleep(milliseconds, undefined, { signal }),
      report: (event) =>
        core.info(
          JSON.stringify({ artifactTransport: policy.version, ...event }),
        ),
    });
    const url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${run}/artifacts/${result.id}`;
    core.setOutput("artifact-id", result.id);
    core.setOutput("artifact-digest", result.digest);
    core.setOutput("artifact-url", url);
    core.setOutput("artifact-name", result.name);
  }
} catch (error) {
  const code =
    typeof error.code === "string" && /^[A-Z0-9_]{1,60}$/u.test(error.code)
      ? error.code
      : "UNKNOWN";
  core.setFailed(
    `Artifact transport failed closed during ${phase} (${code}); see bounded operation dispositions above.`,
  );
} finally {
  if (temporary) {
    await rm(temporary, { recursive: true, force: true });
  }
}
