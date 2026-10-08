import assert from "node:assert/strict";

const [root, apibinding, model, io, formats, util, profiles] =
  await Promise.all([
    import("owlapi"),
    import("owlapi/apibinding"),
    import("owlapi/model"),
    import("owlapi/io"),
    import("owlapi/formats"),
    import("owlapi/util"),
    import("owlapi/profiles"),
  ]);

assert.deepEqual(Object.keys(util).sort(), [
  "OWLOntologyImportsClosureSetProvider",
  "OWLOntologyMerger",
]);

assert.deepEqual(Object.keys(profiles).sort(), [
  "OWL2DLProfile",
  "OWLProfileReport",
]);
for (const namespace of [apibinding, model, io, formats, util, profiles]) {
  for (const [name, binding] of Object.entries(namespace)) {
    if (name === "OWLOntologyWriterConfiguration") {
      assert.equal(Object.hasOwn(root, name), false);
      continue;
    }
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
  "owlapi/io/stringDocumentTarget.js",
  "owlapi/io/errors.js",
  "owlapi/util/index.js",
  "owlapi/util/owlOntologyImportsClosureSetProvider.js",
  "owlapi/util/owlOntologyMerger.js",
  "owlapi/util/generate-java-api-surface.mjs",
  "owlapi/profiles/owl2DLProfile.js",
  "owlapi/internal/profiles/owl2dl.js",
  "owlapi/internal/model/sourceEvidence.js",
]) {
  await assert.rejects(import(specifier), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
}

assert.deepEqual(
  Object.getOwnPropertyNames(io.StringDocumentTarget.prototype),
  ["constructor", "toString"],
);
for (const namespace of [root, io, model]) {
  assert.equal(namespace.UnrepresentableOntologyError, undefined);
  assert.equal(namespace.replaceStringDocumentTargetText, undefined);
}
assert.equal(model.OWLOntologyStorageError, undefined);
assert.equal(model.OWLStorerNotFoundError, undefined);

const manager = root.OWLManager.createOWLOntologyManager();
const preserved = await manager.loadOntologyFromOntologyDocument(
  new io.StringDocumentSource(
    "Prefix(:=<urn:installed:>) Ontology(Declaration(Class(:A)) Declaration(ObjectProperty(:p)) SubClassOf(:A ObjectMinCardinality(9007199254740993 :p :A)))",
    { format: "functional" },
  ),
  { parsingMode: "preserve" },
);
const large = [...preserved.getAxioms()].find(
  ({ kind }) => kind === "OWLSubClassOfAxiom",
);
assert.equal(large.superClass.cardinality, "9007199254740993");
const profile = new profiles.OWL2DLProfile();
assert.equal(
  (await profile.checkOntology(preserved, { sourceAssessment: true }))
    .sourceAssessment.status,
  "valid",
);
const invalid = await manager.loadOntologyFromOntologyDocument(
  new io.StringDocumentSource(
    'Ontology(Annotation(rdfs:comment "bad"^^xsd:integer))',
    { format: "functional" },
  ),
  { parsingMode: "preserve" },
);
assert.equal((await profile.checkOntology(invalid)).status, "invalid");

process.stdout.write("Installed owlapi export boundary passed\n");
