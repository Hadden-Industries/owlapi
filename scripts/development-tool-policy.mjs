/** Exact uv bootstrap identity; native projects retain checked static constraints. */
import { readFileSync } from "node:fs";
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
