import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { IRI } from "../../model/index.js";
import { rdfDataFactory } from "../../rdf/index.js";

import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

const FIXTURE_ROOT = new URL(
  "../../../../util/owlapi-reference/fixtures/rdf/",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL("phase5-structural.java.json", FIXTURE_ROOT);

const axiomTypeName = ({ kind }) =>
  kind.replace(/^OWL/u, "").replace(/Axiom$/u, "");

const typeCounts = (axioms) => {
  const counts = {};
  for (const axiom of axioms) {
    const name = axiomTypeName(axiom);
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
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

const structuralKeys = (values) =>
  [...values].map((value) => value.structuralKey()).sort();

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

const loadFixture = async (fileName, configuration) => {
  const text = readFileSync(new URL(fileName, FIXTURE_ROOT), "utf8");
  return OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: IRI.create(`urn:owlapi-js:phase6:${fileName}`),
      fileName,
    }),
    configuration,
  );
};

describe("RDF/XML structural differential", () => {
  it("matches its Functional, Manchester, OWL/XML, and pinned Java counterparts", async () => {
    const configuration = new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    });
    const [rdfXml, functional, manchester, owlXml] = await Promise.all([
      loadFixture("phase5-structural.rdf", configuration),
      loadFixture("phase5-structural.ofn", configuration),
      loadFixture("phase5-structural.omn", configuration),
      loadFixture("phase5-structural.owx", configuration),
    ]);
    const expectedDocument = JSON.parse(
      readFileSync(JAVA_SNAPSHOT_URL, "utf8"),
    );
    const expected = expectedDocument.snapshot;

    expect(structuralSnapshot(rdfXml)).toEqual(structuralSnapshot(functional));
    expect(structuralSnapshot(rdfXml)).toEqual(structuralSnapshot(manchester));
    expect(structuralSnapshot(rdfXml)).toEqual(structuralSnapshot(owlXml));
    expect({
      axiomTypeCounts: typeCounts(rdfXml.getAxioms()),
      imports: [...rdfXml.getImportsDeclarations()]
        .map(({ iri }) => iri.value)
        .sort(),
      ontologyIRI: rdfXml.getOntologyID().ontologyIRI?.value || null,
      signature: signature(rdfXml),
      versionIRI: rdfXml.getOntologyID().versionIRI?.value || null,
    }).toEqual({
      axiomTypeCounts: expected.axiomTypeCounts,
      imports: expected.imports,
      ontologyIRI: expected.ontologyIRI,
      signature: expected.signature,
      versionIRI: expected.versionIRI,
    });
    expect(rdfXml.getAxioms()).toHaveProperty("size", expected.axioms.length);
    expect([...rdfXml.getAnnotations()]).toHaveLength(
      expected.ontologyAnnotations.length,
    );
  });

  it("preserves the pinned Rational source defect at the RDF seam", async () => {
    const text = readFileSync(
      new URL("phase5-malformed-list.rdf", FIXTURE_ROOT),
      "utf8",
    );
    const source = new StringDocumentSource(text, {
      documentIRI: "urn:owlapi-js:phase6:malformed-list",
      fileName: "phase5-malformed-list.rdf",
    });
    const dataset = await new RdfXmlSyntaxAdapter().parse(source);

    expect(
      dataset.match(
        undefined,
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",
        ),
        rdfDataFactory.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#"),
      ).size,
    ).toBe(1);
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
        new OWLOntologyLoaderConfiguration({ parsingMode: "compatible" }),
      ),
    ).resolves.toBeDefined();
  });
});
