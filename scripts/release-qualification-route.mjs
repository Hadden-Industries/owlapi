/** Native release dispatch routes. An omitted input set allows qualification reuse only. */
import { REPOSITORY } from "./release-identity.mjs";
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCorpusArtifactLocator } from "./corpus-qualification-manifest.mjs";

export function releaseQualificationMode(inputs) {
  assert.ok(inputs && typeof inputs === "object" && !Array.isArray(inputs));
  const defaults = {
    qualification_only: true,
    rc3_recovery: false,
    fresh_qualification: false,
    corpus_qualification_artifact: "",
  };
  for (const [name, value] of Object.entries(inputs)) {
    assert.ok(
      Object.hasOwn(defaults, name) && typeof value === typeof defaults[name],
      "Unknown or incorrectly typed release input",
    );
  }
  const {
    qualification_only: readOnly,
    rc3_recovery: rc3,
    fresh_qualification: fresh,
    corpus_qualification_artifact: corpus,
  } = { ...defaults, ...inputs };
  assert.ok(
    !(rc3 && readOnly) && !(fresh && !readOnly),
    "Incompatible fresh, qualification-only or rc.3 recovery selections",
  );
  if (corpus) {
    assert.ok(
      readOnly,
      "Corpus shadow evidence requires qualification-only dispatch",
    );
    assert.ok(
      !fresh,
      "Fresh corpus evidence is produced in the same release run",
    );
    parseCorpusArtifactLocator(corpus);
  }
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
  assert.equal(process.env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  assert.ok(process.env.GITHUB_OUTPUT);
  appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
}
