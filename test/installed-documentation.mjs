import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { documentationExampleModules } from "./documentation/documentation-examples.mjs";

const root = new URL("./", import.meta.resolve("owlapi"));
const readme = readFileSync(new URL("README.md", root), "utf8");
const manifest = JSON.parse(
  readFileSync(new URL("package.json", root), "utf8"),
);
const dependencyName = "owlapi";
for (const key of Object.keys(manifest.exports)) {
  const specifier =
    key === "." ? dependencyName : `${dependencyName}/${key.slice(2)}`;
  assert.ok(Object.keys(await import(specifier)).length > 0, specifier);
}
for (const [id, source] of Object.entries(
  documentationExampleModules(readme, dependencyName),
)) {
  const file = new URL(`./readme-${id}.mjs`, import.meta.url);
  let created = false;
  try {
    writeFileSync(file, source, { flag: "wx" });
    created = true;
    await (await import(file.href)).exercise();
  } finally {
    if (created) unlinkSync(file);
  }
}
process.stdout.write("Retained README examples and manifest exports: PASS\n");
