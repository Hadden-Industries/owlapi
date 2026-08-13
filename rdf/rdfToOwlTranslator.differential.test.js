import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../io/index.js";
import { OWLManager } from "../manager/index.js";
import { IRI } from "../model/index.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "./index.js";

const DATASET_URL = new URL(
  "../../../util/owlapi-reference/fixtures/rdf/phase5-structural.dataset.json",
  import.meta.url,
);
const FUNCTIONAL_URL = new URL(
  "../../../util/owlapi-reference/fixtures/rdf/phase5-structural.ofn",
  import.meta.url,
);
const JAVA_SNAPSHOT_URL = new URL(
  "../../../util/owlapi-reference/fixtures/rdf/phase5-structural.java.json",
  import.meta.url,
);

const decodeTerm = ([type, value, language, datatype]) => {
  if (type === "N") {
    return rdfDataFactory.namedNode(value);
  }
  if (type === "B") {
    return rdfDataFactory.blankNode(value);
  }
  if (type === "L") {
    return language
      ? rdfDataFactory.literal(value, language)
      : rdfDataFactory.literal(value, rdfDataFactory.namedNode(datatype));
  }
  throw new TypeError(`Unknown RDF fixture term type: ${type}`);
};

const constructDataset = ({ quads }) =>
  rdfDatasetFactory.dataset(
    quads.map(([subject, predicate, object]) =>
      rdfDataFactory.quad(
        decodeTerm(subject),
        decodeTerm(predicate),
        decodeTerm(object),
      ),
    ),
  );

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

describe("RdfToOwlTranslator structural differential", () => {
  it("matches the Functional counterpart and pinned Java OWLAPI summary", async () => {
    const datasetDocument = JSON.parse(readFileSync(DATASET_URL, "utf8"));
    const functionalDocument = readFileSync(FUNCTIONAL_URL, "utf8");
    const expectedDocument = JSON.parse(
      readFileSync(JAVA_SNAPSHOT_URL, "utf8"),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    });
    const documentIRI = IRI.create("urn:owlapi-js:phase5:document");
    const { ontology: rdfOntology } = await new RdfToOwlTranslator().translate(
      constructDataset(datasetDocument),
      { configuration, documentIRI },
    );
    const functionalOntology =
      await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(functionalDocument, {
          documentIRI,
          fileName: "phase5-structural.ofn",
        }),
        configuration,
      );
    const expected = expectedDocument.snapshot;

    expect(datasetDocument).toMatchObject({
      schemaVersion: 1,
      source: "util/owlapi-reference/fixtures/rdf/phase5-structural.rdf",
    });
    expect(expectedDocument).toMatchObject({
      fixture: "util/owlapi-reference/fixtures/rdf/phase5-structural.rdf",
      oracle: {
        revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
        version: "5.5.1",
      },
    });
    expect(structuralSnapshot(rdfOntology)).toEqual(
      structuralSnapshot(functionalOntology),
    );
    expect({
      axiomTypeCounts: typeCounts(rdfOntology.getAxioms()),
      imports: [...rdfOntology.getImportsDeclarations()]
        .map(({ iri }) => iri.value)
        .sort(),
      ontologyIRI: rdfOntology.getOntologyID().ontologyIRI?.value || null,
      signature: signature(rdfOntology),
      versionIRI: rdfOntology.getOntologyID().versionIRI?.value || null,
    }).toEqual({
      axiomTypeCounts: expected.axiomTypeCounts,
      imports: expected.imports,
      ontologyIRI: expected.ontologyIRI,
      signature: expected.signature,
      versionIRI: expected.versionIRI,
    });
    expect(rdfOntology.getAxioms()).toHaveProperty(
      "size",
      expected.axioms.length,
    );
    expect([...rdfOntology.getAnnotations()]).toHaveLength(
      expected.ontologyAnnotations.length,
    );
  });
});
