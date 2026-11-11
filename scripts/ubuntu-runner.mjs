import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const repositoryRuntimePolicy = JSON.parse(
  readFileSync(
    new URL("../docs/release/runtime-policy.json", import.meta.url),
    "utf8",
  ),
);

/** Readable during dependency-review bootstrap before npm ci. */
export function ubuntuRunner(policy = repositoryRuntimePolicy) {
  const linux = policy.consumerPlatforms.filter(({ os }) => os === "linux");
  assert.equal(
    linux.length,
    1,
    "Expected one Linux runner in the runtime policy",
  );
  const release = /^ubuntu-(\d[02468])\.04$/u.exec(linux[0].runner);
  assert.ok(release, "Expected an explicit Ubuntu LTS runner");
  assert.equal(linux[0].arch, "x64", "The Ubuntu reference host must be x64");
  return { label: release[0], image: `ubuntu${release[1]}` };
}
export const UBUNTU = Object.freeze(ubuntuRunner());

export function assertUbuntuHost(label, image) {
  if (label !== UBUNTU.label || image !== UBUNTU.image)
    throw new Error(
      `Ubuntu runner ${label} on image ${image} does not match ${UBUNTU.label} (${UBUNTU.image}).`,
    );
}
