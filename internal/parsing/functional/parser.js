import {
  CooperativeCheckpoint,
  monotonicNow,
} from "../cooperativeCheckpoint.js";
import { isAbsoluteIri } from "../iriCharacters.js";

import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import {
  OWLSyntaxError,
  ParserMismatchError,
  ResourceLimitError,
  UnsupportedConstructError,
} from "../../../io/errors.js";
import { IRI } from "../../../model/structural.js";
import { normalizeCardinality } from "../../model/cardinality.js";
import { requireTwoDistinctBooleanOperands } from "../../model/setConstructs.js";
import { OntologyBehaviorContext } from "../../behavior/ontologyBehaviorContext.js";

import { decodePrefixedLocalName } from "../lexicalNames.js";
import { FunctionalSyntaxLexer } from "./lexer.js";
import { FunctionalStreamLexer } from "./streamLexer.js";
import { StreamDocumentSource } from "../../../io/streamDocumentSource.js";

import { STANDARD_PARSER_PREFIXES as STANDARD_PREFIXES } from "../../rdfjs/vocabulary.js";

const IRI_TOKEN_TYPES = new Set(["FULL_IRI", "ABBREVIATED_IRI"]);
const READ_TOKEN = Symbol("Functional Syntax consume");
const PEEK_TOKEN = Symbol("Functional Syntax lookahead");
const ANNOTATION_AXIOM_KEYWORDS = new Set([
  "AnnotationAssertion",
  "SubAnnotationPropertyOf",
  "AnnotationPropertyDomain",
  "AnnotationPropertyRange",
]);
const UNSUPPORTED_FUNCTIONAL_CONSTRUCTS = new Set(["DLSafeRule"]);

let anonymousDocumentSequence = 0;

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
  #checkpoint;
  #lexer;
  #stream;
  #prefixes;
  #transaction;
  #owlSyntaxPolicy;

  async parse(source, transaction, configuration) {
    this.#configuration = configuration;
    this.#owlSyntaxPolicy = new OntologyBehaviorContext(
      configuration.getBehaviorProfileId?.(),
    ).behaviorProfileDefinition.owlSyntaxPolicy;
    this.#dataFactory = transaction.getOWLDataFactory();
    this.#transaction = transaction;
    this.#prefixes = new Map(Object.entries(STANDARD_PREFIXES));
    this.#documentScope =
      source.getDocumentIRI()?.value ??
      `urn:owlapi-js:functional-document:${++anonymousDocumentSequence}`;
    this.#stream =
      source instanceof StreamDocumentSource
        ? new FunctionalStreamLexer(source, configuration)
        : undefined;
    this.#lexer =
      this.#stream ??
      new FunctionalSyntaxLexer(source.getText(), configuration);
    this.#checkpoint = new CooperativeCheckpoint(monotonicNow());
    const grammar = this.#parseDocument(configuration);
    try {
      let next = grammar.next();
      while (!next.done) {
        let pending = next.value;
        if (pending === READ_TOKEN) pending = this.#stream.consumeNext();
        else if (pending === PEEK_TOKEN) pending = this.#stream.refill();
        next = grammar.next(await pending);
      }
      return next.value;
    } finally {
      grammar.return();
      if (this.#stream) await this.#stream.close();
    }
  }

  *#parseDocument(configuration) {
    const first = this.#lexer.peek() ?? (yield PEEK_TOKEN);
    if (
      first.type !== "WORD" ||
      (first.value !== "Prefix" && first.value !== "Ontology")
    ) {
      throw new ParserMismatchError(
        "The document does not begin with Functional-Style Syntax",
        locationDetails(first, configuration),
      );
    }

    while (this.#isWord("Prefix", this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
      yield* this.#parsePrefixDeclaration();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        yield yieldRequest;
      }
    }
    yield* this.#parseOntology();
    this.#expectType("EOF", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#transaction.setDocumentFormat(OWLDocumentFormats.FUNCTIONAL);
    return OWLDocumentFormats.FUNCTIONAL;
  }

  *#parsePrefixDeclaration() {
    this.#expectWord("Prefix", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const prefix = this.#expectType(
      "PREFIX_NAME",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("=", this.#lexer.consume() ?? (yield READ_TOKEN));
    const iri = this.#expectType(
      "FULL_IRI",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
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

  *#parseOntology() {
    this.#expectWord("Ontology", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));

    let ontologyIri;
    let versionIri;
    if (this.#isIri(this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
      ontologyIri = this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
      if (this.#isIri(this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
        versionIri = this.#parseIri(
          this.#lexer.consume() ?? (yield READ_TOKEN),
        );
      }
    }
    this.#transaction.setOntologyID(
      this.#dataFactory.getOWLOntologyID(ontologyIri, versionIri),
    );

    while (this.#isWord("Import", this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
      yield yield* this.#parseImport();
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        yield yieldRequest;
      }
    }
    while (
      this.#isWord("Annotation", this.#lexer.peek() ?? (yield PEEK_TOKEN))
    ) {
      this.#transaction.addAnnotation(yield* this.#parseAnnotation(1));
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        yield yieldRequest;
      }
    }
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      const axiom = yield* this.#parseAxiom();
      if (
        this.#configuration.loadAnnotationAxioms ||
        !ANNOTATION_AXIOM_KEYWORDS.has(axiom.functionalKeyword)
      ) {
        this.#transaction.addAxiom(axiom.value);
      }
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        yield yieldRequest;
      }
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
  }

  *#parseImport() {
    this.#expectWord("Import", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const iri = this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#transaction.addImportsDeclaration(
      this.#dataFactory.getOWLImportsDeclaration(iri),
    );
  }

  *#parseAxiom() {
    const keyword = this.#lexer.peek() ?? (yield PEEK_TOKEN);
    if (keyword.type !== "WORD") {
      this.#syntax("Expected an OWL axiom", keyword, {
        found: keyword.value || keyword.type,
      });
    }
    if (UNSUPPORTED_FUNCTIONAL_CONSTRUCTS.has(keyword.value)) {
      throw new UnsupportedConstructError(
        `Functional construct ${keyword.value} is outside the initial 0.1 scope`,
        {
          ...locationDetails(keyword, this.#configuration),
          construct: keyword.value,
        },
      );
    }
    switch (keyword.value) {
      case "Declaration":
        return yield* this.#parseDeclaration();
      case "SubClassOf":
        return yield* this.#parseSubClassOf();
      case "EquivalentClasses":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLEquivalentClassesAxiom",
          () => this.#parseClassExpression(0),
        );
      case "DisjointClasses":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLDisjointClassesAxiom",
          () => this.#parseClassExpression(0),
        );
      case "DisjointUnion":
        return yield* this.#parseDisjointUnion();
      case "SubObjectPropertyOf":
        return yield* this.#parseSubObjectPropertyOf();
      case "EquivalentObjectProperties":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLEquivalentObjectPropertiesAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "DisjointObjectProperties":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLDisjointObjectPropertiesAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "InverseObjectProperties":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLInverseObjectPropertiesAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseObjectPropertyExpression(),
        );
      case "ObjectPropertyDomain":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLObjectPropertyDomainAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseClassExpression(0),
        );
      case "ObjectPropertyRange":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLObjectPropertyRangeAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseClassExpression(0),
        );
      case "FunctionalObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLFunctionalObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "InverseFunctionalObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLInverseFunctionalObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "ReflexiveObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLReflexiveObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "IrreflexiveObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLIrreflexiveObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "SymmetricObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLSymmetricObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "AsymmetricObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLAsymmetricObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "TransitiveObjectProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLTransitiveObjectPropertyAxiom",
          () => this.#parseObjectPropertyExpression(),
        );
      case "SubDataPropertyOf":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLSubDataPropertyOfAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseDataPropertyExpression(),
        );
      case "EquivalentDataProperties":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLEquivalentDataPropertiesAxiom",
          () => this.#parseDataPropertyExpression(),
        );
      case "DisjointDataProperties":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLDisjointDataPropertiesAxiom",
          () => this.#parseDataPropertyExpression(),
        );
      case "DataPropertyDomain":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLDataPropertyDomainAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseClassExpression(0),
        );
      case "DataPropertyRange":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLDataPropertyRangeAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseDataRange(0),
        );
      case "FunctionalDataProperty":
        return yield* this.#parseUnaryAxiom(
          keyword.value,
          "getOWLFunctionalDataPropertyAxiom",
          () => this.#parseDataPropertyExpression(),
        );
      case "DatatypeDefinition":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLDatatypeDefinitionAxiom",
          () => this.#parseDatatype(),
          () => this.#parseDataRange(0),
        );
      case "HasKey":
        return yield* this.#parseHasKey();
      case "SameIndividual":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLSameIndividualAxiom",
          () => this.#parseIndividual(),
        );
      case "DifferentIndividuals":
        return yield* this.#parseNaryAxiom(
          keyword.value,
          "getOWLDifferentIndividualsAxiom",
          () => this.#parseIndividual(),
        );
      case "ClassAssertion":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLClassAssertionAxiom",
          () => this.#parseClassExpression(0),
          () => this.#parseIndividual(),
        );
      case "ObjectPropertyAssertion":
        return yield* this.#parsePropertyAssertion(
          keyword.value,
          "getOWLObjectPropertyAssertionAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseIndividual(),
        );
      case "NegativeObjectPropertyAssertion":
        return yield* this.#parsePropertyAssertion(
          keyword.value,
          "getOWLNegativeObjectPropertyAssertionAxiom",
          () => this.#parseObjectPropertyExpression(),
          () => this.#parseIndividual(),
        );
      case "DataPropertyAssertion":
        return yield* this.#parsePropertyAssertion(
          keyword.value,
          "getOWLDataPropertyAssertionAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseLiteral(),
        );
      case "NegativeDataPropertyAssertion":
        return yield* this.#parsePropertyAssertion(
          keyword.value,
          "getOWLNegativeDataPropertyAssertionAxiom",
          () => this.#parseDataPropertyExpression(),
          () => this.#parseLiteral(),
        );
      case "AnnotationAssertion":
        return yield* this.#parseAnnotationAssertion();
      case "SubAnnotationPropertyOf":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLSubAnnotationPropertyOfAxiom",
          () => this.#parseAnnotationProperty(),
          () => this.#parseAnnotationProperty(),
        );
      case "AnnotationPropertyDomain":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLAnnotationPropertyDomainAxiom",
          () => this.#parseAnnotationProperty(),
          () => this.#readIri(),
        );
      case "AnnotationPropertyRange":
        return yield* this.#parseBinaryAxiom(
          keyword.value,
          "getOWLAnnotationPropertyRangeAxiom",
          () => this.#parseAnnotationProperty(),
          () => this.#readIri(),
        );
      default:
        this.#syntax(
          `Unsupported Functional axiom keyword ${keyword.value}`,
          keyword,
          { found: keyword.value },
        );
    }
  }

  *#parseDeclaration() {
    this.#expectWord(
      "Declaration",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const entity = yield* this.#parseEntity();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return {
      functionalKeyword: "Declaration",
      value: this.#dataFactory.getOWLDeclarationAxiom(entity, annotations),
    };
  }

  *#parseSubClassOf() {
    this.#expectWord("SubClassOf", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const subClass = yield* this.#parseClassExpression(0);
    const superClass = yield* this.#parseClassExpression(0);
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return {
      functionalKeyword: "SubClassOf",
      value: this.#dataFactory.getOWLSubClassOfAxiom(
        subClass,
        superClass,
        annotations,
      ),
    };
  }

  *#parseNaryAxiom(keyword, constructor, parseOperand) {
    const start = this.#expectWord(
      keyword,
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const operands = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      operands.push(yield* parseOperand());
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(operands, 2, keyword, start);
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](operands, annotations),
    };
  }

  *#parseUnaryAxiom(keyword, constructor, parseOperand) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const operand = yield* parseOperand();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](operand, annotations),
    };
  }

  *#parseBinaryAxiom(keyword, constructor, parseFirst, parseSecond) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const first = yield* parseFirst();
    const second = yield* parseSecond();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return {
      functionalKeyword: keyword,
      value: this.#dataFactory[constructor](first, second, annotations),
    };
  }

  *#parseDisjointUnion() {
    const start = this.#expectWord(
      "DisjointUnion",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const owlClass = this.#dataFactory.getOWLClass(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
    const classExpressions = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      classExpressions.push(yield* this.#parseClassExpression(0));
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
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

  *#parseSubObjectPropertyOf() {
    this.#expectWord(
      "SubObjectPropertyOf",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    if (
      this.#isWord(
        "ObjectPropertyChain",
        this.#lexer.peek() ?? (yield PEEK_TOKEN),
      )
    ) {
      const chain = yield* this.#parseObjectPropertyChain();
      const superProperty = yield* this.#parseObjectPropertyExpression();
      this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
      return {
        functionalKeyword: "SubObjectPropertyOf",
        value: this.#dataFactory.getOWLSubPropertyChainOfAxiom(
          chain,
          superProperty,
          annotations,
        ),
      };
    }
    const subProperty = yield* this.#parseObjectPropertyExpression();
    const superProperty = yield* this.#parseObjectPropertyExpression();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return {
      functionalKeyword: "SubObjectPropertyOf",
      value: this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
        subProperty,
        superProperty,
        annotations,
      ),
    };
  }

  *#parseObjectPropertyChain() {
    const start = this.#expectWord(
      "ObjectPropertyChain",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const chain = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      chain.push(yield* this.#parseObjectPropertyExpression());
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(chain, 2, "ObjectPropertyChain", start);
    return chain;
  }

  *#parseHasKey() {
    const start = this.#expectWord(
      "HasKey",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const classExpression = yield* this.#parseClassExpression(0);
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const objectProperties = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      objectProperties.push(yield* this.#parseObjectPropertyExpression());
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const dataProperties = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      dataProperties.push(yield* this.#parseDataPropertyExpression());
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
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

  *#parsePropertyAssertion(keyword, constructor, parseProperty, parseValue) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const property = yield* parseProperty();
    const subject = yield* this.#parseIndividual();
    const value = yield* parseValue();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
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

  *#parseAnnotationAssertion() {
    this.#expectWord(
      "AnnotationAssertion",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = yield* this.#parseAxiomAnnotations();
    const property = yield* this.#parseAnnotationProperty();
    const subject = yield* this.#parseAnnotationSubject();
    const value = yield* this.#parseAnnotationValue();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
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

  *#parseAnnotationProperty() {
    return this.#dataFactory.getOWLAnnotationProperty(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
  }

  *#parseAnnotationSubject() {
    return (this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === "NODE_ID"
      ? yield* this.#parseAnonymousIndividual()
      : this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
  }

  *#parseClassExpression(depth) {
    this.#checkExpressionDepth(depth);
    if (this.#isIri(this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
      return this.#dataFactory.getOWLClass(
        this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
      );
    }
    const keyword = this.#lexer.peek() ?? (yield PEEK_TOKEN);
    if (keyword.type !== "WORD") {
      this.#syntax("Expected a class expression", keyword, {
        found: keyword.value || keyword.type,
      });
    }

    switch (keyword.value) {
      case "ObjectIntersectionOf":
        return yield* this.#parseNaryClassExpression(
          keyword.value,
          "getOWLObjectIntersectionOf",
          depth,
        );
      case "ObjectUnionOf":
        return yield* this.#parseNaryClassExpression(
          keyword.value,
          "getOWLObjectUnionOf",
          depth,
        );
      case "ObjectComplementOf":
        return yield* this.#parseUnaryClassExpression(
          keyword.value,
          "getOWLObjectComplementOf",
          depth,
        );
      case "ObjectOneOf":
        return yield* this.#parseObjectOneOf(depth);
      case "ObjectSomeValuesFrom":
        return yield* this.#parseObjectRestriction(
          keyword.value,
          "getOWLObjectSomeValuesFrom",
          depth,
          "class",
        );
      case "ObjectAllValuesFrom":
        return yield* this.#parseObjectRestriction(
          keyword.value,
          "getOWLObjectAllValuesFrom",
          depth,
          "class",
        );
      case "ObjectHasValue":
        return yield* this.#parseObjectRestriction(
          keyword.value,
          "getOWLObjectHasValue",
          depth,
          "individual",
        );
      case "ObjectHasSelf":
        return yield* this.#parseObjectHasSelf();
      case "ObjectMinCardinality":
        return yield* this.#parseObjectCardinality(
          keyword.value,
          "getOWLObjectMinCardinality",
          depth,
        );
      case "ObjectMaxCardinality":
        return yield* this.#parseObjectCardinality(
          keyword.value,
          "getOWLObjectMaxCardinality",
          depth,
        );
      case "ObjectExactCardinality":
        return yield* this.#parseObjectCardinality(
          keyword.value,
          "getOWLObjectExactCardinality",
          depth,
        );
      case "DataSomeValuesFrom":
        return yield* this.#parseDataQuantifiedRestriction(
          keyword.value,
          "getOWLDataSomeValuesFrom",
          depth,
        );
      case "DataAllValuesFrom":
        return yield* this.#parseDataQuantifiedRestriction(
          keyword.value,
          "getOWLDataAllValuesFrom",
          depth,
        );
      case "DataHasValue":
        return yield* this.#parseDataHasValue();
      case "DataMinCardinality":
        return yield* this.#parseDataCardinality(
          keyword.value,
          "getOWLDataMinCardinality",
          depth,
        );
      case "DataMaxCardinality":
        return yield* this.#parseDataCardinality(
          keyword.value,
          "getOWLDataMaxCardinality",
          depth,
        );
      case "DataExactCardinality":
        return yield* this.#parseDataCardinality(
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

  *#parseNaryClassExpression(keyword, constructor, depth) {
    const start = this.#expectWord(
      keyword,
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const operands = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      operands.push(yield* this.#parseClassExpression(depth + 1));
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(operands, 2, keyword, start);
    if (this.#configuration.parsingMode === "strict") {
      requireTwoDistinctBooleanOperands(operands);
    }
    return this.#dataFactory[constructor](operands);
  }

  *#parseUnaryClassExpression(keyword, constructor, depth) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const operand = yield* this.#parseClassExpression(depth + 1);
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory[constructor](operand);
  }

  *#parseObjectOneOf(depth) {
    const start = this.#expectWord(
      "ObjectOneOf",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const individuals = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      this.#checkExpressionDepth(depth + 1);
      individuals.push(yield* this.#parseIndividual());
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(individuals, 1, "ObjectOneOf", start);
    return this.#dataFactory.getOWLObjectOneOf(individuals);
  }

  *#parseObjectRestriction(keyword, constructor, depth, fillerType) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const property = yield* this.#parseObjectPropertyExpression();
    const filler =
      fillerType === "class"
        ? yield* this.#parseClassExpression(depth + 1)
        : yield* this.#parseIndividual();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory[constructor](property, filler);
  }

  *#parseObjectHasSelf() {
    this.#expectWord(
      "ObjectHasSelf",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const property = yield* this.#parseObjectPropertyExpression();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory.getOWLObjectHasSelf(property);
  }

  *#parseObjectCardinality(keyword, constructor, depth) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const cardinality = yield* this.#parseCardinality();
    const property = yield* this.#parseObjectPropertyExpression();
    const filler =
      (this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === ")"
        ? undefined
        : yield* this.#parseClassExpression(depth + 1);
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory[constructor](cardinality, property, filler);
  }

  *#parseObjectPropertyExpression() {
    if (
      this.#isWord("ObjectInverseOf", this.#lexer.peek() ?? (yield PEEK_TOKEN))
    ) {
      this.#expectWord(
        "ObjectInverseOf",
        this.#lexer.consume() ?? (yield READ_TOKEN),
      );
      this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
      const property = this.#dataFactory.getOWLObjectProperty(
        this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
      );
      this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
      return this.#dataFactory.getOWLObjectInverseOf(property);
    }
    return this.#dataFactory.getOWLObjectProperty(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
  }

  *#parseDataQuantifiedRestriction(keyword, constructor, depth) {
    const start = this.#expectWord(
      keyword,
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const iris = [];
    while (this.#isIri(this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
      iris.push(this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)));
    }

    let filler;
    if ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === ")") {
      this.#requireMinimum(iris, 2, keyword, start);
      filler = this.#dataFactory.getOWLDatatype(iris.pop());
    } else {
      this.#requireMinimum(iris, 1, keyword, start);
      filler = yield* this.#parseDataRange(depth + 1);
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    const properties = iris.map((iri) =>
      this.#dataFactory.getOWLDataProperty(iri),
    );
    if (
      this.#owlSyntaxPolicy.requiresUnaryFunctionalDataRestrictions &&
      properties.length !== 1
    )
      this.#syntax(
        "The Java Functional parser accepts one data property in a quantified restriction",
        start,
      );
    return this.#dataFactory[constructor](properties, filler);
  }

  *#parseDataHasValue() {
    this.#expectWord(
      "DataHasValue",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const property = yield* this.#parseDataPropertyExpression();
    const value = yield* this.#parseLiteral();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory.getOWLDataHasValue(property, value);
  }

  *#parseDataCardinality(keyword, constructor, depth) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const cardinality = yield* this.#parseCardinality();
    const property = yield* this.#parseDataPropertyExpression();
    const filler =
      (this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === ")"
        ? undefined
        : yield* this.#parseDataRange(depth + 1);
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory[constructor](cardinality, property, filler);
  }

  *#parseDataRange(depth) {
    this.#checkExpressionDepth(depth);
    if (this.#isIri(this.#lexer.peek() ?? (yield PEEK_TOKEN))) {
      return yield* this.#parseDatatype();
    }
    const keyword = this.#lexer.peek() ?? (yield PEEK_TOKEN);
    if (keyword.type !== "WORD") {
      this.#syntax("Expected a data range", keyword, {
        found: keyword.value || keyword.type,
      });
    }
    switch (keyword.value) {
      case "DataIntersectionOf":
        return yield* this.#parseNaryDataRange(
          keyword.value,
          "getOWLDataIntersectionOf",
          depth,
        );
      case "DataUnionOf":
        return yield* this.#parseNaryDataRange(
          keyword.value,
          "getOWLDataUnionOf",
          depth,
        );
      case "DataComplementOf":
        return yield* this.#parseUnaryDataRange(
          keyword.value,
          "getOWLDataComplementOf",
          depth,
        );
      case "DataOneOf":
        return yield* this.#parseDataOneOf();
      case "DatatypeRestriction":
        return yield* this.#parseDatatypeRestriction(depth);
      default:
        this.#syntax(`Unknown data range ${keyword.value}`, keyword, {
          found: keyword.value,
        });
    }
  }

  *#parseNaryDataRange(keyword, constructor, depth) {
    const start = this.#expectWord(
      keyword,
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const operands = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      operands.push(yield* this.#parseDataRange(depth + 1));
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(operands, 2, keyword, start);
    return this.#dataFactory[constructor](operands);
  }

  *#parseUnaryDataRange(keyword, constructor, depth) {
    this.#expectWord(keyword, this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const operand = yield* this.#parseDataRange(depth + 1);
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory[constructor](operand);
  }

  *#parseDataOneOf() {
    const start = this.#expectWord(
      "DataOneOf",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const values = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      values.push(yield* this.#parseLiteral());
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(values, 1, "DataOneOf", start);
    return this.#dataFactory.getOWLDataOneOf(values);
  }

  *#parseDatatypeRestriction(depth) {
    const start = this.#expectWord(
      "DatatypeRestriction",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const datatype = yield* this.#parseDatatype();
    const restrictions = [];
    while ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type !== ")") {
      this.#checkExpressionDepth(depth + 1);
      const facet = this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
      const value = yield* this.#parseLiteral();
      restrictions.push(this.#dataFactory.getOWLFacetRestriction(facet, value));
    }
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#requireMinimum(restrictions, 1, "DatatypeRestriction", start);
    return this.#dataFactory.getOWLDatatypeRestriction(datatype, restrictions);
  }

  *#parseDatatype() {
    return this.#dataFactory.getOWLDatatype(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
  }

  *#parseDataPropertyExpression() {
    return this.#dataFactory.getOWLDataProperty(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
  }

  *#parseIndividual() {
    if ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === "NODE_ID") {
      return yield* this.#parseAnonymousIndividual();
    }
    return this.#dataFactory.getOWLNamedIndividual(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
  }

  *#parseCardinality() {
    const token = this.#expectType(
      "INTEGER",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
    return normalizeCardinality(token.value);
  }

  #checkExpressionDepth(depth) {
    if (depth <= this.#configuration.maxExpressionDepth) {
      return;
    }
    const token = this.#stream?.currentToken() ?? this.#lexer.peek();
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

  *#parseEntity() {
    const keyword = this.#expectType(
      "WORD",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
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
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const iri = this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory[constructor](iri);
  }

  *#parseAxiomAnnotations() {
    const annotations = [];
    while (
      this.#isWord("Annotation", this.#lexer.peek() ?? (yield PEEK_TOKEN))
    ) {
      annotations.push(yield* this.#parseAnnotation(1));
    }
    return annotations;
  }

  *#parseAnnotation(depth) {
    if (depth > this.#configuration.maxAnnotationDepth) {
      const token = this.#stream?.currentToken() ?? this.#lexer.peek();
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
    this.#expectWord("Annotation", this.#lexer.consume() ?? (yield READ_TOKEN));
    this.#expectType("(", this.#lexer.consume() ?? (yield READ_TOKEN));
    const annotations = [];
    while (
      this.#isWord("Annotation", this.#lexer.peek() ?? (yield PEEK_TOKEN))
    ) {
      annotations.push(yield* this.#parseAnnotation(depth + 1));
    }
    const property = this.#dataFactory.getOWLAnnotationProperty(
      this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
    );
    const value = yield* this.#parseAnnotationValue();
    this.#expectType(")", this.#lexer.consume() ?? (yield READ_TOKEN));
    return this.#dataFactory.getOWLAnnotation(property, value, annotations);
  }

  *#parseAnnotationValue() {
    if ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === "STRING") {
      return yield* this.#parseLiteral();
    }
    if ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === "NODE_ID") {
      return yield* this.#parseAnonymousIndividual();
    }
    return this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
  }

  *#parseLiteral() {
    const lexicalForm = this.#expectType(
      "STRING",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    ).value;
    if ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === "LANGUAGE") {
      return this.#dataFactory.getOWLLiteral(
        lexicalForm,
        (this.#lexer.consume() ?? (yield READ_TOKEN)).value,
      );
    }
    if ((this.#lexer.peek() ?? (yield PEEK_TOKEN)).type === "^^") {
      this.#lexer.consume() ?? (yield READ_TOKEN);
      return this.#dataFactory.getOWLLiteral(
        lexicalForm,
        this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN)),
      );
    }
    return this.#dataFactory.getOWLLiteral(lexicalForm);
  }

  *#parseAnonymousIndividual() {
    const token = this.#expectType(
      "NODE_ID",
      this.#lexer.consume() ?? (yield READ_TOKEN),
    );
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

  #cooperate(lexer = this.#lexer) {
    return this.#checkpoint.cooperate(lexer);
  }

  *#readIri() {
    return this.#parseIri(this.#lexer.consume() ?? (yield READ_TOKEN));
  }

  #parseIri(token) {
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

  #isIri(token) {
    return IRI_TOKEN_TYPES.has(token.type);
  }

  #isWord(value, token) {
    return token.type === "WORD" && token.value === value;
  }

  #expectWord(value, token) {
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

  #expectType(type, token) {
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
