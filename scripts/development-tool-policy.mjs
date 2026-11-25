/** Exact uv bootstrap identity; native projects retain checked static constraints. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const policy = JSON.parse(
  readFileSync(
    new URL("../docs/release/development-tools.json", import.meta.url),
    "utf8",
  ),
);
export const UV_SELECTION = Object.freeze({
  version: policy.uv.version,
  assets: Object.freeze(
    Object.fromEntries(
      Object.entries(policy.uv.assets).map(([platform, asset]) => [
        platform,
        Object.freeze(asset),
      ]),
    ),
  ),
});

/** CI's checksum-pinned actionlint; the upstream asset name embeds the version. */
export const ACTIONLINT_SELECTION = Object.freeze({
  version: policy.actionlint.version,
  assets: Object.freeze({
    linux: Object.freeze({
      file: `actionlint_${policy.actionlint.version}_linux_amd64.tar.gz`,
      sha256: policy.actionlint.assets.linux.sha256,
    }),
  }),
});
if (
  !/^\d+\.\d+\.\d+$/u.test(ACTIONLINT_SELECTION.version) ||
  !/^[0-9a-f]{64}$/u.test(ACTIONLINT_SELECTION.assets.linux.sha256)
)
  throw new Error(
    "docs/release/development-tools.json: invalid actionlint selection",
  );

const projectName = (name) => name.toLowerCase().replaceAll(/[-_.]+/gu, "-");

/** Read the one exact `name==version` requirement a native project declares. */
export function pinnedRequirement(relative, name, repositoryRoot = root) {
  const source = readFileSync(resolve(repositoryRoot, relative), "utf8");
  const versions = [...source.matchAll(/"([A-Za-z0-9._-]+)==([^"\s]+)"/gu)]
    .filter(([, project]) => projectName(project) === projectName(name))
    .map(([, , version]) => version);
  if (versions.length !== 1)
    throw new Error(`${relative}: expected exactly one ${name}== requirement`);
  return versions[0];
}

// The native projects own these pins; scripts and generated records read them.
export const SCANCODE_VERSION = pinnedRequirement(
  "util/scancode-runtime/pyproject.toml",
  "scancode-toolkit",
);
export const BEARTYPE_VERSION = pinnedRequirement(
  "util/scancode-runtime/pyproject.toml",
  "beartype",
);

/** One Python pin drives the scanner interpreter and evidence metadata. */
export function pythonTarget(repositoryRoot = root) {
  const version = readFileSync(
    resolve(repositoryRoot, ".python-version"),
    "utf8",
  ).trim();
  if (!/^[1-9]\d*\.\d+\.\d+$/u.test(version))
    throw new Error(
      ".python-version must contain a stable major.minor.patch version.",
    );
  const [major, minor] = version.split(".");
  return { version, minor: `${major}.${minor}` };
}

export function syncPythonProjections(
  repositoryRoot = root,
  { write = false } = {},
) {
  const target = pythonTarget(repositoryRoot);
  const relative = "util/scancode-runtime/pyproject.toml";
  const path = resolve(repositoryRoot, relative);
  const source = readFileSync(path, "utf8");
  let updated = source;
  for (const [field, value] of [
    ["requires-python", `>=${target.version}`],
    ["required-version", `==${UV_SELECTION.version}`],
  ]) {
    let count = 0;
    updated = updated.replace(new RegExp(`^${field} = ".*"$`, "gmu"), () => {
      count++;
      return `${field} = "${value}"`;
    });
    if (count !== 1)
      throw new Error(`${relative}: expected exactly one generated ${field}`);
  }
  if (source !== updated) {
    if (!write)
      throw new Error(
        `${relative}: Python projection drift; run node scripts/sync-python-target.mjs --write`,
      );
    writeFileSync(path, updated);
  }
}
