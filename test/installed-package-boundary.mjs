import assert from "node:assert/strict";

const [root, apibinding, model, io, formats, util] = await Promise.all([
  import("owlapi"),
  import("owlapi/apibinding"),
  import("owlapi/model"),
  import("owlapi/io"),
  import("owlapi/formats"),
  import("owlapi/util"),
]);

assert.deepEqual(Object.keys(util).sort(), [
  "OWLOntologyImportsClosureSetProvider",
  "OWLOntologyMerger",
]);

for (const namespace of [apibinding, model, io, formats, util]) {
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
  "owlapi/util/index.js",
  "owlapi/util/owlOntologyImportsClosureSetProvider.js",
  "owlapi/util/owlOntologyMerger.js",
  "owlapi/util/generate-java-api-surface.mjs",
]) {
  await assert.rejects(import(specifier), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
}

process.stdout.write("Installed owlapi export boundary passed\n");
