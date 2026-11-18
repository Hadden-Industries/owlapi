/** Native release dispatch routes. An omitted input set allows qualification reuse only. */
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function releaseQualificationMode(inputs) {
  assert.ok(inputs && typeof inputs === "object" && !Array.isArray(inputs));
  const defaults = {
    qualification_only: true,
    rc3_recovery: false,
    fresh_qualification: false,
  };
  for (const [name, value] of Object.entries(inputs)) {
    assert.ok(
      Object.hasOwn(defaults, name) && typeof value === "boolean",
      "Unknown or non-boolean release input",
    );
  }
  const {
    qualification_only: readOnly,
    rc3_recovery: rc3,
    fresh_qualification: fresh,
  } = { ...defaults, ...inputs };
  assert.ok(
    !(rc3 && readOnly) && !(fresh && !readOnly),
    "Incompatible fresh, qualification-only or rc.3 recovery selections",
  );
  return rc3 ? "rc3" : !readOnly ? "legacy" : fresh ? "fresh" : "reuse";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const input = process.env.RELEASE_INPUTS_JSON;
  assert.ok(
    typeof input === "string" && Buffer.byteLength(input) <= 1024,
    "Invalid release input envelope",
  );
  const mode = releaseQualificationMode(JSON.parse(input));
  assert.equal(process.env.GITHUB_EVENT_NAME, "workflow_dispatch");
  assert.equal(process.env.GITHUB_REPOSITORY, "Hadden-Industries/owlapi");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  const predecessors = JSON.parse(
    process.env.RELEASE_PREREQUISITES_JSON ?? "null",
  );
  const result = mode === "rc3" ? "skipped" : "success";
  for (const name of ["runtime_matrix", "release_preflight"])
    assert.equal(
      predecessors?.[name]?.result,
      result,
      `Release admission requires ${name}=${result}`,
    );
  assert.ok(process.env.GITHUB_OUTPUT);
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
}
