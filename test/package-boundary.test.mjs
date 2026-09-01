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
    "OWLParserError",
    "OWLSyntaxError",
    "ParserMismatchError",
    "ResourceLimitError",
    "SecurityPolicyError",
    "StringDocumentSource",
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
});

const sortedKeys = (moduleNamespace) => Object.keys(moduleNamespace).sort();

test("each approved Java-backed namespace exposes exactly its owned bindings", async () => {
  const [apibinding, model, io, formats, util] = await Promise.all([
    import("owlapi/apibinding"),
    import("owlapi/model"),
    import("owlapi/io"),
    import("owlapi/formats"),
    import("owlapi/util"),
  ]);

  assert.deepEqual(sortedKeys(apibinding), EXPECTED_EXPORTS.apibinding);
  assert.deepEqual(sortedKeys(formats), EXPECTED_EXPORTS.formats);
  assert.deepEqual(sortedKeys(io), EXPECTED_EXPORTS.io);
  assert.deepEqual(sortedKeys(model), EXPECTED_EXPORTS.model);
  assert.deepEqual(sortedKeys(util), EXPECTED_EXPORTS.util);
});

test("the bare aggregate re-exports every public binding with identical identity", async () => {
  const [root, apibinding, model, io, formats, util] = await Promise.all([
    import("owlapi"),
    import("owlapi/apibinding"),
    import("owlapi/model"),
    import("owlapi/io"),
    import("owlapi/formats"),
    import("owlapi/util"),
  ]);
  const ownedModules = [apibinding, model, io, formats, util];
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
