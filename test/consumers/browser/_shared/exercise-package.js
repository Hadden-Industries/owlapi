import * as root from "owlapi";
import * as apibinding from "owlapi/apibinding";
import * as formats from "owlapi/formats";
import * as io from "owlapi/io";
import * as model from "owlapi/model";
import * as profiles from "owlapi/profiles";
import * as util from "owlapi/util";
import { createPublicContract } from "./public-contract.js";
import { exerciseWriterConfiguration } from "./writer-configuration.js";
import { exercisePublicModelFields } from "./public-model-probes.js";
import {
  exerciseFormatConfiguration,
  exercisePublicErrors,
} from "./acquisition-contracts.js";
const { exerciseImportClosureStorage, exerciseParserPreservation } =
  createPublicContract(root);
import closureDocuments from "./import-closure-documents.js";

const DOCUMENTS = Object.freeze([
  Object.freeze({
    key: "functional",
    contentType: "text/owl-functional",
    documentIRI: "https://example.com/browser/functional.ofn",
    text: `Prefix(:=<https://example.com/browser/functional#>)
Ontology(<https://example.com/browser/functional>
  Declaration(Class(:Entity))
)`,
  }),
  Object.freeze({
    key: "rdfxml",
    contentType: "application/rdf+xml",
    documentIRI: "https://example.com/browser/rdfxml.owl",
    text: `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="https://example.com/browser/rdfxml" />
  <owl:Class rdf:about="https://example.com/browser/rdfxml#Entity" />
</rdf:RDF>`,
  }),
  Object.freeze({
    key: "turtle",
    contentType: "text/turtle",
    documentIRI: "https://example.com/browser/turtle.ttl",
    text: `@prefix owl: <http://www.w3.org/2002/07/owl#> .
<https://example.com/browser/turtle> a owl:Ontology .
<https://example.com/browser/turtle#Entity> a owl:Class .`,
  }),
  Object.freeze({
    key: "jsonld",
    contentType: "application/ld+json",
    documentIRI: "https://example.com/browser/jsonld.jsonld",
    text: JSON.stringify({
      "@context": {
        owl: "http://www.w3.org/2002/07/owl#",
      },
      "@graph": [
        {
          "@id": "https://example.com/browser/jsonld",
          "@type": "owl:Ontology",
        },
        {
          "@id": "https://example.com/browser/jsonld#Entity",
          "@type": "owl:Class",
        },
      ],
    }),
  }),
]);

const exerciseProfile = async () => {
  const imports = [];
  const manager = apibinding.OWLManager.createOWLOntologyManager({
    documentLoader: {
      load: async (_iri, context) => {
        imports.push(context);
        return new io.StringDocumentSource(
          `@prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        <urn:browser:leaf> a owl:Ontology . <urn:browser:A> a owl:Class; rdfs:comment "bad"^^xsd:integer .`,
          { format: "turtle", documentIRI: "urn:browser:leaf-bytes" },
        );
      },
    },
  });
  const loaded = await manager.loadOntologyGraphFromOntologyDocument(
    new io.StringDocumentSource(
      `Prefix(:=<urn:browser:>) Ontology(<urn:browser:root> Import(<urn:browser:leaf>)
      Declaration(Class(:A)) Declaration(Class(:B)) Declaration(ObjectProperty(:p))
      SubClassOf(:A ObjectIntersectionOf(:B :B))
      SubClassOf(:A ObjectMinCardinality(9007199254740993 :p :B)))`,
      { format: "functional", documentIRI: "urn:browser:root-bytes" },
    ),
    { parsingMode: "preserve" },
  );
  const profile = new profiles.OWL2DLProfile();
  const report = await profile.checkOntology(loaded.ontology, {
    sourceAssessment: true,
  });
  const superClasses = [...loaded.ontology.getAxioms()]
    .filter(({ kind }) => kind === "OWLSubClassOfAxiom")
    .map(({ superClass }) => superClass);
  const xml = await manager.loadOntologyFromOntologyDocument(
    new io.StringDocumentSource(
      'Ontology(Annotation(rdfs:comment "<a/>"^^rdf:XMLLiteral))',
      { format: "functional" },
    ),
    { parsingMode: "preserve" },
  );
  const xmlReport = await profile.checkOntology(xml);
  const xmlControls = [];
  for (const lexical of ["<a></a>", "<a>"]) {
    const control = await manager.loadOntologyFromOntologyDocument(
      new io.StringDocumentSource(
        `Ontology(Annotation(rdfs:comment "${lexical}"^^rdf:XMLLiteral))`,
        { format: "functional" },
      ),
      { parsingMode: "preserve" },
    );
    const checked = await profile.checkOntology(control);
    xmlControls.push({
      status: checked.status,
      codes: checked.violations.map(({ code }) => code),
      unverified: checked.unverifiedChecks,
    });
  }
  const bounded = await profile.checkOntology(loaded.ontology, { maxWork: 1 });
  const controller = new AbortController();
  controller.abort();
  let abortName;
  try {
    await profile.checkOntology(loaded.ontology, { signal: controller.signal });
  } catch (error) {
    abortName = error.name;
  }
  const factory = manager.getOWLDataFactory();
  manager.addAxiom(
    loaded.ontology,
    factory.getOWLDeclarationAxiom(
      factory.getOWLClass(model.IRI.create("urn:browser:New")),
    ),
  );
  const mutated = await profile.checkOntology(loaded.ontology, {
    sourceAssessment: true,
  });
  return {
    formal: report.status,
    source: report.sourceAssessment.status,
    closureCount: report.closure.length,
    sourceCodes: [
      ...new Set(report.sourceAssessment.violations.map(({ code }) => code)),
    ].sort(),
    formats: loaded.documents.map(({ context }) => context.format.key),
    importContext:
      imports.length === 1 &&
      Object.isFrozen(imports[0]) &&
      imports[0].importIRI.value === "urn:browser:leaf" &&
      imports[0].importingDocumentIRI.value === "urn:browser:root-bytes",
    cardinality: superClasses.find(
      ({ kind }) => kind === "OWLObjectMinCardinality",
    ).cardinality,
    singletonOperands: superClasses.find(
      ({ kind }) => kind === "OWLObjectIntersectionOf",
    ).operands.length,
    invalidXml: xmlReport.violations.some(
      ({ code }) => code === "XML_LITERAL_NOT_CANONICAL",
    ),
    xmlControls,
    bounded: bounded.status,
    abortName,
    stale: mutated.sourceAssessment.unverifiedChecks.some(
      ({ code }) => code === "SOURCE_EVIDENCE_STALE",
    ),
  };
};

/**
 * Exercise only documented package specifiers so the fixture cannot pass by
 * reaching through the tarball boundary. The returned value intentionally uses
 * plain records, arrays, strings, numbers and booleans so the same evidence can
 * cross a DedicatedWorker structured-clone boundary unchanged.
 */
export const exerciseInstalledPackage = async () => {
  const bindingIdentity = {
    apibinding: root.OWLManager === apibinding.OWLManager,
    formats: root.OWLDocumentFormats === formats.OWLDocumentFormats,
    io:
      root.StringDocumentSource === io.StringDocumentSource &&
      root.RDFParserMetaData === io.RDFParserMetaData &&
      root.RDFOntologyHeaderStatus === io.RDFOntologyHeaderStatus,
    model:
      root.OWLOntologyManager === model.OWLOntologyManager &&
      !Object.hasOwn(root, "OWLOntologyWriterConfiguration"),
    profiles:
      root.OWL2DLProfile === profiles.OWL2DLProfile &&
      root.OWLProfileReport === profiles.OWLProfileReport,
    util:
      root.OWLOntologyMerger === util.OWLOntologyMerger &&
      root.OWLOntologyImportsClosureSetProvider ===
        util.OWLOntologyImportsClosureSetProvider,
  };

  if (Object.values(bindingIdentity).includes(false)) {
    throw new Error("A public subpath does not preserve root binding identity");
  }

  const documents = {};
  for (const document of DOCUMENTS) {
    const manager = apibinding.OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new io.StringDocumentSource(document.text, {
        contentType: document.contentType,
        documentIRI: document.documentIRI,
      }),
    );
    const outputManager = apibinding.OWLManager.createOWLOntologyManager();
    const loadedFormat = manager.getOntologyFormat(ontology);
    if (loadedFormat.isRdf) {
      const metadata = loadedFormat.getOntologyLoaderMetaData();
      if (
        !(metadata instanceof io.RDFParserMetaData) ||
        !Number.isSafeInteger(metadata.getTripleCount())
      )
        throw new Error(
          "RDF parser metadata is missing from the browser/worker package",
        );
    }
    const provider = new util.OWLOntologyImportsClosureSetProvider(
      manager,
      ontology,
    );
    const merged = new util.OWLOntologyMerger(provider).createMergedOntology(
      outputManager,
    );
    documents[document.key] = {
      axiomCount: ontology.getAxioms().size,
      importCount: ontology.getImportsDeclarations().size,
      mergedAxiomCount: merged.getAxioms().size,
      mergedImportCount: merged.getImportsDeclarations().size,
    };
  }

  const { summary: importClosure } =
    await exerciseImportClosureStorage(closureDocuments);
  return {
    bindingIdentity,
    documents,
    writerConfiguration: await exerciseWriterConfiguration(
      apibinding,
      model,
      io,
      formats,
    ),
    importClosure,
    publicModelFields: exercisePublicModelFields(root),
    acquisitionContracts: {
      formats: exerciseFormatConfiguration(root),
      errorKinds: exercisePublicErrors(root),
    },
    parserPreservation: await exerciseParserPreservation(),
    profile: await exerciseProfile(),
    managerClass:
      apibinding.OWLManager.createOWLOntologyManager().constructor.name,
  };
};
