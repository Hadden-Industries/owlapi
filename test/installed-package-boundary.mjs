import assert from "node:assert/strict";

const [root, apibinding, model, io, formats] = await Promise.all([
  import("owlapi"),
  import("owlapi/apibinding"),
  import("owlapi/model"),
  import("owlapi/io"),
  import("owlapi/formats"),
]);

for (const namespace of [apibinding, model, io, formats]) {
  for (const [name, binding] of Object.entries(namespace)) {
    assert.strictEqual(
      root[name],
      binding,
      `${name} must have one public identity`,
    );
  }
}

for (const specifier of [
  "owlapi/index.js",
  "owlapi/package.json",
  "owlapi/rdf",
  "owlapi/model/index.js",
  "owlapi/model/structural.js",
  "owlapi/internal/parsing/parserRegistry.js",
]) {
  await assert.rejects(import(specifier), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
}

process.stdout.write("Installed owlapi export boundary passed\n");
