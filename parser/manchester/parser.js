import {
  OWLDocumentFormats,
  OWLSyntaxError,
  ParserMismatchError,
  ResourceLimitError,
  UnsupportedConstructError,
} from "../../io/index.js";
import { IRI, OWLObjectKind } from "../../model/index.js";

import {
  decodePrefixedLocalName,
  isManchesterKeyword,
  isManchesterNumericLiteral,
  ManchesterSyntaxLexer,
} from "./lexer.js";

const STANDARD_PREFIXES = Object.freeze({
  "owl:": "http://www.w3.org/2002/07/owl#",
  "rdf:": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "rdfs:": "http://www.w3.org/2000/01/rdf-schema#",
  "xsd:": "http://www.w3.org/2001/XMLSchema#",
});

const CLASS_FRAME_SECTIONS = new Set([
  "Annotations:",
  "DisjointUnionOf:",
  "DisjointWith:",
  "EquivalentTo:",
  "HasKey:",
  "SubClassOf:",
]);
const OBJECT_PROPERTY_FRAME_SECTIONS = new Set([
  "Annotations:",
  "Characteristics:",
  "DisjointWith:",
  "Domain:",
  "EquivalentTo:",
  "InverseOf:",
  "Range:",
  "SubPropertyChain:",
  "SubPropertyOf:",
]);
const DATA_PROPERTY_FRAME_SECTIONS = new Set([
  "Annotations:",
  "Characteristics:",
  "DisjointWith:",
  "Domain:",
  "EquivalentTo:",
  "Range:",
  "SubPropertyOf:",
]);
const DATATYPE_FRAME_SECTIONS = new Set(["Annotations:", "EquivalentTo:"]);
const ANNOTATION_PROPERTY_FRAME_SECTIONS = new Set([
  "Annotations:",
  "Domain:",
  "Range:",
  "SubPropertyOf:",
]);
const INDIVIDUAL_FRAME_SECTIONS = new Set([
  "Annotations:",
  "DifferentFrom:",
  "Facts:",
  "SameAs:",
  "Types:",
]);
const OBJECT_PROPERTY_CHARACTERISTICS = Object.freeze({
  Asymmetric: "getOWLAsymmetricObjectPropertyAxiom",
  Functional: "getOWLFunctionalObjectPropertyAxiom",
  InverseFunctional: "getOWLInverseFunctionalObjectPropertyAxiom",
  Irreflexive: "getOWLIrreflexiveObjectPropertyAxiom",
  Reflexive: "getOWLReflexiveObjectPropertyAxiom",
  Symmetric: "getOWLSymmetricObjectPropertyAxiom",
  Transitive: "getOWLTransitiveObjectPropertyAxiom",
});
const ENTITY_FRAME_KINDS = Object.freeze({
  "AnnotationProperty:": OWLObjectKind.ANNOTATION_PROPERTY,
  "Class:": OWLObjectKind.CLASS,
  "DataProperty:": OWLObjectKind.DATA_PROPERTY,
  "Datatype:": OWLObjectKind.DATATYPE,
  "Individual:": OWLObjectKind.NAMED_INDIVIDUAL,
  "ObjectProperty:": OWLObjectKind.OBJECT_PROPERTY,
});
const PROPERTY_ENTITY_KINDS = new Set([
  OWLObjectKind.ANNOTATION_PROPERTY,
  OWLObjectKind.DATA_PROPERTY,
  OWLObjectKind.OBJECT_PROPERTY,
]);
const RESTRICTION_KEYWORDS = new Set([
  "Self",
  "exactly",
  "max",
  "min",
  "only",
  "some",
  "value",
]);
const SPECIAL_DATATYPES = Object.freeze({
  decimal: "http://www.w3.org/2001/XMLSchema#decimal",
  float: "http://www.w3.org/2001/XMLSchema#float",
  integer: "http://www.w3.org/2001/XMLSchema#integer",
  string: "http://www.w3.org/2001/XMLSchema#string",
});
const FACET_IRIS = Object.freeze({
  "<": "http://www.w3.org/2001/XMLSchema#minExclusive",
  "<=": "http://www.w3.org/2001/XMLSchema#minInclusive",
  ">": "http://www.w3.org/2001/XMLSchema#maxExclusive",
  ">=": "http://www.w3.org/2001/XMLSchema#maxInclusive",
  langRange: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langRange",
  length: "http://www.w3.org/2001/XMLSchema#length",
  maxLength: "http://www.w3.org/2001/XMLSchema#maxLength",
  minLength: "http://www.w3.org/2001/XMLSchema#minLength",
  pattern: "http://www.w3.org/2001/XMLSchema#pattern",
});

let anonymousDocumentSequence = 0;

const isAbsoluteIri = (value) => /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export class OWLManchesterSyntaxOWLParser {
  #anonymousIndividuals = new Map();
  #configuration;
  #dataFactory;
  #documentScope;
  #entityKinds = new Map();
  #executionBudget;
  #lastYieldAt;
  #lexer;
  #prefixes;
  #transaction;

  async parse(source, transaction, configuration) {
    const text = source.getText();
    this.#anonymousIndividuals = new Map();
    this.#configuration = configuration;
    this.#dataFactory = transaction.getOWLDataFactory();
    this.#entityKinds = new Map();
    this.#transaction = transaction;
    this.#prefixes = new Map(Object.entries(STANDARD_PREFIXES));
    const startedAt = monotonicNow();
    this.#executionBudget = Object.freeze({
      deadline: startedAt + configuration.timeoutMs,
      startedAt,
    });
    this.#lastYieldAt = startedAt;
    this.#lexer = new ManchesterSyntaxLexer(text, configuration, {
      executionBudget: this.#executionBudget,
    });
    this.#documentScope =
      source.getDocumentIRI()?.value ??
      `urn:owlapi-js:manchester-document:${++anonymousDocumentSequence}`;

    const first = this.#lexer.peek();
    if (
      first.type !== "BARE" ||
      (first.value !== "Prefix:" && first.value !== "Ontology:")
    ) {
      throw new ParserMismatchError(
        "The document does not begin with Manchester Syntax",
        this.#location(first),
      );
    }

    while (this.#isBare("Prefix:")) {
      this.#parsePrefixDeclaration();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    await this.#indexEntityKinds(text);
    this.#expectBare("Ontology:");

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

    while (this.#isBare("Import:")) {
      this.#parseImport();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    while (this.#isBare("Annotations:")) {
      for (const annotation of this.#parseAnnotationList()) {
        this.#transaction.addAnnotation(annotation);
      }
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    while (this.#lexer.peek().type !== "EOF") {
      this.#parseFrame();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    this.#expectType("EOF");
    transaction.setDocumentFormat(OWLDocumentFormats.MANCHESTER);
    return OWLDocumentFormats.MANCHESTER;
  }

  #parsePrefixDeclaration() {
    this.#expectBare("Prefix:");
    const prefix = this.#expectType("BARE");
    const iri = this.#expectType("FULL_IRI");
    if (!prefix.value.endsWith(":")) {
      this.#syntax("Expected a colon-terminated Manchester prefix", prefix, {
        prefixName: prefix.value,
      });
    }
    if (isManchesterKeyword(prefix.value)) {
      this.#syntax(
        `The Manchester keyword ${prefix.value} cannot be used as a prefix name`,
        prefix,
        { prefixName: prefix.value },
      );
    }
    this.#requireAbsoluteIri(iri.value, iri);
    if (Object.hasOwn(STANDARD_PREFIXES, prefix.value)) {
      if (
        this.#configuration.parsingMode === "compatible" &&
        STANDARD_PREFIXES[prefix.value] === iri.value
      ) {
        this.#warning(
          "MANCHESTER_RESERVED_PREFIX_DECLARATION",
          `Ignored the redundant reserved-prefix declaration ${prefix.value}`,
          prefix,
          { prefixName: prefix.value },
        );
        return;
      }
      this.#syntax(
        `The reserved prefix ${prefix.value} cannot be declared`,
        prefix,
        {
          prefixName: prefix.value,
        },
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

  #parseImport() {
    this.#expectBare("Import:");
    const iri = this.#parseIri();
    this.#transaction.addImportsDeclaration(
      this.#dataFactory.getOWLImportsDeclaration(iri),
    );
  }

  #parseAnnotationList(depth = 1) {
    this.#expectBare("Annotations:");
    const annotations = [this.#parseAnnotation(depth)];
    while (this.#lexer.peek().type === ",") {
      this.#lexer.consume();
      annotations.push(this.#parseAnnotation(depth));
    }
    return annotations;
  }

  #parseAnnotation(depth) {
    if (depth > this.#configuration.maxAnnotationDepth) {
      const token = this.#lexer.peek();
      throw new ResourceLimitError(
        "The Manchester Syntax annotation depth limit was exceeded",
        {
          ...this.#location(token),
          limit: this.#configuration.maxAnnotationDepth,
          observed: depth,
          resource: "maxAnnotationDepth",
        },
      );
    }
    const annotations = this.#isBare("Annotations:")
      ? this.#parseAnnotationList(depth + 1)
      : [];
    const property = this.#dataFactory.getOWLAnnotationProperty(
      this.#parseIri(),
    );
    const value = this.#parseAnnotationValue();
    return this.#dataFactory.getOWLAnnotation(property, value, annotations);
  }

  #parseAnnotationValue() {
    const token = this.#lexer.peek();
    if (
      token.type === "STRING" ||
      (token.type === "BARE" && isManchesterNumericLiteral(token.value))
    ) {
      return this.#parseLiteral();
    }
    if (token.type === "NODE_ID") {
      return this.#parseIndividual();
    }
    return this.#parseIri();
  }

  #parseLiteral() {
    const token = this.#lexer.consume();
    if (token.type === "STRING") {
      if (this.#lexer.peek().type === "LANGUAGE") {
        this.#requireAdjacentLiteralSuffix(token, this.#lexer.peek());
        return this.#dataFactory.getOWLLiteral(
          token.value,
          this.#lexer.consume().value,
        );
      }
      if (this.#lexer.peek().type === "^^") {
        const marker = this.#lexer.consume();
        this.#requireAdjacentLiteralSuffix(token, marker);
        this.#requireAdjacentLiteralSuffix(marker, this.#lexer.peek());
        return this.#dataFactory.getOWLLiteral(
          token.value,
          this.#parseDatatypeIri(),
        );
      }
      return this.#dataFactory.getOWLLiteral(token.value);
    }
    if (token.type !== "BARE") {
      this.#syntax("Expected a Manchester literal", token, {
        found: token.value || token.type,
      });
    }
    if (/^[+-]?[0-9]+$/u.test(token.value)) {
      return this.#dataFactory.getOWLLiteral(
        token.value,
        IRI.create(SPECIAL_DATATYPES.integer),
      );
    }
    if (/^[+-]?[0-9]+\.[0-9]+$/u.test(token.value)) {
      return this.#dataFactory.getOWLLiteral(
        token.value,
        IRI.create(SPECIAL_DATATYPES.decimal),
      );
    }
    if (
      /^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?[fF]$/u.test(
        token.value,
      )
    ) {
      return this.#dataFactory.getOWLLiteral(
        token.value.slice(0, -1),
        IRI.create(SPECIAL_DATATYPES.float),
      );
    }
    this.#syntax("The Manchester literal is invalid", token, {
      found: token.value,
    });
  }

  #parseFrame() {
    const keyword = this.#lexer.peek();
    if (keyword.type !== "BARE") {
      this.#syntax("Expected a Manchester frame", keyword, {
        found: keyword.value || keyword.type,
      });
    }
    switch (keyword.value) {
      case "Class:":
        return this.#parseClassFrame();
      case "ObjectProperty:":
        return this.#parseObjectPropertyFrame();
      case "DataProperty:":
        return this.#parseDataPropertyFrame();
      case "Datatype:":
        return this.#parseDatatypeFrame();
      case "AnnotationProperty:":
        return this.#parseAnnotationPropertyFrame();
      case "Individual:":
        return this.#parseIndividualFrame();
      case "EquivalentClasses:":
        return this.#parseClassAxiomFrame(
          "EquivalentClasses:",
          "getOWLEquivalentClassesAxiom",
        );
      case "DisjointClasses:":
        return this.#parseClassAxiomFrame(
          "DisjointClasses:",
          "getOWLDisjointClassesAxiom",
        );
      case "EquivalentProperties:":
        return this.#parsePropertyAxiomFrame("EquivalentProperties:");
      case "DisjointProperties:":
        return this.#parsePropertyAxiomFrame("DisjointProperties:");
      case "SameIndividual:":
        return this.#parseIndividualAxiomFrame(
          "SameIndividual:",
          "getOWLSameIndividualAxiom",
        );
      case "DifferentIndividuals:":
        return this.#parseIndividualAxiomFrame(
          "DifferentIndividuals:",
          "getOWLDifferentIndividualsAxiom",
        );
      case "Rule:":
        // UNSUPPORTED(OWLAPI parity): Manchester Rule frames construct SWRL
        // rules, whose model and parser surface are DEFERRED for v1. Keep the
        // failure typed and local until capability `swrl` is approved.
        throw new UnsupportedConstructError(
          "Manchester Rule frames are outside the v1 scope",
          {
            ...this.#location(keyword),
            construct: "Rule",
          },
        );
      default:
        this.#syntax(`Unknown Manchester frame ${keyword.value}`, keyword, {
          found: keyword.value,
        });
    }
  }

  #parseClassFrame() {
    const owlClass = this.#parseNamedFrameEntity("Class:", "getOWLClass");

    while (
      this.#lexer.peek().type === "BARE" &&
      CLASS_FRAME_SECTIONS.has(this.#lexer.peek().value)
    ) {
      switch (this.#lexer.peek().value) {
        case "Annotations:":
          this.#parseFrameAnnotations(owlClass.iri);
          break;
        case "SubClassOf:":
          this.#parseAnnotatedAxiomSection(
            "SubClassOf:",
            () => this.#parseDescription(),
            (superClass, annotations) =>
              this.#dataFactory.getOWLSubClassOfAxiom(
                owlClass,
                superClass,
                annotations,
              ),
          );
          break;
        case "EquivalentTo:":
          this.#parseAnnotatedAxiomSection(
            "EquivalentTo:",
            () => this.#parseDescription(),
            (equivalentClass, annotations) =>
              this.#dataFactory.getOWLEquivalentClassesAxiom(
                [owlClass, equivalentClass],
                annotations,
              ),
          );
          break;
        case "DisjointWith:":
          this.#parseAnnotatedAxiomSection(
            "DisjointWith:",
            () => this.#parseDescription(),
            (disjointClass, annotations) =>
              this.#dataFactory.getOWLDisjointClassesAxiom(
                [owlClass, disjointClass],
                annotations,
              ),
          );
          break;
        case "DisjointUnionOf:": {
          this.#expectBare("DisjointUnionOf:");
          const annotations = this.#parseOptionalAnnotations();
          const classExpressions = this.#parseCommaSeparated(
            () => this.#parseDescription(),
            2,
            "DisjointUnionOf requires at least two class expressions",
          );
          this.#addAxiom(
            this.#dataFactory.getOWLDisjointUnionAxiom(
              owlClass,
              classExpressions,
              annotations,
            ),
          );
          break;
        }
        case "HasKey:":
          this.#parseHasKeySection(owlClass);
          break;
        default:
          throw new Error("Unreachable Manchester class section");
      }
    }
  }

  #parseObjectPropertyFrame() {
    const property = this.#parseNamedFrameEntity(
      "ObjectProperty:",
      "getOWLObjectProperty",
    );
    while (
      this.#lexer.peek().type === "BARE" &&
      OBJECT_PROPERTY_FRAME_SECTIONS.has(this.#lexer.peek().value)
    ) {
      switch (this.#lexer.peek().value) {
        case "Annotations:":
          this.#parseFrameAnnotations(property.iri);
          break;
        case "Domain:":
          this.#parseAnnotatedAxiomSection(
            "Domain:",
            () => this.#parseDescription(),
            (domain, annotations) =>
              this.#dataFactory.getOWLObjectPropertyDomainAxiom(
                property,
                domain,
                annotations,
              ),
          );
          break;
        case "Range:":
          this.#parseAnnotatedAxiomSection(
            "Range:",
            () => this.#parseDescription(),
            (range, annotations) =>
              this.#dataFactory.getOWLObjectPropertyRangeAxiom(
                property,
                range,
                annotations,
              ),
          );
          break;
        case "Characteristics:":
          this.#parseObjectPropertyCharacteristics(property);
          break;
        case "SubPropertyOf:":
          this.#parseAnnotatedAxiomSection(
            "SubPropertyOf:",
            () => this.#parseObjectPropertyExpression(),
            (superProperty, annotations) =>
              this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
                property,
                superProperty,
                annotations,
              ),
          );
          break;
        case "EquivalentTo:":
          this.#parseAnnotatedAxiomSection(
            "EquivalentTo:",
            () => this.#parseObjectPropertyExpression(),
            (equivalentProperty, annotations) =>
              this.#dataFactory.getOWLEquivalentObjectPropertiesAxiom(
                [property, equivalentProperty],
                annotations,
              ),
          );
          break;
        case "DisjointWith:":
          this.#parseAnnotatedAxiomSection(
            "DisjointWith:",
            () => this.#parseObjectPropertyExpression(),
            (disjointProperty, annotations) =>
              this.#dataFactory.getOWLDisjointObjectPropertiesAxiom(
                [property, disjointProperty],
                annotations,
              ),
          );
          break;
        case "InverseOf:":
          this.#parseAnnotatedAxiomSection(
            "InverseOf:",
            () => this.#parseObjectPropertyExpression(),
            (inverseProperty, annotations) =>
              this.#dataFactory.getOWLInverseObjectPropertiesAxiom(
                property,
                inverseProperty,
                annotations,
              ),
          );
          break;
        case "SubPropertyChain:":
          this.#parsePropertyChainSection(property);
          break;
        default:
          throw new Error("Unreachable Manchester object-property section");
      }
    }
  }

  #parseDataPropertyFrame() {
    const property = this.#parseNamedFrameEntity(
      "DataProperty:",
      "getOWLDataProperty",
    );
    while (
      this.#lexer.peek().type === "BARE" &&
      DATA_PROPERTY_FRAME_SECTIONS.has(this.#lexer.peek().value)
    ) {
      switch (this.#lexer.peek().value) {
        case "Annotations:":
          this.#parseFrameAnnotations(property.iri);
          break;
        case "Domain:":
          this.#parseAnnotatedAxiomSection(
            "Domain:",
            () => this.#parseDescription(),
            (domain, annotations) =>
              this.#dataFactory.getOWLDataPropertyDomainAxiom(
                property,
                domain,
                annotations,
              ),
          );
          break;
        case "Range:":
          this.#parseAnnotatedAxiomSection(
            "Range:",
            () => this.#parseDataRange(),
            (range, annotations) =>
              this.#dataFactory.getOWLDataPropertyRangeAxiom(
                property,
                range,
                annotations,
              ),
          );
          break;
        case "Characteristics:":
          this.#parseAnnotatedAxiomSection(
            "Characteristics:",
            () => this.#parseExpectedKeyword("Functional"),
            (_characteristic, annotations) =>
              this.#dataFactory.getOWLFunctionalDataPropertyAxiom(
                property,
                annotations,
              ),
          );
          break;
        case "SubPropertyOf:":
          this.#parseAnnotatedAxiomSection(
            "SubPropertyOf:",
            () => this.#requireDataProperty(this.#parseIriReference()),
            (superProperty, annotations) =>
              this.#dataFactory.getOWLSubDataPropertyOfAxiom(
                property,
                superProperty,
                annotations,
              ),
          );
          break;
        case "EquivalentTo:":
          this.#parseAnnotatedAxiomSection(
            "EquivalentTo:",
            () => this.#requireDataProperty(this.#parseIriReference()),
            (equivalentProperty, annotations) =>
              this.#dataFactory.getOWLEquivalentDataPropertiesAxiom(
                [property, equivalentProperty],
                annotations,
              ),
          );
          break;
        case "DisjointWith:":
          this.#parseAnnotatedAxiomSection(
            "DisjointWith:",
            () => this.#requireDataProperty(this.#parseIriReference()),
            (disjointProperty, annotations) =>
              this.#dataFactory.getOWLDisjointDataPropertiesAxiom(
                [property, disjointProperty],
                annotations,
              ),
          );
          break;
        default:
          throw new Error("Unreachable Manchester data-property section");
      }
    }
  }

  #parseDatatypeFrame() {
    this.#expectBare("Datatype:");
    const datatype = this.#dataFactory.getOWLDatatype(this.#parseDatatypeIri());
    this.#declareEntity(datatype);
    while (
      this.#lexer.peek().type === "BARE" &&
      DATATYPE_FRAME_SECTIONS.has(this.#lexer.peek().value)
    ) {
      if (this.#isBare("Annotations:")) {
        this.#parseFrameAnnotations(datatype.iri);
      } else {
        this.#parseAnnotatedAxiomSection(
          "EquivalentTo:",
          () => this.#parseDataRange(),
          (dataRange, annotations) =>
            this.#dataFactory.getOWLDatatypeDefinitionAxiom(
              datatype,
              dataRange,
              annotations,
            ),
        );
      }
    }
  }

  #parseAnnotationPropertyFrame() {
    const property = this.#parseNamedFrameEntity(
      "AnnotationProperty:",
      "getOWLAnnotationProperty",
    );
    while (
      this.#lexer.peek().type === "BARE" &&
      ANNOTATION_PROPERTY_FRAME_SECTIONS.has(this.#lexer.peek().value)
    ) {
      switch (this.#lexer.peek().value) {
        case "Annotations:":
          this.#parseFrameAnnotations(property.iri);
          break;
        case "Domain:":
          this.#parseAnnotatedAxiomSection(
            "Domain:",
            () => this.#parseIri(),
            (domain, annotations) =>
              this.#dataFactory.getOWLAnnotationPropertyDomainAxiom(
                property,
                domain,
                annotations,
              ),
            true,
          );
          break;
        case "Range:":
          this.#parseAnnotatedAxiomSection(
            "Range:",
            () => this.#parseIri(),
            (range, annotations) =>
              this.#dataFactory.getOWLAnnotationPropertyRangeAxiom(
                property,
                range,
                annotations,
              ),
            true,
          );
          break;
        case "SubPropertyOf:":
          this.#parseAnnotatedAxiomSection(
            "SubPropertyOf:",
            () => this.#dataFactory.getOWLAnnotationProperty(this.#parseIri()),
            (superProperty, annotations) =>
              this.#dataFactory.getOWLSubAnnotationPropertyOfAxiom(
                property,
                superProperty,
                annotations,
              ),
            true,
          );
          break;
        default:
          throw new Error("Unreachable Manchester annotation-property section");
      }
    }
  }

  #parseIndividualFrame() {
    this.#expectBare("Individual:");
    const individual = this.#parseIndividual();
    if (individual.kind === OWLObjectKind.NAMED_INDIVIDUAL) {
      this.#declareEntity(individual);
    }
    const annotationSubject = individual.iri || individual;
    while (
      this.#lexer.peek().type === "BARE" &&
      INDIVIDUAL_FRAME_SECTIONS.has(this.#lexer.peek().value)
    ) {
      switch (this.#lexer.peek().value) {
        case "Annotations:":
          this.#parseFrameAnnotations(annotationSubject);
          break;
        case "Types:":
          this.#parseAnnotatedAxiomSection(
            "Types:",
            () => this.#parseDescription(),
            (classExpression, annotations) =>
              this.#dataFactory.getOWLClassAssertionAxiom(
                classExpression,
                individual,
                annotations,
              ),
          );
          break;
        case "Facts:":
          this.#parseAnnotatedAxiomSection(
            "Facts:",
            () => this.#parseFact(),
            ({ constructor, property, value }, annotations) =>
              this.#dataFactory[constructor](
                property,
                individual,
                value,
                annotations,
              ),
          );
          break;
        case "SameAs:":
          this.#parseAnnotatedAxiomSection(
            "SameAs:",
            () => this.#parseIndividual(),
            (other, annotations) =>
              this.#dataFactory.getOWLSameIndividualAxiom(
                [individual, other],
                annotations,
              ),
          );
          break;
        case "DifferentFrom:":
          this.#parseAnnotatedAxiomSection(
            "DifferentFrom:",
            () => this.#parseIndividual(),
            (other, annotations) =>
              this.#dataFactory.getOWLDifferentIndividualsAxiom(
                [individual, other],
                annotations,
              ),
          );
          break;
        default:
          throw new Error("Unreachable Manchester individual section");
      }
    }
  }

  #parseClassAxiomFrame(keyword, constructor) {
    this.#expectBare(keyword);
    const annotations = this.#parseOptionalAnnotations();
    const classExpressions = this.#parseCommaSeparated(
      () => this.#parseDescription(),
      2,
      `${keyword} requires at least two class expressions`,
    );
    this.#addAxiom(
      this.#dataFactory[constructor](classExpressions, annotations),
    );
  }

  #parsePropertyAxiomFrame(keyword) {
    this.#expectBare(keyword);
    const annotations = this.#parseOptionalAnnotations();
    const references = this.#parseCommaSeparated(
      () => this.#parseGenericPropertyExpression(),
      2,
      `${keyword} requires at least two properties`,
    );
    const categories = new Set(references.map(({ category }) => category));
    if (categories.size !== 1) {
      this.#syntax(
        `${keyword} cannot mix object and data properties`,
        this.#lexer.peek(),
      );
    }
    const values = references.map(({ value }) => value);
    const category = references[0].category;
    const constructor =
      category === "object"
        ? keyword === "EquivalentProperties:"
          ? "getOWLEquivalentObjectPropertiesAxiom"
          : "getOWLDisjointObjectPropertiesAxiom"
        : keyword === "EquivalentProperties:"
          ? "getOWLEquivalentDataPropertiesAxiom"
          : "getOWLDisjointDataPropertiesAxiom";
    this.#addAxiom(this.#dataFactory[constructor](values, annotations));
  }

  #parseIndividualAxiomFrame(keyword, constructor) {
    this.#expectBare(keyword);
    const annotations = this.#parseOptionalAnnotations();
    const individuals = this.#parseCommaSeparated(
      () => this.#parseIndividual(),
      2,
      `${keyword} requires at least two individuals`,
    );
    this.#addAxiom(this.#dataFactory[constructor](individuals, annotations));
  }

  #parseNamedFrameEntity(keyword, constructor) {
    this.#expectBare(keyword);
    const entity = this.#dataFactory[constructor](this.#parseIri());
    this.#declareEntity(entity);
    return entity;
  }

  async #indexEntityKinds(text) {
    const lexer = new ManchesterSyntaxLexer(text, this.#configuration, {
      countTokens: false,
      executionBudget: this.#executionBudget,
    });
    let previous;
    while (lexer.peek().type !== "EOF") {
      const token = lexer.consume();
      const kind = ENTITY_FRAME_KINDS[token.value];
      if (token.type === "BARE" && kind && previous?.value !== "Prefix:") {
        const reference = lexer.consume();
        if (reference.type !== "NODE_ID") {
          const iri =
            kind === OWLObjectKind.DATATYPE &&
            reference.type === "BARE" &&
            SPECIAL_DATATYPES[reference.value]
              ? IRI.create(SPECIAL_DATATYPES[reference.value])
              : this.#iriFromToken(reference);
          this.#recordEntityKind(iri, kind, reference);
        }
      }
      previous = token;
      const yieldRequest = this.#cooperate(lexer);
      if (yieldRequest) {
        await yieldRequest;
      }
    }
  }

  #recordEntityKind(iri, kind, token = this.#lexer.peek()) {
    const kinds = this.#entityKinds.get(iri.value) || new Set();
    const incompatible = [...kinds].find(
      (existingKind) =>
        (PROPERTY_ENTITY_KINDS.has(existingKind) &&
          PROPERTY_ENTITY_KINDS.has(kind) &&
          existingKind !== kind) ||
        (existingKind === OWLObjectKind.CLASS &&
          kind === OWLObjectKind.DATATYPE) ||
        (existingKind === OWLObjectKind.DATATYPE &&
          kind === OWLObjectKind.CLASS),
    );
    if (incompatible) {
      this.#syntax(
        "Manchester Syntax forbids overloading this IRI across entity categories",
        token,
        {
          existingKind: incompatible,
          iri: iri.value,
          kind,
        },
      );
    }
    kinds.add(kind);
    this.#entityKinds.set(iri.value, kinds);
  }

  #parseFrameAnnotations(subject) {
    for (const annotation of this.#parseAnnotationList()) {
      this.#addAxiom(
        this.#dataFactory.getOWLAnnotationAssertionAxiom(
          annotation.property,
          subject,
          annotation.value,
          annotation.annotations,
        ),
        true,
      );
    }
  }

  #parseOptionalAnnotations() {
    return this.#isBare("Annotations:") ? this.#parseAnnotationList() : [];
  }

  #parseAnnotatedAxiomSection(
    keyword,
    parseValue,
    createAxiom,
    annotationAxiom = false,
  ) {
    this.#expectBare(keyword);
    for (const { annotations, value } of this.#parseAnnotatedList(parseValue)) {
      this.#addAxiom(createAxiom(value, annotations), annotationAxiom);
    }
  }

  #parseCommaSeparated(parseValue, minimum, message) {
    const values = [parseValue()];
    while (this.#lexer.peek().type === ",") {
      this.#lexer.consume();
      values.push(parseValue());
    }
    if (values.length < minimum) {
      this.#syntax(message, this.#lexer.peek(), {
        minimum,
        observed: values.length,
      });
    }
    return values;
  }

  #parseHasKeySection(owlClass) {
    this.#expectBare("HasKey:");
    const annotations = this.#parseOptionalAnnotations();
    const objectProperties = [];
    const dataProperties = [];
    while (this.#isBare("inverse") || this.#isIri()) {
      const { category, value } = this.#parseGenericPropertyExpression();
      if (category === "object") {
        objectProperties.push(value);
      } else {
        dataProperties.push(value);
      }
    }
    if (objectProperties.length + dataProperties.length === 0) {
      this.#syntax("HasKey requires at least one property", this.#lexer.peek());
    }
    this.#addAxiom(
      this.#dataFactory.getOWLHasKeyAxiom(
        owlClass,
        objectProperties,
        dataProperties,
        annotations,
      ),
    );
  }

  #parseObjectPropertyCharacteristics(property) {
    this.#parseAnnotatedAxiomSection(
      "Characteristics:",
      () => {
        const token = this.#expectType("BARE");
        const constructor = OBJECT_PROPERTY_CHARACTERISTICS[token.value];
        if (!constructor) {
          this.#syntax(
            `Unknown Manchester object-property characteristic ${token.value}`,
            token,
            { found: token.value },
          );
        }
        return constructor;
      },
      (constructor, annotations) =>
        this.#dataFactory[constructor](property, annotations),
    );
  }

  #parseExpectedKeyword(expected) {
    this.#expectBare(expected);
    return expected;
  }

  #parsePropertyChainSection(superProperty) {
    this.#expectBare("SubPropertyChain:");
    const annotations = this.#parseOptionalAnnotations();
    const chain = [this.#parseObjectPropertyExpression()];
    while (this.#isBare("o")) {
      this.#lexer.consume();
      chain.push(this.#parseObjectPropertyExpression());
    }
    if (chain.length < 2) {
      this.#syntax(
        "SubPropertyChain requires at least two properties",
        this.#lexer.peek(),
        { minimum: 2, observed: chain.length },
      );
    }
    this.#addAxiom(
      this.#dataFactory.getOWLSubPropertyChainOfAxiom(
        chain,
        superProperty,
        annotations,
      ),
    );
  }

  #parseFact() {
    const negated = this.#isBare("not");
    if (negated) {
      this.#lexer.consume();
    }
    if (this.#isBare("inverse")) {
      this.#syntax(
        "Manchester facts require a named object or data property",
        this.#lexer.peek(),
        { found: "inverse" },
      );
    }
    const { category, value: property } =
      this.#parseGenericPropertyExpression();
    if (category === "object") {
      return {
        constructor: negated
          ? "getOWLNegativeObjectPropertyAssertionAxiom"
          : "getOWLObjectPropertyAssertionAxiom",
        property,
        value: this.#parseIndividual(),
      };
    }
    return {
      constructor: negated
        ? "getOWLNegativeDataPropertyAssertionAxiom"
        : "getOWLDataPropertyAssertionAxiom",
      property,
      value: this.#parseLiteral(),
    };
  }

  #parseGenericPropertyExpression() {
    if (this.#isBare("inverse")) {
      return {
        category: "object",
        value: this.#parseObjectPropertyExpression(),
      };
    }
    const reference = this.#parseIriReference();
    const kinds = this.#entityKinds.get(reference.iri.value);
    const objectProperty = kinds?.has(OWLObjectKind.OBJECT_PROPERTY) || false;
    const dataProperty = kinds?.has(OWLObjectKind.DATA_PROPERTY) || false;
    if (objectProperty === dataProperty) {
      this.#syntax(
        "Expected an unambiguous declared Manchester property",
        reference.token,
        { iri: reference.iri.value },
      );
    }
    return objectProperty
      ? {
          category: "object",
          value: this.#dataFactory.getOWLObjectProperty(reference.iri),
        }
      : {
          category: "data",
          value: this.#dataFactory.getOWLDataProperty(reference.iri),
        };
  }

  #addAxiom(axiom, annotationAxiom = false) {
    if (!annotationAxiom || this.#configuration.loadAnnotationAxioms) {
      this.#transaction.addAxiom(axiom);
    }
  }

  #cooperate(lexer = this.#lexer) {
    lexer.checkExecutionBudget();
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
      lexer.checkExecutionBudget();
    });
  }

  #declareEntity(entity) {
    this.#recordEntityKind(entity.iri, entity.kind);
    this.#addAxiom(this.#dataFactory.getOWLDeclarationAxiom(entity));
  }

  #parseAnnotatedList(parseValue) {
    const values = [];
    while (true) {
      const annotations = this.#isBare("Annotations:")
        ? this.#parseAnnotationList()
        : [];
      values.push({ annotations, value: parseValue() });
      if (this.#lexer.peek().type !== ",") {
        return values;
      }
      this.#lexer.consume();
    }
  }

  #parseDescription(depth = 0) {
    this.#checkExpressionDepth(depth);
    const operands = [this.#parseConjunction(depth)];
    while (this.#isBare("or")) {
      this.#lexer.consume();
      operands.push(this.#parseConjunction(depth));
    }
    return operands.length === 1
      ? operands[0]
      : this.#dataFactory.getOWLObjectUnionOf(operands);
  }

  #parseConjunction(depth) {
    const operands = [this.#parsePrimary(depth)];
    if (this.#isBare("that")) {
      const token = this.#lexer.consume();
      if (operands[0].kind !== OWLObjectKind.CLASS) {
        this.#syntax(
          "Manchester that descriptions must begin with a named class",
          token,
        );
      }
      operands.push(this.#parseThatRestriction(depth));
      while (this.#isBare("and")) {
        this.#lexer.consume();
        operands.push(this.#parseThatRestriction(depth));
      }
      return this.#dataFactory.getOWLObjectIntersectionOf(operands);
    }
    while (this.#isBare("and")) {
      this.#lexer.consume();
      operands.push(this.#parsePrimary(depth));
    }
    return operands.length === 1
      ? operands[0]
      : this.#dataFactory.getOWLObjectIntersectionOf(operands);
  }

  #parseThatRestriction(depth) {
    this.#checkExpressionDepth(depth);
    const negated = this.#isBare("not");
    if (negated) {
      this.#lexer.consume();
    }

    let restriction;
    if (this.#isBare("inverse")) {
      restriction = this.#parseObjectRestriction(
        this.#parseObjectPropertyExpression(),
        depth,
      );
    } else {
      const reference = this.#parseIriReference();
      if (
        this.#lexer.peek().type !== "BARE" ||
        !RESTRICTION_KEYWORDS.has(this.#lexer.peek().value)
      ) {
        this.#syntax(
          "Manchester that descriptions require property restrictions",
          reference.token,
          { iri: reference.iri.value },
        );
      }
      restriction = this.#parseRestriction(reference, depth);
    }
    return negated
      ? this.#dataFactory.getOWLObjectComplementOf(restriction)
      : restriction;
  }

  #parsePrimary(depth) {
    this.#checkExpressionDepth(depth);
    const negated = this.#isBare("not");
    if (negated) {
      this.#lexer.consume();
    }

    let value;
    if (this.#lexer.peek().type === "(") {
      this.#lexer.consume();
      value = this.#parseDescription(depth + 1);
      this.#expectType(")");
    } else if (this.#lexer.peek().type === "{") {
      value = this.#parseObjectOneOf();
    } else if (this.#isBare("inverse")) {
      const property = this.#parseObjectPropertyExpression();
      value = this.#parseObjectRestriction(property, depth);
    } else {
      const reference = this.#parseIriReference();
      if (
        this.#lexer.peek().type === "BARE" &&
        RESTRICTION_KEYWORDS.has(this.#lexer.peek().value)
      ) {
        value = this.#parseRestriction(reference, depth);
      } else {
        value = this.#dataFactory.getOWLClass(reference.iri);
      }
    }

    return negated ? this.#dataFactory.getOWLObjectComplementOf(value) : value;
  }

  #parseObjectOneOf() {
    this.#expectType("{");
    const individuals = [this.#parseIndividual()];
    while (this.#lexer.peek().type === ",") {
      this.#lexer.consume();
      individuals.push(this.#parseIndividual());
    }
    this.#expectType("}");
    return this.#dataFactory.getOWLObjectOneOf(individuals);
  }

  #parseObjectPropertyExpression() {
    const inverse = this.#isBare("inverse");
    if (inverse) {
      this.#lexer.consume();
    }
    const property = this.#requireObjectProperty(this.#parseIriReference());
    return inverse
      ? this.#dataFactory.getOWLObjectInverseOf(property)
      : property;
  }

  #requireObjectProperty({ iri, token }) {
    if (!this.#entityKinds.get(iri.value)?.has(OWLObjectKind.OBJECT_PROPERTY)) {
      this.#syntax("Expected a declared Manchester object property", token, {
        iri: iri.value,
      });
    }
    return this.#dataFactory.getOWLObjectProperty(iri);
  }

  #requireDataProperty({ iri, token }) {
    if (!this.#entityKinds.get(iri.value)?.has(OWLObjectKind.DATA_PROPERTY)) {
      this.#syntax("Expected a declared Manchester data property", token, {
        iri: iri.value,
      });
    }
    return this.#dataFactory.getOWLDataProperty(iri);
  }

  #parseRestriction(reference, depth) {
    const kinds = this.#entityKinds.get(reference.iri.value);
    if (kinds?.has(OWLObjectKind.OBJECT_PROPERTY)) {
      return this.#parseObjectRestriction(
        this.#dataFactory.getOWLObjectProperty(reference.iri),
        depth,
      );
    }
    if (kinds?.has(OWLObjectKind.DATA_PROPERTY)) {
      return this.#parseDataRestriction(
        this.#dataFactory.getOWLDataProperty(reference.iri),
        depth,
      );
    }
    this.#syntax("Expected a declared Manchester property", reference.token, {
      iri: reference.iri.value,
    });
  }

  #parseObjectRestriction(property, depth) {
    const keyword = this.#expectType("BARE");
    switch (keyword.value) {
      case "some":
        return this.#dataFactory.getOWLObjectSomeValuesFrom(
          property,
          this.#parsePrimary(depth + 1),
        );
      case "only":
        return this.#dataFactory.getOWLObjectAllValuesFrom(
          property,
          this.#parsePrimary(depth + 1),
        );
      case "value":
        return this.#dataFactory.getOWLObjectHasValue(
          property,
          this.#parseIndividual(),
        );
      case "Self":
        return this.#dataFactory.getOWLObjectHasSelf(property);
      case "min":
        return this.#dataFactory.getOWLObjectMinCardinality(
          this.#parseCardinality(),
          property,
          this.#canStartPrimary() ? this.#parsePrimary(depth + 1) : undefined,
        );
      case "max":
        return this.#dataFactory.getOWLObjectMaxCardinality(
          this.#parseCardinality(),
          property,
          this.#canStartPrimary() ? this.#parsePrimary(depth + 1) : undefined,
        );
      case "exactly":
        return this.#dataFactory.getOWLObjectExactCardinality(
          this.#parseCardinality(),
          property,
          this.#canStartPrimary() ? this.#parsePrimary(depth + 1) : undefined,
        );
      default:
        this.#syntax(
          `Unknown Manchester restriction ${keyword.value}`,
          keyword,
          {
            found: keyword.value,
          },
        );
    }
  }

  #parseDataRestriction(property, depth) {
    const keyword = this.#expectType("BARE");
    switch (keyword.value) {
      case "some":
        return this.#dataFactory.getOWLDataSomeValuesFrom(
          [property],
          this.#parseDataPrimary(depth + 1),
        );
      case "only":
        return this.#dataFactory.getOWLDataAllValuesFrom(
          [property],
          this.#parseDataPrimary(depth + 1),
        );
      case "value":
        return this.#dataFactory.getOWLDataHasValue(
          property,
          this.#parseLiteral(),
        );
      case "min":
        return this.#dataFactory.getOWLDataMinCardinality(
          this.#parseCardinality(),
          property,
          this.#canStartDataPrimary()
            ? this.#parseDataPrimary(depth + 1)
            : undefined,
        );
      case "max":
        return this.#dataFactory.getOWLDataMaxCardinality(
          this.#parseCardinality(),
          property,
          this.#canStartDataPrimary()
            ? this.#parseDataPrimary(depth + 1)
            : undefined,
        );
      case "exactly":
        return this.#dataFactory.getOWLDataExactCardinality(
          this.#parseCardinality(),
          property,
          this.#canStartDataPrimary()
            ? this.#parseDataPrimary(depth + 1)
            : undefined,
        );
      default:
        this.#syntax(
          `Unknown Manchester data restriction ${keyword.value}`,
          keyword,
          { found: keyword.value },
        );
    }
  }

  #parseDataRange(depth = 0) {
    this.#checkExpressionDepth(depth);
    const operands = [this.#parseDataConjunction(depth)];
    while (this.#isBare("or")) {
      this.#lexer.consume();
      operands.push(this.#parseDataConjunction(depth));
    }
    return operands.length === 1
      ? operands[0]
      : this.#dataFactory.getOWLDataUnionOf(operands);
  }

  #parseDataConjunction(depth) {
    const operands = [this.#parseDataPrimary(depth)];
    while (this.#isBare("and")) {
      this.#lexer.consume();
      operands.push(this.#parseDataPrimary(depth));
    }
    return operands.length === 1
      ? operands[0]
      : this.#dataFactory.getOWLDataIntersectionOf(operands);
  }

  #parseDataPrimary(depth) {
    this.#checkExpressionDepth(depth);
    const negated = this.#isBare("not");
    if (negated) {
      this.#lexer.consume();
    }

    let value;
    if (this.#lexer.peek().type === "(") {
      this.#lexer.consume();
      value = this.#parseDataRange(depth + 1);
      this.#expectType(")");
    } else if (this.#lexer.peek().type === "{") {
      value = this.#parseDataOneOf();
    } else {
      const datatype = this.#dataFactory.getOWLDatatype(
        this.#parseDatatypeIri(),
      );
      value =
        this.#lexer.peek().type === "["
          ? this.#parseDatatypeRestriction(datatype)
          : datatype;
    }

    return negated ? this.#dataFactory.getOWLDataComplementOf(value) : value;
  }

  #parseDataOneOf() {
    this.#expectType("{");
    const values = [this.#parseLiteral()];
    while (this.#lexer.peek().type === ",") {
      this.#lexer.consume();
      values.push(this.#parseLiteral());
    }
    this.#expectType("}");
    return this.#dataFactory.getOWLDataOneOf(values);
  }

  #parseDatatypeRestriction(datatype) {
    this.#expectType("[");
    const restrictions = [this.#parseFacetRestriction()];
    while (this.#lexer.peek().type === ",") {
      this.#lexer.consume();
      restrictions.push(this.#parseFacetRestriction());
    }
    this.#expectType("]");
    return this.#dataFactory.getOWLDatatypeRestriction(datatype, restrictions);
  }

  #parseFacetRestriction() {
    const token = this.#lexer.consume();
    const facetIri = FACET_IRIS[token.value];
    if (
      (token.type !== "BARE" && token.type !== "FACET") ||
      facetIri === undefined
    ) {
      this.#syntax("Expected a Manchester datatype facet", token, {
        found: token.value || token.type,
      });
    }
    return this.#dataFactory.getOWLFacetRestriction(
      IRI.create(facetIri),
      this.#parseLiteral(),
    );
  }

  #parseDatatypeIri() {
    const token = this.#lexer.peek();
    if (token.type === "BARE" && SPECIAL_DATATYPES[token.value]) {
      this.#lexer.consume();
      return IRI.create(SPECIAL_DATATYPES[token.value]);
    }
    return this.#parseIri();
  }

  #parseCardinality() {
    const token = this.#expectType("BARE");
    if (!/^[0-9]+$/u.test(token.value)) {
      this.#syntax("Expected a non-negative integer cardinality", token, {
        found: token.value,
      });
    }
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
      "The Manchester Syntax expression depth limit was exceeded",
      {
        ...this.#location(token),
        limit: this.#configuration.maxExpressionDepth,
        observed: depth,
        resource: "maxExpressionDepth",
      },
    );
  }

  #canStartPrimary() {
    const token = this.#lexer.peek();
    if (["(", "{", "FULL_IRI"].includes(token.type)) {
      return true;
    }
    return (
      token.type === "BARE" &&
      !token.value.endsWith(":") &&
      token.value !== "and" &&
      token.value !== "or"
    );
  }

  #canStartDataPrimary() {
    const token = this.#lexer.peek();
    if (["(", "{", "FULL_IRI"].includes(token.type)) {
      return true;
    }
    return (
      token.type === "BARE" &&
      !token.value.endsWith(":") &&
      token.value !== "and" &&
      token.value !== "or"
    );
  }

  #parseIndividual() {
    if (this.#lexer.peek().type === "NODE_ID") {
      const token = this.#lexer.consume();
      if (!this.#anonymousIndividuals.has(token.value)) {
        const observed = this.#anonymousIndividuals.size + 1;
        if (observed > this.#configuration.maxBlankNodes) {
          throw new ResourceLimitError(
            "The Manchester Syntax blank-node limit was exceeded",
            {
              ...this.#location(token),
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
    return this.#dataFactory.getOWLNamedIndividual(this.#parseIri());
  }

  #parseIri() {
    return this.#parseIriReference().iri;
  }

  #parseIriReference() {
    const token = this.#lexer.consume();
    return { iri: this.#iriFromToken(token), token };
  }

  #iriFromToken(token) {
    if (token.type === "FULL_IRI") {
      this.#requireAbsoluteIri(token.value, token);
      return IRI.create(token.value);
    }
    if (token.type !== "BARE") {
      this.#syntax("Expected a Manchester IRI", token, {
        found: token.value || token.type,
      });
    }
    if (isManchesterKeyword(token.value)) {
      this.#syntax(
        `The Manchester keyword ${token.value} cannot be used as an IRI`,
        token,
        { found: token.value },
      );
    }
    const colon = token.value.indexOf(":");
    const prefixName = colon < 0 ? ":" : token.value.slice(0, colon + 1);
    const localName = decodePrefixedLocalName(
      colon < 0 ? token.value : token.value.slice(colon + 1),
    );
    const prefixIri = this.#prefixes.get(prefixName);
    if (prefixIri === undefined) {
      this.#syntax(`The prefix ${prefixName} has not been declared`, token, {
        prefixName,
      });
    }
    const expanded = `${prefixIri}${localName}`;
    this.#requireAbsoluteIri(expanded, token);
    return IRI.create(expanded);
  }

  #requireAbsoluteIri(value, token) {
    if (!isAbsoluteIri(value)) {
      this.#syntax("Manchester Syntax requires an absolute IRI", token, {
        iri: value,
      });
    }
  }

  #requireAdjacentLiteralSuffix(left, right) {
    if (left.endOffset !== right.offset) {
      this.#syntax(
        "Manchester literal suffixes cannot contain whitespace or comments",
        right,
      );
    }
  }

  #isIri() {
    const token = this.#lexer.peek();
    return (
      token.type === "FULL_IRI" ||
      (token.type === "BARE" && !token.value.endsWith(":"))
    );
  }

  #isBare(value) {
    const token = this.#lexer.peek();
    return token.type === "BARE" && token.value === value;
  }

  #expectBare(value) {
    const token = this.#lexer.consume();
    if (token.type !== "BARE" || token.value !== value) {
      this.#syntax(
        `Expected ${value} but found ${token.value || token.type}`,
        token,
        { expected: value, found: token.value || token.type },
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
        { expected: type, found: token.value || token.type },
      );
    }
    return token;
  }

  #location(token) {
    return this.#configuration.sourceLocations
      ? { column: token.column, line: token.line, offset: token.offset }
      : {};
  }

  #syntax(message, token, details = {}) {
    throw new OWLSyntaxError(message, {
      ...this.#location(token),
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
      ...this.#location(token),
      ...details,
    });
  }
}
