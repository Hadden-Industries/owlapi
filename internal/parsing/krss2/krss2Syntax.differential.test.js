import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

const KRSS2_FIXTURE = new URL(
  "../../../util/owlapi-reference/fixtures/krss2/phase11-structural.krss2",
  import.meta.url,
);
const KRSS2_FIXTURE_ROOT = new URL(
  "../../../util/owlapi-reference/fixtures/krss2/",
  import.meta.url,
);
const DL_FIXTURE_ROOT = new URL(
  "../../../util/owlapi-reference/fixtures/dl/",
  import.meta.url,
);
const excludedFromKRSS2Subset = (axiom) =>
  [
    OWLObjectKind.DECLARATION_AXIOM,
    OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
    OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM,
  ].includes(axiom.kind) ||
  (axiom.kind === OWLObjectKind.SUBCLASS_OF_AXIOM &&
    axiom.subClass.kind === OWLObjectKind.OBJECT_ONE_OF);
const structuralKeys = (ontology) =>
  [...ontology.getAxioms()]
    .filter((axiom) => !excludedFromKRSS2Subset(axiom))
    .map((axiom) => axiom.structuralKey())
    .sort();
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
    classes: iris(ontology.getClassesInSignature()),
    objectProperties: iris(ontology.getObjectPropertiesInSignature()),
    dataProperties: iris(ontology.getDataPropertiesInSignature()),
    annotationProperties: iris(ontology.getAnnotationPropertiesInSignature()),
    individuals: iris(ontology.getIndividualsInSignature()),
    datatypes: iris(ontology.getDatatypesInSignature()),
  };
};
const load = (url, fileName) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(readFileSync(url, "utf8"), {
      documentIRI: "urn:test:phase10",
      fileName,
    }),
    new OWLOntologyLoaderConfiguration({
      missingImportHandling: "diagnostic",
    }),
  );

describe("KRSS2 structural differential", () => {
  it("matches the shared OWL-native and RDF syntax subset exactly", async () => {
    const [krss2, dl, functional, manchester, owlXml, rdfXml, turtle] =
      await Promise.all([
        load(KRSS2_FIXTURE, "phase11-structural.krss2"),
        load(new URL("phase10-structural.dl", DL_FIXTURE_ROOT), "phase10.dl"),
        load(new URL("phase10-structural.ofn", DL_FIXTURE_ROOT), "phase10.ofn"),
        load(
          new URL("phase11-structural.omn", KRSS2_FIXTURE_ROOT),
          "phase11.omn",
        ),
        load(
          new URL("phase11-structural.owx", KRSS2_FIXTURE_ROOT),
          "phase11.owx",
        ),
        load(new URL("phase10-structural.rdf", DL_FIXTURE_ROOT), "phase10.rdf"),
        load(new URL("phase10-structural.ttl", DL_FIXTURE_ROOT), "phase10.ttl"),
      ]);
    const expected = structuralKeys(functional);

    expect(structuralKeys(krss2)).toEqual(expected);
    expect(structuralKeys(dl)).toEqual(expected);
    expect(structuralKeys(manchester)).toEqual(expected);
    expect(structuralKeys(owlXml)).toEqual(expected);
    expect(structuralKeys(rdfXml)).toEqual(expected);
    expect(structuralKeys(turtle)).toEqual(expected);
    expect(krss2.getAxioms()).toHaveProperty("size", 12);

    const javaDocument = JSON.parse(
      readFileSync(
        new URL("phase11-structural.java.json", KRSS2_FIXTURE_ROOT),
        "utf8",
      ),
    );
    expect(javaDocument.oracle).toMatchObject({
      name: "OWLAPI",
      revision: "d7e997a53b470e32700de89cc610d9daf01ea769",
      version: "5.5.1",
    });
    expect({
      axiomTypeCounts: typeCounts(krss2.getAxioms()),
      signature: signature(krss2),
    }).toEqual({
      axiomTypeCounts: javaDocument.snapshot.axiomTypeCounts,
      signature: javaDocument.snapshot.signature,
    });
    expect(krss2.getAxioms()).toHaveProperty(
      "size",
      javaDocument.snapshot.axioms.length,
    );
  });
});
