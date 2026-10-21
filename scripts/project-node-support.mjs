import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import semver from "semver";
import {
  CI_RUNTIME,
  consumerNodeRange,
  projectRuntimeText,
  validateRuntimePolicy,
} from "./runtime-policy.mjs";
import {
  projectWorkflowRuntime,
  RUNTIME_PROJECTIONS,
} from "./workflow-runtime-policy.mjs";

const root = new URL("../", import.meta.url);
const startMarker = "<!-- runtime-policy:start -->";
const endMarker = "<!-- runtime-policy:end -->";

/** Project current declarations only; historical evidence and synthetic policies stay frozen.
 * Pattern: markdown-quality e55e1b7 and json-quality fd247f2, adapted to OwlAPI's existing policy.
 */
export function projectNodeSupport(files, policy = CI_RUNTIME) {
  validateRuntimePolicy(policy);
  return Object.fromEntries(
    Object.entries(files).map(([path, source]) => {
      if (path === ".node-version")
        return [path, `${policy.node[policy.canonicalNodeMajor]}\n`];
      const jsonProjections = RUNTIME_PROJECTIONS.json[path];
      if (jsonProjections) {
        const value = JSON.parse(source);
        for (const projection of jsonProjections) {
          let target = value;
          for (const key of projection.path.slice(0, -1)) {
            assert.ok(
              Object.hasOwn(target, key),
              `Missing projection: ${path}`,
            );
            target = target[key];
          }
          if (projection.requirementId) {
            assert.equal(
              target.requirementId,
              projection.requirementId,
              "Producer requirement order changed",
            );
          }
          const key = projection.path.at(-1);
          assert.equal(
            typeof target[key],
            "string",
            `Missing scalar projection: ${path}`,
          );
          target[key] = projectRuntimeText(projection.template, policy);
        }
        // Project declared version scalars while preserving all unrelated JSON data.
        return [path, `${JSON.stringify(value, null, 2)}\n`];
      }
      const document = RUNTIME_PROJECTIONS.documents[path];
      if (document) {
        assert.equal(
          source.split(startMarker).length,
          2,
          `Missing or duplicate runtime marker: ${path}`,
        );
        assert.equal(
          source.split(endMarker).length,
          2,
          `Missing or duplicate runtime marker: ${path}`,
        );
        const first = source.indexOf(startMarker),
          last = source.indexOf(endMarker);
        assert.ok(last > first, `Reversed runtime markers: ${path}`);
        const block = [
          startMarker,
          "",
          ...document.map((line) => projectRuntimeText(line, policy)),
          "",
          endMarker,
        ].join("\n");
        return [
          path,
          source.slice(0, first) +
            block +
            source.slice(last + endMarker.length),
        ];
      }
      const file = path.replace(/^\.github\/workflows\//u, "");
      assert.ok(
        path.startsWith(".github/workflows/") &&
          Object.hasOwn(RUNTIME_PROJECTIONS.workflows, file),
        `Unapproved runtime projection: ${path}`,
      );
      return [
        path,
        projectWorkflowRuntime(source, RUNTIME_PROJECTIONS.workflows[file], {
          write: true,
          policy,
        }).source,
      ];
    }),
  );
}

const readProjectionFiles = (workflowOverrides = {}) =>
  Object.fromEntries(
    [
      ".node-version",
      ...Object.keys(RUNTIME_PROJECTIONS.json),
      ...Object.keys(RUNTIME_PROJECTIONS.documents),
      ...Object.keys(RUNTIME_PROJECTIONS.workflows).map(
        (file) => `.github/workflows/${file}`,
      ),
    ].map((path) => [
      path,
      workflowOverrides[path.replace(/^\.github\/workflows\//u, "")] ??
        readFileSync(new URL(path, root), "utf8"),
    ]),
  );

export function checkNodeSupportProjections(workflowOverrides = {}) {
  try {
    const files = readProjectionFiles(workflowOverrides);
    const projected = projectNodeSupport(files);
    const drift = Object.keys(files)
      .filter((path) => files[path] !== projected[path])
      .map((path) => `${path}: runtime projection drift`);
    const lock = JSON.parse(
      readFileSync(new URL("package-lock.json", root), "utf8"),
    );
    if (lock.packages[""].engines.node !== consumerNodeRange()) {
      drift.push(
        "package-lock.json: consumer engine drift; refresh root metadata with native npm --package-lock-only --ignore-scripts",
      );
    }
    for (const [path, dependency] of Object.entries(lock.packages)) {
      if (!path || dependency.dev || !dependency.engines?.node) continue;
      for (const minimum of CI_RUNTIME.minimums) {
        if (!semver.satisfies(minimum, dependency.engines.node))
          drift.push(
            `${path}: declared engine rejects consumer minimum ${minimum}`,
          );
      }
    }
    return drift;
  } catch (error) {
    return [`Runtime projections: ${error.message}`];
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(process.argv.length, 3, "Use --check or --write");
  const mode = process.argv[2];
  assert.ok(["--check", "--write"].includes(mode));
  if (mode === "--write") {
    const files = readProjectionFiles();
    const projected = projectNodeSupport(files);
    for (const [path, source] of Object.entries(projected)) {
      if (source !== files[path]) writeFileSync(new URL(path, root), source);
    }
  }
  const drift = checkNodeSupportProjections();
  process.stdout.write(`${JSON.stringify({ mode, drift })}\n`);
  if (drift.length) process.exitCode = 1;
}
