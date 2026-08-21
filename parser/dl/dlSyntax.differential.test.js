import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

const FIXTURE_ROOT = new URL(
  "../../../../util/owlapi-reference/fixtures/dl/",
  import.meta.url,
);
const structuralKeys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();
const axiomTypeName = ({ kind }) =>
  kind.replace(/^OWL/u, "").replace(/Axiom$/u, "");
const typeCounts = (axioms) => {
  const counts = {};
  for (const axiom of axioms) {
    const name = axiomTypeName(axiom);
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
  );
};
const signature = (ontology) => {
  const iris = (entities) => [...entities].map(({ iri }) => iri.value).sort();
  return {
    annotationProperties: iris(ontology.getAnnotationPropertiesInSignature()),
    classes: iris(ontology.getClassesInSignature()),
    dataProperties: iris(ontology.getDataPropertiesInSignature()),
    datatypes: iris(ontology.getDatatypesInSignature()),
    individuals: iris(ontology.getIndividualsInSignature()),
    objectProperties: iris(ontology.getObjectPropertiesInSignature()),
  };
};
// DL Syntax has no declaration production. RDF needs explicit property typing
// to disambiguate the domain and transitivity triples during reconstruction, so
// the shared expressible subset compares every non-declaration axiom and the
// complete inferred signature instead of pretending those declarations are DL.
const structuralSnapshot = (ontology) => ({
  annotations: structuralKeys(ontology.getAnnotations()),
  axioms: structuralKeys(
    [...ontology.getAxioms()].filter(
      ({ kind }) => kind !== OWLObjectKind.DECLARATION_AXIOM,
    ),
  ),
  imports: structuralKeys(ontology.getImportsDeclarations()),
  ontologyIRI: ontology.getOntologyID().ontologyIRI?.value || null,
  signature: signature(ontology),
  versionIRI: ontology.getOntologyID().versionIRI?.value || null,
});
const loadFixture = (fileName) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(
      readFileSync(new URL(fileName, FIXTURE_ROOT), "utf8"),
      {
        documentIRI: "urn:test:phase10",
        fileName,
      },
    ),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );

describe("DL Syntax structural differential", () => {
  it("matches project-owned Functional, RDF/XML, and Turtle counterparts exactly", async () => {
    const [dl, functional, rdfXml, turtle] = await Promise.all([
      loadFixture("phase10-structural.dl"),
      loadFixture("phase10-structural.ofn"),
      loadFixture("phase10-structural.rdf"),
      loadFixture("phase10-structural.ttl"),
    ]);
    const expected = structuralSnapshot(functional);
    const javaDocument = JSON.parse(
      readFileSync(
        new URL("phase10-structural.java.json", FIXTURE_ROOT),
        "utf8",
      ),
    );
    const java = javaDocument.snapshot;

    expect(structuralSnapshot(dl)).toEqual(expected);
    expect(structuralSnapshot(rdfXml)).toEqual(expected);
    expect(structuralSnapshot(turtle)).toEqual(expected);
    expect(javaDocument.oracle).toMatchObject({
      name: "OWLAPI",
      revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
      version: "5.5.1",
    });
    expect({
      axiomTypeCounts: typeCounts(dl.getAxioms()),
      imports: [...dl.getImportsDeclarations()]
        .map(({ iri }) => iri.value)
        .sort(),
      ontologyAnnotations: [],
      ontologyIRI: dl.getOntologyID().ontologyIRI?.value || null,
      signature: signature(dl),
      versionIRI: dl.getOntologyID().versionIRI?.value || null,
    }).toEqual({
      axiomTypeCounts: java.axiomTypeCounts,
      imports: java.imports,
      ontologyAnnotations: java.ontologyAnnotations,
      ontologyIRI: java.ontologyIRI,
      signature: java.signature,
      versionIRI: java.versionIRI,
    });
    expect(dl.getAxioms()).toHaveProperty("size", java.axioms.length);
    for (const rdfOntology of [rdfXml, turtle]) {
      const declarations = rdfOntology.getAxiomsByType(
        OWLObjectKind.DECLARATION_AXIOM,
      );
      expect(
        [...declarations].map(({ entity }) => entity.iri.value).sort(),
      ).toEqual([
        "urn:test:phase10#hasAncestor",
        "urn:test:phase10#hasChild",
        "urn:test:phase10#hasParent",
      ]);
    }
  });
});
