/** Real installed public interfaces only; no consumer adapter or projection is loaded. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OWL_CONTRACT_ASSERTIONS } from "./public-model-cases.js";
import { exerciseWriterConfiguration } from "./writer-configuration.js";
import {
  exerciseFormatConfiguration,
  exercisePublicErrors,
} from "./acquisition-contracts.js";
import { createPublicModelProbes } from "./public-model-probes.js";
import { createPublicContract } from "../../import-closure/public-contract.js";
import { exerciseRC2PublicContract } from "../../import-closure/rc2-public-contract.js";

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

async function exerciseLocalDocumentLoading() {
  let importAttempts = 0;
  const load = async (source, configuration) => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load() {
          importAttempts++;
        },
      },
    });
    const graph = await manager.loadOntologyGraphFromOntologyDocument(
      source,
      configuration,
    );
    return { ...graph, format: manager.getOntologyFormat(graph.ontology) };
  };
  const importedIRI = "https://example.invalid/contract/import.owl";
  const xml = `<Ontology xmlns="http://www.w3.org/2002/07/owl#" ontologyIRI="urn:contract:local">
    <Import>${importedIRI}</Import>
    <Declaration><Class IRI="Relative"/></Declaration>
  </Ontology>`;
  const configuration = new model.OWLOntologyLoaderConfiguration({
    parsingMode: "preserve",
    missingImportHandling: "diagnostic",
    remoteImports: true,
  });

  await assert.rejects(
    load(new StringDocumentSource(xml), configuration),
    (error) =>
      error instanceof io.OWLSyntaxError &&
      error.code === "OWL_SYNTAX_ERROR" &&
      error.iri === "Relative" &&
      !Object.hasOwn(error, "baseIRI") &&
      !Object.hasOwn(error, "abbreviatedIRI"),
  );
  const rdfXml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#">
    <owl:Class rdf:about="Relative"/>
  </rdf:RDF>`;
  await assert.rejects(
    load(
      new StringDocumentSource(rdfXml, {
        format: OWLDocumentFormats.RDF_XML,
      }),
      configuration,
    ),
    (error) =>
      error instanceof io.OWLSyntaxError &&
      error.code === "OWL_SYNTAX_ERROR" &&
      error.syntax === undefined &&
      typeof error.parserMessage === "string",
  );

  const source = new StringDocumentSource(xml, {
    documentIRI: IRI.create("https://example.invalid/contract/local.owl"),
  });
  const diagnostic = await load(
    source,
    configuration.with({ remoteImports: false }),
  );
  assert.equal(diagnostic.format.key, "owlxml");
  assert.equal(diagnostic.format, diagnostic.documents[0].context.format);
  assert.equal(
    diagnostic.documents[0].context.documentIRI.value,
    "https://example.invalid/contract/local.owl",
  );
  assert.deepEqual(
    [...diagnostic.ontology.getClassesInSignature()].map(
      ({ iri }) => iri.value,
    ),
    ["https://example.invalid/contract/Relative"],
  );
  assert.deepEqual(
    diagnostic.documents[0].context.diagnostics.map(({ code, importIRI }) => [
      code,
      importIRI?.value,
    ]),
    [["MISSING_IMPORT", importedIRI]],
  );
  assert.equal(configuration.remoteImports, true);
  await assert.rejects(
    load(source, configuration.with({ maxImportCount: 0 })),
    {
      name: "ResourceLimitError",
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxImportCount",
      limit: 0,
      observed: 1,
    },
  );

  const expandedJsonLd = `[
    {"@id":"urn:contract:normalized","@type":["http://www.w3.org/2002/07/owl#Ontology"]},
    {"@id":"urn:contract:NormalizedClass","@type":["http://www.w3.org/2002/07/owl#Class"]}
  ]`;
  const normalized = new StringDocumentSource(expandedJsonLd, {
    format: OWLDocumentFormats.JSON_LD,
  });
  const byteLength = new TextEncoder().encode(expandedJsonLd).byteLength;
  const bounded = configuration.with({ maxInputBytes: byteLength - 1 });
  await assert.rejects(load(normalized, bounded), {
    name: "ResourceLimitError",
    code: "RESOURCE_LIMIT_EXCEEDED",
    resource: "maxInputBytes",
    limit: byteLength - 1,
    observed: byteLength,
  });
  const accepted = await load(
    normalized,
    bounded.with({ maxInputBytes: byteLength }),
  );
  assert.equal(bounded.maxInputBytes, byteLength - 1);
  assert.equal(accepted.documents[0].context.documentIRI, undefined);
  assert.deepEqual(
    [...accepted.ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ["urn:contract:NormalizedClass"],
  );
  assert.equal(importAttempts, 0);
}

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
  const cause = new Error("loader could not parse the acquired document");
  const unloadable = OWLManager.createOWLOntologyManager({
    documentLoader: {
      load() {
        throw cause;
      },
    },
  });
  await assert.rejects(
    unloadable.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(
        "Ontology(<urn:contract:unloadable> Import(<urn:contract:broken>))",
        { format: "functional" },
      ),
      { missingImportHandling: "throw" },
    ),
    (error) =>
      error instanceof io.UnloadableImportError &&
      error.code === "UNLOADABLE_IMPORT" &&
      error.cause === cause,
  );
  await exerciseLocalDocumentLoading();
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
  const transportCause = new TypeError("fetch could not produce a response");
  const transportFailure = new io.MissingImportError("unreadable import", {
    cause: transportCause,
  });
  assert.equal(transportFailure.cause, transportCause);
  assert.equal(transportFailure.status, undefined);
  const httpFailure = new io.MissingImportError("import returned HTTP 404", {
    status: 404,
  });
  assert.equal(httpFailure.status, 404);
  assert.equal(httpFailure.cause, undefined);
});
for (const { kind, value, fields } of probes)
  test(`public model fields: ${kind}`, () => {
    assert.equal(value.kind, kind);
    for (const [field, expected] of Object.entries(fields))
      assert.deepEqual(value[field], expected, `${kind}.${field}`);
    if (kind.endsWith("Axiom")) assert.deepEqual(value.annotations, []);
  });

test(OWL_CONTRACT_ASSERTIONS.at(-2), async () => {
  assert.equal(Object.hasOwn(owl, "OWLOntologyWriterConfiguration"), false);
  assert.deepEqual(
    await exerciseWriterConfiguration(binding, model, io, formats),
    {
      modelOnly: true,
      indentSize: 2,
      banners: false,
      defaultEquivalent: true,
      axiomCount: 2,
    },
  );
  assertNoNetworkOperations();
});

test(OWL_CONTRACT_ASSERTIONS.at(-1), async () => {
  await exerciseRC2PublicContract(owl);
});
