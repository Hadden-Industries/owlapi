/** Real installed public interfaces only; no consumer adapter or projection is loaded. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OWL_CONTRACT_ASSERTIONS } from "./public-model-cases.js";
import {
  exerciseFormatConfiguration,
  exercisePublicErrors,
} from "./acquisition-contracts.js";
import { createPublicModelProbes } from "./public-model-probes.js";
import { createPublicContract } from "../../import-closure/public-contract.js";

// Guards run before package loading and remain installed throughout the semantic suite.
const { assertNoNetworkOperations } =
  await import("../../installed-package-no-network.mjs");
const owl = await import("owlapi");
const model = await import("owlapi/model");
const io = await import("owlapi/io");
const formats = await import("owlapi/formats");
const profiles = await import("owlapi/profiles");
const util = await import("owlapi/util");
const binding = await import("owlapi/apibinding");
const { OWLManager, IRI, StringDocumentSource, OWLDocumentFormats } = owl;
const publicContract = createPublicContract(owl);
const { values, probes } = createPublicModelProbes(owl);

test(OWL_CONTRACT_ASSERTIONS[0], () => {
  const installedRoot = realpathSync("node_modules/owlapi");
  for (const suffix of [
    "",
    "/model",
    "/io",
    "/formats",
    "/profiles",
    "/util",
    "/apibinding",
  ]) {
    const resolved = realpathSync(
      fileURLToPath(import.meta.resolve(`owlapi${suffix}`)),
    );
    assert.ok(
      resolved.startsWith(`${installedRoot}/`) ||
        resolved.startsWith(`${installedRoot}\\`),
    );
  }
  assert.equal(binding.OWLManager, OWLManager);
  assert.equal(model.IRI, IRI);
  for (const name of [
    "StringDocumentSource",
    "StringDocumentTarget",
    "MissingImportError",
    "UnloadableImportError",
    "ResourceLimitError",
    "SecurityPolicyError",
  ])
    assert.equal(typeof io[name], "function");
  assert.equal(formats.OWLDocumentFormats.FUNCTIONAL.key, "functional");
  assert.equal(formats.OWLDocumentFormats.RDF_XML.key, "rdfxml");
  assert.equal(typeof profiles.OWL2DLProfile, "function");
  assert.equal(typeof util.OWLOntologyImportsClosureSetProvider, "function");
  assert.equal(typeof util.OWLOntologyMerger, "function");
});
test(OWL_CONTRACT_ASSERTIONS[1], () => {
  assert.equal(values.literal.kind, "OWLLiteral");
  assert.equal(values.literal.lexicalForm, "0001");
  assert.equal(
    values.literal.datatype.iri.value,
    "http://www.w3.org/2001/XMLSchema#integer",
  );
  assert.equal(values.otherLiteral.language, "en");
  const annotation = OWLManager.createOWLOntologyManager()
    .getOWLDataFactory()
    .getOWLAnnotation(values.annotationP, values.literal);
  assert.equal(annotation.property.iri.value, "urn:contract:label");
  assert.equal(annotation.value, values.literal);
  assert.deepEqual(annotation.annotations, []);
  assert.equal(values.classA.kind, "OWLClass");
  assert.equal(values.classA.iri.value, "urn:contract:A");
  assert.equal(IRI.create("urn:contract:A").equals(values.iriA), true);
  assert.equal(typeof values.classA.structuralKey(), "string");
});
test(OWL_CONTRACT_ASSERTIONS[2], async () => {
  const contexts = [];
  const manager = OWLManager.createOWLOntologyManager({
    documentLoader: {
      load(iri, context) {
        contexts.push({ iri, context });
        return new StringDocumentSource(
          "Ontology(<urn:contract:child> Declaration(Class(<urn:contract:B>)))",
          { documentIRI: iri, format: "functional" },
        );
      },
    },
  });
  const graph = await manager.loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(
      "Ontology(<urn:contract:root> Import(<urn:contract:child>) Declaration(Class(<urn:contract:A>)))",
      { documentIRI: "urn:contract:document", format: "functional" },
    ),
    new model.OWLOntologyLoaderConfiguration({
      parsingMode: "strict",
      collectWarnings: true,
    }),
  );
  assert.equal(
    graph.ontology.getOntologyID().ontologyIRI.value,
    "urn:contract:root",
  );
  assert.equal(graph.documents.length, 2);
  assert.equal(graph.importsClosure.length, 2);
  assert.equal(graph.ontology.getAxioms().size, 1);
  assert.equal(graph.ontology.getImportsDeclarations().size, 1);
  assert.equal(contexts[0].iri.value, "urn:contract:child");
  assert.equal(contexts[0].context.importIRI.value, "urn:contract:child");
  assert.equal(Object.isFrozen(contexts[0].context), true);
  for (const document of graph.documents) {
    assert.equal(document.context.format.key, "functional");
    assert.ok(Array.isArray(document.context.diagnostics));
    assert.ok(document.context.documentIRI.value);
  }
  const missing = OWLManager.createOWLOntologyManager({
    documentLoader: {
      load() {
        throw new io.MissingImportError("missing");
      },
    },
  });
  await assert.rejects(
    missing.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(
        "Ontology(<urn:contract:missing> Import(<urn:contract:absent>))",
        { format: "functional" },
      ),
      { missingImportHandling: "throw" },
    ),
    io.MissingImportError,
  );
  assertNoNetworkOperations();
});
test(OWL_CONTRACT_ASSERTIONS[3], async () => {
  const manager = OWLManager.createOWLOntologyManager();
  const graph = await manager.loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(
      "@prefix owl: <http://www.w3.org/2002/07/owl#> . <urn:contract:rdf> a owl:Ontology . <urn:contract:A> a owl:Class .",
      { format: OWLDocumentFormats.TURTLE },
    ),
    { parsingMode: "preserve", collectWarnings: true },
  );
  const context = graph.documents[0].context;
  const metadata = context.format.getOntologyLoaderMetaData();
  assert.equal(context.format.isRdf, true);
  assert.equal(metadata.getTripleCount(), 2);
  assert.ok(metadata.getHeaderState());
  assert.deepEqual(metadata.getUnparsedTriples(), []);
  assert.ok(Array.isArray(metadata.getGuessedDeclarations()));
  assert.ok(context.sourceStructure);
  assert.ok(Array.isArray(context.diagnostics));
  assert.equal(
    [...graph.ontology.getAxioms()][0].entity.iri.value,
    "urn:contract:A",
  );
  assertNoNetworkOperations();
});
test(OWL_CONTRACT_ASSERTIONS[4], async () => {
  await publicContract.exerciseParserPreservation();
  assertNoNetworkOperations();
});
test(OWL_CONTRACT_ASSERTIONS[5], async () => {
  const documents = Object.fromEntries(
    ["root", "left", "right", "leaf"].map((name) => [
      name,
      readFileSync(
        new URL(
          `../../import-closure/fixtures/closure/${name}.ofn`,
          import.meta.url,
        ),
        "utf8",
      ),
    ]),
  );
  const { summary } =
    await publicContract.exerciseImportClosureStorage(documents);
  assert.equal(summary.closureCount, 4);
  assert.equal(summary.directAxiomCount, 26);
  assert.equal(summary.retainedTargetAfterFailure, true);
  assertNoNetworkOperations();
});
test(OWL_CONTRACT_ASSERTIONS[6], () => {
  assert.equal(exerciseFormatConfiguration(owl), 12);
});
test(OWL_CONTRACT_ASSERTIONS[7], () => {
  assert.equal(exercisePublicErrors(owl), 4);
});
for (const { kind, value, fields } of probes)
  test(`public model fields: ${kind}`, () => {
    assert.equal(value.kind, kind);
    for (const [field, expected] of Object.entries(fields))
      assert.deepEqual(value[field], expected, `${kind}.${field}`);
    if (kind.endsWith("Axiom")) assert.deepEqual(value.annotations, []);
  });
