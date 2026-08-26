import {
  CLASS_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  IRI,
  OWLDataFactory,
  OWLOntology,
} from "../../model/index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";
import { OwlToRdfTranslator } from "./owlToRdfTranslator.js";
import { datasetsAreIsomorphic } from "../../util/rdf-dataset-isomorphism.mjs";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_SUBCLASS = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_LITERAL = "http://www.w3.org/2000/01/rdf-schema#Literal";
const OWL = "http://www.w3.org/2002/07/owl#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const EX = "https://example.com/owl-to-rdf#";

const nn = (value) => rdfDataFactory.namedNode(value);
const bn = (value) => rdfDataFactory.blankNode(value);
const q = (subject, predicate, object) =>
  rdfDataFactory.quad(subject, nn(predicate), object);

const ontologyWithSuperclass = (factory, superclass) =>
  new OWLOntology({
    axioms: [
      factory.getOWLSubClassOfAxiom(
        factory.getOWLClass(IRI.create(`${EX}Subject`)),
        superclass,
      ),
    ],
    ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}ontology`)),
  });

const superclassNode = (dataset) =>
  [...dataset.match(nn(`${EX}Subject`), nn(RDFS_SUBCLASS), null)][0].object;

describe("OwlToRdfTranslator class expressions", () => {
  it("maps an object some-values-from superclass through its fresh main node", () => {
    // Dropping the recursive restriction triples would preserve a plausible
    // subclass edge while silently changing its superclass semantics.
    const factory = new OWLDataFactory();
    const owlClass = factory.getOWLClass(IRI.create(`${EX}Child`));
    const property = factory.getOWLObjectProperty(IRI.create(`${EX}hasParent`));
    const filler = factory.getOWLClass(IRI.create(`${EX}Person`));
    const ontology = new OWLOntology({
      axioms: [
        factory.getOWLSubClassOfAxiom(
          owlClass,
          factory.getOWLObjectSomeValuesFrom(property, filler),
        ),
      ],
      ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}ontology`)),
    });

    const actual = new OwlToRdfTranslator().translate(ontology);
    const restriction = bn("restriction");
    const expected = rdfDatasetFactory.dataset([
      q(nn(`${EX}ontology`), RDF_TYPE, nn(`${OWL}Ontology`)),
      q(nn(`${EX}Child`), RDFS_SUBCLASS, restriction),
      q(restriction, RDF_TYPE, nn(`${OWL}Restriction`)),
      q(restriction, `${OWL}onProperty`, nn(`${EX}hasParent`)),
      q(restriction, `${OWL}someValuesFrom`, nn(`${EX}Person`)),
    ]);

    expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
  });

  it("selects every qualified and unqualified cardinality predicate", () => {
    // Qualified cardinalities are not shorthand for their unqualified forms:
    // the predicate and explicit filler triple are both semantically material.
    const factory = new OWLDataFactory();
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create(`${EX}objectProperty`),
    );
    const dataProperty = factory.getOWLDataProperty(
      IRI.create(`${EX}dataProperty`),
    );
    const owlClass = factory.getOWLClass(IRI.create(`${EX}Filler`));
    const datatype = factory.getOWLDatatype(IRI.create(`${XSD}string`));
    const cases = [
      ["getOWLObjectMinCardinality", [1, objectProperty], "minCardinality"],
      [
        "getOWLObjectMinCardinality",
        [1, objectProperty, owlClass],
        "minQualifiedCardinality",
        "onClass",
      ],
      ["getOWLObjectMaxCardinality", [2, objectProperty], "maxCardinality"],
      [
        "getOWLObjectMaxCardinality",
        [2, objectProperty, owlClass],
        "maxQualifiedCardinality",
        "onClass",
      ],
      ["getOWLObjectExactCardinality", [3, objectProperty], "cardinality"],
      [
        "getOWLObjectExactCardinality",
        [3, objectProperty, owlClass],
        "qualifiedCardinality",
        "onClass",
      ],
      ["getOWLDataMinCardinality", [1, dataProperty], "minCardinality"],
      [
        "getOWLDataMinCardinality",
        [1, dataProperty, datatype],
        "minQualifiedCardinality",
        "onDataRange",
      ],
      ["getOWLDataMaxCardinality", [2, dataProperty], "maxCardinality"],
      [
        "getOWLDataMaxCardinality",
        [2, dataProperty, datatype],
        "maxQualifiedCardinality",
        "onDataRange",
      ],
      ["getOWLDataExactCardinality", [3, dataProperty], "cardinality"],
      [
        "getOWLDataExactCardinality",
        [3, dataProperty, datatype],
        "qualifiedCardinality",
        "onDataRange",
      ],
    ];

    for (const [method, args, cardinalityPredicate, fillerPredicate] of cases) {
      const expression = factory[method](...args);
      const dataset = new OwlToRdfTranslator().translate(
        ontologyWithSuperclass(factory, expression),
      );
      const restriction = superclassNode(dataset);

      expect(
        dataset.match(restriction, nn(`${OWL}${cardinalityPredicate}`), null)
          .size,
      ).toBe(1);
      expect(
        dataset.match(restriction, nn(`${OWL}onClass`), null).size +
          dataset.match(restriction, nn(`${OWL}onDataRange`), null).size,
      ).toBe(fillerPredicate ? 1 : 0);
      if (fillerPredicate) {
        expect(
          dataset.match(restriction, nn(`${OWL}${fillerPredicate}`), null).size,
        ).toBe(1);
      }
    }
  });

  it("maps multi-property data restrictions and the remaining recursive forms", () => {
    const factory = new OWLDataFactory();
    const first = factory.getOWLDataProperty(IRI.create(`${EX}firstData`));
    const second = factory.getOWLDataProperty(IRI.create(`${EX}secondData`));
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create(`${EX}objectProperty`),
    );
    const string = factory.getOWLDatatype(IRI.create(`${XSD}string`));
    const integer = factory.getOWLDatatype(IRI.create(`${XSD}integer`));
    const dataRange = factory.getOWLDataIntersectionOf([
      string,
      factory.getOWLDataComplementOf(integer),
    ]);
    const axioms = [
      factory.getOWLSubClassOfAxiom(
        factory.getOWLClass(IRI.create(`${EX}SelfSubject`)),
        factory.getOWLObjectHasSelf(objectProperty),
      ),
      factory.getOWLSubClassOfAxiom(
        factory.getOWLClass(IRI.create(`${EX}AllSubject`)),
        factory.getOWLDataAllValuesFrom([first, second], dataRange),
      ),
      factory.getOWLSubClassOfAxiom(
        factory.getOWLClass(IRI.create(`${EX}ValueSubject`)),
        factory.getOWLDataHasValue(first, factory.getOWLLiteral("value")),
      ),
    ];
    const dataset = new OwlToRdfTranslator().translate(
      new OWLOntology({
        axioms,
        ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}ontology`)),
      }),
    );

    expect(
      dataset.match(
        null,
        nn(`${OWL}hasSelf`),
        rdfDataFactory.literal("true", nn(`${XSD}boolean`)),
      ).size,
    ).toBe(1);
    expect(dataset.match(null, nn(`${OWL}onProperties`), null).size).toBe(1);
    expect(dataset.match(null, nn(`${OWL}allValuesFrom`), null).size).toBe(1);
    expect(dataset.match(null, nn(`${OWL}intersectionOf`), null).size).toBe(1);
    expect(
      dataset.match(null, nn(`${OWL}datatypeComplementOf`), null).size,
    ).toBe(1);
    expect(dataset.match(null, nn(`${OWL}hasValue`), null).size).toBe(1);
  });

  it("uses rdfs:Literal as the unqualified data-cardinality sentinel", () => {
    const factory = new OWLDataFactory();
    const dataProperty = factory.getOWLDataProperty(
      IRI.create(`${EX}dataProperty`),
    );
    const expression = factory.getOWLDataMinCardinality(
      1,
      dataProperty,
      factory.getOWLDatatype(IRI.create(RDFS_LITERAL)),
    );
    const dataset = new OwlToRdfTranslator().translate(
      ontologyWithSuperclass(factory, expression),
    );
    const restriction = superclassNode(dataset);

    expect(
      dataset.match(restriction, nn(`${OWL}minCardinality`), null).size,
    ).toBe(1);
    expect(dataset.match(restriction, nn(`${OWL}onDataRange`), null).size).toBe(
      0,
    );
  });

  it("keeps the finite expression inventory exhaustive", () => {
    // This inventory is coupled intentionally to the canonical taxonomy. A new
    // structural kind must acquire both a representative and a mapping rule.
    const factory = new OWLDataFactory();
    const firstClass = factory.getOWLClass(IRI.create(`${EX}FirstClass`));
    const secondClass = factory.getOWLClass(IRI.create(`${EX}SecondClass`));
    const individual = factory.getOWLNamedIndividual(
      IRI.create(`${EX}Individual`),
    );
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create(`${EX}objectProperty`),
    );
    const dataProperty = factory.getOWLDataProperty(
      IRI.create(`${EX}dataProperty`),
    );
    const string = factory.getOWLDatatype(IRI.create(`${XSD}string`));
    const integer = factory.getOWLDatatype(IRI.create(`${XSD}integer`));
    const literal = factory.getOWLLiteral("value");
    const classExpressions = [
      firstClass,
      factory.getOWLObjectIntersectionOf([firstClass, secondClass]),
      factory.getOWLObjectUnionOf([firstClass, secondClass]),
      factory.getOWLObjectComplementOf(firstClass),
      factory.getOWLObjectOneOf([individual]),
      factory.getOWLObjectSomeValuesFrom(objectProperty, firstClass),
      factory.getOWLObjectAllValuesFrom(objectProperty, firstClass),
      factory.getOWLObjectHasValue(objectProperty, individual),
      factory.getOWLObjectHasSelf(objectProperty),
      factory.getOWLObjectMinCardinality(1, objectProperty, firstClass),
      factory.getOWLObjectMaxCardinality(1, objectProperty, firstClass),
      factory.getOWLObjectExactCardinality(1, objectProperty, firstClass),
      factory.getOWLDataSomeValuesFrom([dataProperty], string),
      factory.getOWLDataAllValuesFrom([dataProperty], string),
      factory.getOWLDataHasValue(dataProperty, literal),
      factory.getOWLDataMinCardinality(1, dataProperty, string),
      factory.getOWLDataMaxCardinality(1, dataProperty, string),
      factory.getOWLDataExactCardinality(1, dataProperty, string),
    ];
    const dataRanges = [
      string,
      factory.getOWLDataIntersectionOf([string, integer]),
      factory.getOWLDataUnionOf([string, integer]),
      factory.getOWLDataComplementOf(integer),
      factory.getOWLDataOneOf([literal]),
      factory.getOWLDatatypeRestriction(string, [
        factory.getOWLFacetRestriction(
          IRI.create(`${XSD}minLength`),
          factory.getOWLLiteral("1", integer),
        ),
      ]),
    ];

    expect(classExpressions.map(({ kind }) => kind).sort()).toEqual(
      [...CLASS_EXPRESSION_KINDS].sort(),
    );
    expect(dataRanges.map(({ kind }) => kind).sort()).toEqual(
      [...DATA_RANGE_KINDS].sort(),
    );
    for (const expression of classExpressions) {
      expect(() =>
        new OwlToRdfTranslator().translate(
          ontologyWithSuperclass(factory, expression),
        ),
      ).not.toThrow();
    }
    for (const dataRange of dataRanges) {
      expect(() =>
        new OwlToRdfTranslator().translate(
          new OWLOntology({
            axioms: [
              factory.getOWLDataPropertyRangeAxiom(dataProperty, dataRange),
            ],
            ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}ontology`)),
          }),
        ),
      ).not.toThrow();
    }
  });
});
