import { readFileSync } from "node:fs";

import { StringDocumentSource } from "../io/index.js";
import { OWLManager } from "../manager/index.js";
import { AXIOM_KINDS } from "../model/index.js";
import { datasetsAreIsomorphic } from "../../../util/rdf-dataset-isomorphism.mjs";
import { rdfDataFactory, rdfDatasetFactory } from "./environment.js";
import { OwlToRdfTranslator, RdfToOwlTranslator } from "./index.js";
import {
  OWL_VOCABULARY,
  RDF_VOCABULARY,
  RDFS_VOCABULARY,
} from "./vocabulary.js";

const FIXTURE_URL = new URL(
  "../../../util/owlapi-reference/fixtures/functional/phase2-structural.ofn",
  import.meta.url,
);
const DOCUMENT_IRI = "urn:owlapi-js:phase16:round-trip-source";

const structuralKeys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();

const DECLARATION_TYPES = new Set([
  OWL_VOCABULARY.AnnotationProperty,
  OWL_VOCABULARY.Class,
  OWL_VOCABULARY.DatatypeProperty,
  OWL_VOCABULARY.NamedIndividual,
  OWL_VOCABULARY.ObjectProperty,
  RDFS_VOCABULARY.Datatype,
]);

const hasAxiomReification = (dataset, quad) => {
  const annotatedSource = rdfDataFactory.namedNode(
    OWL_VOCABULARY.annotatedSource,
  );
  const annotatedProperty = rdfDataFactory.namedNode(
    OWL_VOCABULARY.annotatedProperty,
  );
  const annotatedTarget = rdfDataFactory.namedNode(
    OWL_VOCABULARY.annotatedTarget,
  );
  return [
    ...dataset.match(null, annotatedSource, quad.subject, quad.graph),
  ].some(
    ({ subject }) =>
      dataset.match(subject, annotatedProperty, quad.predicate, quad.graph)
        .size > 0 &&
      dataset.match(subject, annotatedTarget, quad.object, quad.graph).size > 0,
  );
};

const withoutInferredDeclarations = (dataset) => {
  const result = rdfDatasetFactory.dataset();
  for (const quad of dataset) {
    const isUnannotatedDeclaration =
      quad.subject.termType === "NamedNode" &&
      quad.predicate.value === RDF_VOCABULARY.type &&
      quad.object.termType === "NamedNode" &&
      DECLARATION_TYPES.has(quad.object.value) &&
      !hasAxiomReification(dataset, quad);
    if (!isUnannotatedDeclaration) {
      result.add(quad);
    }
  }
  return result;
};

describe("OwlToRdfTranslator round trips", () => {
  it("preserves the complete Phase 2 structural ontology through RDF", async () => {
    // A mapper can produce valid RDF while omitting one structural family; the
    // inverse translator makes that semantic loss observable at the OWL model.
    const manager = OWLManager.createOWLOntologyManager();
    const source = new StringDocumentSource(readFileSync(FIXTURE_URL, "utf8"), {
      contentType: "text/owl-functional",
      documentIRI: DOCUMENT_IRI,
      fileName: "phase2-structural.ofn",
    });
    const original = await manager.loadOntologyFromOntologyDocument(source, {
      missingImportHandling: "diagnostic",
    });
    expect(
      [...new Set([...original.getAxioms()].map(({ kind }) => kind))].sort(),
    ).toEqual([...AXIOM_KINDS].sort());

    const dataset = new OwlToRdfTranslator().translate(original);
    const { ontology: reconstructed } =
      await new RdfToOwlTranslator().translate(dataset, {
        configuration: { parsingMode: "strict" },
        documentIRI: DOCUMENT_IRI,
      });

    expect(reconstructed.getOntologyID().structuralKey()).toBe(
      original.getOntologyID().structuralKey(),
    );
    expect(structuralKeys(reconstructed.getImportsDeclarations())).toEqual(
      structuralKeys(original.getImportsDeclarations()),
    );
    expect(structuralKeys(reconstructed.getAnnotations())).toEqual(
      structuralKeys(original.getAnnotations()),
    );
    // Anonymous-individual node IDs are RDF serialization artifacts. Mapping
    // the reconstructed ontology once more and comparing graph isomorphism
    // checks every axiom without accidentally making those labels contractual.
    const reconstructedDataset = new OwlToRdfTranslator().translate(
      reconstructed,
    );
    // W3C reverse mapping and the reader's OWL 1 compatibility rules can infer
    // unannotated declarations from characteristic triples. Declarations do not
    // affect logical meaning; annotated declarations remain in this comparison
    // because their annotations are structurally significant.
    expect(
      datasetsAreIsomorphic(
        withoutInferredDeclarations(dataset),
        withoutInferredDeclarations(reconstructedDataset),
      ),
    ).toBe(true);
  });
});
