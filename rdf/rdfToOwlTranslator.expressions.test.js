import { OWLOntologyLoaderConfiguration } from "../io/index.js";
import { OWLObjectKind } from "../model/index.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "./index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const EX = "https://example.com/";

const nn = (value) => rdfDataFactory.namedNode(value);
const bn = (value) => rdfDataFactory.blankNode(value);
const q = (...values) => rdfDataFactory.quad(...values);
const datasetOf = (...quads) => rdfDatasetFactory.dataset(quads.flat());

const rdfList = (name, values) => {
  const quads = [];
  let head = nn(`${RDF}nil`);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const node = bn(`${name}-${index}`);
    quads.push(q(node, nn(`${RDF}first`), values[index]));
    quads.push(q(node, nn(`${RDF}rest`), head));
    head = node;
  }
  return { head, quads };
};

const declaration = (subject, type) => q(subject, nn(`${RDF}type`), nn(type));

const restriction = (name, property, predicate, value, extra = []) => {
  const node = bn(name);
  return {
    node,
    quads: [
      declaration(node, `${OWL}Restriction`),
      q(node, nn(`${OWL}onProperty`), property),
      q(node, nn(`${OWL}${predicate}`), value),
      ...extra,
    ],
  };
};

describe("RdfToOwlTranslator recursive expressions", () => {
  it("normalizes OWL 1 compatible empty and singleton class-expression lists", async () => {
    const subject = nn(`${EX}Subject`);
    const operand = nn(`${EX}Operand`);
    const emptyUnion = bn("empty-union");
    const singletonIntersection = bn("singleton-intersection");
    const singletonItems = rdfList("singleton-items", [operand]);
    const input = datasetOf(
      declaration(subject, `${OWL}Class`),
      declaration(operand, `${OWL}Class`),
      declaration(emptyUnion, `${OWL}Class`),
      q(emptyUnion, nn(`${OWL}unionOf`), nn(`${RDF}nil`)),
      declaration(singletonIntersection, `${OWL}Class`),
      q(singletonIntersection, nn(`${OWL}intersectionOf`), singletonItems.head),
      singletonItems.quads,
      q(subject, nn(`${RDFS}subClassOf`), emptyUnion),
      q(subject, nn(`${RDFS}subClassOf`), singletonIntersection),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const superClassIris = new Set(
      [...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM)].map(
        ({ superClass }) => superClass.iri.value,
      ),
    );

    expect(superClassIris).toEqual(new Set([`${OWL}Nothing`, operand.value]));
  });

  it("reconstructs OWL 1 compatible named-class Boolean and enumeration axioms", async () => {
    const emptyIntersection = nn(`${EX}EmptyIntersection`);
    const singletonUnion = nn(`${EX}SingletonUnion`);
    const enumeration = nn(`${EX}Enumeration`);
    const operand = nn(`${EX}Operand`);
    const individual = nn(`${EX}individual`);
    const singletonClassItems = rdfList("named-singleton", [operand]);
    const individualItems = rdfList("named-individual", [individual]);
    const input = datasetOf(
      declaration(emptyIntersection, `${OWL}Class`),
      declaration(singletonUnion, `${OWL}Class`),
      declaration(enumeration, `${OWL}Class`),
      declaration(operand, `${OWL}Class`),
      q(emptyIntersection, nn(`${OWL}intersectionOf`), nn(`${RDF}nil`)),
      q(singletonUnion, nn(`${OWL}unionOf`), singletonClassItems.head),
      singletonClassItems.quads,
      q(enumeration, nn(`${OWL}oneOf`), individualItems.head),
      individualItems.quads,
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const equivalentAxioms = [
      ...ontology.getAxiomsByType(OWLObjectKind.EQUIVALENT_CLASSES_AXIOM),
    ];

    expect(equivalentAxioms).toHaveLength(3);
    expect(
      equivalentAxioms.some(({ classExpressions }) =>
        classExpressions.some(({ iri }) => iri?.value === `${OWL}Thing`),
      ),
    ).toBe(true);
    expect(
      equivalentAxioms.some(({ classExpressions }) =>
        classExpressions.some(
          ({ kind }) => kind === OWLObjectKind.OBJECT_ONE_OF,
        ),
      ),
    ).toBe(true);
  });

  it("consumes standalone anonymous expression definitions without inventing axioms", async () => {
    const first = nn(`${EX}First`);
    const second = nn(`${EX}Second`);
    const expression = bn("standalone-expression");
    const operands = rdfList("standalone-operands", [first, second]);
    const input = datasetOf(
      declaration(first, `${OWL}Class`),
      declaration(second, `${OWL}Class`),
      declaration(expression, `${OWL}Class`),
      q(expression, nn(`${OWL}intersectionOf`), operands.head),
      operands.quads,
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);

    expect(ontology.getAxioms()).toHaveProperty("size", 2);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 2);
  });

  it("reconstructs nested class expressions through one ordered RDF-list decoder", async () => {
    const person = nn(`${EX}Person`);
    const parent = nn(`${EX}Parent`);
    const child = nn(`${EX}Child`);
    const hasChild = nn(`${EX}hasChild`);
    const restriction = bn("some-child");
    const intersection = bn("parent-expression");
    const operands = rdfList("intersection", [person, restriction]);
    const input = datasetOf(
      declaration(person, `${OWL}Class`),
      declaration(parent, `${OWL}Class`),
      declaration(child, `${OWL}Class`),
      declaration(hasChild, `${OWL}ObjectProperty`),
      declaration(restriction, `${OWL}Restriction`),
      q(restriction, nn(`${OWL}onProperty`), hasChild),
      q(restriction, nn(`${OWL}someValuesFrom`), child),
      q(intersection, nn(`${OWL}intersectionOf`), operands.head),
      operands.quads,
      q(parent, nn(`${OWL}equivalentClass`), intersection),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const [axiom] = ontology.getAxiomsByType(
      OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
    );
    const nested = axiom.classExpressions.find(
      ({ kind }) => kind === OWLObjectKind.OBJECT_INTERSECTION_OF,
    );

    expect(nested.operands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          iri: expect.objectContaining({ value: person.value }),
          kind: OWLObjectKind.CLASS,
        }),
        expect.objectContaining({
          filler: expect.objectContaining({
            iri: expect.objectContaining({ value: child.value }),
          }),
          kind: OWLObjectKind.OBJECT_SOME_VALUES_FROM,
          property: expect.objectContaining({
            iri: expect.objectContaining({ value: hasChild.value }),
          }),
        }),
      ]),
    );
  });

  it("rejects cyclic RDF lists deterministically", async () => {
    const expression = bn("expression");
    const list = bn("cycle");
    const input = datasetOf(
      q(expression, nn(`${OWL}intersectionOf`), list),
      q(list, nn(`${RDF}first`), nn(`${EX}A`)),
      q(list, nn(`${RDF}rest`), list),
      q(nn(`${EX}Subject`), nn(`${RDFS}subClassOf`), expression),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
  });

  it("keeps non-rdf:nil list termination strict while matching Java in compatible mode", async () => {
    const expression = bn("legacy-list-expression");
    const firstNode = bn("legacy-list-first");
    const secondNode = bn("legacy-list-second");
    const input = datasetOf(
      declaration(expression, `${OWL}Class`),
      q(expression, nn(`${OWL}intersectionOf`), firstNode),
      q(firstNode, nn(`${RDF}first`), nn(`${EX}First`)),
      q(firstNode, nn(`${RDF}rest`), secondNode),
      q(secondNode, nn(`${RDF}first`), nn(`${EX}Second`)),
      q(secondNode, nn(`${RDF}rest`), nn(RDF)),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });

    const configuration = new OWLOntologyLoaderConfiguration({
      parsingMode: "compatible",
    });
    const { context, ontology } = await new RdfToOwlTranslator().translate(
      input,
      { configuration },
    );

    expect(ontology.getAxioms()).toHaveProperty("size", 0);
    expect(context.diagnostics).toEqual([
      expect.objectContaining({
        code: "RDF_LIST_NON_NIL_TERMINATOR",
        severity: "warning",
        terminator: RDF,
      }),
    ]);
  });

  it("enforces the configured RDF-list length before decoding further items", async () => {
    const expression = bn("expression");
    const operands = rdfList("bounded", [nn(`${EX}A`), nn(`${EX}B`)]);
    const input = datasetOf(
      q(expression, nn(`${OWL}intersectionOf`), operands.head),
      operands.quads,
      q(nn(`${EX}Subject`), nn(`${RDFS}subClassOf`), expression),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      maxRdfListLength: 1,
    });

    await expect(
      new RdfToOwlTranslator().translate(input, { configuration }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxRdfListLength",
    });
  });

  it("covers every object class-expression family, including inverse properties and cardinalities", async () => {
    const subject = nn(`${EX}Subject`);
    const firstClass = nn(`${EX}First`);
    const secondClass = nn(`${EX}Second`);
    const property = nn(`${EX}relatedTo`);
    const individual = nn(`${EX}individual`);
    const inverse = bn("inverse-property");
    const union = bn("union");
    const unionItems = rdfList("union-items", [firstClass, secondClass]);
    const complement = bn("complement");
    const enumeration = bn("enumeration");
    const enumerationItems = rdfList("individual-items", [individual]);
    const all = restriction("all-values", inverse, "allValuesFrom", firstClass);
    const value = restriction("has-value", property, "hasValue", individual);
    const self = restriction(
      "has-self",
      property,
      "hasSelf",
      rdfDataFactory.literal(
        "true",
        nn("http://www.w3.org/2001/XMLSchema#boolean"),
      ),
    );
    const minimum = restriction(
      "minimum",
      property,
      "minCardinality",
      rdfDataFactory.literal(
        "1",
        nn("http://www.w3.org/2001/XMLSchema#nonNegativeInteger"),
      ),
    );
    const maximum = restriction(
      "maximum",
      property,
      "maxQualifiedCardinality",
      rdfDataFactory.literal(
        "2",
        nn("http://www.w3.org/2001/XMLSchema#nonNegativeInteger"),
      ),
      [q(bn("maximum"), nn(`${OWL}onClass`), secondClass)],
    );
    const exact = restriction(
      "exact",
      property,
      "qualifiedCardinality",
      rdfDataFactory.literal(
        "3",
        nn("http://www.w3.org/2001/XMLSchema#nonNegativeInteger"),
      ),
      [q(bn("exact"), nn(`${OWL}onClass`), firstClass)],
    );
    const expressions = [
      union,
      complement,
      enumeration,
      all.node,
      value.node,
      self.node,
      minimum.node,
      maximum.node,
      exact.node,
    ];
    const input = datasetOf(
      declaration(subject, `${OWL}Class`),
      declaration(firstClass, `${OWL}Class`),
      declaration(secondClass, `${OWL}Class`),
      declaration(property, `${OWL}ObjectProperty`),
      declaration(individual, `${OWL}NamedIndividual`),
      q(inverse, nn(`${OWL}inverseOf`), property),
      q(union, nn(`${OWL}unionOf`), unionItems.head),
      unionItems.quads,
      q(complement, nn(`${OWL}complementOf`), firstClass),
      q(enumeration, nn(`${OWL}oneOf`), enumerationItems.head),
      enumerationItems.quads,
      all.quads,
      value.quads,
      self.quads,
      minimum.quads,
      maximum.quads,
      exact.quads,
      expressions.map((expression) =>
        q(subject, nn(`${RDFS}subClassOf`), expression),
      ),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const kinds = new Set(
      [...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM)].map(
        ({ superClass }) => superClass.kind,
      ),
    );

    expect(kinds).toEqual(
      new Set([
        OWLObjectKind.OBJECT_UNION_OF,
        OWLObjectKind.OBJECT_COMPLEMENT_OF,
        OWLObjectKind.OBJECT_ONE_OF,
        OWLObjectKind.OBJECT_ALL_VALUES_FROM,
        OWLObjectKind.OBJECT_HAS_VALUE,
        OWLObjectKind.OBJECT_HAS_SELF,
        OWLObjectKind.OBJECT_MIN_CARDINALITY,
        OWLObjectKind.OBJECT_MAX_CARDINALITY,
        OWLObjectKind.OBJECT_EXACT_CARDINALITY,
      ]),
    );
    const allAxiom = [
      ...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM),
    ].find(
      ({ superClass }) =>
        superClass.kind === OWLObjectKind.OBJECT_ALL_VALUES_FROM,
    );
    expect(allAxiom.superClass.property).toMatchObject({
      inverse: expect.objectContaining({
        iri: expect.objectContaining({ value: property.value }),
      }),
      kind: OWLObjectKind.OBJECT_INVERSE_OF,
    });
  });

  it.each([
    ["nonNegativeInteger", "+01"],
    ["int", "1"],
    ["decimal", "1.000"],
    ["double", "1E0"],
  ])(
    "uses the integer value of a valid xsd:%s cardinality literal",
    async (datatype, lexicalForm) => {
      const subject = nn(`${EX}Subject`);
      const property = nn(`${EX}relatedTo`);
      const minimum = restriction(
        `minimum-${datatype}`,
        property,
        "minCardinality",
        rdfDataFactory.literal(lexicalForm, nn(`${XSD}${datatype}`)),
      );
      const input = datasetOf(
        declaration(subject, `${OWL}Class`),
        declaration(property, `${OWL}ObjectProperty`),
        minimum.quads,
        q(subject, nn(`${RDFS}subClassOf`), minimum.node),
      );

      const { ontology } = await new RdfToOwlTranslator().translate(input);
      const [axiom] = ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM);

      expect(axiom.superClass).toMatchObject({
        cardinality: 1,
        kind: OWLObjectKind.OBJECT_MIN_CARDINALITY,
      });
    },
  );

  it.each([
    ["string", "1"],
    ["decimal", "1.5"],
    ["integer", "-1"],
  ])(
    "rejects an xsd:%s cardinality literal without a non-negative integer value",
    async (datatype, lexicalForm) => {
      const subject = nn(`${EX}Subject`);
      const property = nn(`${EX}relatedTo`);
      const minimum = restriction(
        `invalid-minimum-${datatype}`,
        property,
        "minCardinality",
        rdfDataFactory.literal(lexicalForm, nn(`${XSD}${datatype}`)),
      );
      const input = datasetOf(
        declaration(subject, `${OWL}Class`),
        declaration(property, `${OWL}ObjectProperty`),
        minimum.quads,
        q(subject, nn(`${RDFS}subClassOf`), minimum.node),
      );

      await expect(
        new RdfToOwlTranslator().translate(input),
      ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    },
  );

  it("covers data restrictions, Boolean data ranges, enumerations, and facet restrictions", async () => {
    const subject = nn(`${EX}Subject`);
    const firstProperty = nn(`${EX}firstValue`);
    const secondProperty = nn(`${EX}secondValue`);
    const customDatatype = nn(`${EX}SmallInteger`);
    const stringDatatype = nn("http://www.w3.org/2001/XMLSchema#string");
    const integerDatatype = nn("http://www.w3.org/2001/XMLSchema#integer");
    const one = rdfDataFactory.literal(
      "1",
      nn("http://www.w3.org/2001/XMLSchema#integer"),
    );
    const two = rdfDataFactory.literal(
      "2",
      nn("http://www.w3.org/2001/XMLSchema#integer"),
    );
    const union = bn("data-union");
    const unionItems = rdfList("data-union-items", [
      stringDatatype,
      integerDatatype,
    ]);
    const intersection = bn("data-intersection");
    const intersectionItems = rdfList("data-intersection-items", [
      stringDatatype,
      integerDatatype,
    ]);
    const complement = bn("data-complement");
    const enumeration = bn("data-enumeration");
    const enumerationItems = rdfList("data-values", [one, two]);
    const datatypeRestriction = bn("datatype-restriction");
    const facet = bn("minimum-facet");
    const facets = rdfList("facet-items", [facet]);
    const some = restriction(
      "data-some",
      firstProperty,
      "someValuesFrom",
      union,
    );
    const all = restriction(
      "data-all",
      firstProperty,
      "allValuesFrom",
      intersection,
    );
    const value = restriction("data-value", firstProperty, "hasValue", one);
    const minimum = restriction(
      "data-minimum",
      firstProperty,
      "minCardinality",
      rdfDataFactory.literal(
        "1",
        nn("http://www.w3.org/2001/XMLSchema#nonNegativeInteger"),
      ),
    );
    const maximum = restriction(
      "data-maximum",
      firstProperty,
      "maxQualifiedCardinality",
      rdfDataFactory.literal(
        "2",
        nn("http://www.w3.org/2001/XMLSchema#nonNegativeInteger"),
      ),
      [q(bn("data-maximum"), nn(`${OWL}onDataRange`), complement)],
    );
    const exact = restriction(
      "data-exact",
      firstProperty,
      "qualifiedCardinality",
      rdfDataFactory.literal(
        "3",
        nn("http://www.w3.org/2001/XMLSchema#nonNegativeInteger"),
      ),
      [q(bn("data-exact"), nn(`${OWL}onDataRange`), enumeration)],
    );
    const propertyList = rdfList("data-properties", [
      firstProperty,
      secondProperty,
    ]);
    const multiProperty = bn("multi-property");
    const inputs = [
      some.node,
      all.node,
      value.node,
      minimum.node,
      maximum.node,
      exact.node,
      multiProperty,
    ];
    const input = datasetOf(
      declaration(subject, `${OWL}Class`),
      declaration(firstProperty, `${OWL}DatatypeProperty`),
      declaration(secondProperty, `${OWL}DatatypeProperty`),
      declaration(customDatatype, `${RDFS}Datatype`),
      q(union, nn(`${OWL}unionOf`), unionItems.head),
      unionItems.quads,
      q(intersection, nn(`${OWL}intersectionOf`), intersectionItems.head),
      intersectionItems.quads,
      q(complement, nn(`${OWL}datatypeComplementOf`), integerDatatype),
      q(enumeration, nn(`${OWL}oneOf`), enumerationItems.head),
      enumerationItems.quads,
      q(datatypeRestriction, nn(`${OWL}onDatatype`), integerDatatype),
      q(datatypeRestriction, nn(`${OWL}withRestrictions`), facets.head),
      facets.quads,
      q(facet, nn("http://www.w3.org/2001/XMLSchema#minInclusive"), one),
      q(customDatatype, nn(`${OWL}equivalentClass`), datatypeRestriction),
      some.quads,
      all.quads,
      value.quads,
      minimum.quads,
      maximum.quads,
      exact.quads,
      declaration(multiProperty, `${OWL}Restriction`),
      q(multiProperty, nn(`${OWL}onProperties`), propertyList.head),
      propertyList.quads,
      q(multiProperty, nn(`${OWL}someValuesFrom`), stringDatatype),
      inputs.map((expression) =>
        q(subject, nn(`${RDFS}subClassOf`), expression),
      ),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const kinds = new Set(
      [...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM)].map(
        ({ superClass }) => superClass.kind,
      ),
    );

    expect(kinds).toEqual(
      new Set([
        OWLObjectKind.DATA_SOME_VALUES_FROM,
        OWLObjectKind.DATA_ALL_VALUES_FROM,
        OWLObjectKind.DATA_HAS_VALUE,
        OWLObjectKind.DATA_MIN_CARDINALITY,
        OWLObjectKind.DATA_MAX_CARDINALITY,
        OWLObjectKind.DATA_EXACT_CARDINALITY,
      ]),
    );
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DATATYPE_DEFINITION_AXIOM),
    ).toHaveProperty("size", 1);
    const definition = [
      ...ontology.getAxiomsByType(OWLObjectKind.DATATYPE_DEFINITION_AXIOM),
    ][0];
    expect(definition.dataRange).toMatchObject({
      facetRestrictions: [
        expect.objectContaining({ kind: OWLObjectKind.FACET_RESTRICTION }),
      ],
      kind: OWLObjectKind.DATATYPE_RESTRICTION,
    });
  });

  it("maps an empty OWL 1 data-range enumeration to the complement of rdfs:Literal", async () => {
    const property = nn(`${EX}legacyDataProperty`);
    const dataRange = bn("legacy-empty-data-range");
    const input = datasetOf(
      declaration(property, `${OWL}DatatypeProperty`),
      declaration(dataRange, `${OWL}DataRange`),
      q(dataRange, nn(`${OWL}oneOf`), nn(`${RDF}nil`)),
      q(property, nn(`${RDFS}range`), dataRange),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const [rangeAxiom] = ontology.getAxiomsByType(
      OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
    );

    expect(rangeAxiom.range).toMatchObject({
      operand: {
        iri: { value: `${RDFS}Literal` },
        kind: OWLObjectKind.DATATYPE,
      },
      kind: OWLObjectKind.DATA_COMPLEMENT_OF,
    });
  });
});
