import { OWLOntologyLoaderConfiguration } from "../io/index.js";
import { IRI, OWLObjectKind } from "../model/index.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "./index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const EX = "https://example.com/";

const nn = (value) => rdfDataFactory.namedNode(value);
const bn = (value) => rdfDataFactory.blankNode(value);
const literal = (...values) => rdfDataFactory.literal(...values);
const q = (...values) => rdfDataFactory.quad(...values);
const datasetOf = (...quads) => rdfDatasetFactory.dataset(quads.flat());
const declaration = (subject, type) => q(subject, nn(`${RDF}type`), nn(type));
const configuration = (values) => new OWLOntologyLoaderConfiguration(values);

describe("RdfToOwlTranslator finite-resource and failure contracts", () => {
  it.each([
    ["maxQuads", { maxQuads: 0 }, "maxQuads"],
    ["maxBlankNodes", { maxBlankNodes: 0 }, "maxBlankNodes"],
    ["maxAxioms", { maxAxioms: 0 }, "maxAxioms"],
  ])("enforces %s", async (_name, values, resource) => {
    const input = datasetOf(
      declaration(
        resource === "maxBlankNodes" ? bn("class") : nn(`${EX}Class`),
        `${OWL}Class`,
      ),
    );

    await expect(
      new RdfToOwlTranslator().translate(input, {
        configuration: configuration(values),
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource,
    });
  });

  it("enforces expression depth", async () => {
    const outer = bn("outer");
    const inner = bn("inner");
    const input = datasetOf(
      q(outer, nn(`${OWL}complementOf`), inner),
      q(inner, nn(`${OWL}complementOf`), nn(`${EX}Leaf`)),
      q(nn(`${EX}Root`), nn(`${RDFS}subClassOf`), outer),
    );

    await expect(
      new RdfToOwlTranslator().translate(input, {
        configuration: configuration({ maxExpressionDepth: 0 }),
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxExpressionDepth",
    });
  });

  it("enforces nested annotation depth", async () => {
    const first = nn(`${EX}First`);
    const second = nn(`${EX}Second`);
    const axiom = bn("axiom");
    const nested = bn("nested-annotation");
    const note = literal("outer");
    const input = datasetOf(
      declaration(first, `${OWL}Class`),
      declaration(second, `${OWL}Class`),
      q(first, nn(`${RDFS}subClassOf`), second),
      declaration(axiom, `${OWL}Axiom`),
      q(axiom, nn(`${OWL}annotatedSource`), first),
      q(axiom, nn(`${OWL}annotatedProperty`), nn(`${RDFS}subClassOf`)),
      q(axiom, nn(`${OWL}annotatedTarget`), second),
      q(axiom, nn(`${RDFS}comment`), note),
      declaration(nested, `${OWL}Annotation`),
      q(nested, nn(`${OWL}annotatedSource`), axiom),
      q(nested, nn(`${OWL}annotatedProperty`), nn(`${RDFS}comment`)),
      q(nested, nn(`${OWL}annotatedTarget`), note),
      q(nested, nn(`${RDFS}label`), literal("nested")),
    );

    await expect(
      new RdfToOwlTranslator().translate(input, {
        configuration: configuration({ maxAnnotationDepth: 0 }),
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxAnnotationDepth",
    });
  });

  it("honors an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      new RdfToOwlTranslator().translate(datasetOf(), {
        configuration: configuration({ signal: controller.signal }),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("enforces timeoutMs", async () => {
    await expect(
      new RdfToOwlTranslator().translate(
        datasetOf(declaration(nn(`${EX}Class`), `${OWL}Class`)),
        { configuration: configuration({ timeoutMs: 0 }) },
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "timeoutMs",
    });
  });

  it("rejects shared RDF-list tails", async () => {
    const tail = bn("tail");
    const firstHead = bn("first-head");
    const secondHead = bn("second-head");
    const firstExpression = bn("first-expression");
    const secondExpression = bn("second-expression");
    const input = datasetOf(
      q(firstHead, nn(`${RDF}first`), nn(`${EX}First`)),
      q(firstHead, nn(`${RDF}rest`), tail),
      q(secondHead, nn(`${RDF}first`), nn(`${EX}Second`)),
      q(secondHead, nn(`${RDF}rest`), tail),
      q(tail, nn(`${RDF}first`), nn(`${EX}Shared`)),
      q(tail, nn(`${RDF}rest`), nn(`${RDF}nil`)),
      q(firstExpression, nn(`${OWL}intersectionOf`), firstHead),
      q(secondExpression, nn(`${OWL}intersectionOf`), secondHead),
      q(nn(`${EX}A`), nn(`${RDFS}subClassOf`), firstExpression),
      q(nn(`${EX}B`), nn(`${RDFS}subClassOf`), secondExpression),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("rejects property-category conflicts before publishing declarations", async () => {
    const property = nn(`${EX}conflictedProperty`);
    const input = datasetOf(
      declaration(property, `${OWL}ObjectProperty`),
      declaration(property, `${OWL}DatatypeProperty`),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("fails on unconsumed OWL-significant triples in strict mode", async () => {
    const input = datasetOf(
      declaration(nn(`${EX}Class`), `${OWL}Class`),
      q(
        nn(`${EX}Class`),
        nn(`${OWL}unsupportedMappingPredicate`),
        nn(`${EX}Other`),
      ),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      predicate: `${OWL}unsupportedMappingPredicate`,
    });
  });

  it("reports unconsumed OWL-significant triples in compatible warning mode", async () => {
    const input = datasetOf(
      declaration(nn(`${EX}Class`), `${OWL}Class`),
      q(
        nn(`${EX}Class`),
        nn(`${OWL}unsupportedMappingPredicate`),
        nn(`${EX}Other`),
      ),
    );

    const { context } = await new RdfToOwlTranslator().translate(input, {
      configuration: configuration({ parsingMode: "compatible" }),
    });

    expect(context.diagnostics).toEqual([
      expect.objectContaining({
        code: "RDF_UNCONSUMED_OWL_TRIPLE",
        predicate: `${OWL}unsupportedMappingPredicate`,
        severity: "warning",
      }),
    ]);
  });

  it("keeps anonymous individuals scoped to their source document", async () => {
    const individual = bn("same-label");
    const owlClass = nn(`${EX}Class`);
    const input = datasetOf(
      declaration(owlClass, `${OWL}Class`),
      q(individual, nn(`${RDF}type`), owlClass),
    );
    const translator = new RdfToOwlTranslator();
    const first = await translator.translate(input, {
      documentIRI: IRI.create(`${EX}first-document`),
    });
    const second = await translator.translate(input, {
      documentIRI: IRI.create(`${EX}second-document`),
    });
    const [firstAxiom] = first.ontology.getAxiomsByType(
      OWLObjectKind.CLASS_ASSERTION_AXIOM,
    );
    const [secondAxiom] = second.ontology.getAxiomsByType(
      OWLObjectKind.CLASS_ASSERTION_AXIOM,
    );

    expect(firstAxiom.individual).toMatchObject({
      documentScope: `${EX}first-document`,
      nodeID: "same-label",
    });
    expect(secondAxiom.individual).toMatchObject({
      documentScope: `${EX}second-document`,
      nodeID: "same-label",
    });
    expect(firstAxiom.individual.equals(secondAxiom.individual)).toBe(false);
  });

  it("rejects RDF 1.2 triple terms rather than inventing OWL semantics", async () => {
    const tripleTerm = q(
      nn(`${EX}subject`),
      nn(`${EX}predicate`),
      nn(`${EX}object`),
    );
    const input = datasetOf(
      q(tripleTerm, nn(`${RDF}type`), nn(`${OWL}NamedIndividual`)),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONSTRUCT" });
  });
});
