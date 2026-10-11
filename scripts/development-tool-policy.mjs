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

/** Check only the enumerated native uv requirement; uv itself validates locks. */
export function checkUvProjections(repositoryRoot = root) {
  for (const relative of [
    "pyproject.toml",
    "util/scancode-runtime/pyproject.toml",
  ]) {
    const source = readFileSync(resolve(repositoryRoot, relative), "utf8");
    const expected = `required-version = "==${UV_SELECTION.version}"`;
    if (!source.split(/\r?\n/u).some((line) => line.trim() === expected))
      throw new Error(`${relative}: exact uv projection drift`);
  }
}

/** One maintained Python pin drives native package, Ruff and scanner metadata. */
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
  return { version, minor: `${major}.${minor}`, ruff: `py${major}${minor}` };
}

export function syncPythonProjections(
  repositoryRoot = root,
  { write = false } = {},
) {
  const target = pythonTarget(repositoryRoot);
  for (const [relative, field, value] of [
    ["pyproject.toml", "requires-python", `>=${target.version}`],
    [
      "util/scancode-runtime/pyproject.toml",
      "requires-python",
      `>=${target.version}`,
    ],
    ["ruff.toml", "target-version", target.ruff],
  ]) {
    const path = resolve(repositoryRoot, relative);
    const source = readFileSync(path, "utf8");
    let count = 0;
    const updated = source.replace(
      new RegExp(`^${field} = ".*"$`, "gmu"),
      () => {
        count++;
        return `${field} = "${value}"`;
      },
    );
    if (count !== 1)
      throw new Error(`${relative}: expected exactly one generated ${field}`);
    if (source !== updated) {
      if (!write)
        throw new Error(
          `${relative}: Python projection drift; run node scripts/sync-python-target.mjs --write`,
        );
      writeFileSync(path, updated);
    }
  }
}
