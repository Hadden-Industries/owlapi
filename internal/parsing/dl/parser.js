import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { OWLSyntaxError, ResourceLimitError } from "../../../io/errors.js";
import { OWLObjectKind } from "../../../model/kinds.js";
import { IRI } from "../../../model/structural.js";

import { DLSyntaxLexer } from "./lexer.js";

const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const OWL_THING_IRI = "http://www.w3.org/2002/07/owl#Thing";
const OWL_NOTHING_IRI = "http://www.w3.org/2002/07/owl#Nothing";
const XSD_DOUBLE_IRI = "http://www.w3.org/2001/XMLSchema#double";
const XSD_INTEGER_IRI = "http://www.w3.org/2001/XMLSchema#integer";
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
let anonymousDocumentSequence = 0;

const documentNamespace = (source) => {
  const documentIri = source.getDocumentIRI()?.value;
  if (!documentIri) {
    return `urn:owlapi-js:dl-document:${++anonymousDocumentSequence}#`;
  }
  return documentIri.endsWith("#") || documentIri.endsWith("/")
    ? documentIri
    : `${documentIri}#`;
};

const uniqueStructuralValues = (values) => {
  const byKey = new Map();
  for (const value of values) {
    byKey.set(value.structuralKey(), value);
  }
  return [...byKey.values()];
};

export class OWLDLSyntaxOWLParser {
  #configuration;
  #dataFactory;
  #executionBudget;
  #lastYieldAt;
  #lexer;
  #namespace;

  async parse(source, transaction, configuration) {
    this.#configuration = configuration;
    this.#dataFactory = transaction.getOWLDataFactory();
    this.#namespace = documentNamespace(source);
    const startedAt = monotonicNow();
    this.#executionBudget = Object.freeze({
      deadline: startedAt + configuration.timeoutMs,
      startedAt,
    });
    this.#lastYieldAt = startedAt;
    this.#lexer = new DLSyntaxLexer(
      source.getText(),
      configuration,
      this.#executionBudget,
    );

    while (this.#lexer.peek().type !== "EOF") {
      transaction.addAxiom(this.#parseAxiom());
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    this.#expect("EOF");
    transaction.setDocumentFormat(OWLDocumentFormats.DL);
    return OWLDocumentFormats.DL;
  }

  #parseAxiom() {
    if (this.#lexer.peek().type === ":") {
      return this.#parsePropertyAxiom();
    }
    if (
      this.#lexer.peek().type === "ID" &&
      this.#lexer.peek(1).type === "NOT_EQUAL"
    ) {
      return this.#parseDifferentIndividualsAxiom();
    }
    if (
      this.#lexer.peek().type === "ID" &&
      this.#lexer.peek(1).type === "EXACT" &&
      this.#lexer.peek(2).type === "ID"
    ) {
      return this.#parseSameIndividualAxiom();
    }
    if (
      this.#lexer.peek().type === "ID" &&
      (this.#lexer.peek(1).type === "(" ||
        (this.#lexer.peek(1).type === "INVERSE" &&
          this.#lexer.peek(2).type === "("))
    ) {
      return this.#parseAtomicAssertionAxiom();
    }

    const left = this.#parseClassExpression(0);
    if (this.#lexer.peek().type === "(") {
      const individual = this.#parseParenthesizedIndividual();
      return this.#dataFactory.getOWLClassAssertionAxiom(left, individual);
    }
    const operator = this.#lexer.consume();
    if (operator.type === "SUBCLASS") {
      return this.#createSubclassLikeAxiom(left, this.#parseClassExpression(0));
    }
    if (operator.type === "EQUIVALENT") {
      return this.#dataFactory.getOWLEquivalentClassesAxiom([
        left,
        this.#parseClassExpression(0),
      ]);
    }
    this.#syntax("Expected a DL Syntax axiom operator", operator, {
      expected: "SUBCLASS or EQUIVALENT",
      found: operator.value || operator.type,
    });
  }

  #parseAtomicAssertionAxiom() {
    const name = this.#expect("ID");
    const inverse = this.#accept("INVERSE");
    this.#expect("(");
    const subject = this.#parseIndividual();
    if (this.#accept(")")) {
      if (inverse) {
        this.#syntax(
          "An inverse object property assertion requires an object",
          inverse,
        );
      }
      return this.#dataFactory.getOWLClassAssertionAxiom(
        this.#dataFactory.getOWLClass(this.#iri(name)),
        subject,
      );
    }
    this.#expect(",");
    const valueToken = this.#lexer.peek();
    if (valueToken.type === "INTEGER" || valueToken.type === "DOUBLE") {
      if (inverse) {
        this.#syntax("A data property cannot be inverse", inverse);
      }
      const value = this.#parseLiteral();
      this.#expect(")");
      return this.#dataFactory.getOWLDataPropertyAssertionAxiom(
        this.#dataFactory.getOWLDataProperty(this.#iri(name)),
        subject,
        value,
      );
    }
    const object = this.#parseIndividual();
    this.#expect(")");
    let property = this.#dataFactory.getOWLObjectProperty(this.#iri(name));
    if (inverse) {
      property = this.#dataFactory.getOWLObjectInverseOf(property);
    }
    return this.#dataFactory.getOWLObjectPropertyAssertionAxiom(
      property,
      subject,
      object,
    );
  }

  #parseSameIndividualAxiom() {
    const first = this.#parseIndividual();
    this.#expect("EXACT");
    const second = this.#parseIndividual();
    return this.#dataFactory.getOWLSameIndividualAxiom([first, second]);
  }

  #parseDifferentIndividualsAxiom() {
    const individuals = [this.#parseIndividual()];
    do {
      this.#expect("NOT_EQUAL");
      individuals.push(this.#parseIndividual());
    } while (this.#lexer.peek().type === "NOT_EQUAL");
    return this.#dataFactory.getOWLDifferentIndividualsAxiom(individuals);
  }

  #parsePropertyAxiom() {
    this.#expect(":");
    const left = this.#parseObjectPropertyExpression();
    if (this.#accept("COMPOSE")) {
      const chain = [left, this.#parseObjectPropertyExpression()];
      while (this.#accept("COMPOSE")) {
        chain.push(this.#parseObjectPropertyExpression());
      }
      this.#expect("SUBCLASS");
      return this.#dataFactory.getOWLSubPropertyChainOfAxiom(
        chain,
        this.#parseObjectPropertyExpression(),
      );
    }
    if (this.#accept("SUBCLASS")) {
      return this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
        left,
        this.#parseObjectPropertyExpression(),
      );
    }
    if (this.#accept("EQUIVALENT")) {
      const right = this.#parseObjectPropertyExpression();
      if (right.kind === OWLObjectKind.OBJECT_INVERSE_OF) {
        return this.#dataFactory.getOWLInverseObjectPropertiesAxiom(
          left,
          right.inverse,
        );
      }
      return this.#dataFactory.getOWLEquivalentObjectPropertiesAxiom([
        left,
        right,
      ]);
    }
    if (this.#accept("IN")) {
      this.#expect("TRANSITIVE");
      return this.#dataFactory.getOWLTransitiveObjectPropertyAxiom(left);
    }
    const token = this.#lexer.peek();
    this.#syntax("Expected an object-property axiom operator", token, {
      found: token.value || token.type,
    });
  }

  #createSubclassLikeAxiom(left, right) {
    if (this.#isThing(left)) {
      if (right.kind === OWLObjectKind.OBJECT_ALL_VALUES_FROM) {
        return this.#dataFactory.getOWLObjectPropertyRangeAxiom(
          right.property,
          right.filler,
        );
      }
      if (
        right.kind === OWLObjectKind.OBJECT_MAX_CARDINALITY &&
        right.cardinality === 1 &&
        this.#isThing(right.filler)
      ) {
        return this.#dataFactory.getOWLFunctionalObjectPropertyAxiom(
          right.property,
        );
      }
    }
    if (
      left.kind === OWLObjectKind.OBJECT_SOME_VALUES_FROM &&
      this.#isThing(left.filler)
    ) {
      return this.#dataFactory.getOWLObjectPropertyDomainAxiom(
        left.property,
        right,
      );
    }
    return this.#dataFactory.getOWLSubClassOfAxiom(left, right);
  }

  #parseClassExpression(depth) {
    this.#checkExpressionDepth(depth);
    return this.#parseOr(depth);
  }

  #parseOr(depth) {
    const operands = [this.#parseAnd(depth)];
    while (this.#accept("OR")) {
      operands.push(this.#parseAnd(depth + 1));
    }
    const unique = uniqueStructuralValues(operands);
    return unique.length === 1
      ? unique[0]
      : this.#dataFactory.getOWLObjectUnionOf(unique);
  }

  #parseAnd(depth) {
    const operands = [this.#parseNonNaryExpression(depth)];
    while (this.#accept("AND")) {
      operands.push(this.#parseNonNaryExpression(depth + 1));
    }
    const unique = uniqueStructuralValues(operands);
    return unique.length === 1
      ? unique[0]
      : this.#dataFactory.getOWLObjectIntersectionOf(unique);
  }

  #parseNonNaryExpression(depth) {
    this.#checkExpressionDepth(depth);
    switch (this.#lexer.peek().type) {
      case "SOME":
        return this.#parseSomeRestriction(depth);
      case "ALL":
        return this.#parseAllRestriction(depth);
      case "MIN":
      case "MAX":
      case "EXACT":
        return this.#parseCardinalityRestriction(depth);
      case "NOT": {
        this.#lexer.consume();
        return this.#dataFactory.getOWLObjectComplementOf(
          this.#parseNamedOrNestedExpression(depth + 1),
        );
      }
      default:
        return this.#parseNamedOrNestedExpression(depth);
    }
  }

  #parseSomeRestriction(depth) {
    this.#expect("SOME");
    const reference = this.#parsePropertyReference();
    this.#accept("DOT");
    if (
      this.#lexer.peek().type === "{" &&
      ["INTEGER", "DOUBLE"].includes(this.#lexer.peek(1).type)
    ) {
      if (reference.inverse) {
        this.#syntax("A data property cannot be inverse", reference.lastToken);
      }
      return this.#dataFactory.getOWLDataSomeValuesFrom(
        [this.#dataFactory.getOWLDataProperty(this.#iri(reference.name))],
        this.#parseDataOneOf(),
      );
    }
    return this.#dataFactory.getOWLObjectSomeValuesFrom(
      this.#objectPropertyFromReference(reference),
      this.#parseNamedOrNestedExpression(depth + 1),
    );
  }

  #parseAllRestriction(depth) {
    this.#expect("ALL");
    const property = this.#parseObjectPropertyExpression();
    this.#accept("DOT");
    return this.#dataFactory.getOWLObjectAllValuesFrom(
      property,
      this.#parseNamedOrNestedExpression(depth + 1),
    );
  }

  #parseCardinalityRestriction(depth) {
    const operator = this.#lexer.consume();
    const cardinalityToken = this.#expect("INTEGER");
    const cardinality = Number.parseInt(cardinalityToken.value, 10);
    if (!Number.isSafeInteger(cardinality)) {
      this.#syntax(
        "The cardinality is outside the safe integer range",
        cardinalityToken,
        { found: cardinalityToken.value },
      );
    }
    const reference = this.#parsePropertyReference();
    const property = this.#objectPropertyFromReference(reference);
    let filler = this.#owlThing();
    if (this.#accept("DOT")) {
      filler = this.#parseNamedOrNestedExpression(depth + 1);
    } else if (
      this.#canStartNamedOrNestedExpression(this.#lexer.peek()) &&
      this.#lexer.peek().line === reference.lastToken.line
    ) {
      filler = this.#parseNamedOrNestedExpression(depth + 1);
    }
    const methods = {
      EXACT: "getOWLObjectExactCardinality",
      MAX: "getOWLObjectMaxCardinality",
      MIN: "getOWLObjectMinCardinality",
    };
    return this.#dataFactory[methods[operator.type]](
      cardinality,
      property,
      filler,
    );
  }

  #parseNamedOrNestedExpression(depth) {
    this.#checkExpressionDepth(depth);
    const token = this.#lexer.peek();
    if (token.type === "ID") {
      return this.#dataFactory.getOWLClass(this.#iri(this.#lexer.consume()));
    }
    if (this.#accept("(")) {
      const expression = this.#parseClassExpression(depth + 1);
      this.#expect(")");
      return expression;
    }
    if (token.type === "{") {
      return this.#parseObjectOneOf();
    }
    this.#syntax("Expected a named or nested class expression", token, {
      found: token.value || token.type,
    });
  }

  #parseObjectOneOf() {
    this.#expect("{");
    const individuals = [];
    while (this.#lexer.peek().type !== "}") {
      if (this.#lexer.peek().type === "EOF") {
        this.#syntax(
          "An object nominal is missing its closing brace",
          this.#lexer.peek(),
        );
      }
      individuals.push(this.#parseIndividual());
    }
    const closing = this.#expect("}");
    if (individuals.length === 0) {
      this.#syntax(
        "An object nominal requires at least one individual",
        closing,
      );
    }
    return this.#dataFactory.getOWLObjectOneOf(individuals);
  }

  #parseDataOneOf() {
    this.#expect("{");
    const values = [];
    while (this.#lexer.peek().type !== "}") {
      if (this.#lexer.peek().type === "EOF") {
        this.#syntax(
          "A data nominal is missing its closing brace",
          this.#lexer.peek(),
        );
      }
      values.push(this.#parseLiteral());
    }
    const closing = this.#expect("}");
    if (values.length === 0) {
      this.#syntax("A data nominal requires at least one literal", closing);
    }
    return this.#dataFactory.getOWLDataOneOf(values);
  }

  #parseLiteral() {
    const token = this.#lexer.consume();
    if (token.type === "INTEGER") {
      const parsed = Number.parseInt(token.value, 10);
      if (!Number.isSafeInteger(parsed)) {
        this.#syntax(
          "The integer literal is outside the safe integer range",
          token,
          { found: token.value },
        );
      }
      return this.#dataFactory.getOWLLiteral(
        String(parsed),
        IRI.create(XSD_INTEGER_IRI),
      );
    }
    if (token.type === "DOUBLE") {
      const parsed = Number(token.value);
      if (!Number.isFinite(parsed)) {
        this.#syntax("The double literal is not finite", token, {
          found: token.value,
        });
      }
      const lexicalForm = Number.isInteger(parsed)
        ? parsed.toFixed(1)
        : String(parsed);
      return this.#dataFactory.getOWLLiteral(
        lexicalForm,
        IRI.create(XSD_DOUBLE_IRI),
      );
    }
    this.#syntax("Expected a numeric DL Syntax literal", token, {
      found: token.value || token.type,
    });
  }

  #parseParenthesizedIndividual() {
    this.#expect("(");
    const individual = this.#parseIndividual();
    this.#expect(")");
    return individual;
  }

  #parseIndividual() {
    const token = this.#expect("ID");
    return this.#dataFactory.getOWLNamedIndividual(this.#iri(token));
  }

  #parseObjectPropertyExpression() {
    return this.#objectPropertyFromReference(this.#parsePropertyReference());
  }

  #parsePropertyReference() {
    const name = this.#expect("ID");
    const inverse = this.#accept("INVERSE");
    return {
      inverse: Boolean(inverse),
      lastToken: inverse || name,
      name,
    };
  }

  #objectPropertyFromReference(reference) {
    const property = this.#dataFactory.getOWLObjectProperty(
      this.#iri(reference.name),
    );
    return reference.inverse
      ? this.#dataFactory.getOWLObjectInverseOf(property)
      : property;
  }

  #canStartNamedOrNestedExpression(token) {
    return token.type === "ID" || token.type === "(" || token.type === "{";
  }

  #isThing(expression) {
    return (
      expression.kind === OWLObjectKind.CLASS &&
      expression.iri.value === OWL_THING_IRI
    );
  }

  #owlThing() {
    return this.#dataFactory.getOWLClass(IRI.create(OWL_THING_IRI));
  }

  #iri(token) {
    if (token.value === "top" || token.value === "⊤") {
      return IRI.create(OWL_THING_IRI);
    }
    if (token.value === "bottom" || token.value === "⊥") {
      return IRI.create(OWL_NOTHING_IRI);
    }
    return IRI.create(`${this.#namespace}${token.value}`);
  }

  #checkExpressionDepth(depth) {
    if (depth <= this.#configuration.maxExpressionDepth) {
      return;
    }
    const token = this.#lexer.peek();
    throw new ResourceLimitError(
      "The DL Syntax expression depth limit was exceeded",
      {
        ...this.#location(token),
        limit: this.#configuration.maxExpressionDepth,
        observed: depth,
        resource: "maxExpressionDepth",
      },
    );
  }

  #accept(type) {
    if (this.#lexer.peek().type !== type) {
      return undefined;
    }
    return this.#lexer.consume();
  }

  #expect(type) {
    const token = this.#lexer.peek();
    if (token.type !== type) {
      this.#syntax(`Expected DL Syntax token ${type}`, token, {
        expected: type,
        found: token.value || token.type,
      });
    }
    return this.#lexer.consume();
  }

  #location(token) {
    return this.#configuration.sourceLocations
      ? { column: token.column, line: token.line, offset: token.offset }
      : {};
  }

  #syntax(message, token, details = {}) {
    throw new OWLSyntaxError(message, {
      ...details,
      ...this.#location(token),
    });
  }

  #cooperate() {
    this.#lexer.checkExecutionBudget();
    const current = monotonicNow();
    if (current - this.#lastYieldAt < COOPERATIVE_YIELD_INTERVAL_MS) {
      return undefined;
    }
    const scheduler = Reflect.get(globalThis, "scheduler");
    const request =
      typeof scheduler?.yield === "function"
        ? scheduler.yield()
        : new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    return Promise.resolve(request).then(() => {
      this.#lastYieldAt = monotonicNow();
      this.#lexer.checkExecutionBudget();
    });
  }
}
