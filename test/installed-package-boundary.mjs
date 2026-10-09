import assert from "node:assert/strict";
import { exerciseRC2PublicContract } from "./import-closure/rc2-public-contract.js";

const [
  root,
  apibinding,
  model,
  io,
  formats,
  util,
  profiles,
  parameters,
  search,
  renderer,
  locality,
] = await Promise.all([
  import("owlapi"),
  import("owlapi/apibinding"),
  import("owlapi/model"),
  import("owlapi/io"),
  import("owlapi/formats"),
  import("owlapi/util"),
  import("owlapi/profiles"),
  import("owlapi/model/parameters"),
  import("owlapi/search"),
  import("owlapi/manchestersyntax/renderer"),
  import("owlapi/modularity/locality"),
]);

assert.deepEqual(Object.keys(util).sort(), [
  "AnnotationValueShortFormProvider",
  "OWLEntityRemover",
  "OWLEntityRenamer",
  "OWLObjectDuplicator",
  "OWLOntologyImportsClosureSetProvider",
  "OWLOntologyMerger",
  "SimpleShortFormProvider",
]);

assert.deepEqual(Object.keys(profiles).sort(), [
  "OWL2DLProfile",
  "OWL2ELProfile",
  "OWL2QLProfile",
  "OWL2RLProfile",
  "OWLProfileReport",
]);
assert.deepEqual(Object.keys(formats).sort(), [
  "OWLDocumentFormats",
  "RDFXMLDocumentFormat",
]);
for (const namespace of [
  apibinding,
  model,
  io,
  formats,
  util,
  profiles,
  parameters,
  search,
  renderer,
  locality,
]) {
  for (const [name, binding] of Object.entries(namespace)) {
    if (
      name === "OWLOntologyWriterConfiguration" ||
      name === "RDFXMLDocumentFormat"
    ) {
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

await exerciseRC2PublicContract(root);
process.stdout.write(
  "Installed owlapi export boundary and rc.2 contract passed\n",
);
