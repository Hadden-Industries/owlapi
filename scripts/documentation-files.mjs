/** Authored Markdown selection adapted from universal-ontology at 58a306013d3701f59dfe34341e96fac5a011e3ed.
 * Copyright (c) 2026 Hadden Industries Ltd. MIT; see LICENSES/MIT-universal-ontology.txt.
 */
import { lstatSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import * as prettier from "prettier";

const excludedDirectories = new Set([
  ".git",
  "node_modules",
  ".venv",
  ".development-tools",
  ".release",
  "coverage",
  "playwright-report",
  "test-results",
]);

/** Select authored documents using native ignore semantics. Never traverse symlinks.
 * Omitted paths select the whole checkout; an explicit empty array selects nothing.
 */
export async function selectDocumentationFiles(root, paths) {
  root = resolve(root);
  const selected = [];
  const ignored = async (path) =>
    (
      await prettier.getFileInfo(path, {
        ignorePath: [join(root, ".gitignore"), join(root, ".prettierignore")],
        resolveConfig: false,
      })
    ).ignored;
  if (paths !== undefined) {
    for (const path of new Set(paths.map((name) => resolve(root, name)))) {
      const name = relative(root, path);
      if (isAbsolute(name) || name === ".." || name.startsWith(`..${sep}`)) {
        throw new Error(`Document path is outside the checkout: ${path}`);
      }
      let current = root;
      for (const part of name.split(sep)) {
        current = join(current, part);
        if (lstatSync(current).isSymbolicLink())
          throw new Error(`Document path follows a symlink: ${path}`);
      }
      if (!path.endsWith(".md") || !lstatSync(path).isFile())
        throw new Error(`Not a regular Markdown document: ${path}`);
      if (
        name.split(sep).some((part) => excludedDirectories.has(part)) ||
        (await ignored(path))
      )
        continue;
      selected.push(path);
    }
  } else {
    const visit = async (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (
            !excludedDirectories.has(entry.name) &&
            !(await ignored(`${path}${sep}`))
          )
            await visit(path);
        } else if (
          entry.isFile() &&
          path.endsWith(".md") &&
          !(await ignored(path))
        ) {
          selected.push(path);
        }
      }
    };
    await visit(root);
  }
  return selected.sort();
}
