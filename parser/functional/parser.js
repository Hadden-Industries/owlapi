import {
  OWLDocumentFormats,
  OWLSyntaxError,
  ParserMismatchError,
  ResourceLimitError,
  UnsupportedConstructError,
} from "../../io/index.js";
import { IRI } from "../../model/index.js";

import { decodePrefixedLocalName, FunctionalSyntaxLexer } from "./lexer.js";

const STANDARD_PREFIXES = Object.freeze({
  "owl:": "http://www.w3.org/2002/07/owl#",
  "rdf:": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "rdfs:": "http://www.w3.org/2000/01/rdf-schema#",
  "xsd:": "http://www.w3.org/2001/XMLSchema#",
});

const IRI_TOKEN_TYPES = new Set(["FULL_IRI", "ABBREVIATED_IRI"]);
const ANNOTATION_AXIOM_KEYWORDS = new Set([
  "AnnotationAssertion",
  "SubAnnotationPropertyOf",
  "AnnotationPropertyDomain",
  "AnnotationPropertyRange",
]);
const UNSUPPORTED_FUNCTIONAL_CONSTRUCTS = new Set(["DLSafeRule"]);

let anonymousDocumentSequence = 0;

const hasForbiddenIriCharacter = (value) => {
  for (let offset = 0; offset < value.length;) {
    const codePoint = value.codePointAt(offset);
    const character = String.fromCodePoint(codePoint);
    if (
      codePoint <= 0x20 ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      '<>"{}|^`\\'.includes(character)
    ) {
      return true;
    }
    offset += character.length;
  }
  return false;
};

const isAbsoluteIri = (value) =>
  /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !hasForbiddenIriCharacter(value);

const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

const locationDetails = (token, configuration) =>
  configuration.sourceLocations
    ? {
        column: token.column,
        line: token.line,
        offset: token.offset,
      }
    : {};

export class OWLFunctionalSyntaxOWLParser {
  #anonymousIndividuals = new Map();
  #configuration;
  #dataFactory;
  #documentScope;
  #lastYieldAt;
  #lexer;
  #prefixes;
  #transaction;

  async parse(source, transaction, configuration) {
    this.#configuration = configuration;
    this.#dataFactory = transaction.getOWLDataFactory();
    this.#transaction = transaction;
    this.#prefixes = new Map(Object.entries(STANDARD_PREFIXES));
    this.#documentScope =
      source.getDocumentIRI()?.value ??
      `urn:owlapi-js:functional-document:${++anonymousDocumentSequence}`;
    this.#lexer = new FunctionalSyntaxLexer(source.getText(), configuration);
    this.#lastYieldAt = monotonicNow();

    const first = this.#lexer.peek();
    if (
      first.type !== "WORD" ||
      (first.value !== "Prefix" && first.value !== "Ontology")
    ) {
      throw new ParserMismatchError(
        "The document does not begin with Functional-Style Syntax",
        locationDetails(first, configuration),
      );
    }

    while (this.#isWord("Prefix")) {
      this.#parsePrefixDeclaration();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    await this.#parseOntology();
    this.#expectType("EOF");
    transaction.setDocumentFormat(OWLDocumentFormats.FUNCTIONAL);
    return OWLDocumentFormats.FUNCTIONAL;
  }

  #parsePrefixDeclaration() {
    this.#expectWord("Prefix");
    this.#expectType("(");
    const prefix = this.#expectType("PREFIX_NAME");
    this.#expectType("=");
    const iri = this.#expectType("FULL_IRI");
    this.#expectType(")");
    this.#requireAbsoluteIri(iri.value, iri);

    if (Object.hasOwn(STANDARD_PREFIXES, prefix.value)) {
      if (
        this.#configuration.parsingMode === "compatible" &&
        STANDARD_PREFIXES[prefix.value] === iri.value
      ) {
        this.#warning(
          "FUNCTIONAL_RESERVED_PREFIX_DECLARATION",
          `Ignored the redundant reserved-prefix declaration ${prefix.value}`,
          prefix,
          { prefixName: prefix.value },
        );
        return;
      }
      this.#syntax(
        `The reserved prefix ${prefix.value} cannot be declared`,
        prefix,
        { prefixName: prefix.value },
      );
    }
    if (this.#prefixes.has(prefix.value)) {
      this.#syntax(
        `The prefix ${prefix.value} is declared more than once`,
        prefix,
        {
          prefixName: prefix.value,
        },
      );
    }
    this.#prefixes.set(prefix.value, iri.value);
  }

  async #parseOntology() {
    this.#expectWord("Ontology");
    this.#expectType("(");

    let ontologyIri;
    let versionIri;
    if (this.#isIri()) {
      ontologyIri = this.#parseIri();
      if (this.#isIri()) {
        versionIri = this.#parseIri();
      }
    }
    this.#transaction.setOntologyID(
      this.#dataFactory.getOWLOntologyID(ontologyIri, versionIri),
    );

    while (this.#isWord("Import")) {
      this.#parseImport();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    while (this.#isWord("Annotation")) {
      this.#transaction.addAnnotation(this.#parseAnnotation(1));
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    while (this.#lexer.peek().type !== ")") {
      const axiom = this.#parseAxiom();
      if (
        this.#configuration.loadAnnotationAxioms ||
        !ANNOTATION_AXIOM_KEYWORDS.has(axiom.functionalKeyword)
      ) {
        this.#transaction.addAxiom(axiom.value);
      }
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    this.#expectType(")");
  }

  #parseImport() {
    this.#expectWord("Import");
    this.#expectType("(");
    const iri = this.#parseIri();
    this.#expectType(")");
    this.#transaction.addImportsDeclaration(
      this.#dataFactory.getOWLImportsDeclaration(iri),
    );
  }

  #parseAxiom() {
    const keyword = this.#lexer.peek();
    if (keyword.type !== "WORD") {
      this.#syntax("Expected an OWL axiom", keyword, {
        found: keyword.value || keyword.type,
      });
    }
    if (UNSUPPORTED_FUNCTIONAL_CONSTRUCTS.has(keyword.value)) {
      throw new UnsupportedConstructError(
        `Functional construct ${keyword.value} is outside the v1 scope`,
        {
          ...locationDetails(keyword, this.#configuration),
          construct: keyword.value,
        },
      );
    }
    switch (keyword.value) {
      case "Declaration":
        return this.#parseDeclaration();
      case "SubClassOf":
        return this.#parseSubClassOf();
      case "EquivalentClasses":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLEquivalentClassesAxiom",
          () => this.#parseClassExpression(0),
        );
      case "DisjointClasses":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLDisjointClassesAxiom",
          () => this.#parseClassExpression(0),
        );
      case "DisjointUnion":
        return this.#parseDisjointUnion();
      case "SubObjectPropertyOf":
        return this.#parseSubObjectPropertyOf();
      case "EquivalentObjectProperties":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLEquivalentObjectPropertiesAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "DisjointObjectProperties":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLDisjointObjectPropertiesAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "InverseObjectProperties":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLInverseObjectPropertiesAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseObjectPropertyExpression(),
        );
      case "ObjectPropertyDomain":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLObjectPropertyDomainAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseClassExpression(0),
        );
      case "ObjectPropertyRange":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLObjectPropertyRangeAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseClassExpression(0),
        );
      case "FunctionalObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLFunctionalObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "InverseFunctionalObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLInverseFunctionalObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "ReflexiveObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLReflexiveObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "IrreflexiveObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLIrreflexiveObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "SymmetricObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLSymmetricObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "AsymmetricObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLAsymmetricObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "TransitiveObjectProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLTransitiveObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "SubDataPropertyOf":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLSubDataPropertyOfAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseDataPropertyExpression(),
        );
      case "EquivalentDataProperties":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLEquivalentDataPropertiesAxiom",
          () => this.#parseDataPropertyExpression(),
        );
      case "DisjointDataProperties":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLDisjointDataPropertiesAxiom",
          () => this.#parseDataPropertyExpression(),
        );
      case "DataPropertyDomain":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLDataPropertyDomainAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseClassExpression(0),
        );
      case "DataPropertyRange":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLDataPropertyRangeAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseDataRange(0),
        );
      case "FunctionalDataProperty":
        return this.#parseUnaryAxiom(
          keyword.value,
          "getOWLFunctionalDataPropertyAxiom",
          () => this.#parseDataPropertyExpression(),
        );
      case "DatatypeDefinition":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLDatatypeDefinitionAxiom",
          () => this.#dataFactory.getOWLDatatype(this.#parseIri()),
          () => this.#parseDataRange(0),
        );
      case "HasKey":
        return this.#parseHasKey();
      case "SameIndividual":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLSameIndividualAxiom",
          () => this.#parseIndividual(),
        );
      case "DifferentIndividuals":
        return this.#parseNaryAxiom(
          keyword.value,
          "getOWLDifferentIndividualsAxiom",
          () => this.#parseIndividual(),
        );
      case "ClassAssertion":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLClassAssertionAxiom",
          () => this.#parseClassExpression(0),
          () => this.#parseIndividual(),
        );
      case "ObjectPropertyAssertion":
        return this.#parsePropertyAssertion(
          keyword.value,
          "getOWLObjectPropertyAssertionAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseIndividual(),
        );
      case "NegativeObjectPropertyAssertion":
        return this.#parsePropertyAssertion(
          keyword.value,
          "getOWLNegativeObjectPropertyAssertionAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseIndividual(),
        );
      case "DataPropertyAssertion":
        return this.#parsePropertyAssertion(
          keyword.value,
          "getOWLDataPropertyAssertionAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseLiteral(),
        );
      case "NegativeDataPropertyAssertion":
        return this.#parsePropertyAssertion(
          keyword.value,
          "getOWLNegativeDataPropertyAssertionAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseLiteral(),
        );
      case "AnnotationAssertion":
        return this.#parseAnnotationAssertion();
      case "SubAnnotationPropertyOf":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLSubAnnotationPropertyOfAxiom",
          () => this.#parseAnnotationProperty(),
          () => this.#parseAnnotationProperty(),
        );
      case "AnnotationPropertyDomain":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLAnnotationPropertyDomainAxiom",
          () => this.#parseAnnotationProperty(),
          () => this.#parseIri(),
        );
      case "AnnotationPropertyRange":
        return this.#parseBinaryAxiom(
          keyword.value,
          "getOWLAnnotationPropertyRangeAxiom",
          () => this.#parseAnnotationProperty(),
          () => this.#parseIri(),
        );
      default:
        this.#syntax(
          `Unsupported Functional axiom keyword ${keyword.value}`,
          keyword,
          { found: keyword.value },
        );
    }
  }

  #parseDeclaration() {
    this.#expectWord("Declaration");
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const entity = this.#parseEntity();
    this.#expectType(")");
    return {
      functionalKeyword: "Declaration",
      value: this.#dataFactory.getOWLDeclarationAxiom(entity, annotations),
    };
  }

  #parseSubClassOf() {
    this.#expectWord("SubClassOf");
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const subClass = this.#parseClassExpression(0);
    const superClass = this.#parseClassExpression(0);
    this.#expectType(")");
    return {
      functionalKeyword: "SubClassOf",
      value: this.#dataFactory.getOWLSubClassOfAxiom(
        subClass,
        superClass,
        annotations,
      ),
    };
  }

  #parseNaryAxiom(keyword, constructor, parseOperand) {
    const start = this.#expectWord(keyword);
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const operands = [];
    while (this.#lexer.peek().type !== ")") {
      operands.push(parseOperand());
    }
    this.#expectType(")");
    this.#requireMinimum(operands, 2, keyword, start);
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](operands, annotations),
    };
  }

  #parseUnaryAxiom(keyword, constructor, parseOperand) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const operand = parseOperand();
    this.#expectType(")");
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](operand, annotations),
    };
  }

  #parseBinaryAxiom(keyword, constructor, parseFirst, parseSecond) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const first = parseFirst();
    const second = parseSecond();
    this.#expectType(")");
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](first, second, annotations),
    };
  }

  #parseDisjointUnion() {
    const start = this.#expectWord("DisjointUnion");
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const owlClass = this.#dataFactory.getOWLClass(this.#parseIri());
    const classExpressions = [];
    while (this.#lexer.peek().type !== ")") {
      classExpressions.push(this.#parseClassExpression(0));
    }
    this.#expectType(")");
    this.#requireMinimum(classExpressions, 2, "DisjointUnion", start);
    return {
      functionalKeyword: "DisjointUnion",
      value: this.#dataFactory.getOWLDisjointUnionAxiom(
        owlClass,
        classExpressions,
        annotations,
      ),
    };
  }

  #parseSubObjectPropertyOf() {
    this.#expectWord("SubObjectPropertyOf");
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    if (this.#isWord("ObjectPropertyChain")) {
      const chain = this.#parseObjectPropertyChain();
      const superProperty = this.#parseObjectPropertyExpression();
      this.#expectType(")");
      return {
        functionalKeyword: "SubObjectPropertyOf",
        value: this.#dataFactory.getOWLSubPropertyChainOfAxiom(
          chain,
          superProperty,
          annotations,
        ),
      };
    }
    const subProperty = this.#parseObjectPropertyExpression();
    const superProperty = this.#parseObjectPropertyExpression();
    this.#expectType(")");
    return {
      functionalKeyword: "SubObjectPropertyOf",
      value: this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
        subProperty,
        superProperty,
        annotations,
      ),
    };
  }

  #parseObjectPropertyChain() {
    const start = this.#expectWord("ObjectPropertyChain");
    this.#expectType("(");
    const chain = [];
    while (this.#lexer.peek().type !== ")") {
      chain.push(this.#parseObjectPropertyExpression());
    }
    this.#expectType(")");
    this.#requireMinimum(chain, 2, "ObjectPropertyChain", start);
    return chain;
  }

  #parseHasKey() {
    const start = this.#expectWord("HasKey");
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const classExpression = this.#parseClassExpression(0);
    this.#expectType("(");
    const objectProperties = [];
    while (this.#lexer.peek().type !== ")") {
      objectProperties.push(this.#parseObjectPropertyExpression());
    }
    this.#expectType(")");
    this.#expectType("(");
    const dataProperties = [];
    while (this.#lexer.peek().type !== ")") {
      dataProperties.push(this.#parseDataPropertyExpression());
    }
    this.#expectType(")");
    this.#expectType(")");
    if (objectProperties.length + dataProperties.length === 0) {
      this.#syntax("HasKey requires at least one property", start, {
        construct: "HasKey",
        minimum: 1,
        observed: 0,
      });
    }
    return {
      functionalKeyword: "HasKey",
      value: this.#dataFactory.getOWLHasKeyAxiom(
        classExpression,
        objectProperties,
        dataProperties,
        annotations,
      ),
    };
  }

  #parsePropertyAssertion(keyword, constructor, parseProperty, parseValue) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const property = parseProperty();
    const subject = this.#parseIndividual();
    const value = parseValue();
    this.#expectType(")");
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](
        property,
        subject,
        value,
        annotations,
      ),
    };
  }

  #parseAnnotationAssertion() {
    this.#expectWord("AnnotationAssertion");
    this.#expectType("(");
    const annotations = this.#parseAxiomAnnotations();
    const property = this.#parseAnnotationProperty();
    const subject = this.#parseAnnotationSubject();
    const value = this.#parseAnnotationValue();
    this.#expectType(")");
    return {
      functionalKeyword: "AnnotationAssertion",
      value: this.#dataFactory.getOWLAnnotationAssertionAxiom(
        property,
        subject,
        value,
        annotations,
      ),
    };
  }

  #parseAnnotationProperty() {
    return this.#dataFactory.getOWLAnnotationProperty(this.#parseIri());
  }

  #parseAnnotationSubject() {
    return this.#lexer.peek().type === "NODE_ID"
      ? this.#parseAnonymousIndividual()
      : this.#parseIri();
  }

  #parseClassExpression(depth) {
    this.#checkExpressionDepth(depth);
    if (this.#isIri()) {
      return this.#dataFactory.getOWLClass(this.#parseIri());
    }
    const keyword = this.#lexer.peek();
    if (keyword.type !== "WORD") {
      this.#syntax("Expected a class expression", keyword, {
        found: keyword.value || keyword.type,
      });
    }

    switch (keyword.value) {
      case "ObjectIntersectionOf":
        return this.#parseNaryClassExpression(
          keyword.value,
          "getOWLObjectIntersectionOf",
          depth,
        );
      case "ObjectUnionOf":
        return this.#parseNaryClassExpression(
          keyword.value,
          "getOWLObjectUnionOf",
          depth,
        );
      case "ObjectComplementOf":
        return this.#parseUnaryClassExpression(
          keyword.value,
          "getOWLObjectComplementOf",
          depth,
        );
      case "ObjectOneOf":
        return this.#parseObjectOneOf(depth);
      case "ObjectSomeValuesFrom":
        return this.#parseObjectRestriction(
          keyword.value,
          "getOWLObjectSomeValuesFrom",
          depth,
          "class",
        );
      case "ObjectAllValuesFrom":
        return this.#parseObjectRestriction(
          keyword.value,
          "getOWLObjectAllValuesFrom",
          depth,
          "class",
        );
      case "ObjectHasValue":
        return this.#parseObjectRestriction(
          keyword.value,
          "getOWLObjectHasValue",
          depth,
          "individual",
        );
      case "ObjectHasSelf":
        return this.#parseObjectHasSelf();
      case "ObjectMinCardinality":
        return this.#parseObjectCardinality(
          keyword.value,
          "getOWLObjectMinCardinality",
          depth,
        );
      case "ObjectMaxCardinality":
        return this.#parseObjectCardinality(
          keyword.value,
          "getOWLObjectMaxCardinality",
          depth,
        );
      case "ObjectExactCardinality":
        return this.#parseObjectCardinality(
          keyword.value,
          "getOWLObjectExactCardinality",
          depth,
        );
      case "DataSomeValuesFrom":
        return this.#parseDataQuantifiedRestriction(
          keyword.value,
          "getOWLDataSomeValuesFrom",
          depth,
        );
      case "DataAllValuesFrom":
        return this.#parseDataQuantifiedRestriction(
          keyword.value,
          "getOWLDataAllValuesFrom",
          depth,
        );
      case "DataHasValue":
        return this.#parseDataHasValue();
      case "DataMinCardinality":
        return this.#parseDataCardinality(
          keyword.value,
          "getOWLDataMinCardinality",
          depth,
        );
      case "DataMaxCardinality":
        return this.#parseDataCardinality(
          keyword.value,
          "getOWLDataMaxCardinality",
          depth,
        );
      case "DataExactCardinality":
        return this.#parseDataCardinality(
          keyword.value,
          "getOWLDataExactCardinality",
          depth,
        );
      default:
        this.#syntax(`Unknown class expression ${keyword.value}`, keyword, {
          found: keyword.value,
        });
    }
  }

  #parseNaryClassExpression(keyword, constructor, depth) {
    const start = this.#expectWord(keyword);
    this.#expectType("(");
    const operands = [];
    while (this.#lexer.peek().type !== ")") {
      operands.push(this.#parseClassExpression(depth + 1));
    }
    this.#expectType(")");
    this.#requireMinimum(operands, 2, keyword, start);
    return this.#dataFactory[constructor](operands);
  }

  #parseUnaryClassExpression(keyword, constructor, depth) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const operand = this.#parseClassExpression(depth + 1);
    this.#expectType(")");
    return this.#dataFactory[constructor](operand);
  }

  #parseObjectOneOf(depth) {
    const start = this.#expectWord("ObjectOneOf");
    this.#expectType("(");
    const individuals = [];
    while (this.#lexer.peek().type !== ")") {
      this.#checkExpressionDepth(depth + 1);
      individuals.push(this.#parseIndividual());
    }
    this.#expectType(")");
    this.#requireMinimum(individuals, 1, "ObjectOneOf", start);
    return this.#dataFactory.getOWLObjectOneOf(individuals);
  }

  #parseObjectRestriction(keyword, constructor, depth, fillerType) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const property = this.#parseObjectPropertyExpression();
    const filler =
      fillerType === "class"
        ? this.#parseClassExpression(depth + 1)
        : this.#parseIndividual();
    this.#expectType(")");
    return this.#dataFactory[constructor](property, filler);
  }

  #parseObjectHasSelf() {
    this.#expectWord("ObjectHasSelf");
    this.#expectType("(");
    const property = this.#parseObjectPropertyExpression();
    this.#expectType(")");
    return this.#dataFactory.getOWLObjectHasSelf(property);
  }

  #parseObjectCardinality(keyword, constructor, depth) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const cardinality = this.#parseCardinality();
    const property = this.#parseObjectPropertyExpression();
    const filler =
      this.#lexer.peek().type === ")"
        ? undefined
        : this.#parseClassExpression(depth + 1);
    this.#expectType(")");
    return this.#dataFactory[constructor](cardinality, property, filler);
  }

  #parseObjectPropertyExpression() {
    if (this.#isWord("ObjectInverseOf")) {
      this.#expectWord("ObjectInverseOf");
      this.#expectType("(");
      const property = this.#dataFactory.getOWLObjectProperty(this.#parseIri());
      this.#expectType(")");
      return this.#dataFactory.getOWLObjectInverseOf(property);
    }
    return this.#dataFactory.getOWLObjectProperty(this.#parseIri());
  }

  #parseDataQuantifiedRestriction(keyword, constructor, depth) {
    const start = this.#expectWord(keyword);
    this.#expectType("(");
    const iris = [];
    while (this.#isIri()) {
      iris.push(this.#parseIri());
    }

    let filler;
    if (this.#lexer.peek().type === ")") {
      this.#requireMinimum(iris, 2, keyword, start);
      filler = this.#dataFactory.getOWLDatatype(iris.pop());
    } else {
      this.#requireMinimum(iris, 1, keyword, start);
      filler = this.#parseDataRange(depth + 1);
    }
    this.#expectType(")");
    const properties = iris.map((iri) =>
      this.#dataFactory.getOWLDataProperty(iri),
    );
    return this.#dataFactory[constructor](properties, filler);
  }

  #parseDataHasValue() {
    this.#expectWord("DataHasValue");
    this.#expectType("(");
    const property = this.#parseDataPropertyExpression();
    const value = this.#parseLiteral();
    this.#expectType(")");
    return this.#dataFactory.getOWLDataHasValue(property, value);
  }

  #parseDataCardinality(keyword, constructor, depth) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const cardinality = this.#parseCardinality();
    const property = this.#parseDataPropertyExpression();
    const filler =
      this.#lexer.peek().type === ")"
        ? undefined
        : this.#parseDataRange(depth + 1);
    this.#expectType(")");
    return this.#dataFactory[constructor](cardinality, property, filler);
  }

  #parseDataRange(depth) {
    this.#checkExpressionDepth(depth);
    if (this.#isIri()) {
      return this.#dataFactory.getOWLDatatype(this.#parseIri());
    }
    const keyword = this.#lexer.peek();
    if (keyword.type !== "WORD") {
      this.#syntax("Expected a data range", keyword, {
        found: keyword.value || keyword.type,
      });
    }
    switch (keyword.value) {
      case "DataIntersectionOf":
        return this.#parseNaryDataRange(
          keyword.value,
          "getOWLDataIntersectionOf",
          depth,
        );
      case "DataUnionOf":
        return this.#parseNaryDataRange(
          keyword.value,
          "getOWLDataUnionOf",
          depth,
        );
      case "DataComplementOf":
        return this.#parseUnaryDataRange(
          keyword.value,
          "getOWLDataComplementOf",
          depth,
        );
      case "DataOneOf":
        return this.#parseDataOneOf();
      case "DatatypeRestriction":
        return this.#parseDatatypeRestriction(depth);
      default:
        this.#syntax(`Unknown data range ${keyword.value}`, keyword, {
          found: keyword.value,
        });
    }
  }

  #parseNaryDataRange(keyword, constructor, depth) {
    const start = this.#expectWord(keyword);
    this.#expectType("(");
    const operands = [];
    while (this.#lexer.peek().type !== ")") {
      operands.push(this.#parseDataRange(depth + 1));
    }
    this.#expectType(")");
    this.#requireMinimum(operands, 2, keyword, start);
    return this.#dataFactory[constructor](operands);
  }

  #parseUnaryDataRange(keyword, constructor, depth) {
    this.#expectWord(keyword);
    this.#expectType("(");
    const operand = this.#parseDataRange(depth + 1);
    this.#expectType(")");
    return this.#dataFactory[constructor](operand);
  }

  #parseDataOneOf() {
    const start = this.#expectWord("DataOneOf");
    this.#expectType("(");
    const values = [];
    while (this.#lexer.peek().type !== ")") {
      values.push(this.#parseLiteral());
    }
    this.#expectType(")");
    this.#requireMinimum(values, 1, "DataOneOf", start);
    return this.#dataFactory.getOWLDataOneOf(values);
  }

  #parseDatatypeRestriction(depth) {
    const start = this.#expectWord("DatatypeRestriction");
    this.#expectType("(");
    const datatype = this.#dataFactory.getOWLDatatype(this.#parseIri());
    const restrictions = [];
    while (this.#lexer.peek().type !== ")") {
      this.#checkExpressionDepth(depth + 1);
      const facet = this.#parseIri();
      const value = this.#parseLiteral();
      restrictions.push(this.#dataFactory.getOWLFacetRestriction(facet, value));
    }
    this.#expectType(")");
    this.#requireMinimum(restrictions, 1, "DatatypeRestriction", start);
    return this.#dataFactory.getOWLDatatypeRestriction(datatype, restrictions);
  }

  #parseDataPropertyExpression() {
    return this.#dataFactory.getOWLDataProperty(this.#parseIri());
  }

  #parseIndividual() {
    if (this.#lexer.peek().type === "NODE_ID") {
      return this.#parseAnonymousIndividual();
    }
    return this.#dataFactory.getOWLNamedIndividual(this.#parseIri());
  }

  #parseCardinality() {
    const token = this.#expectType("INTEGER");
    const cardinality = Number(token.value);
    if (!Number.isSafeInteger(cardinality)) {
      this.#syntax("The cardinality is outside the safe integer range", token, {
        found: token.value,
      });
    }
    return cardinality;
  }

  #checkExpressionDepth(depth) {
    if (depth <= this.#configuration.maxExpressionDepth) {
      return;
    }
    const token = this.#lexer.peek();
    throw new ResourceLimitError(
      "The Functional Syntax expression depth limit was exceeded",
      {
        ...locationDetails(token, this.#configuration),
        limit: this.#configuration.maxExpressionDepth,
        observed: depth,
        resource: "maxExpressionDepth",
      },
    );
  }

  #requireMinimum(values, minimum, construct, token) {
    if (values.length < minimum) {
      this.#syntax(
        `${construct} requires at least ${minimum} operands`,
        token,
        {
          construct,
          minimum,
          observed: values.length,
        },
      );
    }
  }

  #parseEntity() {
    const keyword = this.#expectType("WORD");
    const constructors = {
      AnnotationProperty: "getOWLAnnotationProperty",
      Class: "getOWLClass",
      DataProperty: "getOWLDataProperty",
      Datatype: "getOWLDatatype",
      NamedIndividual: "getOWLNamedIndividual",
      ObjectProperty: "getOWLObjectProperty",
    };
    const constructor = constructors[keyword.value];
    if (!constructor) {
      this.#syntax(`Unknown declaration entity ${keyword.value}`, keyword, {
        found: keyword.value,
      });
    }
    this.#expectType("(");
    const iri = this.#parseIri();
    this.#expectType(")");
    return this.#dataFactory[constructor](iri);
  }

  #parseAxiomAnnotations() {
    const annotations = [];
    while (this.#isWord("Annotation")) {
      annotations.push(this.#parseAnnotation(1));
    }
    return annotations;
  }

  #parseAnnotation(depth) {
    if (depth > this.#configuration.maxAnnotationDepth) {
      const token = this.#lexer.peek();
      throw new ResourceLimitError(
        "The Functional Syntax annotation depth limit was exceeded",
        {
          ...locationDetails(token, this.#configuration),
          limit: this.#configuration.maxAnnotationDepth,
          observed: depth,
          resource: "maxAnnotationDepth",
        },
      );
    }
    this.#expectWord("Annotation");
    this.#expectType("(");
    const annotations = [];
    while (this.#isWord("Annotation")) {
      annotations.push(this.#parseAnnotation(depth + 1));
    }
    const property = this.#dataFactory.getOWLAnnotationProperty(
      this.#parseIri(),
    );
    const value = this.#parseAnnotationValue();
    this.#expectType(")");
    return this.#dataFactory.getOWLAnnotation(property, value, annotations);
  }

  #parseAnnotationValue() {
    if (this.#lexer.peek().type === "STRING") {
      return this.#parseLiteral();
    }
    if (this.#lexer.peek().type === "NODE_ID") {
      return this.#parseAnonymousIndividual();
    }
    return this.#parseIri();
  }

  #parseLiteral() {
    const lexicalForm = this.#expectType("STRING").value;
    if (this.#lexer.peek().type === "LANGUAGE") {
      return this.#dataFactory.getOWLLiteral(
        lexicalForm,
        this.#lexer.consume().value,
      );
    }
    if (this.#lexer.peek().type === "^^") {
      this.#lexer.consume();
      return this.#dataFactory.getOWLLiteral(lexicalForm, this.#parseIri());
    }
    return this.#dataFactory.getOWLLiteral(lexicalForm);
  }

  #parseAnonymousIndividual() {
    const token = this.#expectType("NODE_ID");
    if (!this.#anonymousIndividuals.has(token.value)) {
      const observed = this.#anonymousIndividuals.size + 1;
      if (observed > this.#configuration.maxBlankNodes) {
        throw new ResourceLimitError(
          "The Functional Syntax blank-node limit was exceeded",
          {
            ...locationDetails(token, this.#configuration),
            limit: this.#configuration.maxBlankNodes,
            observed,
            resource: "maxBlankNodes",
          },
        );
      }
      this.#anonymousIndividuals.set(
        token.value,
        this.#dataFactory.getOWLAnonymousIndividual(
          token.value,
          this.#documentScope,
        ),
      );
    }
    return this.#anonymousIndividuals.get(token.value);
  }

  #cooperate() {
    this.#lexer.checkExecutionBudget();
    if (monotonicNow() - this.#lastYieldAt < COOPERATIVE_YIELD_INTERVAL_MS) {
      return undefined;
    }
    const scheduler = Reflect.get(globalThis, "scheduler");
    const yieldRequest =
      typeof scheduler?.yield === "function"
        ? scheduler.yield()
        : new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    return Promise.resolve(yieldRequest).then(() => {
      this.#lastYieldAt = monotonicNow();
      this.#lexer.checkExecutionBudget();
    });
  }

  #parseIri() {
    const token = this.#lexer.consume();
    if (token.type === "FULL_IRI") {
      this.#requireAbsoluteIri(token.value, token);
      return IRI.create(token.value);
    }
    if (token.type !== "ABBREVIATED_IRI") {
      this.#syntax("Expected an IRI", token, {
        found: token.value || token.type,
      });
    }
    const colon = token.value.indexOf(":");
    const prefixName = token.value.slice(0, colon + 1);
    const prefixIri = this.#prefixes.get(prefixName);
    if (prefixIri === undefined) {
      this.#syntax(`The prefix ${prefixName} has not been declared`, token, {
        prefixName,
      });
    }
    const localName = decodePrefixedLocalName(token.value.slice(colon + 1));
    const expanded = `${prefixIri}${localName}`;
    this.#requireAbsoluteIri(expanded, token);
    return IRI.create(expanded);
  }

  #requireAbsoluteIri(value, token) {
    if (!isAbsoluteIri(value)) {
      this.#syntax("OWL Functional Syntax requires an absolute IRI", token, {
        iri: value,
      });
    }
  }

  #isIri() {
    return IRI_TOKEN_TYPES.has(this.#lexer.peek().type);
  }

  #isWord(value) {
    const token = this.#lexer.peek();
    return token.type === "WORD" && token.value === value;
  }

  #expectWord(value) {
    const token = this.#lexer.consume();
    if (token.type !== "WORD" || token.value !== value) {
      this.#syntax(
        `Expected ${value} but found ${token.value || token.type}`,
        token,
        {
          expected: value,
          found: token.value || token.type,
        },
      );
    }
    return token;
  }

  #expectType(type) {
    const token = this.#lexer.consume();
    if (token.type !== type) {
      this.#syntax(
        `Expected ${type} but found ${token.value || token.type}`,
        token,
        {
          expected: type,
          found: token.value || token.type,
        },
      );
    }
    return token;
  }

  #syntax(message, token, details = {}) {
    throw new OWLSyntaxError(message, {
      ...locationDetails(token, this.#configuration),
      ...details,
    });
  }

  #warning(code, message, token, details = {}) {
    if (!this.#configuration.collectWarnings) {
      return;
    }
    this.#transaction.addDiagnostic({
      code,
      message,
      severity: "warning",
      ...locationDetails(token, this.#configuration),
      ...details,
    });
  }
}
