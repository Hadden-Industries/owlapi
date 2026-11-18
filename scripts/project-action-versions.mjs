/** One catalog owns each external GitHub Action pin. GitHub requires literal
 * `uses:` values, so workflow and composite-action references are checked
 * projections of that catalog rather than separately maintained pins.
 * Pattern: oxygen-not-included tools/ci/action_versions.py, adapted to OwlAPI's
 * Node projections and workflow governance.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isScalar, parseDocument, visit } from "yaml";

const root = fileURLToPath(new URL("../", import.meta.url));
export const ACTION_CATALOG_PATH = "docs/release/action-versions.json";
const REPOSITORY = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const TAG = /^v\d+(?:\.\d+)*$/u;
const REFERENCE = /^([^/@\s]+\/[^/@\s]+)((?:\/[^@\s]+)?)@([^@\s]+)$/u;

export function validateActionCatalog(catalog) {
  const fail = (message) => {
    throw new Error(`${ACTION_CATALOG_PATH}: ${message}`);
  };
  if (
    catalog?.schemaVersion !== 1 ||
    Object.keys(catalog).sort().join() !== "actions,schemaVersion" ||
    typeof catalog.actions !== "object" ||
    catalog.actions === null ||
    Array.isArray(catalog.actions)
  )
    fail("expected schemaVersion 1 and an actions map");
  const names = Object.keys(catalog.actions);
  if (names.join() !== [...names].sort().join())
    fail("sort actions by repository");
  for (const [name, entry] of Object.entries(catalog.actions)) {
    if (!REPOSITORY.test(name)) fail(`invalid action repository ${name}`);
    if (
      Object.keys(entry ?? {})
        .sort()
        .join() !== "revision,tag"
    )
      fail(`${name} must declare exactly a tag and a revision`);
    if (!TAG.test(entry.tag)) fail(`${name} needs a release tag`);
    if (!REVISION.test(entry.revision))
      fail(`${name} needs a full lowercase commit revision`);
  }
  return catalog;
}

const catalog = validateActionCatalog(
  JSON.parse(readFileSync(resolve(root, ACTION_CATALOG_PATH), "utf8")),
);

export const ACTION_VERSIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(catalog.actions).map(([name, entry]) => [
      name,
      Object.freeze({ ...entry }),
    ]),
  ),
);

/** Approved immutable references mapped to their release-tag comments. */
export const ACTION_PINS = Object.freeze(
  Object.fromEntries(
    Object.entries(ACTION_VERSIONS).map(([name, { revision, tag }]) => [
      `${name}@${revision}`,
      tag,
    ]),
  ),
);

export function actionReference(name) {
  const entry = ACTION_VERSIONS[name];
  if (!entry) throw new Error(`${name} is not in ${ACTION_CATALOG_PATH}`);
  return `${name}@${entry.revision}`;
}

const remote = (value) =>
  typeof value === "string" &&
  !value.startsWith("./") &&
  !value.startsWith("docker://");

/** Check, and optionally rewrite, the external `uses:` values of one file. */
export function projectActionVersions(
  source,
  { file, write = false, actions = ACTION_VERSIONS } = {},
) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length)
    return {
      source,
      used: [],
      violations: [`${file}: action pins need valid YAML`],
    };
  const violations = [];
  const used = new Set();
  const edits = [];
  visit(document, {
    Pair(_key, pair) {
      if (
        !isScalar(pair.key) ||
        pair.key.value !== "uses" ||
        !isScalar(pair.value) ||
        !remote(pair.value.value)
      )
        return;
      const node = pair.value;
      const match = REFERENCE.exec(node.value);
      if (!match) {
        violations.push(`${file}: unrecognized action reference ${node.value}`);
        return;
      }
      const [, name, subpath, revision] = match;
      const entry = actions[name];
      if (!entry) {
        violations.push(`${file}: ${name} is not in ${ACTION_CATALOG_PATH}`);
        return;
      }
      used.add(name);
      if (revision === entry.revision && node.comment?.trim() === entry.tag)
        return;
      violations.push(
        `${file}: ${name} drifts from ${ACTION_CATALOG_PATH}; run node scripts/project-action-versions.mjs --write`,
      );
      const lineEnd = source.indexOf("\n", node.range[1]);
      const end = lineEnd < 0 ? source.length : lineEnd;
      // Rewrite only a block value followed by nothing but its tag comment.
      if (/^[ \t]*(?:#.*)?$/u.test(source.slice(node.range[1], end)))
        edits.push([
          node.range[0],
          end,
          `${name}${subpath}@${entry.revision} # ${entry.tag}`,
        ]);
      else violations.push(`${file}: cannot rewrite ${name} in place`);
    },
  });
  if (write)
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
      source = source.slice(0, start) + replacement + source.slice(end);
  return { source, used: [...used], violations };
}

/** Every workflow and repository composite action consumes catalog pins. */
export function actionConsumers(repositoryRoot = root) {
  const workflows = readdirSync(resolve(repositoryRoot, ".github/workflows"))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => ({
      path: `.github/workflows/${name}`,
      key: name,
      kind: "workflow",
    }));
  const actions = readdirSync(resolve(repositoryRoot, ".github/actions"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((name) =>
      ["action.yml", "action.yaml"]
        .filter((file) =>
          existsSync(resolve(repositoryRoot, ".github/actions", name, file)),
        )
        .map((file) => ({
          path: `.github/actions/${name}/${file}`,
          key: name,
          kind: "action",
        })),
    );
  return [...workflows, ...actions];
}

/** Reject drift, unregistered actions and catalog entries without consumers. */
export function checkActionProjections({
  workflowSourceOverrides = {},
  actionSourceOverrides = {},
} = {}) {
  const violations = [];
  const used = new Set();
  for (const { path, key, kind } of actionConsumers()) {
    const override = (
      kind === "workflow" ? workflowSourceOverrides : actionSourceOverrides
    )[key];
    const result = projectActionVersions(
      override ?? readFileSync(resolve(root, path), "utf8"),
      { file: path },
    );
    violations.push(...result.violations);
    for (const name of result.used) used.add(name);
  }
  for (const name of Object.keys(ACTION_VERSIONS))
    if (!used.has(name))
      violations.push(
        `${ACTION_CATALOG_PATH}: ${name} has no workflow or action consumer`,
      );
  return violations;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, ...rest] = process.argv.slice(2);
  if (rest.length || !["--check", "--write"].includes(mode))
    throw new Error("Use --check or --write");
  if (mode === "--write")
    for (const { path } of actionConsumers()) {
      const target = resolve(root, path);
      const source = readFileSync(target, "utf8");
      const result = projectActionVersions(source, { file: path, write: true });
      if (result.source !== source) writeFileSync(target, result.source);
    }
  const violations = checkActionProjections();
  process.stdout.write(
    `${JSON.stringify({ mode: mode.slice(2), violations })}\n`,
  );
  if (violations.length) process.exitCode = 1;
}
