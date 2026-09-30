import { OWL2DLProfile, OWLManager, StringDocumentSource } from "../index.js";

const prefix = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`;
const declaration = "<urn:graph:A> a owl:Class .";
const invalid = '<urn:graph:A> rdfs:label "300"^^xsd:byte .';
const defaultGraph = { termType: "DefaultGraph", value: "" };
const namedGraph = { termType: "NamedNode", value: "urn:graph:selected" };
const selections = [
  { rdfDatasetGraphPolicy: "defaultGraphOnly" },
  { rdfDatasetGraphPolicy: "selectGraph", selectedGraph: defaultGraph },
  { rdfDatasetGraphPolicy: "selectGraph", selectedGraph: namedGraph },
];
const check = async (body, configuration, imported = false) => {
  const source = new StringDocumentSource(`${prefix}\n${body}`, {
    format: "trig",
    documentIRI: "urn:graph:source-bytes",
  });
  const manager = OWLManager.createOWLOntologyManager({
    documentLoader: { load: async () => source },
  });
  const ontology = await manager.loadOntologyFromOntologyDocument(
    imported
      ? new StringDocumentSource(
          "Ontology(<urn:graph:root> Import(<urn:graph:import>))",
          { format: "functional", documentIRI: "urn:graph:root-bytes" },
        )
      : source,
    { parsingMode: "preserve", ...configuration },
  );
  return new OWL2DLProfile().checkOntology(ontology, {
    sourceAssessment: true,
  });
};

test.each(selections)(
  "does not certify discarded source graphs with %j",
  async (configuration) => {
    const body =
      configuration.selectedGraph === namedGraph
        ? `${invalid}\n<urn:graph:selected> { ${declaration} }`
        : `${declaration}\n<urn:graph:omitted> { ${invalid} }`;
    for (const imported of [false, true]) {
      const result = await check(
        body,
        { ...configuration, collectWarnings: false },
        imported,
      );
      expect(result.status).toBe("valid");
      expect(result.sourceAssessment.status).toBe("unverified");
      expect(result.sourceAssessment.unverifiedChecks).toContainEqual({
        code: "SOURCE_EVIDENCE_UNVERIFIED",
        scope: imported ? 1 : 0,
      });
    }
  },
);

test.each(selections)(
  "still certifies graph selection without source omission: %j",
  async (configuration) => {
    const body =
      configuration.selectedGraph === namedGraph
        ? `<urn:graph:selected> { ${declaration} }`
        : declaration;
    const result = await check(body, configuration);
    expect(result.status).toBe("valid");
    expect(result.sourceAssessment.status).toBe("valid");
    expect(result.sourceAssessment.unverifiedChecks).toEqual([]);
  },
);

test("checks every merged graph while allowing duplicate source triples", async () => {
  const configuration = { rdfDatasetGraphPolicy: "merge" };
  const duplicate = `${declaration}\n<urn:graph:other> { ${declaration} }`;
  const valid = await check(duplicate, configuration);
  expect(valid.sourceAssessment.status).toBe("valid");
  const result = await check(
    `${duplicate}\n<urn:graph:other> { ${invalid} }`,
    configuration,
  );
  expect(result.sourceAssessment.status).toBe("invalid");
  expect(result.sourceAssessment.violations).toContainEqual(
    expect.objectContaining({ code: "LITERAL_LEXICAL_SPACE" }),
  );
  expect(result.sourceAssessment.unverifiedChecks).toEqual([]);
});
