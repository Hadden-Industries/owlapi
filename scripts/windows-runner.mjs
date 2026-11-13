import assert from "node:assert/strict";
import { repositoryRuntimePolicy } from "./ubuntu-runner.mjs";

export function windowsRunner(policy = repositoryRuntimePolicy) {
  const windows = policy.consumerPlatforms.filter(({ os }) => os === "win32");
  assert.equal(
    windows.length,
    1,
    "Expected one Windows runner in the runtime policy",
  );
  const { runner, arch } = windows[0];
  const release = runner.match(/^windows-20(\d{2}(?:-vs20\d{2})?)$/u);
  assert.ok(release, "Expected an explicit Windows Server runner");
  assert.equal(arch, "x64", "The Windows reference host must be x64");
  // GitHub's ImageOS keeps the VS suffix and abbreviates the server year.
  return { label: runner, image: `win${release[1]}` };
}

export const WINDOWS = Object.freeze(windowsRunner());

export function assertWindowsHost(label, image) {
  if (label !== WINDOWS.label || image !== WINDOWS.image)
    throw new Error(
      `Windows runner ${label} on image ${image} does not match ${WINDOWS.label} (${WINDOWS.image}).`,
    );
}
