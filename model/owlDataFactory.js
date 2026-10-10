import {
  OWL_NAMESPACE,
  RDFS_NAMESPACE,
  XSD_NAMESPACE,
  RDF_NAMESPACE,
} from "../internal/rdfjs/vocabulary.js";
import { normalizeCardinality } from "../internal/model/cardinality.js";
import {
  isSourcePreservingFactory,
  markSourcePreservingFactory,
  retainSourceArity,
} from "../internal/model/sourceArity.js";
import {
  ANNOTATION_VALUE_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLObjectKind,
} from "./kinds.js";
import {
  createOntologyID,
  IRI,
  isCanonicalStructuralObject,
  normalizeStructuralSet,
  OWLStructuralObject,
} from "./structural.js";

const OWL_THING_IRI = OWL_NAMESPACE + "Thing";
const RDFS_LITERAL_IRI = RDFS_NAMESPACE + "Literal";

const requireStructural = (value, name) => {
  if (!isCanonicalStructuralObject(value)) {
    throw new TypeError(`${name} must be an OWL structural object`);
  }
  return value;
};

const requireKind = (value, kinds, name) => {
  const normalized = requireStructural(value, name);
  if (!kinds.includes(normalized.kind)) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  return normalized;
};

const requireIri = (value, name) =>
  requireKind(value, [OWLObjectKind.IRI], name);

const requireStructuralSet = (values, name, minimum) => {
  const normalized = normalizeStructuralSet(values, name);
  if (normalized.length < minimum) {
    throw new RangeError(`${name} requires at least ${minimum} value(s)`);
  }
  return normalized;
};

const requireKindSet = (values, kinds, name, minimum) => {
  const normalized = requireStructuralSet(values, name, minimum);
  for (const value of normalized) {
    requireKind(value, kinds, name);
  }
  return normalized;
};

const createUnary = (kind, field, value) =>
  new OWLStructuralObject(kind, { [field]: requireStructural(value, field) }, [
    value,
  ]);

const createRestriction = (kind, property, filler, fillerName = "filler") =>
  new OWLStructuralObject(
    kind,
    {
      [fillerName]: requireStructural(filler, fillerName),
      property: requireStructural(property, "property"),
    },
    [property, filler],
  );

const createCardinality = (kind, cardinality, property, filler) => {
  const normalizedCardinality = normalizeCardinality(cardinality);
  const normalizedProperty = requireStructural(property, "property");
  const normalizedFiller =
    filler === undefined ? undefined : requireStructural(filler, "filler");
  return new OWLStructuralObject(
    kind,
    {
      cardinality: normalizedCardinality,
      filler: normalizedFiller,
      property: normalizedProperty,
    },
    [normalizedCardinality, normalizedProperty, normalizedFiller || null],
  );
};

const normalizeOrdered = (values, name, minimum = 1) => {
  if (!values || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError(`${name} must be iterable`);
  }
  const result = [...values].map((value) => requireStructural(value, name));
  if (result.length < minimum) {
    throw new RangeError(`${name} requires at least ${minimum} value(s)`);
  }
  return Object.freeze(result);
};

const normalizeOrderedKinds = (values, kinds, name, minimum = 1) => {
  const normalized = normalizeOrdered(values, name, minimum);
  for (const value of normalized) {
    requireKind(value, kinds, name);
  }
  return normalized;
};

const normalizeUnorderedKindsWithRepetitions = (
  values,
  kinds,
  name,
  minimum,
) => {
  const normalized = normalizeOrderedKinds(values, kinds, name, minimum);
  return Object.freeze(
    [...normalized].sort((left, right) => {
      const leftKey = left.structuralKey();
      const rightKey = right.structuralKey();
      if (leftKey < rightKey) {
        return -1;
      }
      return leftKey > rightKey ? 1 : 0;
    }),
  );
};

const normalizeAnnotations = (annotations) =>
  requireKindSet(annotations, [OWLObjectKind.ANNOTATION], "annotations", 0);

const createAnnotatedAxiom = (kind, fields, components, annotations = []) => {
  const normalizedAnnotations = normalizeAnnotations(annotations);
  return new OWLStructuralObject(
    kind,
    { ...fields, annotations: normalizedAnnotations },
    [...components, normalizedAnnotations],
    { componentsWithoutAnnotations: components },
  );
};

const createUnaryAxiom = (kind, field, value, kinds, annotations) => {
  const normalized = requireKind(value, kinds, field);
  return createAnnotatedAxiom(
    kind,
    { [field]: normalized },
    [normalized],
    annotations,
  );
};

const createBinaryAxiom = (
  kind,
  leftField,
  left,
  leftKinds,
  rightField,
  right,
  rightKinds,
  annotations,
) => {
  const normalizedLeft = requireKind(left, leftKinds, leftField);
  const normalizedRight = requireKind(right, rightKinds, rightField);
  return createAnnotatedAxiom(
    kind,
    { [leftField]: normalizedLeft, [rightField]: normalizedRight },
    [normalizedLeft, normalizedRight],
    annotations,
  );
};

const createSetConstruct = (
  factory,
  kind,
  field,
  values,
  kinds,
  annotations,
  minimum = 2,
  leadingFields = {},
) => {
  const original = isSourcePreservingFactory(factory)
    ? normalizeOrdered(values, field, minimum)
    : undefined;
  const normalized = requireKindSet(
    original ?? values,
    kinds,
    field,
    original ? 1 : minimum,
  );
  const fields = { ...leadingFields, [field]: normalized };
  const components = [...Object.values(leadingFields), normalized];
  const object =
    annotations === undefined
      ? new OWLStructuralObject(kind, fields, components)
      : createAnnotatedAxiom(kind, fields, components, annotations);
  return original
    ? retainSourceArity(object, field, original.length, minimum)
    : object;
};

export class OWLDataFactory {
  // UNSUPPORTED(OWLAPI parity): The Java OWLDataFactory overload matrix is not
  // reproduced mechanically. The initial 0.1 package exposes one unambiguous JavaScript signature
  // for each REQUIRED_V1 OWL 2 structural construct, accepts iterables where
  // appropriate, and rejects category-invalid operands. This is the intentional
  // JavaScript API rule in implementation-plan section 14.8; any additional
  // convenience constructor must preserve the same canonical object and update
  // `factory.required-v1-constructors` plus factory.test.js.
  #entities = new Map();

  getOWLClass(iri) {
    const normalizedIri = requireIri(iri, "iri");
    const key = `${OWLObjectKind.CLASS}:${normalizedIri.value}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(
        key,
        new OWLStructuralObject(OWLObjectKind.CLASS, { iri: normalizedIri }, [
          normalizedIri,
        ]),
      );
    }
    return this.#entities.get(key);
  }

  getOWLAnnotationProperty(iri) {
    const normalizedIri = requireIri(iri, "iri");
    const key = `${OWLObjectKind.ANNOTATION_PROPERTY}:${normalizedIri.value}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(
        key,
        new OWLStructuralObject(
          OWLObjectKind.ANNOTATION_PROPERTY,
          { iri: normalizedIri },
          [normalizedIri],
        ),
      );
    }
    return this.#entities.get(key);
  }

  getOWLDatatype(iri) {
    const normalizedIri = requireIri(iri, "iri");
    const key = `${OWLObjectKind.DATATYPE}:${normalizedIri.value}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(
        key,
        new OWLStructuralObject(
          OWLObjectKind.DATATYPE,
          { iri: normalizedIri },
          [normalizedIri],
        ),
      );
    }
    return this.#entities.get(key);
  }

  getOWLObjectProperty(iri) {
    const normalizedIri = requireIri(iri, "iri");
    const key = `${OWLObjectKind.OBJECT_PROPERTY}:${normalizedIri.value}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(
        key,
        new OWLStructuralObject(
          OWLObjectKind.OBJECT_PROPERTY,
          { iri: normalizedIri },
          [normalizedIri],
        ),
      );
    }
    return this.#entities.get(key);
  }

  getOWLDataProperty(iri) {
    const normalizedIri = requireIri(iri, "iri");
    const key = `${OWLObjectKind.DATA_PROPERTY}:${normalizedIri.value}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(
        key,
        new OWLStructuralObject(
          OWLObjectKind.DATA_PROPERTY,
          { iri: normalizedIri },
          [normalizedIri],
        ),
      );
    }
    return this.#entities.get(key);
  }

  getOWLNamedIndividual(iri) {
    const normalizedIri = requireIri(iri, "iri");
    const key = `${OWLObjectKind.NAMED_INDIVIDUAL}:${normalizedIri.value}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(
        key,
        new OWLStructuralObject(
          OWLObjectKind.NAMED_INDIVIDUAL,
          { iri: normalizedIri },
          [normalizedIri],
        ),
      );
    }
    return this.#entities.get(key);
  }

  getOWLAnonymousIndividual(nodeID, documentScope = "") {
    if (typeof nodeID !== "string" || nodeID.length === 0) {
      throw new TypeError("nodeID must be a non-empty string");
    }
    if (typeof documentScope !== "string") {
      throw new TypeError("documentScope must be a string");
    }
    return new OWLStructuralObject(
      OWLObjectKind.ANONYMOUS_INDIVIDUAL,
      { documentScope, nodeID },
      [documentScope, nodeID],
    );
  }

  getOWLOntologyID(ontologyIRI, versionIRI) {
    const normalizedOntologyIri =
      ontologyIRI === undefined || ontologyIRI === null
        ? undefined
        : requireIri(ontologyIRI, "ontologyIRI");
    const normalizedVersionIri =
      versionIRI === undefined || versionIRI === null
        ? undefined
        : requireIri(versionIRI, "versionIRI");
    if (normalizedVersionIri && !normalizedOntologyIri) {
      throw new TypeError("versionIRI requires an ontologyIRI");
    }
    return createOntologyID(normalizedOntologyIri, normalizedVersionIri);
  }

  getOWLImportsDeclaration(iri) {
    const normalizedIri = requireIri(iri, "iri");
    return new OWLStructuralObject(
      OWLObjectKind.IMPORTS_DECLARATION,
      { iri: normalizedIri },
      [normalizedIri],
    );
  }

  getRDFSLabel() {
    return this.getOWLAnnotationProperty(IRI.create(RDFS_NAMESPACE + "label"));
  }

  getOWLLiteral(lexicalForm, languageOrDatatype) {
    if (typeof lexicalForm !== "string") {
      throw new TypeError("lexicalForm must be a string");
    }
    let language = "";
    let datatype;
    if (languageOrDatatype === undefined) {
      datatype = this.getOWLDatatype(IRI.create(XSD_NAMESPACE + "string"));
    } else if (typeof languageOrDatatype === "string") {
      language = languageOrDatatype.toLowerCase();
      datatype = this.getOWLDatatype(
        IRI.create(
          language ? RDF_NAMESPACE + "langString" : XSD_NAMESPACE + "string",
        ),
      );
    } else if (languageOrDatatype?.kind === OWLObjectKind.IRI) {
      datatype = this.getOWLDatatype(
        requireIri(languageOrDatatype, "languageOrDatatype"),
      );
    } else {
      datatype = requireKind(
        languageOrDatatype,
        [OWLObjectKind.DATATYPE],
        "languageOrDatatype",
      );
    }
    return new OWLStructuralObject(
      OWLObjectKind.LITERAL,
      { datatype, language, lexicalForm },
      [lexicalForm, language, datatype],
    );
  }

  getOWLAnnotation(property, value, annotations = []) {
    const normalizedAnnotations = normalizeAnnotations(annotations);
    const normalizedProperty = requireKind(
      property,
      [OWLObjectKind.ANNOTATION_PROPERTY],
      "property",
    );
    const normalizedValue = requireKind(value, ANNOTATION_VALUE_KINDS, "value");
    return new OWLStructuralObject(
      OWLObjectKind.ANNOTATION,
      {
        annotations: normalizedAnnotations,
        property: normalizedProperty,
        value: normalizedValue,
      },
      [normalizedProperty, normalizedValue, normalizedAnnotations],
    );
  }

  getOWLSubClassOfAxiom(subClass, superClass, annotations = []) {
    const normalizedAnnotations = normalizeAnnotations(annotations);
    const operands = [
      requireKind(subClass, CLASS_EXPRESSION_KINDS, "subClass"),
      requireKind(superClass, CLASS_EXPRESSION_KINDS, "superClass"),
    ];
    return new OWLStructuralObject(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
      {
        annotations: normalizedAnnotations,
        subClass: operands[0],
        superClass: operands[1],
      },
      [...operands, normalizedAnnotations],
      { componentsWithoutAnnotations: operands },
    );
  }

  getOWLDeclarationAxiom(entity, annotations = []) {
    const normalizedAnnotations = normalizeAnnotations(annotations);
    const normalizedEntity = requireKind(entity, ENTITY_KINDS, "entity");
    return new OWLStructuralObject(
      OWLObjectKind.DECLARATION_AXIOM,
      { annotations: normalizedAnnotations, entity: normalizedEntity },
      [normalizedEntity, normalizedAnnotations],
      { componentsWithoutAnnotations: [normalizedEntity] },
    );
  }

  getOWLObjectIntersectionOf(operands) {
    return createSetConstruct(
      this,
      OWLObjectKind.OBJECT_INTERSECTION_OF,
      "operands",
      operands,
      CLASS_EXPRESSION_KINDS,
    );
  }

  getOWLObjectInverseOf(property) {
    return createUnary(
      OWLObjectKind.OBJECT_INVERSE_OF,
      "inverse",
      requireKind(property, [OWLObjectKind.OBJECT_PROPERTY], "property"),
    );
  }

  getOWLObjectUnionOf(operands) {
    return createSetConstruct(
      this,
      OWLObjectKind.OBJECT_UNION_OF,
      "operands",
      operands,
      CLASS_EXPRESSION_KINDS,
    );
  }

  getOWLObjectComplementOf(operand) {
    return createUnary(
      OWLObjectKind.OBJECT_COMPLEMENT_OF,
      "operand",
      requireKind(operand, CLASS_EXPRESSION_KINDS, "operand"),
    );
  }

  getOWLObjectOneOf(individuals) {
    const normalized = requireKindSet(
      individuals,
      INDIVIDUAL_KINDS,
      "individuals",
      1,
    );
    return new OWLStructuralObject(
      OWLObjectKind.OBJECT_ONE_OF,
      { individuals: normalized },
      [normalized],
    );
  }

  getOWLObjectSomeValuesFrom(property, filler) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property");
    requireKind(filler, CLASS_EXPRESSION_KINDS, "filler");
    return createRestriction(
      OWLObjectKind.OBJECT_SOME_VALUES_FROM,
      property,
      filler,
    );
  }

  getOWLObjectAllValuesFrom(property, filler) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property");
    requireKind(filler, CLASS_EXPRESSION_KINDS, "filler");
    return createRestriction(
      OWLObjectKind.OBJECT_ALL_VALUES_FROM,
      property,
      filler,
    );
  }

  getOWLObjectHasValue(property, individual) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property");
    requireKind(individual, INDIVIDUAL_KINDS, "individual");
    return createRestriction(
      OWLObjectKind.OBJECT_HAS_VALUE,
      property,
      individual,
      "individual",
    );
  }

  getOWLObjectHasSelf(property) {
    return createUnary(
      OWLObjectKind.OBJECT_HAS_SELF,
      "property",
      requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property"),
    );
  }

  getOWLObjectMinCardinality(cardinality, property, filler) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property");
    const normalizedFiller =
      filler === undefined
        ? this.getOWLClass(IRI.create(OWL_THING_IRI))
        : requireKind(filler, CLASS_EXPRESSION_KINDS, "filler");
    return createCardinality(
      OWLObjectKind.OBJECT_MIN_CARDINALITY,
      cardinality,
      property,
      normalizedFiller,
    );
  }

  getOWLObjectMaxCardinality(cardinality, property, filler) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property");
    const normalizedFiller =
      filler === undefined
        ? this.getOWLClass(IRI.create(OWL_THING_IRI))
        : requireKind(filler, CLASS_EXPRESSION_KINDS, "filler");
    return createCardinality(
      OWLObjectKind.OBJECT_MAX_CARDINALITY,
      cardinality,
      property,
      normalizedFiller,
    );
  }

  getOWLObjectExactCardinality(cardinality, property, filler) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS, "property");
    const normalizedFiller =
      filler === undefined
        ? this.getOWLClass(IRI.create(OWL_THING_IRI))
        : requireKind(filler, CLASS_EXPRESSION_KINDS, "filler");
    return createCardinality(
      OWLObjectKind.OBJECT_EXACT_CARDINALITY,
      cardinality,
      property,
      normalizedFiller,
    );
  }

  getOWLDataSomeValuesFrom(properties, filler) {
    const normalizedProperties = normalizeOrderedKinds(
      properties,
      DATA_PROPERTY_EXPRESSION_KINDS,
      "properties",
    );
    const normalizedFiller = requireKind(filler, DATA_RANGE_KINDS, "filler");
    return new OWLStructuralObject(
      OWLObjectKind.DATA_SOME_VALUES_FROM,
      { filler: normalizedFiller, properties: normalizedProperties },
      [normalizedProperties, normalizedFiller],
    );
  }

  getOWLDataAllValuesFrom(properties, filler) {
    const normalizedProperties = normalizeOrderedKinds(
      properties,
      DATA_PROPERTY_EXPRESSION_KINDS,
      "properties",
    );
    const normalizedFiller = requireKind(filler, DATA_RANGE_KINDS, "filler");
    return new OWLStructuralObject(
      OWLObjectKind.DATA_ALL_VALUES_FROM,
      { filler: normalizedFiller, properties: normalizedProperties },
      [normalizedProperties, normalizedFiller],
    );
  }

  getOWLDataHasValue(property, value) {
    requireKind(property, DATA_PROPERTY_EXPRESSION_KINDS, "property");
    requireKind(value, [OWLObjectKind.LITERAL], "value");
    return createRestriction(
      OWLObjectKind.DATA_HAS_VALUE,
      property,
      value,
      "value",
    );
  }

  getOWLDataMinCardinality(cardinality, property, filler) {
    requireKind(property, DATA_PROPERTY_EXPRESSION_KINDS, "property");
    const normalizedFiller =
      filler === undefined
        ? this.getOWLDatatype(IRI.create(RDFS_LITERAL_IRI))
        : requireKind(filler, DATA_RANGE_KINDS, "filler");
    return createCardinality(
      OWLObjectKind.DATA_MIN_CARDINALITY,
      cardinality,
      property,
      normalizedFiller,
    );
  }

  getOWLDataMaxCardinality(cardinality, property, filler) {
    requireKind(property, DATA_PROPERTY_EXPRESSION_KINDS, "property");
    const normalizedFiller =
      filler === undefined
        ? this.getOWLDatatype(IRI.create(RDFS_LITERAL_IRI))
        : requireKind(filler, DATA_RANGE_KINDS, "filler");
    return createCardinality(
      OWLObjectKind.DATA_MAX_CARDINALITY,
      cardinality,
      property,
      normalizedFiller,
    );
  }

  getOWLDataExactCardinality(cardinality, property, filler) {
    requireKind(property, DATA_PROPERTY_EXPRESSION_KINDS, "property");
    const normalizedFiller =
      filler === undefined
        ? this.getOWLDatatype(IRI.create(RDFS_LITERAL_IRI))
        : requireKind(filler, DATA_RANGE_KINDS, "filler");
    return createCardinality(
      OWLObjectKind.DATA_EXACT_CARDINALITY,
      cardinality,
      property,
      normalizedFiller,
    );
  }

  getOWLDataIntersectionOf(operands) {
    return createSetConstruct(
      this,
      OWLObjectKind.DATA_INTERSECTION_OF,
      "operands",
      operands,
      DATA_RANGE_KINDS,
    );
  }

  getOWLDataUnionOf(operands) {
    return createSetConstruct(
      this,
      OWLObjectKind.DATA_UNION_OF,
      "operands",
      operands,
      DATA_RANGE_KINDS,
    );
  }

  getOWLDataComplementOf(operand) {
    return createUnary(
      OWLObjectKind.DATA_COMPLEMENT_OF,
      "operand",
      requireKind(operand, DATA_RANGE_KINDS, "operand"),
    );
  }

  getOWLDataOneOf(values) {
    const normalized = requireKindSet(
      values,
      [OWLObjectKind.LITERAL],
      "values",
      1,
    );
    return new OWLStructuralObject(
      OWLObjectKind.DATA_ONE_OF,
      { values: normalized },
      [normalized],
    );
  }

  getOWLFacetRestriction(facet, value) {
    const normalizedFacet = requireIri(facet, "facet");
    const normalizedValue = requireKind(
      value,
      [OWLObjectKind.LITERAL],
      "value",
    );
    return new OWLStructuralObject(
      OWLObjectKind.FACET_RESTRICTION,
      { facet: normalizedFacet, value: normalizedValue },
      [normalizedFacet, normalizedValue],
    );
  }

  getOWLDatatypeRestriction(datatype, facetRestrictions) {
    const normalizedDatatype = requireKind(
      datatype,
      [OWLObjectKind.DATATYPE],
      "datatype",
    );
    const normalizedRestrictions = requireKindSet(
      facetRestrictions,
      [OWLObjectKind.FACET_RESTRICTION],
      "facetRestrictions",
      1,
    );
    return new OWLStructuralObject(
      OWLObjectKind.DATATYPE_RESTRICTION,
      {
        datatype: normalizedDatatype,
        facetRestrictions: normalizedRestrictions,
      },
      [normalizedDatatype, normalizedRestrictions],
    );
  }

  getOWLEquivalentClassesAxiom(classExpressions, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
      "classExpressions",
      classExpressions,
      CLASS_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDisjointClassesAxiom(classExpressions, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.DISJOINT_CLASSES_AXIOM,
      "classExpressions",
      classExpressions,
      CLASS_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDisjointUnionAxiom(owlClass, classExpressions, annotations = []) {
    const normalizedClass = requireKind(
      owlClass,
      [OWLObjectKind.CLASS],
      "owlClass",
    );
    return createSetConstruct(
      this,
      OWLObjectKind.DISJOINT_UNION_AXIOM,
      "classExpressions",
      classExpressions,
      CLASS_EXPRESSION_KINDS,
      annotations,
      2,
      { owlClass: normalizedClass },
    );
  }

  getOWLSubObjectPropertyOfAxiom(subProperty, superProperty, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
      "subProperty",
      subProperty,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "superProperty",
      superProperty,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLSubPropertyChainOfAxiom(chain, superProperty, annotations = []) {
    const normalizedChain = normalizeOrderedKinds(
      chain,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "chain",
      2,
    );
    const normalizedSuperProperty = requireKind(
      superProperty,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "superProperty",
    );
    return createAnnotatedAxiom(
      OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM,
      { chain: normalizedChain, superProperty: normalizedSuperProperty },
      [normalizedChain, normalizedSuperProperty],
      annotations,
    );
  }

  getOWLEquivalentObjectPropertiesAxiom(properties, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM,
      "properties",
      properties,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDisjointObjectPropertiesAxiom(properties, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM,
      "properties",
      properties,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLObjectPropertyDomainAxiom(property, domain, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "domain",
      domain,
      CLASS_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLObjectPropertyRangeAxiom(property, range, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "range",
      range,
      CLASS_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLInverseObjectPropertiesAxiom(first, second, annotations = []) {
    const properties = normalizeUnorderedKindsWithRepetitions(
      [first, second],
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "properties",
      2,
    );
    return createAnnotatedAxiom(
      OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM,
      { properties },
      [properties],
      annotations,
    );
  }

  getOWLFunctionalObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLInverseFunctionalObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLReflexiveObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLIrreflexiveObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLSymmetricObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLAsymmetricObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLTransitiveObjectPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLSubDataPropertyOfAxiom(subProperty, superProperty, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
      "subProperty",
      subProperty,
      DATA_PROPERTY_EXPRESSION_KINDS,
      "superProperty",
      superProperty,
      DATA_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLEquivalentDataPropertiesAxiom(properties, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM,
      "properties",
      properties,
      DATA_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDisjointDataPropertiesAxiom(properties, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM,
      "properties",
      properties,
      DATA_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDataPropertyDomainAxiom(property, domain, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM,
      "property",
      property,
      DATA_PROPERTY_EXPRESSION_KINDS,
      "domain",
      domain,
      CLASS_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDataPropertyRangeAxiom(property, range, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
      "property",
      property,
      DATA_PROPERTY_EXPRESSION_KINDS,
      "range",
      range,
      DATA_RANGE_KINDS,
      annotations,
    );
  }

  getOWLFunctionalDataPropertyAxiom(property, annotations = []) {
    return createUnaryAxiom(
      OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM,
      "property",
      property,
      DATA_PROPERTY_EXPRESSION_KINDS,
      annotations,
    );
  }

  getOWLDatatypeDefinitionAxiom(datatype, dataRange, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.DATATYPE_DEFINITION_AXIOM,
      "datatype",
      datatype,
      [OWLObjectKind.DATATYPE],
      "dataRange",
      dataRange,
      DATA_RANGE_KINDS,
      annotations,
    );
  }

  getOWLHasKeyAxiom(
    classExpression,
    objectProperties,
    dataProperties,
    annotations = [],
  ) {
    const normalizedClassExpression = requireKind(
      classExpression,
      CLASS_EXPRESSION_KINDS,
      "classExpression",
    );
    const normalizedObjectProperties = requireKindSet(
      objectProperties,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      "objectProperties",
      0,
    );
    const normalizedDataProperties = requireKindSet(
      dataProperties,
      DATA_PROPERTY_EXPRESSION_KINDS,
      "dataProperties",
      0,
    );
    if (
      normalizedObjectProperties.length + normalizedDataProperties.length ===
      0
    ) {
      throw new RangeError("OWLHasKeyAxiom requires at least one property");
    }
    return createAnnotatedAxiom(
      OWLObjectKind.HAS_KEY_AXIOM,
      {
        classExpression: normalizedClassExpression,
        dataProperties: normalizedDataProperties,
        objectProperties: normalizedObjectProperties,
      },
      [
        normalizedClassExpression,
        normalizedObjectProperties,
        normalizedDataProperties,
      ],
      annotations,
    );
  }

  getOWLSameIndividualAxiom(individuals, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.SAME_INDIVIDUAL_AXIOM,
      "individuals",
      individuals,
      INDIVIDUAL_KINDS,
      annotations,
    );
  }

  getOWLDifferentIndividualsAxiom(individuals, annotations = []) {
    return createSetConstruct(
      this,
      OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM,
      "individuals",
      individuals,
      INDIVIDUAL_KINDS,
      annotations,
    );
  }

  getOWLClassAssertionAxiom(classExpression, individual, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.CLASS_ASSERTION_AXIOM,
      "classExpression",
      classExpression,
      CLASS_EXPRESSION_KINDS,
      "individual",
      individual,
      INDIVIDUAL_KINDS,
      annotations,
    );
  }

  getOWLObjectPropertyAssertionAxiom(
    property,
    subject,
    object,
    annotations = [],
  ) {
    return this.#createPropertyAssertion(
      OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
      property,
      subject,
      object,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      INDIVIDUAL_KINDS,
      INDIVIDUAL_KINDS,
      annotations,
    );
  }

  getOWLNegativeObjectPropertyAssertionAxiom(
    property,
    subject,
    object,
    annotations = [],
  ) {
    return this.#createPropertyAssertion(
      OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
      property,
      subject,
      object,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
      INDIVIDUAL_KINDS,
      INDIVIDUAL_KINDS,
      annotations,
    );
  }

  getOWLDataPropertyAssertionAxiom(property, subject, value, annotations = []) {
    return this.#createPropertyAssertion(
      OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
      property,
      subject,
      value,
      DATA_PROPERTY_EXPRESSION_KINDS,
      INDIVIDUAL_KINDS,
      [OWLObjectKind.LITERAL],
      annotations,
    );
  }

  getOWLNegativeDataPropertyAssertionAxiom(
    property,
    subject,
    value,
    annotations = [],
  ) {
    return this.#createPropertyAssertion(
      OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
      property,
      subject,
      value,
      DATA_PROPERTY_EXPRESSION_KINDS,
      INDIVIDUAL_KINDS,
      [OWLObjectKind.LITERAL],
      annotations,
    );
  }

  getOWLAnnotationAssertionAxiom(property, subject, value, annotations = []) {
    return this.#createPropertyAssertion(
      OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
      property,
      subject,
      value,
      [OWLObjectKind.ANNOTATION_PROPERTY],
      [OWLObjectKind.IRI, OWLObjectKind.ANONYMOUS_INDIVIDUAL],
      ANNOTATION_VALUE_KINDS,
      annotations,
    );
  }

  getOWLSubAnnotationPropertyOfAxiom(
    subProperty,
    superProperty,
    annotations = [],
  ) {
    return createBinaryAxiom(
      OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
      "subProperty",
      subProperty,
      [OWLObjectKind.ANNOTATION_PROPERTY],
      "superProperty",
      superProperty,
      [OWLObjectKind.ANNOTATION_PROPERTY],
      annotations,
    );
  }

  getOWLAnnotationPropertyDomainAxiom(property, domain, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
      "property",
      property,
      [OWLObjectKind.ANNOTATION_PROPERTY],
      "domain",
      domain,
      [OWLObjectKind.IRI],
      annotations,
    );
  }

  getOWLAnnotationPropertyRangeAxiom(property, range, annotations = []) {
    return createBinaryAxiom(
      OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
      "property",
      property,
      [OWLObjectKind.ANNOTATION_PROPERTY],
      "range",
      range,
      [OWLObjectKind.IRI],
      annotations,
    );
  }

  #createPropertyAssertion(
    kind,
    property,
    subject,
    value,
    propertyKinds,
    subjectKinds,
    valueKinds,
    annotations,
  ) {
    const normalizedProperty = requireKind(property, propertyKinds, "property");
    const normalizedSubject = requireKind(subject, subjectKinds, "subject");
    const normalizedValue = requireKind(value, valueKinds, "value");
    return createAnnotatedAxiom(
      kind,
      {
        property: normalizedProperty,
        subject: normalizedSubject,
        value: normalizedValue,
      },
      [normalizedProperty, normalizedSubject, normalizedValue],
      annotations,
    );
  }
}

// Private parser seam. Preservation is selected by loader policy, never by
// changing the caller's factory or the default constructor contract.
export const createSourcePreservingDataFactory = (factory) => {
  if (Object.getPrototypeOf(factory) !== OWLDataFactory.prototype) {
    throw new TypeError(
      "Source preservation requires the package OWLDataFactory",
    );
  }
  return markSourcePreservingFactory(new OWLDataFactory());
};
