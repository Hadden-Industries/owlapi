import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const FIXTURE_ROOT = new URL(
  "../../../../util/owlapi-reference/fixtures/rdf/",
  import.meta.url,
);

const structuralKeys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();

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

const structuralSnapshot = (ontology) => {
  const ontologyId = ontology.getOntologyID();
  return {
    annotations: structuralKeys(ontology.getAnnotations()),
    axioms: structuralKeys(ontology.getAxioms()),
    imports: structuralKeys(ontology.getImportsDeclarations()),
    ontologyIRI: ontologyId.ontologyIRI?.value || null,
    signature: signature(ontology),
    versionIRI: ontologyId.versionIRI?.value || null,
  };
};

const loadFixture = (fileName) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(
      readFileSync(new URL(fileName, FIXTURE_ROOT), "utf8"),
      {
        documentIRI: `urn:owlapi-js:phase9:${fileName}`,
        fileName,
      },
    ),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );

describe("Turtle structural differential", () => {
  it("reconstructs the same ontology as the paired RDF/XML and Java fixture", async () => {
    const [turtle, rdfXml] = await Promise.all([
      loadFixture("phase5-structural.ttl"),
      loadFixture("phase5-structural.rdf"),
    ]);
    const java = JSON.parse(
      readFileSync(
        new URL("phase5-structural.java.json", FIXTURE_ROOT),
        "utf8",
      ),
    ).snapshot;

    expect(structuralSnapshot(turtle)).toEqual(structuralSnapshot(rdfXml));
    expect(turtle.getAxioms()).toHaveProperty("size", java.axioms.length);
    expect(turtle.getOntologyID()).toMatchObject({
      ontologyIRI: { value: java.ontologyIRI },
      versionIRI: { value: java.versionIRI },
    });
  });
});
