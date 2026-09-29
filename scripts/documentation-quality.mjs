/** Authored Markdown quality, adapted from universal-ontology's formatter at
 * 58a306013d3701f59dfe34341e96fac5a011e3ed. Copyright (c) 2026 Hadden Industries Ltd.
 * MIT notice: LICENSES/MIT-universal-ontology.txt. File selection and tool execution
 * are independent of PR selection, so local commands use the same content policy.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ESLint } from "eslint";
import * as prettier from "prettier";
import { selectDocumentationFiles } from "./documentation-files.mjs";
import {
  checkPythonTools,
  repositoryRoot,
  runPythonTool,
} from "./repository-python-tools.mjs";

/** Interpret the native single-input report. A successful exit can still contain defects. */
export function snapperDiagnostics(result, text) {
  if (![0, 1].includes(result.status))
    throw new Error(`Snapper check failed: ${result.stderr.slice(0, 4000)}`);
  let reports;
  try {
    reports = JSON.parse(result.stdout);
  } catch {
    throw new Error("Invalid Snapper JSON diagnostics.");
  }
  // Snapper emits [] for a clean document, not a report with empty diagnostics.
  if (Array.isArray(reports) && reports.length === 0 && result.status === 0)
    return [];
  if (
    !Array.isArray(reports) ||
    reports.length !== 1 ||
    !reports[0] ||
    !Array.isArray(reports[0].diagnostics) ||
    typeof reports[0].would_reformat !== "boolean"
  ) {
    throw new Error("Invalid Snapper single-document report.");
  }
  const lines = text.split("\n");
  for (const diagnostic of reports[0].diagnostics) {
    if (
      !diagnostic ||
      !["fused", "wrap", "long"].includes(diagnostic.kind) ||
      !Number.isSafeInteger(diagnostic.line) ||
      diagnostic.line < 1 ||
      diagnostic.line > lines.length ||
      typeof diagnostic.excerpt !== "string"
    )
      throw new Error("Invalid or unknown Snapper diagnostic.");
  }
  // Width checking is deliberately disabled by max_width = 0; sentence checks remain mandatory.
  return reports[0].diagnostics.filter(({ kind }) => kind !== "long");
}

const snapperArguments = (root, path) => [
  "--native",
  "--config",
  join(root, ".snapperrc.toml"),
  "--stdin-filepath",
  path,
];

// Recognize only the two reproduced list shapes. This is deliberately not a
// Markdown parser: ambiguous containers retain the native finding.
const listItem = (line = "") => {
  let offset = 0;
  let quotes = 0;
  while (true) {
    const quote = /^[ ]{0,3}> ?/u.exec(line.slice(offset));
    if (!quote) break;
    offset += quote[0].length;
    quotes += 1;
  }
  const match = /^( {0,3})(\d{1,9}[.)]|[-+*]) +(\S.*)$/u.exec(
    line.slice(offset),
  );
  if (!match) return undefined;
  return {
    prefix: line.slice(0, offset),
    quotes,
    indent: match[1].length,
    ordered: /^\d/u.test(match[2]),
    contentOffset: line.length - match[3].length,
    prose: match[3],
  };
};

/** Check sentence diagnostics independently of formatting and exit status. */
export function checkDocumentProse(text, path, { root = repositoryRoot } = {}) {
  const args = [
    ...snapperArguments(root, path),
    "--check",
    "--output-format",
    "json",
  ];
  const check = (input) =>
    snapperDiagnostics(runPythonTool("snapper-fmt", args, { input }), input);
  const lines = text.split("\n");
  return check(text).filter((diagnostic) => {
    const index = diagnostic.line - 1;
    const item = listItem(lines[index]);
    if (!item) return true;
    const previous = listItem(lines[index - 1]);
    const quotedNumber =
      diagnostic.kind === "fused" && item.quotes > 0 && item.ordered;
    const adjacentList =
      diagnostic.kind === "wrap" &&
      previous &&
      previous.prefix === item.prefix &&
      previous.indent === item.indent &&
      previous.ordered === item.ordered;
    if (!quotedNumber && !adjacentList) return true;
    // Owner-approved 2026-09-30 for Snapper 0.11.7; requalify on every update.
    // Recheck the item including indented continuation prose. Never suppress a
    // genuine fused sentence or an unknown diagnostic in the unquoted content.
    const prose = [item.prose];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (!line.startsWith(item.prefix) || listItem(line)) break;
      const content = line.slice(item.prefix.length);
      const indentation = item.contentOffset - item.prefix.length;
      if (!content.startsWith(" ".repeat(indentation))) break;
      prose.push(content.slice(indentation));
    }
    return check(`${prose.join("\n")}\n`).length !== 0;
  });
}

/** Compose layout and prose formatters; validate proposed output before writing it. */
export async function formatDocument(
  text,
  path,
  { root = repositoryRoot } = {},
) {
  const options = {
    ...(await prettier.resolveConfig(path, {
      editorconfig: true,
      useCache: false,
    })),
    filepath: path,
  };
  const layout = await prettier.format(text, options);
  const args = snapperArguments(root, path);
  const formatted = runPythonTool("snapper-fmt", args, { input: layout });
  if (formatted.status !== 0)
    throw new Error(
      `Snapper formatting failed: ${formatted.stderr.slice(0, 4000)}`,
    );
  const output = await prettier.format(formatted.stdout, options);
  return { output, diagnostics: checkDocumentProse(output, path, { root }) };
}

/** Check, write, or lint exactly the selected authored files. A zero selection never reads stdin. */
export async function processDocumentation({
  root = repositoryRoot,
  mode = "check",
  paths,
  report = (message) => process.stdout.write(`${message}\n`),
} = {}) {
  if (!["check", "write", "lint"].includes(mode))
    throw new Error(`Unknown documentation mode: ${mode}`);
  const files = await selectDocumentationFiles(root, paths);
  if (mode === "lint") {
    const eslint = new ESLint({
      cwd: resolve(root),
      overrideConfigFile: join(repositoryRoot, "eslint.config.js"),
    });
    // ESLint interprets [] as its default input set; protect explicit empty selections.
    const results = files.length ? await eslint.lintFiles(files) : [];
    const output = (await eslint.loadFormatter("stylish")).format(results);
    if (output) report(output);
    report(`Linted ${files.length} authored Markdown documents.`);
    return results.some((result) => result.errorCount || result.warningCount)
      ? 1
      : 0;
  }
  if (files.length) checkPythonTools();
  let failed = false;
  let written = 0;
  let processed = 0;
  for (const path of files) {
    try {
      const original = readFileSync(path, "utf8");
      const { output, diagnostics } = await formatDocument(original, path, {
        root,
      });
      processed += 1;
      if (diagnostics.length) {
        diagnostics
          .slice(0, 20)
          .forEach(({ line, kind, excerpt }) =>
            report(`${path}:${line}: ${kind}: ${excerpt.slice(0, 240)}`),
          );
        if (diagnostics.length > 20)
          report(
            `${path}: ${diagnostics.length - 20} additional prose findings; showing the first 20.`,
          );
        failed = true;
      } else if (mode === "write" && output !== original) {
        writeFileSync(path, output);
        written += 1;
      }
      if (mode === "check" && output !== original) {
        report(`Would reformat: ${path}`);
        failed = true;
      }
    } catch (error) {
      report(`${path}: ${error.message}`);
      failed = true;
      break;
    }
  }
  report(
    `${mode === "write" ? `Wrote ${written}; processed ${processed} of` : `Checked ${processed} of`} ${files.length} authored Markdown documents${failed ? "; failures remain" : ""}.`,
  );
  return failed ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        check: { type: "boolean" },
        write: { type: "boolean" },
        lint: { type: "boolean" },
      },
    });
    const modes = Object.keys(values).filter((key) => values[key]);
    if (modes.length !== 1)
      throw new Error("Choose exactly one of --check, --write, or --lint.");
    process.exitCode = await processDocumentation({
      mode: modes[0],
      paths: positionals.length ? positionals : undefined,
    });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
