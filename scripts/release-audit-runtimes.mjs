/** Reuse the workflow's pinned consumer npm for native lock replay, including on a cold writer. */
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  assertConsumerNpm,
  provisionConsumerNpm,
} from "./consumer-runtime-tools.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
} from "./assert-workflow-runtime.mjs";
import { isStrictDescendantPath } from "./release-file-utils.mjs";

/** Provision at most once per operation. The tool installer receives no GitHub or
 * signing credentials. Only the two admitted runtime policy versions are eligible. */
export async function withAuditNpmClients(
  producerCli,
  action,
  consumerNpm = CI_RUNTIME.consumerNpm,
) {
  const tools = new Map([[CI_RUNTIME.npm, producerCli]]);
  let scratch;
  const parent = realpathSync(tmpdir());
  function forVersion(version) {
    assert.ok([CI_RUNTIME.npm, consumerNpm].includes(version));
    if (tools.has(version)) return tools.get(version);
    for (const candidate of [
      process.env.OWLAPI_CONSUMER_NPM,
      ...findNpmCliCandidates(),
    ].filter(Boolean)) {
      if (observeNpmVersion(candidate) === version) {
        assertConsumerNpm(candidate, process.versions.node, consumerNpm);
        tools.set(version, candidate);
        return candidate;
      }
    }
    scratch = mkdtempSync(join(parent, "owlapi-audit-tools-"));
    assert.ok(isStrictDescendantPath(parent, scratch));
    const cli = provisionConsumerNpm(
      producerCli,
      scratch,
      process.versions.node,
      consumerNpm,
    );
    tools.set(version, cli);
    return cli;
  }
  try {
    return await action(forVersion);
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}
