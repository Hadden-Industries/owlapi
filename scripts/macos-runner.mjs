import assert from "node:assert/strict";
import { repositoryRuntimePolicy } from "./ubuntu-runner.mjs";

/** The runtime policy owns the macOS consumer runner, like Ubuntu and Windows. */
export function macosRunner(policy = repositoryRuntimePolicy) {
  const macos = policy.consumerPlatforms.filter(({ os }) => os === "darwin");
  assert.equal(
    macos.length,
    1,
    "Expected one macOS runner in the runtime policy",
  );
  const { runner, arch } = macos[0];
  assert.ok(/^macos-\d+$/u.test(runner), "Expected an explicit macOS runner");
  assert.equal(arch, "arm64", "The macOS reference host must be arm64");
  return { label: runner };
}

export const MACOS = Object.freeze(macosRunner());
