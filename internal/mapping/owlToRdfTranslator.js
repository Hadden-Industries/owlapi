import {
  ANNOTATION_VALUE_KINDS,
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind,
} from "../../model/kinds.js";
import {
  dispatchAnnotationValue,
  dispatchAxiom,
  dispatchClassExpression,
  dispatchDataPropertyExpression,
  dispatchDataRange,
  dispatchIndividual,
  dispatchObjectPropertyExpression,
} from "../../model/dispatch.js";
import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";
import {
  OWL_VOCABULARY,
  RDF_NAMESPACE,
  RDF_VOCABULARY,
  RDFS_VOCABULARY,
  XSD_VOCABULARY,
} from "../rdfjs/vocabulary.js";

const GRAPH_TERM_TYPES = new Set(["BlankNode", "DefaultGraph", "NamedNode"]);
const RDF_PLAIN_LITERAL = `${RDF_NAMESPACE}PlainLiteral`;
const ENTITY_DECLARATION_TYPES = Object.freeze({
  [OWLObjectKind.ANNOTATION_PROPERTY]: OWL_VOCABULARY.AnnotationProperty,
  [OWLObjectKind.CLASS]: OWL_VOCABULARY.Class,
  [OWLObjectKind.DATA_PROPERTY]: OWL_VOCABULARY.DatatypeProperty,
  [OWLObjectKind.DATATYPE]: RDFS_VOCABULARY.Datatype,
  [OWLObjectKind.NAMED_INDIVIDUAL]: OWL_VOCABULARY.NamedIndividual,
  [OWLObjectKind.OBJECT_PROPERTY]: OWL_VOCABULARY.ObjectProperty,
});

const requireMethod = (value, method, name) => {
  if (typeof value?.[method] !== "function") {
    throw new TypeError(`${name} must implement ${method}()`);
  }
};

const assertCompleteHandlers = (handlers, kinds, category) => {
  const missing = kinds.filter((kind) => typeof handlers[kind] !== "function");
  const extra = Object.keys(handlers).filter((kind) => !kinds.includes(kind));
  if (missing.length || extra.length) {
    throw new TypeError(
      `Incomplete ${category} RDF mapping; missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}`,
    );
  }
  return Object.freeze(handlers);
};

// Category dispatch catches missing rules inside each family. This second guard
// also catches a newly introduced top-level OWL kind that was not assigned to a
// family at all, before an ontology can be translated incompletely.
const assertTranslatorTaxonomyCoverage = () => {
  const covered = new Set([
    ...ANNOTATION_VALUE_KINDS,
    ...AXIOM_KINDS,
    ...CLASS_EXPRESSION_KINDS,
    ...DATA_PROPERTY_EXPRESSION_KINDS,
    ...DATA_RANGE_KINDS,
    ...ENTITY_KINDS,
    ...INDIVIDUAL_KINDS,
    ...OBJECT_PROPERTY_EXPRESSION_KINDS,
    OWLObjectKind.ANNOTATION,
    OWLObjectKind.FACET_RESTRICTION,
    OWLObjectKind.IMPORTS_DECLARATION,
    OWLObjectKind.ONTOLOGY_ID,
  ]);
  const missing = OWL_OBJECT_KINDS.filter((kind) => !covered.has(kind));
  if (missing.length) {
    throw new TypeError(
      `OWL-to-RDF translator taxonomy is missing: ${missing.join(", ")}`,
    );
  }
  const missingEntityMappings = ENTITY_KINDS.filter(
    (kind) => !Object.hasOwn(ENTITY_DECLARATION_TYPES, kind),
  );
  if (missingEntityMappings.length) {
    throw new TypeError(
      `OWL-to-RDF declaration mapping is missing: ${missingEntityMappings.join(", ")}`,
    );
  }
};

class TranslationSession {
  #anonymousIndividuals = new Map();
  #axiomHandlers;
  #classExpressionHandlers;
  #dataFactory;
  #dataPropertyExpressionHandlers;
  #dataRangeHandlers;
  #dataset;
  #graph;
  #individualHandlers;
  #objectPropertyExpressionHandlers;

  constructor({ dataFactory, dataset, graph }) {
    this.#dataFactory = dataFactory;
    this.#dataset = dataset;
    this.#graph = graph;

    // These maps are deliberately exhaustive instead of relying on a default
    // switch branch. Adding a model kind therefore requires an explicit mapping
    // decision before the translator can silently accept it.
    this.#classExpressionHandlers = assertCompleteHandlers(
      {
        [OWLObjectKind.CLASS]: (expression) =>
          this.#namedNode(expression.iri.value),
        [OWLObjectKind.OBJECT_INTERSECTION_OF]: (expression) =>
          this.#mapBooleanClassExpression(
            expression.operands,
            OWL_VOCABULARY.intersectionOf,
          ),
        [OWLObjectKind.OBJECT_UNION_OF]: (expression) =>
          this.#mapBooleanClassExpression(
            expression.operands,
            OWL_VOCABULARY.unionOf,
          ),
        [OWLObjectKind.OBJECT_COMPLEMENT_OF]: (expression) =>
          this.#mapComplementClassExpression(expression),
        [OWLObjectKind.OBJECT_ONE_OF]: (expression) =>
          this.#mapObjectOneOf(expression),
        [OWLObjectKind.OBJECT_SOME_VALUES_FROM]: (expression) =>
          this.#mapObjectQuantifiedRestriction(
            expression,
            OWL_VOCABULARY.someValuesFrom,
          ),
        [OWLObjectKind.OBJECT_ALL_VALUES_FROM]: (expression) =>
          this.#mapObjectQuantifiedRestriction(
            expression,
            OWL_VOCABULARY.allValuesFrom,
          ),
        [OWLObjectKind.OBJECT_HAS_VALUE]: (expression) =>
          this.#mapObjectHasValue(expression),
        [OWLObjectKind.OBJECT_HAS_SELF]: (expression) =>
          this.#mapObjectHasSelf(expression),
        [OWLObjectKind.OBJECT_MIN_CARDINALITY]: (expression) =>
          this.#mapObjectCardinality(
            expression,
            OWL_VOCABULARY.minCardinality,
            OWL_VOCABULARY.minQualifiedCardinality,
          ),
        [OWLObjectKind.OBJECT_MAX_CARDINALITY]: (expression) =>
          this.#mapObjectCardinality(
            expression,
            OWL_VOCABULARY.maxCardinality,
            OWL_VOCABULARY.maxQualifiedCardinality,
          ),
        [OWLObjectKind.OBJECT_EXACT_CARDINALITY]: (expression) =>
          this.#mapObjectCardinality(
            expression,
            OWL_VOCABULARY.cardinality,
            OWL_VOCABULARY.qualifiedCardinality,
          ),
        [OWLObjectKind.DATA_SOME_VALUES_FROM]: (expression) =>
          this.#mapDataQuantifiedRestriction(
            expression,
            OWL_VOCABULARY.someValuesFrom,
          ),
        [OWLObjectKind.DATA_ALL_VALUES_FROM]: (expression) =>
          this.#mapDataQuantifiedRestriction(
            expression,
            OWL_VOCABULARY.allValuesFrom,
          ),
        [OWLObjectKind.DATA_HAS_VALUE]: (expression) =>
          this.#mapDataHasValue(expression),
        [OWLObjectKind.DATA_MIN_CARDINALITY]: (expression) =>
          this.#mapDataCardinality(
            expression,
            OWL_VOCABULARY.minCardinality,
            OWL_VOCABULARY.minQualifiedCardinality,
          ),
        [OWLObjectKind.DATA_MAX_CARDINALITY]: (expression) =>
          this.#mapDataCardinality(
            expression,
            OWL_VOCABULARY.maxCardinality,
            OWL_VOCABULARY.maxQualifiedCardinality,
          ),
        [OWLObjectKind.DATA_EXACT_CARDINALITY]: (expression) =>
          this.#mapDataCardinality(
            expression,
            OWL_VOCABULARY.cardinality,
            OWL_VOCABULARY.qualifiedCardinality,
          ),
      },
      CLASS_EXPRESSION_KINDS,
      "class-expression",
    );

    this.#dataRangeHandlers = assertCompleteHandlers(
      {
        [OWLObjectKind.DATATYPE]: (dataRange) =>
          this.#namedNode(dataRange.iri.value),
        [OWLObjectKind.DATA_INTERSECTION_OF]: (dataRange) =>
          this.#mapBooleanDataRange(
            dataRange.operands,
            OWL_VOCABULARY.intersectionOf,
          ),
        [OWLObjectKind.DATA_UNION_OF]: (dataRange) =>
          this.#mapBooleanDataRange(dataRange.operands, OWL_VOCABULARY.unionOf),
        [OWLObjectKind.DATA_COMPLEMENT_OF]: (dataRange) =>
          this.#mapComplementDataRange(dataRange),
        [OWLObjectKind.DATA_ONE_OF]: (dataRange) =>
          this.#mapDataOneOf(dataRange),
        [OWLObjectKind.DATATYPE_RESTRICTION]: (dataRange) =>
          this.#mapDatatypeRestriction(dataRange),
      },
      DATA_RANGE_KINDS,
      "data-range",
    );

    this.#objectPropertyExpressionHandlers = assertCompleteHandlers(
      {
        [OWLObjectKind.OBJECT_PROPERTY]: (property) =>
          this.#namedNode(property.iri.value),
        [OWLObjectKind.OBJECT_INVERSE_OF]: (property) =>
          this.#mapInverseObjectProperty(property),
      },
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "object-property-expression",
    );

    this.#dataPropertyExpressionHandlers = assertCompleteHandlers(
      {
        [OWLObjectKind.DATA_PROPERTY]: (property) =>
          this.#namedNode(property.iri.value),
      },
      DATA_PROPERTY_EXPRESSION_KINDS,
      "data-property-expression",
    );

    this.#individualHandlers = assertCompleteHandlers(
      {
        [OWLObjectKind.NAMED_INDIVIDUAL]: (individual) =>
          this.#namedNode(individual.iri.value),
        [OWLObjectKind.ANONYMOUS_INDIVIDUAL]: (individual) =>
          this.#anonymousIndividual(individual),
      },
      INDIVIDUAL_KINDS,
      "individual",
    );

    this.#axiomHandlers = assertCompleteHandlers(
      {
        [OWLObjectKind.DECLARATION_AXIOM]: (axiom) =>
          this.#mapDeclarationAxiom(axiom),
        [OWLObjectKind.SUBCLASS_OF_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapClassExpression(axiom.subClass),
            RDFS_VOCABULARY.subClassOf,
            this.#mapClassExpression(axiom.superClass),
            axiom.annotations,
          ),
        [OWLObjectKind.EQUIVALENT_CLASSES_AXIOM]: (axiom) =>
          this.#mapPairwiseAxiom(
            axiom.classExpressions,
            (value) => this.#mapClassExpression(value),
            OWL_VOCABULARY.equivalentClass,
            axiom.annotations,
          ),
        [OWLObjectKind.DISJOINT_CLASSES_AXIOM]: (axiom) =>
          this.#mapDisjointAxiom({
            annotations: axiom.annotations,
            binaryPredicate: OWL_VOCABULARY.disjointWith,
            nodeType: OWL_VOCABULARY.AllDisjointClasses,
            values: axiom.classExpressions,
            valueMapper: (value) => this.#mapClassExpression(value),
          }),
        [OWLObjectKind.DISJOINT_UNION_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#namedNode(axiom.owlClass.iri.value),
            OWL_VOCABULARY.disjointUnionOf,
            this.#createList(
              [...axiom.classExpressions].map((value) =>
                this.#mapClassExpression(value),
              ),
            ),
            axiom.annotations,
          ),
        [OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapObjectPropertyExpression(axiom.subProperty),
            RDFS_VOCABULARY.subPropertyOf,
            this.#mapObjectPropertyExpression(axiom.superProperty),
            axiom.annotations,
          ),
        [OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapObjectPropertyExpression(axiom.superProperty),
            OWL_VOCABULARY.propertyChainAxiom,
            this.#createList(
              axiom.chain.map((value) =>
                this.#mapObjectPropertyExpression(value),
              ),
            ),
            axiom.annotations,
          ),
        [OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM]: (axiom) =>
          this.#mapPairwiseAxiom(
            axiom.properties,
            (value) => this.#mapObjectPropertyExpression(value),
            OWL_VOCABULARY.equivalentProperty,
            axiom.annotations,
          ),
        [OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM]: (axiom) =>
          this.#mapDisjointAxiom({
            annotations: axiom.annotations,
            binaryPredicate: OWL_VOCABULARY.propertyDisjointWith,
            nodeType: OWL_VOCABULARY.AllDisjointProperties,
            values: axiom.properties,
            valueMapper: (value) => this.#mapObjectPropertyExpression(value),
          }),
        [OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapObjectPropertyExpression(axiom.property),
            RDFS_VOCABULARY.domain,
            this.#mapClassExpression(axiom.domain),
            axiom.annotations,
          ),
        [OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapObjectPropertyExpression(axiom.property),
            RDFS_VOCABULARY.range,
            this.#mapClassExpression(axiom.range),
            axiom.annotations,
          ),
        [OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapObjectPropertyExpression(axiom.properties[0]),
            OWL_VOCABULARY.inverseOf,
            this.#mapObjectPropertyExpression(axiom.properties[1]),
            axiom.annotations,
          ),
        [OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.FunctionalProperty,
          ),
        [OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.InverseFunctionalProperty,
          ),
        [OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.ReflexiveProperty,
          ),
        [OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.IrreflexiveProperty,
          ),
        [OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.SymmetricProperty,
          ),
        [OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.AsymmetricProperty,
          ),
        [OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.TransitiveProperty,
          ),
        [OWLObjectKind.SUB_DATA_PROPERTY_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapDataPropertyExpression(axiom.subProperty),
            RDFS_VOCABULARY.subPropertyOf,
            this.#mapDataPropertyExpression(axiom.superProperty),
            axiom.annotations,
          ),
        [OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM]: (axiom) =>
          this.#mapPairwiseAxiom(
            axiom.properties,
            (value) => this.#mapDataPropertyExpression(value),
            OWL_VOCABULARY.equivalentProperty,
            axiom.annotations,
          ),
        [OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM]: (axiom) =>
          this.#mapDisjointAxiom({
            annotations: axiom.annotations,
            binaryPredicate: OWL_VOCABULARY.propertyDisjointWith,
            nodeType: OWL_VOCABULARY.AllDisjointProperties,
            values: axiom.properties,
            valueMapper: (value) => this.#mapDataPropertyExpression(value),
          }),
        [OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapDataPropertyExpression(axiom.property),
            RDFS_VOCABULARY.domain,
            this.#mapClassExpression(axiom.domain),
            axiom.annotations,
          ),
        [OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapDataPropertyExpression(axiom.property),
            RDFS_VOCABULARY.range,
            this.#mapDataRange(axiom.range),
            axiom.annotations,
          ),
        [OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM]: (axiom) =>
          this.#mapPropertyCharacteristic(
            axiom,
            OWL_VOCABULARY.FunctionalProperty,
            true,
          ),
        [OWLObjectKind.DATATYPE_DEFINITION_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#namedNode(axiom.datatype.iri.value),
            OWL_VOCABULARY.equivalentClass,
            this.#mapDataRange(axiom.dataRange),
            axiom.annotations,
          ),
        [OWLObjectKind.HAS_KEY_AXIOM]: (axiom) => this.#mapHasKeyAxiom(axiom),
        [OWLObjectKind.SAME_INDIVIDUAL_AXIOM]: (axiom) =>
          this.#mapPairwiseAxiom(
            axiom.individuals,
            (value) => this.#mapIndividual(value),
            OWL_VOCABULARY.sameAs,
            axiom.annotations,
          ),
        [OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM]: (axiom) =>
          this.#mapDifferentIndividualsAxiom(axiom),
        [OWLObjectKind.CLASS_ASSERTION_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapIndividual(axiom.individual),
            RDF_VOCABULARY.type,
            this.#mapClassExpression(axiom.classExpression),
            axiom.annotations,
          ),
        [OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM]: (axiom) =>
          this.#mapObjectPropertyAssertionAxiom(axiom),
        [OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM]: (axiom) =>
          this.#mapNegativePropertyAssertionAxiom(axiom, false),
        [OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapIndividual(axiom.subject),
            this.#mapDataPropertyExpression(axiom.property),
            this.#mapLiteral(axiom.value),
            axiom.annotations,
          ),
        [OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM]: (axiom) =>
          this.#mapNegativePropertyAssertionAxiom(axiom, true),
        [OWLObjectKind.ANNOTATION_ASSERTION_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#mapAnnotationSubject(axiom.subject),
            this.#namedNode(axiom.property.iri.value),
            this.#mapAnnotationValue(axiom.value),
            axiom.annotations,
          ),
        [OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#namedNode(axiom.subProperty.iri.value),
            RDFS_VOCABULARY.subPropertyOf,
            this.#namedNode(axiom.superProperty.iri.value),
            axiom.annotations,
          ),
        [OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#namedNode(axiom.property.iri.value),
            RDFS_VOCABULARY.domain,
            this.#namedNode(axiom.domain.value),
            axiom.annotations,
          ),
        [OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM]: (axiom) =>
          this.#addAnnotatedMainTriple(
            this.#namedNode(axiom.property.iri.value),
            RDFS_VOCABULARY.range,
            this.#namedNode(axiom.range.value),
            axiom.annotations,
          ),
      },
      AXIOM_KINDS,
      "axiom",
    );
  }

  translateOntology(ontology) {
    const ontologyID = ontology.getOntologyID();
    const ontologyNode = ontologyID.ontologyIRI
      ? this.#namedNode(ontologyID.ontologyIRI.value)
      : this.#dataFactory.blankNode();

    this.#add(
      ontologyNode,
      RDF_VOCABULARY.type,
      this.#namedNode(OWL_VOCABULARY.Ontology),
    );
    if (ontologyID.versionIRI) {
      this.#add(
        ontologyNode,
        OWL_VOCABULARY.versionIRI,
        this.#namedNode(ontologyID.versionIRI.value),
      );
    }
    for (const declaration of ontology.getImportsDeclarations()) {
      this.#add(
        ontologyNode,
        OWL_VOCABULARY.imports,
        this.#namedNode(declaration.iri.value),
      );
    }
    this.#addAnnotations(ontologyNode, ontology.getAnnotations());
    for (const axiom of ontology.getAxioms()) {
      dispatchAxiom(axiom, this.#axiomHandlers);
    }

    return this.#dataset;
  }

  #mapDeclarationAxiom(axiom) {
    this.#addAnnotatedMainTriple(
      this.#namedNode(axiom.entity.iri.value),
      RDF_VOCABULARY.type,
      this.#namedNode(ENTITY_DECLARATION_TYPES[axiom.entity.kind]),
      axiom.annotations,
    );
  }

  #mapPairwiseAxiom(values, mapper, predicate, annotations) {
    const terms = [...values].map(mapper);
    for (let index = 0; index < terms.length - 1; index += 1) {
      // OWL n-ary equivalence and equality map to a connected chain, not all
      // O(n²) pairs. Annotations apply independently to every generated triple.
      this.#addAnnotatedMainTriple(
        terms[index],
        predicate,
        terms[index + 1],
        annotations,
      );
    }
  }

  #mapDisjointAxiom({
    annotations,
    binaryPredicate,
    nodeType,
    values,
    valueMapper,
  }) {
    const terms = [...values].map(valueMapper);
    if (terms.length === 2) {
      this.#addAnnotatedMainTriple(
        terms[0],
        binaryPredicate,
        terms[1],
        annotations,
      );
      return;
    }

    const axiomNode = this.#dataFactory.blankNode();
    this.#add(axiomNode, RDF_VOCABULARY.type, this.#namedNode(nodeType));
    this.#add(axiomNode, OWL_VOCABULARY.members, this.#createList(terms));
    // N-ary disjointness already has a native RDF axiom node, so its OWL
    // annotations attach there directly rather than through owl:Axiom.
    this.#addAnnotations(axiomNode, annotations);
  }

  #mapPropertyCharacteristic(axiom, characteristic, dataProperty = false) {
    this.#addAnnotatedMainTriple(
      dataProperty
        ? this.#mapDataPropertyExpression(axiom.property)
        : this.#mapObjectPropertyExpression(axiom.property),
      RDF_VOCABULARY.type,
      this.#namedNode(characteristic),
      axiom.annotations,
    );
  }

  #mapHasKeyAxiom(axiom) {
    const properties = [
      ...axiom.objectProperties.map((property) =>
        this.#mapObjectPropertyExpression(property),
      ),
      ...axiom.dataProperties.map((property) =>
        this.#mapDataPropertyExpression(property),
      ),
    ];
    this.#addAnnotatedMainTriple(
      this.#mapClassExpression(axiom.classExpression),
      OWL_VOCABULARY.hasKey,
      this.#createList(properties),
      axiom.annotations,
    );
  }

  #mapDifferentIndividualsAxiom(axiom) {
    const individuals = [...axiom.individuals].map((individual) =>
      this.#mapIndividual(individual),
    );
    if (individuals.length === 2) {
      this.#addAnnotatedMainTriple(
        individuals[0],
        OWL_VOCABULARY.differentFrom,
        individuals[1],
        axiom.annotations,
      );
      return;
    }

    const axiomNode = this.#dataFactory.blankNode();
    this.#add(
      axiomNode,
      RDF_VOCABULARY.type,
      this.#namedNode(OWL_VOCABULARY.AllDifferent),
    );
    // OWL 2 Mapping to RDF uses owl:members. owl:distinctMembers is retained
    // only as an accepted legacy input by the inverse translator.
    this.#add(axiomNode, OWL_VOCABULARY.members, this.#createList(individuals));
    this.#addAnnotations(axiomNode, axiom.annotations);
  }

  #mapObjectPropertyAssertionAxiom(axiom) {
    let subject = this.#mapIndividual(axiom.subject);
    let object = this.#mapIndividual(axiom.value);
    let property = axiom.property;

    // Positive assertions over ObjectInverseOf(P) normalize to the ordinary P
    // triple with subject and object exchanged, as required by the W3C mapping.
    if (property.kind === OWLObjectKind.OBJECT_INVERSE_OF) {
      [subject, object] = [object, subject];
      property = property.inverse;
    }
    this.#addAnnotatedMainTriple(
      subject,
      this.#mapObjectPropertyExpression(property),
      object,
      axiom.annotations,
    );
  }

  #mapNegativePropertyAssertionAxiom(axiom, dataProperty) {
    const axiomNode = this.#dataFactory.blankNode();
    this.#add(
      axiomNode,
      RDF_VOCABULARY.type,
      this.#namedNode(OWL_VOCABULARY.NegativePropertyAssertion),
    );
    this.#add(
      axiomNode,
      OWL_VOCABULARY.sourceIndividual,
      this.#mapIndividual(axiom.subject),
    );
    this.#add(
      axiomNode,
      OWL_VOCABULARY.assertionProperty,
      dataProperty
        ? this.#mapDataPropertyExpression(axiom.property)
        : this.#mapObjectPropertyExpression(axiom.property),
    );
    this.#add(
      axiomNode,
      dataProperty
        ? OWL_VOCABULARY.targetValue
        : OWL_VOCABULARY.targetIndividual,
      dataProperty
        ? this.#mapLiteral(axiom.value)
        : this.#mapIndividual(axiom.value),
    );
    this.#addAnnotations(axiomNode, axiom.annotations);
  }

  #mapClassExpression(expression) {
    return dispatchClassExpression(expression, this.#classExpressionHandlers);
  }

  #mapBooleanClassExpression(operands, predicate) {
    const node = this.#typedBlankNode(OWL_VOCABULARY.Class);
    this.#add(
      node,
      predicate,
      this.#createList(
        [...operands].map((operand) => this.#mapClassExpression(operand)),
      ),
    );
    return node;
  }

  #mapComplementClassExpression(expression) {
    const node = this.#typedBlankNode(OWL_VOCABULARY.Class);
    this.#add(
      node,
      OWL_VOCABULARY.complementOf,
      this.#mapClassExpression(expression.operand),
    );
    return node;
  }

  #mapObjectOneOf(expression) {
    const node = this.#typedBlankNode(OWL_VOCABULARY.Class);
    this.#add(
      node,
      OWL_VOCABULARY.oneOf,
      this.#createList(
        [...expression.individuals].map((individual) =>
          this.#mapIndividual(individual),
        ),
      ),
    );
    return node;
  }

  #mapObjectQuantifiedRestriction(expression, predicate) {
    const node = this.#restrictionNode(
      this.#mapObjectPropertyExpression(expression.property),
    );
    this.#add(node, predicate, this.#mapClassExpression(expression.filler));
    return node;
  }

  #mapObjectHasValue(expression) {
    const node = this.#restrictionNode(
      this.#mapObjectPropertyExpression(expression.property),
    );
    this.#add(
      node,
      OWL_VOCABULARY.hasValue,
      this.#mapIndividual(expression.individual),
    );
    return node;
  }

  #mapObjectHasSelf(expression) {
    const node = this.#restrictionNode(
      this.#mapObjectPropertyExpression(expression.property),
    );
    this.#add(
      node,
      OWL_VOCABULARY.hasSelf,
      this.#dataFactory.literal(
        "true",
        this.#namedNode(XSD_VOCABULARY.boolean),
      ),
    );
    return node;
  }

  #mapObjectCardinality(expression, unqualifiedPredicate, qualifiedPredicate) {
    const node = this.#restrictionNode(
      this.#mapObjectPropertyExpression(expression.property),
    );
    const unqualified =
      expression.filler.kind === OWLObjectKind.CLASS &&
      expression.filler.iri.value === OWL_VOCABULARY.Thing;
    this.#add(
      node,
      unqualified ? unqualifiedPredicate : qualifiedPredicate,
      this.#cardinalityLiteral(expression.cardinality),
    );
    if (!unqualified) {
      this.#add(
        node,
        OWL_VOCABULARY.onClass,
        this.#mapClassExpression(expression.filler),
      );
    }
    return node;
  }

  #mapDataQuantifiedRestriction(expression, predicate) {
    const node = this.#typedBlankNode(OWL_VOCABULARY.Restriction);
    const properties = expression.properties.map((property) =>
      this.#mapDataPropertyExpression(property),
    );
    if (properties.length === 1) {
      this.#add(node, OWL_VOCABULARY.onProperty, properties[0]);
    } else {
      this.#add(
        node,
        OWL_VOCABULARY.onProperties,
        this.#createList(properties),
      );
    }
    this.#add(node, predicate, this.#mapDataRange(expression.filler));
    return node;
  }

  #mapDataHasValue(expression) {
    const node = this.#restrictionNode(
      this.#mapDataPropertyExpression(expression.property),
    );
    this.#add(
      node,
      OWL_VOCABULARY.hasValue,
      this.#mapLiteral(expression.value),
    );
    return node;
  }

  #mapDataCardinality(expression, unqualifiedPredicate, qualifiedPredicate) {
    const node = this.#restrictionNode(
      this.#mapDataPropertyExpression(expression.property),
    );
    const unqualified =
      expression.filler.kind === OWLObjectKind.DATATYPE &&
      expression.filler.iri.value === RDFS_VOCABULARY.Literal;
    this.#add(
      node,
      unqualified ? unqualifiedPredicate : qualifiedPredicate,
      this.#cardinalityLiteral(expression.cardinality),
    );
    if (!unqualified) {
      this.#add(
        node,
        OWL_VOCABULARY.onDataRange,
        this.#mapDataRange(expression.filler),
      );
    }
    return node;
  }

  #mapDataRange(dataRange) {
    return dispatchDataRange(dataRange, this.#dataRangeHandlers);
  }

  #mapBooleanDataRange(operands, predicate) {
    const node = this.#typedBlankNode(RDFS_VOCABULARY.Datatype);
    this.#add(
      node,
      predicate,
      this.#createList(
        [...operands].map((operand) => this.#mapDataRange(operand)),
      ),
    );
    return node;
  }

  #mapComplementDataRange(dataRange) {
    const node = this.#typedBlankNode(RDFS_VOCABULARY.Datatype);
    this.#add(
      node,
      OWL_VOCABULARY.datatypeComplementOf,
      this.#mapDataRange(dataRange.operand),
    );
    return node;
  }

  #mapDataOneOf(dataRange) {
    const node = this.#typedBlankNode(RDFS_VOCABULARY.Datatype);
    this.#add(
      node,
      OWL_VOCABULARY.oneOf,
      this.#createList(
        [...dataRange.values].map((value) => this.#mapLiteral(value)),
      ),
    );
    return node;
  }

  #mapDatatypeRestriction(dataRange) {
    const node = this.#typedBlankNode(RDFS_VOCABULARY.Datatype);
    this.#add(
      node,
      OWL_VOCABULARY.onDatatype,
      this.#namedNode(dataRange.datatype.iri.value),
    );
    const restrictions = [...dataRange.facetRestrictions].map((restriction) => {
      const restrictionNode = this.#dataFactory.blankNode();
      this.#add(
        restrictionNode,
        restriction.facet.value,
        this.#mapLiteral(restriction.value),
      );
      return restrictionNode;
    });
    this.#add(
      node,
      OWL_VOCABULARY.withRestrictions,
      this.#createList(restrictions),
    );
    return node;
  }

  #mapObjectPropertyExpression(expression) {
    return dispatchObjectPropertyExpression(
      expression,
      this.#objectPropertyExpressionHandlers,
    );
  }

  #mapInverseObjectProperty(expression) {
    const node = this.#dataFactory.blankNode();
    this.#add(
      node,
      OWL_VOCABULARY.inverseOf,
      this.#namedNode(expression.inverse.iri.value),
    );
    return node;
  }

  #mapDataPropertyExpression(expression) {
    return dispatchDataPropertyExpression(
      expression,
      this.#dataPropertyExpressionHandlers,
    );
  }

  #mapIndividual(individual) {
    return dispatchIndividual(individual, this.#individualHandlers);
  }

  #mapAnnotationSubject(subject) {
    if (subject.kind === OWLObjectKind.IRI) {
      return this.#namedNode(subject.value);
    }
    if (subject.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL) {
      return this.#anonymousIndividual(subject);
    }
    throw new TypeError(`Unknown annotation subject kind: ${subject.kind}`);
  }

  #mapAnnotationValue(value) {
    return dispatchAnnotationValue(value, {
      [OWLObjectKind.ANONYMOUS_INDIVIDUAL]: (individual) =>
        this.#anonymousIndividual(individual),
      [OWLObjectKind.IRI]: (iri) => this.#namedNode(iri.value),
      [OWLObjectKind.LITERAL]: (literal) => this.#mapLiteral(literal),
    });
  }

  #mapLiteral(literal) {
    if (literal.language) {
      return this.#dataFactory.literal(literal.lexicalForm, literal.language);
    }

    // rdf:PlainLiteral is part of the OWL structural datatype map but RDF 1.1
    // represents it as an ordinary simple or language-tagged RDF literal.
    if (literal.datatype.iri.value === RDF_PLAIN_LITERAL) {
      const delimiter = literal.lexicalForm.lastIndexOf("@");
      if (delimiter >= 0) {
        const lexicalForm = literal.lexicalForm.slice(0, delimiter);
        const language = literal.lexicalForm.slice(delimiter + 1);
        return language
          ? this.#dataFactory.literal(lexicalForm, language)
          : this.#dataFactory.literal(lexicalForm);
      }
    }

    return this.#dataFactory.literal(
      literal.lexicalForm,
      this.#namedNode(literal.datatype.iri.value),
    );
  }

  #restrictionNode(property) {
    const node = this.#typedBlankNode(OWL_VOCABULARY.Restriction);
    this.#add(node, OWL_VOCABULARY.onProperty, property);
    return node;
  }

  #typedBlankNode(type) {
    const node = this.#dataFactory.blankNode();
    this.#add(node, RDF_VOCABULARY.type, this.#namedNode(type));
    return node;
  }

  #cardinalityLiteral(cardinality) {
    return this.#dataFactory.literal(
      String(cardinality),
      this.#namedNode(XSD_VOCABULARY.nonNegativeInteger),
    );
  }

  #createList(items) {
    let tail = this.#namedNode(RDF_VOCABULARY.nil);
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const head = this.#dataFactory.blankNode();
      this.#add(head, RDF_VOCABULARY.first, items[index]);
      this.#add(head, RDF_VOCABULARY.rest, tail);
      tail = head;
    }
    return tail;
  }

  #addAnnotatedMainTriple(subject, predicate, object, annotations) {
    this.#add(subject, predicate, object);
    if (annotations.length === 0) {
      return;
    }

    const axiomNode = this.#typedBlankNode(OWL_VOCABULARY.Axiom);
    this.#add(axiomNode, OWL_VOCABULARY.annotatedSource, subject);
    this.#add(
      axiomNode,
      OWL_VOCABULARY.annotatedProperty,
      typeof predicate === "string" ? this.#namedNode(predicate) : predicate,
    );
    this.#add(axiomNode, OWL_VOCABULARY.annotatedTarget, object);
    this.#addAnnotations(axiomNode, annotations);
  }

  #addAnnotations(subject, annotations) {
    for (const annotation of annotations) {
      this.#addAnnotation(subject, annotation);
    }
  }

  #addAnnotation(subject, annotation) {
    const predicate = this.#namedNode(annotation.property.iri.value);
    const object = this.#mapAnnotationValue(annotation.value);
    this.#add(subject, predicate, object);
    if (annotation.annotations.length === 0) {
      return;
    }

    const annotationNode = this.#typedBlankNode(OWL_VOCABULARY.Annotation);
    this.#add(annotationNode, OWL_VOCABULARY.annotatedSource, subject);
    this.#add(annotationNode, OWL_VOCABULARY.annotatedProperty, predicate);
    this.#add(annotationNode, OWL_VOCABULARY.annotatedTarget, object);
    this.#addAnnotations(annotationNode, annotation.annotations);
  }

  #add(subject, predicate, object) {
    const predicateNode =
      typeof predicate === "string" ? this.#namedNode(predicate) : predicate;
    const quad = this.#dataFactory.quad(
      subject,
      predicateNode,
      object,
      this.#graph,
    );
    this.#dataset.add(quad);
    return quad;
  }

  #anonymousIndividual(individual) {
    const key = individual.structuralKey();
    if (!this.#anonymousIndividuals.has(key)) {
      this.#anonymousIndividuals.set(key, this.#dataFactory.blankNode());
    }
    return this.#anonymousIndividuals.get(key);
  }

  #namedNode(iri) {
    return this.#dataFactory.namedNode(iri);
  }
}

/**
 * Maps the canonical OWL structural model to an RDF/JS dataset.
 *
 * The concrete W3C mapping rules live behind this small public façade so RDF
 * serializers can remain independent of both OWL parser syntax and ontology
 * storage internals. Each call owns a fresh session because generated blank
 * nodes belong to one application of the normative mapping rules.
 */
export class OwlToRdfTranslator {
  #dataFactory;
  #datasetFactory;

  constructor({
    dataFactory = rdfDataFactory,
    datasetFactory = rdfDatasetFactory,
  } = {}) {
    assertTranslatorTaxonomyCoverage();
    requireMethod(dataFactory, "blankNode", "dataFactory");
    requireMethod(dataFactory, "defaultGraph", "dataFactory");
    requireMethod(dataFactory, "literal", "dataFactory");
    requireMethod(dataFactory, "namedNode", "dataFactory");
    requireMethod(dataFactory, "quad", "dataFactory");
    requireMethod(datasetFactory, "dataset", "datasetFactory");
    this.#dataFactory = dataFactory;
    this.#datasetFactory = datasetFactory;
  }

  translate(ontology, { graph = this.#dataFactory.defaultGraph() } = {}) {
    requireMethod(ontology, "getAnnotations", "ontology");
    requireMethod(ontology, "getAxioms", "ontology");
    requireMethod(ontology, "getImportsDeclarations", "ontology");
    requireMethod(ontology, "getOntologyID", "ontology");
    if (!GRAPH_TERM_TYPES.has(graph?.termType)) {
      throw new TypeError(
        "graph must be an RDF/JS DefaultGraph, NamedNode, or BlankNode",
      );
    }
    const dataset = this.#datasetFactory.dataset();
    requireMethod(dataset, "add", "dataset");
    return new TranslationSession({
      dataFactory: this.#dataFactory,
      dataset,
      graph,
    }).translateOntology(ontology);
  }
}
