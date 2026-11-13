/** Narrow static YAML scalar projections; check mode never rewrites a workflow. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseDocument, isScalar, visit } from "yaml";
import { CI_RUNTIME, projectRuntimeText } from "./runtime-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const { runnerWorkflows, workflows, ...otherProjections } = JSON.parse(
  readFileSync(
    new URL("../docs/release/runtime-projections.json", import.meta.url),
    "utf8",
  ),
);
for (const [file, selectors] of Object.entries(runnerWorkflows)) {
  if (!Object.hasOwn(workflows, file))
    throw new Error(`Unknown runner projection workflow: ${file}`);
  for (const [pointer, template] of Object.entries(selectors)) {
    if (!/^\/jobs(?:\/[a-zA-Z0-9_-]+)+$/u.test(pointer))
      throw new Error(`Invalid runner projection pointer: ${pointer}`);
    workflows[file].push({
      path: pointer
        .slice(1)
        .split("/")
        .map((segment) => (/^\d+$/u.test(segment) ? Number(segment) : segment)),
      template,
    });
  }
}
export const RUNTIME_PROJECTIONS = { ...otherProjections, workflows };

const runnerSelectors = [
  {
    family: "Ubuntu",
    label: /\bubuntu-(?:latest|slim|\d+\.\d+)(?:-[\w-]+)?(?![\w-])/u,
    token: "{{runtime:ubuntuRunner}}",
  },
  {
    family: "Windows",
    label: /\bwindows-(?:latest|\d+)(?:-[\w-]+)?(?![\w-])/u,
    token: "{{runtime:windowsRunner}}",
  },
];

/** Project only enumerated runner selectors, job names, setup fields and step commands. */
export function projectWorkflowRuntime(
  source,
  projections,
  { write = false, policy = CI_RUNTIME } = {},
) {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error("Runtime projection requires valid YAML");
  const drift = [];
  const edits = [];
  const managed = new Map();
  for (const { path, template } of projections) {
    const permitted =
      path[0] === "jobs" &&
      ((path.length === 3 && ["name", "runs-on"].includes(path[2])) ||
        (path[2] === "steps" &&
          Number.isInteger(path[3]) &&
          (["name", "run"].includes(path[4]) ||
            (path[4] === "with" &&
              ["node-version", "node"].includes(path[5])))) ||
        (path[2] === "strategy" && path[3] === "matrix"));
    if (!permitted)
      throw new Error(`Unapproved runtime projection path: ${path.join(".")}`);
    const node = document.getIn(path, true);
    const expected = projectRuntimeText(template, policy);
    if (!isScalar(node) || typeof node.value !== "string")
      throw new Error(`Missing runtime projection: ${path.join(".")}`);
    if (managed.has(node))
      throw new Error(`Duplicate runtime projection: ${path.join(".")}`);
    managed.set(node, template);
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
  visit(document, {
    Scalar(_key, node) {
      if (typeof node.value !== "string") return;
      for (const { family, label, token } of runnerSelectors) {
        if (label.test(node.value) && !managed.get(node)?.includes(token))
          throw new Error(`Unmanaged ${family} selector: ${node.value}`);
      }
    },
  });
  if (write)
    for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
      source = source.slice(0, start) + replacement + source.slice(end);
  return { source, drift };
}

export function checkWorkflowRuntimeProjections(overrides = {}) {
  return Object.entries(RUNTIME_PROJECTIONS.workflows).flatMap(
    ([file, projections]) => {
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
    },
  );
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
    for (const [file, projections] of Object.entries(
      RUNTIME_PROJECTIONS.workflows,
    )) {
      const target = resolve(root, ".github/workflows", file);
      const result = projectWorkflowRuntime(
        readFileSync(target, "utf8"),
        projections,
        { write: true },
      );
      if (result.drift.length) writeFileSync(target, result.source);
    }
  const violations = checkWorkflowRuntimeProjections();
  process.stdout.write(
    `${JSON.stringify({ mode: write ? "write" : "check", violations })}\n`,
  );
  if (violations.length) process.exitCode = 1;
}
