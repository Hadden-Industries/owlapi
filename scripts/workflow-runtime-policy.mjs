/** Narrow static YAML scalar projections; check mode never rewrites a workflow. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseDocument, isScalar } from "yaml";
import { projectRuntimeText } from "./runtime-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const inventory = JSON.parse(
  readFileSync(
    new URL("../docs/release/runtime-projections.json", import.meta.url),
    "utf8",
  ),
);

/** Project only enumerated job names, setup fields and step commands/names. */
export function projectWorkflowRuntime(
  source,
  projections,
  { write = false } = {},
) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error("Runtime projection requires valid YAML");
  const drift = [];
  const edits = [];
  for (const { path, template } of projections) {
    const permitted =
      path[0] === "jobs" &&
      ((path.length === 3 && path[2] === "name") ||
        (path[2] === "steps" &&
          Number.isInteger(path[3]) &&
          (["name", "run"].includes(path[4]) ||
            (path[4] === "with" && path[5] === "node-version"))) ||
        (path[2] === "strategy" && path[3] === "matrix"));
    if (!permitted)
      throw new Error(`Unapproved runtime projection path: ${path.join(".")}`);
    const node = document.getIn(path, true);
    const expected = projectRuntimeText(template);
    if (!isScalar(node) || typeof node.value !== "string")
      throw new Error(`Missing runtime projection: ${path.join(".")}`);
    if (node.value === expected) continue;
    drift.push(path.join("."));
    // Native YAML owns scalar escaping. Multiline commands retain their block header.
    const replacement = document.createNode(expected);
    replacement.type = node.type;
    const wrapper = parseDocument("value: placeholder\n");
    wrapper.set("value", replacement);
    const prefix = source.slice(
      source.lastIndexOf("\n", node.range[0]) + 1,
      node.range[0],
    );
    const indent = " ".repeat(
      prefix.search(/\S/u) + (prefix.trimStart().startsWith("- ") ? 2 : 0),
    );
    const scalar = wrapper.toString({ lineWidth: 0 }).slice("value: ".length);
    const block = ["BLOCK_LITERAL", "BLOCK_FOLDED"].includes(node.type);
    const rendered = (block ? scalar : scalar.trimEnd()).replace(
      /\n(?=.)/gu,
      `\n${indent}`,
    );
    edits.push([node.range[0], node.range[1], rendered]);
  }
  if (write)
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
      source = source.slice(0, start) + replacement + source.slice(end);
  return { source, drift };
}

export function checkWorkflowRuntimeProjections(overrides = {}) {
  return Object.entries(inventory.workflows).flatMap(([file, projections]) => {
    try {
      const source =
        overrides[file] ??
        readFileSync(resolve(root, ".github/workflows", file), "utf8");
      return projectWorkflowRuntime(source, projections).drift.map(
        (path) => `${file}: runtime projection drift at ${path}`,
      );
    } catch (error) {
      return [`${file}: ${error.message}`];
    }
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const write = process.argv.slice(2).includes("--write");
  if (
    process.argv.slice(2).some((arg) => arg !== "--write" && arg !== "--check")
  )
    throw new Error("Use --check or --write");
  if (write)
    for (const [file, projections] of Object.entries(inventory.workflows)) {
      const target = resolve(root, ".github/workflows", file);
      const result = projectWorkflowRuntime(
        readFileSync(target, "utf8"),
        projections,
        { write: true },
      );
      if (result.drift.length) writeFileSync(target, result.source);
    }
  const violations = checkWorkflowRuntimeProjections();
  console.log(JSON.stringify({ mode: write ? "write" : "check", violations }));
  if (violations.length) process.exitCode = 1;
}
