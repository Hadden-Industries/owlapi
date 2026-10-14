import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import {
  StringDocumentSource,
  UnparsableOntologyException,
} from "../io/index.js";

test.each(
  ["java-owlapi-5.5.1", "normative-v1"].flatMap((profile) =>
    [true, false].map((annotations) => [profile, annotations]),
  ),
)(
  "%s preserves its named RDF datatype restriction outcome with annotations=%s",
  async (behaviorProfileId, annotationsEnabled) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const text =
      '@prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. @prefix xsd: <http://www.w3.org/2001/XMLSchema#>. <urn:D> a rdfs:Datatype; owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern "x"]).';
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { format: OWLDocumentFormats.TURTLE }),
      manager
        .getOntologyLoaderConfiguration()
        .setStrict(false)
        .setLoadAnnotationAxioms(annotationsEnabled),
    );
    const axioms = [...ontology.getAxioms()];
    expect(
      axioms.filter(({ kind }) => kind === "OWLDatatypeDefinitionAxiom"),
    ).toHaveLength(behaviorProfileId === "normative-v1" ? 1 : 0);
    const annotations = axioms.filter(
      ({ kind }) => kind === "OWLAnnotationAssertionAxiom",
    );
    expect(annotations).toHaveLength(
      behaviorProfileId === "normative-v1" || !annotationsEnabled ? 0 : 1,
    );
    if (annotations.length)
      expect(annotations[0].subject.kind).toBe("OWLAnonymousIndividual");
  },
);

test.each(
  ["java-owlapi-5.5.1", "normative-v1"].flatMap((profile) =>
    ["anonymous", "mixed", "empty"].map((contents) => [profile, contents]),
  ),
)(
  "%s parses the native OWL/XML %s enumeration contract",
  async (behaviorProfileId, contents) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const individuals =
      contents === "empty"
        ? ""
        : `${contents === "mixed" ? "<NamedIndividual IRI='urn:i'/>" : ""}<AnonymousIndividual nodeID='a'/>`;
    const loading = manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `<Ontology xmlns='http://www.w3.org/2002/07/owl#'><SubClassOf><Class IRI='urn:C'/><ObjectOneOf>${individuals}</ObjectOneOf></SubClassOf></Ontology>`,
        { format: OWLDocumentFormats.OWL_XML },
      ),
    );
    if (contents === "empty" && behaviorProfileId === "normative-v1")
      await expect(loading).rejects.toThrow();
    else {
      const ontology = await loading;
      const enumeration = [...ontology.getAxioms()][0].superClass;
      expect(enumeration.individuals).toHaveLength(
        (contents === "mixed" ? 1 : 0) +
          (behaviorProfileId === "normative-v1" ? 1 : 0),
      );
    }
  },
);

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s exposes its empty enumeration factory contract",
  (behaviorProfileId) => {
    const factory = OWLManager.createOWLOntologyManager({
      behaviorProfileId,
    }).getOWLDataFactory();
    if (behaviorProfileId === "normative-v1")
      expect(() => factory.getOWLObjectOneOf([])).toThrow(RangeError);
    else expect(factory.getOWLObjectOneOf([]).individuals).toEqual([]);
  },
);

test.each(
  ["java-owlapi-5.5.1", "normative-v1"].flatMap((behaviorProfileId) =>
    [0, 1, 2].flatMap((count) =>
      ["turtle", "rdfxml"].map((syntax) => [behaviorProfileId, count, syntax]),
    ),
  ),
)(
  "%s reports its native header status for %s %s headers",
  async (behaviorProfileId, count, syntax) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const headers = Array.from(
      { length: count },
      (_, index) => `urn:ontology:${index}`,
    );
    const text =
      syntax === "turtle"
        ? "<urn:C> a <http://www.w3.org/2002/07/owl#Class> . " +
          headers
            .map(
              (iri) => `<${iri}> a <http://www.w3.org/2002/07/owl#Ontology> .`,
            )
            .join(" ")
        : `<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#' xmlns:owl='http://www.w3.org/2002/07/owl#'><owl:Class rdf:about='urn:C'/>${headers.map((iri) => `<owl:Ontology rdf:about='${iri}'/>`).join("")}</rdf:RDF>`;
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, {
        format:
          syntax === "turtle"
            ? OWLDocumentFormats.TURTLE
            : OWLDocumentFormats.RDF_XML,
      }),
      manager.getOntologyLoaderConfiguration().setStrict(false),
    );
    const metadata = manager
      .getOntologyFormat(ontology)
      .getOntologyLoaderMetaData();
    expect(metadata.getHeaderState()).toBe(
      behaviorProfileId === "java-owlapi-5.5.1"
        ? "PARSED_ONE_HEADER"
        : [
            "PARSED_ZERO_HEADERS",
            "PARSED_ONE_HEADER",
            "PARSED_MULTIPLE_HEADERS",
          ][count],
    );
    expect(metadata.getTripleCount()).toBe(count + 1);
  },
);

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s counts RDF source occurrences according to its metadata contract",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const text =
      "<urn:C> a <http://www.w3.org/2002/07/owl#Class> . <urn:C> a <http://www.w3.org/2002/07/owl#Class> .";
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { format: OWLDocumentFormats.TURTLE }),
    );
    expect(ontology.getAxiomCount()).toBe(1);
    expect(
      manager
        .getOntologyFormat(ontology)
        .getOntologyLoaderMetaData()
        .getTripleCount(),
    ).toBe(behaviorProfileId === "java-owlapi-5.5.1" ? 2 : 1);
  },
);

test("Java aggregates the selected Functional parser failure", async () => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  await expect(
    manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Broken(", {
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    ),
  ).rejects.toBeInstanceOf(UnparsableOntologyException);
  await expect(
    manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Ontology(<urn:parser:retry>)", {
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    ),
  ).resolves.toBeDefined();
});

test("Java's first accepting supported factory reads an empty document as Turtle", async () => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(""),
  );
  expect(manager.getOntologyFormat(ontology).key).toBe("turtle");
  expect(ontology.getAxiomCount()).toBe(0);
});

test("Java's Functional parser rejects a n-ary data-property list", async () => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const text =
    "Prefix(:=<urn:profiles:>) Ontology(SubClassOf(:A DataSomeValuesFrom(:d :e <http://www.w3.org/2001/XMLSchema#string>)))";
  await expect(
    manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { format: OWLDocumentFormats.FUNCTIONAL }),
    ),
  ).rejects.toBeInstanceOf(UnparsableOntologyException);
});
