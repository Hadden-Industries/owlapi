import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { findNpmCliCandidates } from "./assert-workflow-runtime.mjs";

// Admission runs before project installation. Reuse the selected npm's native
// SemVer implementation without installing the development graph or running npm.
const nativeNpm =
  process.env.OWLAPI_CONSUMER_NPM ??
  process.env.npm_execpath ??
  findNpmCliCandidates()[0];
assert.ok(nativeNpm, "A native npm CLI is required to read version policy");
export const npmSemver = createRequire(nativeNpm)("semver");
