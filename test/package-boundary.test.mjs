import assert from "node:assert/strict";
import { test } from "node:test";

const EXPECTED_EXPORTS = Object.freeze({
  apibinding: ["OWLManager"],
  formats: ["OWLDocumentFormats"],
  io: [
    "AmbiguousRdfDatasetError",
    "DocumentLoadError",
    "GraphSelectionError",
    "MissingImportError",
    "OWLAPIError",
    "OWLOntologyCreationError",
    "OWLOntologyStateError",
    "OWLOntologyStorageError",
    "OWLParserError",
    "OWLStorerNotFoundError",
    "OWLSyntaxError",
    "ParserMismatchError",
    "ResourceLimitError",
    "SecurityPolicyError",
    "StringDocumentSource",
    "StringDocumentTarget",
    "UnloadableImportError",
    "UnparsableOntologyException",
    "UnsupportedConstructError",
    "XmlParseError",
  ],
  model: [
    "ANNOTATION_VALUE_KINDS",
    "AXIOM_KINDS",
    "AddOntologyAnnotation",
    "CLASS_EXPRESSION_KINDS",
    "DATA_PROPERTY_EXPRESSION_KINDS",
    "DATA_RANGE_KINDS",
    "ENTITY_KINDS",
    "INDIVIDUAL_KINDS",
    "IRI",
    "OBJECT_PROPERTY_EXPRESSION_KINDS",
    "OWLDataFactory",
    "OWLDocumentFormat",
    "OWLObjectKind",
    "OWLOntology",
    "OWLOntologyLoaderConfiguration",
    "OWLOntologyManager",
    "OWLStructuralObject",
    "OWL_OBJECT_KINDS",
    "SetOntologyID",
    "StructuralSet",
    "dispatchAnnotationValue",
    "dispatchAxiom",
    "dispatchClassExpression",
    "dispatchDataPropertyExpression",
    "dispatchDataRange",
    "dispatchIndividual",
    "dispatchObjectPropertyExpression",
    "dispatchOwlObject",
  ],
  util: ["OWLOntologyImportsClosureSetProvider", "OWLOntologyMerger"],
  profiles: ["OWL2DLProfile", "OWLProfileReport"],
});

const sortedKeys = (moduleNamespace) => Object.keys(moduleNamespace).sort();

test("each approved Java-backed namespace exposes exactly its owned bindings", async () => {
  const [apibinding, model, io, formats, util, profiles] = await Promise.all([
    import("owlapi/apibinding"),
    import("owlapi/model"),
    import("owlapi/io"),
    import("owlapi/formats"),
    import("owlapi/util"),
    import("owlapi/profiles"),
  ]);

  assert.deepEqual(sortedKeys(apibinding), EXPECTED_EXPORTS.apibinding);
  assert.deepEqual(sortedKeys(formats), EXPECTED_EXPORTS.formats);
  assert.deepEqual(sortedKeys(io), EXPECTED_EXPORTS.io);
  assert.deepEqual(sortedKeys(model), EXPECTED_EXPORTS.model);
  assert.deepEqual(sortedKeys(util), EXPECTED_EXPORTS.util);
  assert.deepEqual(sortedKeys(profiles), EXPECTED_EXPORTS.profiles);
});

test("the bare aggregate re-exports every public binding with identical identity", async () => {
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
  const ownedModules = [apibinding, model, io, formats, util, profiles];
  const ownedBindings = Object.assign({}, ...ownedModules);

  assert.deepEqual(sortedKeys(root), Object.keys(ownedBindings).sort());
  for (const [name, binding] of Object.entries(ownedBindings)) {
    assert.strictEqual(
      root[name],
      binding,
      `${name} must have one public identity`,
    );
  }
});

test("the export map rejects legacy, metadata, extension, and deep paths", async () => {
  // Self-referencing package imports exercise the same export map that an
  // installed consumer receives, without creating a second test-only resolver.
  for (const specifier of [
    "owlapi/index.js",
    "owlapi/package.json",
    "owlapi/rdf",
    "owlapi/model/index.js",
    "owlapi/model/addOntologyAnnotation.js",
    "owlapi/model/setOntologyID.js",
    "owlapi/model/structural.js",
    "owlapi/internal/parsing/parserRegistry.js",
    "owlapi/internal/storage/storerRegistry.js",
    "owlapi/io/stringDocumentTarget.js",
    "owlapi/io/errors.js",
    "owlapi/util/index.js",
    "owlapi/util/owlOntologyImportsClosureSetProvider.js",
    "owlapi/util/owlOntologyMerger.js",
    "owlapi/util/generate-java-api-surface.mjs",
  ]) {
    await assert.rejects(import(specifier), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("the parity target has no public writer or replacement helper", async () => {
  const [io, root] = await Promise.all([import("owlapi/io"), import("owlapi")]);
  assert.deepEqual(
    Object.getOwnPropertyNames(io.StringDocumentTarget.prototype),
    ["constructor", "toString"],
  );
  for (const namespace of [io, root]) {
    assert.equal(namespace.UnrepresentableOntologyError, undefined);
    assert.equal(namespace.replaceStringDocumentTargetText, undefined);
  }
});
