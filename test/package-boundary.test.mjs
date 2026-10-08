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
    "RDFOntologyHeaderStatus",
    "RDFParserMetaData",
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
    "OWLOntologyWriterConfiguration",
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
    import("@hadden-industries/owlapi/apibinding"),
    import("@hadden-industries/owlapi/model"),
    import("@hadden-industries/owlapi/io"),
    import("@hadden-industries/owlapi/formats"),
    import("@hadden-industries/owlapi/util"),
    import("@hadden-industries/owlapi/profiles"),
  ]);

  assert.deepEqual(sortedKeys(apibinding), EXPECTED_EXPORTS.apibinding);
  assert.deepEqual(sortedKeys(formats), EXPECTED_EXPORTS.formats);
  assert.deepEqual(sortedKeys(io), EXPECTED_EXPORTS.io);
  assert.deepEqual(sortedKeys(model), EXPECTED_EXPORTS.model);
  assert.deepEqual(sortedKeys(util), EXPECTED_EXPORTS.util);
  assert.deepEqual(sortedKeys(profiles), EXPECTED_EXPORTS.profiles);
});

test("the bare aggregate preserves its owned bindings while writer configuration belongs to model", async () => {
  const [root, apibinding, model, io, formats, util, profiles] =
    await Promise.all([
      import("@hadden-industries/owlapi"),
      import("@hadden-industries/owlapi/apibinding"),
      import("@hadden-industries/owlapi/model"),
      import("@hadden-industries/owlapi/io"),
      import("@hadden-industries/owlapi/formats"),
      import("@hadden-industries/owlapi/util"),
      import("@hadden-industries/owlapi/profiles"),
    ]);
  const ownedModules = [apibinding, model, io, formats, util, profiles];
  const ownedBindings = Object.assign({}, ...ownedModules);
  delete ownedBindings.OWLOntologyWriterConfiguration;
  assert.equal(Object.hasOwn(root, "OWLOntologyWriterConfiguration"), false);

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
    "@hadden-industries/owlapi/index.js",
    "@hadden-industries/owlapi/package.json",
    "@hadden-industries/owlapi/rdf",
    "@hadden-industries/owlapi/model/index.js",
    "@hadden-industries/owlapi/model/addOntologyAnnotation.js",
    "@hadden-industries/owlapi/model/setOntologyID.js",
    "@hadden-industries/owlapi/model/structural.js",
    "@hadden-industries/owlapi/internal/parsing/parserRegistry.js",
    "@hadden-industries/owlapi/internal/storage/storerRegistry.js",
    "@hadden-industries/owlapi/io/stringDocumentTarget.js",
    "@hadden-industries/owlapi/io/errors.js",
    "@hadden-industries/owlapi/util/index.js",
    "@hadden-industries/owlapi/util/owlOntologyImportsClosureSetProvider.js",
    "@hadden-industries/owlapi/util/owlOntologyMerger.js",
    "@hadden-industries/owlapi/util/generate-java-api-surface.mjs",
  ]) {
    await assert.rejects(import(specifier), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("the parity target has no public writer or replacement helper", async () => {
  const [io, root] = await Promise.all([
    import("@hadden-industries/owlapi/io"),
    import("@hadden-industries/owlapi"),
  ]);
  assert.deepEqual(
    Object.getOwnPropertyNames(io.StringDocumentTarget.prototype),
    ["constructor", "toString"],
  );
  for (const namespace of [io, root]) {
    assert.equal(namespace.UnrepresentableOntologyError, undefined);
    assert.equal(namespace.replaceStringDocumentTargetText, undefined);
  }
});
