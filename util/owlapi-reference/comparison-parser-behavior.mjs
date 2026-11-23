import { comparisonIdentity } from "./comparison-evidence.mjs";
import { comparisonSyntaxes } from "./comparison-fixtures.mjs";

const owl = "http://www.w3.org/2002/07/owl#";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const classTriple = `<urn:C> a <${owl}Class> .`;
const headerStates = [
  "PARSED_ZERO_HEADERS",
  "PARSED_ONE_HEADER",
  "PARSED_MULTIPLE_HEADERS",
];
const metadata = (headers, tripleCount) => ({ headers, tripleCount });
const enumeration = (individuals, anonymous) => ({
  status: "return",
  individuals,
  anonymous,
});
const datatype = (definitions, annotations, anonymousAnnotations) => ({
  definitions,
  annotations,
  anonymousAnnotations,
});

const headerRows = [0, 1, 2].flatMap((count) => {
  const headers = Array.from(
    { length: count },
    (_, index) => `urn:ontology:${index}`,
  );
  return [
    {
      id: `turtle-headers-${count}`,
      format: "turtle",
      text:
        classTriple +
        " " +
        headers.map((iri) => `<${iri}> a <${owl}Ontology> .`).join(" "),
      count,
      strict: false,
    },
    {
      id: `rdfxml-headers-${count}`,
      format: "rdfxml",
      text:
        `<rdf:RDF xmlns:rdf='${rdf}' xmlns:owl='${owl}'><owl:Class rdf:about='urn:C'/>` +
        headers.map((iri) => `<owl:Ontology rdf:about='${iri}'/>`).join("") +
        "</rdf:RDF>",
      count,
      strict: false,
    },
  ];
});
const enumerationRows = [
  ["anonymous", "<AnonymousIndividual nodeID='a'/>"],
  ["mixed", "<NamedIndividual IRI='urn:i'/><AnonymousIndividual nodeID='a'/>"],
  ["empty", ""],
].map(([id, contents]) => ({
  id,
  format: "owlxml",
  text: `<Ontology xmlns='${owl}'><SubClassOf><Class IRI='urn:C'/><ObjectOneOf>${contents}</ObjectOneOf></SubClassOf></Ontology>`,
}));
const datatypeSource =
  `@prefix owl: <${owl}>. ` +
  "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. " +
  "@prefix xsd: <http://www.w3.org/2001/XMLSchema#>. " +
  '<urn:D> a rdfs:Datatype; owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern "x"]).';
const recipes = [
  {
    kind: "selection",
    decisionId: "BEHAVIOR-PARSER-SELECTION",
    rows: [
      { id: "empty-auto", text: "" },
      { id: "broken-functional", format: "functional", text: "Broken(" },
    ],
    javaRows: [
      { status: "return", format: "turtle", axioms: 0 },
      { status: "aggregate" },
    ],
  },
  {
    kind: "rdf-metadata",
    decisionId: "BEHAVIOR-RDF-METADATA",
    rows: [
      ...headerRows,
      {
        id: "turtle-duplicate",
        format: "turtle",
        text: `${classTriple} ${classTriple}`,
      },
    ],
    javaRows: [
      ...headerRows.map(({ count }) => metadata(headerStates[1], count + 1)),
      metadata(headerStates[1], 2),
    ],
    normative: [
      ...headerRows.map(({ count }) =>
        metadata(headerStates[count], count + 1),
      ),
      metadata(headerStates[0], 1),
    ],
  },
  {
    kind: "individual-enumeration",
    decisionId: "BEHAVIOR-INDIVIDUAL-ENUMERATION",
    rows: [...enumerationRows, { id: "factory-empty", factory: true }],
    javaRows: [
      enumeration(0, 0),
      enumeration(1, 0),
      enumeration(0, 0),
      enumeration(0, 0),
    ],
    normative: [
      enumeration(1, 1),
      enumeration(2, 1),
      { status: "refused" },
      { status: "refused" },
    ],
  },
  {
    kind: "named-datatype-restriction",
    decisionId: "BEHAVIOR-NAMED-DATATYPE-RESTRICTION",
    rows: [true, false].map((annotations) => ({
      id: `annotations-${annotations}`,
      format: "turtle",
      text: datatypeSource,
      annotations,
      strict: false,
    })),
    javaRows: [datatype(0, 1, 1), datatype(0, 0, 0)],
    normative: [datatype(1, 0, 0), datatype(1, 0, 0)],
  },
];

export function parserBehaviorComparisonCases() {
  return recipes.map((parserBehavior) => {
    const input = { id: `parser/${parserBehavior.kind}` };
    const definition = {
      schemaVersion: 1,
      scenario: "public-api-behavior",
      scenarioVersion: 1,
      observationPoint: "parser-selection-and-result",
      behaviorProfileId: "java-owlapi-5.5.1",
      measurements: ["behavior"],
      input,
      parserBehavior,
    };
    return {
      input,
      definition,
      caseId: comparisonIdentity(definition),
      imports: [],
    };
  });
}

async function trace(api, recipe, options) {
  const outcomes = [];
  let behaviorProfileId;
  for (const row of recipe.rows) {
    const manager = api.OWLManager.createOWLOntologyManager(options);
    behaviorProfileId = manager.getBehaviorProfileId();
    let ontology;
    try {
      if (row.factory) {
        const empty = manager.getOWLDataFactory().getOWLObjectOneOf([]);
        outcomes.push(enumeration(empty.individuals.length, 0));
        continue;
      }
      const format =
        row.format &&
        api.OWLDocumentFormats[comparisonSyntaxes[row.format].format];
      const source = new api.StringDocumentSource(row.text, {
        documentIRI: api.IRI.create(`urn:parser:${recipe.kind}:${row.id}`),
        ...(format ? { format } : {}),
      });
      let configuration = manager.getOntologyLoaderConfiguration();
      if (row.strict !== undefined)
        configuration = configuration.setStrict(row.strict);
      if (row.annotations !== undefined)
        configuration = configuration.setLoadAnnotationAxioms(row.annotations);
      ontology = await manager.loadOntologyFromOntologyDocument(
        source,
        configuration,
      );
    } catch (error) {
      if (error.code === "UNPARSABLE_ONTOLOGY")
        outcomes.push({ status: "aggregate" });
      else if (recipe.kind === "selection" && error.code === "PARSER_MISMATCH")
        outcomes.push({ status: "mismatch" });
      else if (
        row.factory
          ? error instanceof RangeError
          : error.code === "OWL_SYNTAX_ERROR" ||
            error.code === "UNSUPPORTED_CONSTRUCT"
      )
        outcomes.push({ status: "refused" });
      else throw error;
      continue;
    }
    const format = manager.getOntologyFormat(ontology);
    if (recipe.kind === "selection") {
      outcomes.push({
        status: "return",
        format: format.key,
        axioms: ontology.getAxiomCount(),
      });
    } else if (recipe.kind === "rdf-metadata") {
      const parsed = format.getOntologyLoaderMetaData();
      outcomes.push(metadata(parsed.getHeaderState(), parsed.getTripleCount()));
    } else if (recipe.kind === "individual-enumeration") {
      const [{ superClass }] = ontology.getAxioms();
      const individuals = superClass.individuals;
      outcomes.push(
        enumeration(
          individuals.length,
          individuals.filter(({ kind }) => kind === "OWLAnonymousIndividual")
            .length,
        ),
      );
    } else {
      const axioms = [...ontology.getAxioms()];
      const annotations = axioms.filter(
        ({ kind }) => kind === "OWLAnnotationAssertionAxiom",
      );
      outcomes.push(
        datatype(
          axioms.filter(({ kind }) => kind === "OWLDatatypeDefinitionAxiom")
            .length,
          annotations.length,
          annotations.filter(
            ({ subject }) => subject.kind === "OWLAnonymousIndividual",
          ).length,
        ),
      );
    }
  }
  return { behaviorProfileId, outcomes };
}

export async function observeParserBehavior(api, request) {
  const selected = await trace(api, request.parserBehavior, {
    behaviorProfileId: request.behaviorProfileId,
  });
  const normative = await trace(api, request.parserBehavior);
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: selected.behaviorProfileId,
      defaultBehaviorProfileId: normative.behaviorProfileId,
    },
    networkRequests: [],
    load: { status: "completed" },
    parserBehavior: selected.outcomes,
    normativeParserBehavior: normative.outcomes,
  };
}
