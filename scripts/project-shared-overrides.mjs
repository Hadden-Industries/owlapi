/** The root manifest owns npm override values that independent projects share.
 * npm cannot reference another manifest, so each nested project's matching
 * overrides are checked projections; nested locks remain npm-owned.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
export const SHARED_OVERRIDE_PROJECTS = Object.freeze([
  "tooling/artifact-transport/package.json",
]);

const readManifest = (relative) =>
  JSON.parse(readFileSync(resolve(root, relative), "utf8"));

/** Project the root values into one nested manifest without adding new keys. */
export function projectSharedOverrides(manifest, rootOverrides, relative) {
  const violations = [];
  let changed = false;
  const overrides = manifest.overrides ?? {};
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(rootOverrides, key)) {
      violations.push(`${relative}: override ${key} has no root authority`);
      continue;
    }
    if (isDeepStrictEqual(value, rootOverrides[key])) continue;
    violations.push(
      `${relative}: override ${key} drifts from package.json; run node scripts/project-shared-overrides.mjs --write, then refresh its lock with npm`,
    );
    overrides[key] = structuredClone(rootOverrides[key]);
    changed = true;
  }
  return { manifest, violations, changed };
}

export function checkSharedOverrides({
  rootManifest = readManifest("package.json"),
  manifests = {},
} = {}) {
  return SHARED_OVERRIDE_PROJECTS.flatMap(
    (relative) =>
      projectSharedOverrides(
        structuredClone(manifests[relative] ?? readManifest(relative)),
        rootManifest.overrides ?? {},
        relative,
      ).violations,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, ...rest] = process.argv.slice(2);
  if (rest.length || !["--check", "--write"].includes(mode))
    throw new Error("Use --check or --write");
  if (mode === "--write") {
    const rootOverrides = readManifest("package.json").overrides ?? {};
    for (const relative of SHARED_OVERRIDE_PROJECTS) {
      const { manifest, changed } = projectSharedOverrides(
        readManifest(relative),
        rootOverrides,
        relative,
      );
      // npm manifests use two-space JSON with a final newline.
      if (changed)
        writeFileSync(
          resolve(root, relative),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );
    }
  }
  const violations = checkSharedOverrides();
  process.stdout.write(
    `${JSON.stringify({ mode: mode.slice(2), violations })}\n`,
  );
  if (violations.length) process.exitCode = 1;
}
