import { OWLSyntaxError, ResourceLimitError } from "../../io/index.js";
import { IRI } from "../../model/index.js";
import { KRSSLexer } from "./lexer.js";

const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const OWL_THING_IRI = "http://www.w3.org/2002/07/owl#Thing";
const OWL_NOTHING_IRI = "http://www.w3.org/2002/07/owl#Nothing";
const PRIMITIVE_ROLE_ATTRIBUTE_ORDER = Object.freeze({
  "left-identity": 1,
  "right-identity": 1,
  parent: 2,
  parents: 2,
  domain: 3,
  range: 4,
  transitive: 5,
  symmetric: 6,
  reflexive: 7,
  inverse: 8,
});
const ABOX_OPERATIONS = new Set(["instance", "related", "equal", "distinct"]);
const RESERVED_NAME_KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "all",
  "some",
  "at-least",
  "at-most",
  "exactly",
  "inv",
  "compose",
  "nil",
  "t",
  "end-tbox",
  "end-abox",
  "define-primitive-concept",
  "define-concept",
  "disjoint",
  "equivalent",
  "implies",
  "define-role",
  "define-primitive-role",
  "disjoint-roles",
  "implies-role",
  "inverse",
  "roles-equivalent",
  "role-inclusion",
  "transitive",
  "range",
  "define-individual",
  "instance",
  "related",
  "equal",
  "distinct",
  "one-of",
  "enum",
]);
const ABSOLUTE_IRI = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
let anonymousDocumentSequence = 0;

const documentNamespace = (source, anonymousNamespacePrefix) => {
  const documentIri = source.getDocumentIRI()?.value;
  if (!documentIri) {
    return `${anonymousNamespacePrefix}${++anonymousDocumentSequence}#`;
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

export class KRSSParserCore {
  #configuration;
  #dataFactory;
  #lastYieldAt;
  #lexer;
  #namespace;
  #policy;
  #seenABox = false;
  #tboxClosed = false;

  constructor(policy) {
    this.#policy = policy;
  }

  async parse(source, transaction, configuration) {
    this.#configuration = configuration;
    this.#dataFactory = transaction.getOWLDataFactory();
    this.#namespace = documentNamespace(
      source,
      this.#policy.anonymousNamespacePrefix,
    );
    this.#seenABox = false;
    this.#tboxClosed = false;
    const startedAt = monotonicNow();
    const executionBudget = Object.freeze({
      deadline: startedAt + configuration.timeoutMs,
      startedAt,
    });
    this.#lastYieldAt = startedAt;
    this.#lexer = new KRSSLexer(
      source.getText(),
      configuration,
      executionBudget,
    );

    while (this.#lexer.peek().type !== "EOF") {
      if (this.#acceptKeyword("end-tbox")) {
        if (this.#tboxClosed || this.#seenABox) {
          this.#syntax(
            `The ${this.#policy.label} TBox delimiter is out of place`,
            this.#lexer.peek(),
            { found: "end-tbox" },
          );
        }
        this.#tboxClosed = true;
        continue;
      }
      if (this.#acceptKeyword("end-abox")) {
        const trailing = this.#lexer.peek();
        if (trailing.type !== "EOF") {
          const found =
            trailing.type === "(" && this.#lexer.peek(1).type === "SYMBOL"
              ? this.#lexer.peek(1).value
              : trailing.value || trailing.type;
          this.#syntax(
            `No ${this.#policy.label} statement may follow the ABox delimiter`,
            trailing,
            { found },
          );
        }
        break;
      }
      transaction.addAxioms(this.#parseTopLevel());
      const yieldRequest = this.#cooperate();
      if (yieldRequest) {
        await yieldRequest;
      }
    }
    this.#expect("EOF");
    transaction.setDocumentFormat(this.#policy.format);
    return this.#policy.format;
  }

  #parseTopLevel() {
    this.#expect("(");
    const operation = this.#expect("SYMBOL");
    const keyword = operation.value.toLowerCase();
    if (!this.#policy.topLevelKeywords.has(keyword)) {
      this.#syntax(
        `Unsupported ${this.#policy.label} top-level production`,
        operation,
        { found: operation.value },
      );
    }
    if (ABOX_OPERATIONS.has(keyword)) {
      this.#seenABox = true;
    } else if (this.#seenABox || this.#tboxClosed) {
      // Both public KRSS parsers use TBox* followed by ABox*. Enforcing the
      // boundary here keeps the dialect adapters structurally consistent.
      this.#syntax(
        `A ${this.#policy.label} TBox statement cannot follow an ABox statement`,
        operation,
        {
          found: operation.value,
        },
      );
    }
    switch (keyword) {
      case "define-primitive-concept":
        return this.#parsePrimitiveConcept();
      case "define-concept":
        return this.#parseDefinedConcept();
      case "implies":
        return this.#parseImplies();
      case "equivalent":
        return this.#parseEquivalent();
      case "disjoint":
        return [this.#parseDisjoint()];
      case "define-role":
        return [this.#parseDefinedRole()];
      case "define-primitive-role":
        return this.#parsePrimitiveRole();
      case "disjoint-roles":
        return [this.#parseBinaryRoleAxiom("disjoint")];
      case "implies-role":
        return [this.#parseBinaryRoleAxiom("subproperty")];
      case "inverse":
        return [this.#parseBinaryRoleAxiom("inverse")];
      case "roles-equivalent":
        return [this.#parseBinaryRoleAxiom("equivalent")];
      case "role-inclusion":
        return [this.#parseRoleInclusion()];
      case "transitive":
        return [this.#parseTransitiveRole()];
      case "range":
        return [this.#parseRoleRange()];
      case "instance":
        return [this.#parseInstance()];
      case "related":
        return [this.#parseRelated()];
      case "equal":
        return [this.#parseIndividualIdentity("same")];
      case "distinct":
        return [this.#parseIndividualIdentity("different")];
      default:
        this.#syntax(
          `Unsupported ${this.#policy.label} top-level production`,
          operation,
          {
            found: operation.value,
          },
        );
    }
  }

  #parsePrimitiveConcept() {
    const concept = this.#parseNamedClass();
    if (
      this.#policy.primitiveConceptRequiresParent &&
      this.#lexer.peek().type === ")"
    ) {
      this.#syntax(
        `A ${this.#policy.label} primitive concept requires a superclass`,
        this.#lexer.peek(),
      );
    }
    const parent =
      this.#lexer.peek().type === ")"
        ? this.#owlThing()
        : this.#parseClassExpression(0);
    this.#expect(")");
    return [this.#dataFactory.getOWLSubClassOfAxiom(concept, parent)];
  }

  #parseDefinedConcept() {
    const concept = this.#parseNamedClass();
    const definition = this.#parseClassExpression(0);
    this.#expect(")");
    return [
      this.#dataFactory.getOWLEquivalentClassesAxiom([concept, definition]),
    ];
  }

  #parseImplies() {
    const subclass = this.#parseClassExpression(0);
    const superclass = this.#parseClassExpression(0);
    this.#expect(")");
    return [this.#dataFactory.getOWLSubClassOfAxiom(subclass, superclass)];
  }

  #parseEquivalent() {
    const classes = this.#parseBinaryClassExpressions();
    return [this.#dataFactory.getOWLEquivalentClassesAxiom(classes)];
  }

  #parseDisjoint() {
    const classes = this.#parseBinaryClassExpressions();
    return this.#dataFactory.getOWLDisjointClassesAxiom(classes);
  }

  #parseDefinedRole() {
    const first = this.#parseObjectPropertyExpression();
    const second = this.#parseObjectPropertyExpression();
    this.#expect(")");
    return this.#dataFactory.getOWLEquivalentObjectPropertiesAxiom([
      first,
      second,
    ]);
  }

  #parsePrimitiveRole() {
    if (this.#policy.primitiveRoleGrammar === "krss1") {
      return this.#parseKRSS1PrimitiveRole();
    }
    const property = this.#parseNamedObjectProperty();
    const axioms = [this.#dataFactory.getOWLDeclarationAxiom(property)];
    if (this.#isNameToken(this.#lexer.peek())) {
      axioms.push(
        this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
          property,
          this.#parseNamedObjectProperty(),
        ),
      );
    }
    const seenAttributes = new Set();
    let previousAttributeOrder = 0;
    while (this.#lexer.peek().type !== ")") {
      const attribute = this.#expect("ATTRIBUTE");
      const name = attribute.value.toLowerCase();
      const attributeOrder = PRIMITIVE_ROLE_ATTRIBUTE_ORDER[name];
      if (attributeOrder === undefined) {
        this.#syntax(
          `Unsupported ${this.#policy.label} primitive-role attribute`,
          attribute,
          {
            found: `:${attribute.value}`,
          },
        );
      }
      if (attributeOrder < previousAttributeOrder) {
        this.#syntax(
          `${this.#policy.label} primitive-role attributes are out of order`,
          attribute,
          {
            found: `:${attribute.value}`,
          },
        );
      }
      previousAttributeOrder = attributeOrder;
      if (seenAttributes.has(name)) {
        this.#syntax(
          `A ${this.#policy.label} role attribute cannot be repeated`,
          attribute,
          {
            found: `:${attribute.value}`,
          },
        );
      }
      if (
        (name === "left-identity" && seenAttributes.has("right-identity")) ||
        (name === "right-identity" && seenAttributes.has("left-identity")) ||
        (name === "parent" && seenAttributes.has("parents")) ||
        (name === "parents" && seenAttributes.has("parent"))
      ) {
        this.#syntax(
          `Mutually exclusive ${this.#policy.label} role attributes cannot be combined`,
          attribute,
          { found: `:${attribute.value}` },
        );
      }
      seenAttributes.add(name);
      switch (name) {
        case "parent":
          this.#parseParentAttribute(property, axioms);
          break;
        case "parents":
          this.#parseParentsAttribute(property, axioms);
          break;
        case "right-identity":
          axioms.push(
            this.#dataFactory.getOWLSubPropertyChainOfAxiom(
              [property, this.#parseNamedObjectProperty()],
              property,
            ),
          );
          break;
        case "left-identity":
          axioms.push(
            this.#dataFactory.getOWLSubPropertyChainOfAxiom(
              [this.#parseNamedObjectProperty(), property],
              property,
            ),
          );
          break;
        case "domain":
          for (const domain of this.#parseAttributeClassExpressions()) {
            axioms.push(
              this.#dataFactory.getOWLObjectPropertyDomainAxiom(
                property,
                domain,
              ),
            );
          }
          break;
        case "range":
          for (const range of this.#parseAttributeClassExpressions()) {
            axioms.push(
              this.#dataFactory.getOWLObjectPropertyRangeAxiom(property, range),
            );
          }
          break;
        case "transitive":
          if (this.#parseBoolean()) {
            axioms.push(
              this.#dataFactory.getOWLTransitiveObjectPropertyAxiom(property),
            );
          }
          break;
        case "symmetric":
          if (this.#parseBoolean()) {
            axioms.push(
              this.#dataFactory.getOWLSymmetricObjectPropertyAxiom(property),
            );
          }
          break;
        case "reflexive":
          if (this.#parseBoolean()) {
            axioms.push(
              this.#dataFactory.getOWLReflexiveObjectPropertyAxiom(property),
            );
          }
          break;
        case "inverse":
          axioms.push(
            this.#dataFactory.getOWLInverseObjectPropertiesAxiom(
              property,
              this.#parseObjectPropertyExpression(),
            ),
          );
          break;
        default:
          throw new TypeError(
            `Unreachable ${this.#policy.label} primitive-role attribute`,
          );
      }
    }
    this.#expect(")");
    return axioms;
  }

  #parseKRSS1PrimitiveRole() {
    const property = this.#parseNamedObjectProperty();
    if (!this.#isNameToken(this.#lexer.peek())) {
      this.#syntax(
        "A KRSS1 primitive role requires a superclass role",
        this.#lexer.peek(),
      );
    }
    const parent = this.#parseNamedObjectProperty();
    if (this.#lexer.peek().type !== ")") {
      const attribute = this.#expect("ATTRIBUTE");
      if (attribute.value.toLowerCase() !== "right-identity") {
        this.#syntax("Unsupported KRSS1 primitive-role attribute", attribute, {
          found: `:${attribute.value}`,
        });
      }
      // The OWLAPI KRSS1 parser accepts the legacy clause but exposes no
      // structural axiom for it. Consume its role without guessing semantics.
      this.#parseNamedObjectProperty();
    }
    this.#expect(")");
    return [this.#dataFactory.getOWLSubObjectPropertyOfAxiom(property, parent)];
  }

  #parseParentAttribute(property, axioms) {
    if (this.#acceptKeyword("nil")) {
      return;
    }
    axioms.push(
      this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
        property,
        this.#parseNamedObjectProperty(),
      ),
    );
  }

  #parseParentsAttribute(property, axioms) {
    if (this.#acceptKeyword("nil")) {
      return;
    }
    this.#expect("(");
    let parentCount = 0;
    while (this.#lexer.peek().type !== ")") {
      axioms.push(
        this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
          property,
          this.#parseNamedObjectProperty(),
        ),
      );
      parentCount += 1;
    }
    const closing = this.#expect(")");
    if (parentCount === 0) {
      this.#syntax(
        `A ${this.#policy.label} parents attribute cannot be empty`,
        closing,
      );
    }
  }

  #parseAttributeClassExpressions() {
    if (this.#lexer.peek().type !== "(") {
      return [this.#parseClassExpression(0)];
    }
    // In the OWLAPI KRSS2 grammar, parentheses following :domain or :range
    // delimit a list of expressions; they are not an extra grouping layer.
    this.#expect("(");
    const values = [];
    while (this.#lexer.peek().type !== ")") {
      values.push(this.#parseClassExpression(0));
    }
    const closing = this.#expect(")");
    if (values.length === 0) {
      this.#syntax(
        `A ${this.#policy.label} role attribute list cannot be empty`,
        closing,
      );
    }
    return uniqueStructuralValues(values);
  }

  #parseBoolean() {
    const token = this.#expect("SYMBOL");
    if (token.value.toLowerCase() === "t") {
      return true;
    }
    if (token.value.toLowerCase() === "nil") {
      return false;
    }
    this.#syntax(`A ${this.#policy.label} role flag must be t or nil`, token, {
      expected: "t or nil",
      found: token.value,
    });
  }

  #parseBinaryRoleAxiom(kind) {
    const first = this.#parseObjectPropertyExpression();
    const second = this.#parseObjectPropertyExpression();
    this.#expect(")");
    switch (kind) {
      case "disjoint":
        return this.#dataFactory.getOWLDisjointObjectPropertiesAxiom([
          first,
          second,
        ]);
      case "subproperty":
        return this.#dataFactory.getOWLSubObjectPropertyOfAxiom(first, second);
      case "inverse":
        return this.#dataFactory.getOWLInverseObjectPropertiesAxiom(
          first,
          second,
        );
      default:
        return this.#dataFactory.getOWLEquivalentObjectPropertiesAxiom([
          first,
          second,
        ]);
    }
  }

  #parseRoleInclusion() {
    const chain = this.#parsePropertyChain();
    const superProperty = this.#parseNamedObjectProperty();
    this.#expect(")");
    return this.#dataFactory.getOWLSubPropertyChainOfAxiom(
      chain,
      superProperty,
    );
  }

  #parsePropertyChain() {
    this.#expect("(");
    const operation = this.#expect("SYMBOL");
    if (operation.value.toLowerCase() !== "compose") {
      this.#syntax(
        `Expected the ${this.#policy.label} compose role operator`,
        operation,
        {
          expected: "compose",
          found: operation.value,
        },
      );
    }
    const first = this.#parseObjectPropertyExpression();
    const remainder =
      this.#lexer.peek().type === "(" &&
      this.#lexer.peek(1).type === "SYMBOL" &&
      this.#lexer.peek(1).value.toLowerCase() === "compose"
        ? this.#parsePropertyChain()
        : [this.#parseObjectPropertyExpression()];
    this.#expect(")");
    return [first, ...remainder];
  }

  #parseTransitiveRole() {
    const property = this.#parseNamedObjectProperty();
    this.#expect(")");
    return this.#dataFactory.getOWLTransitiveObjectPropertyAxiom(property);
  }

  #parseRoleRange() {
    const property = this.#parseNamedObjectProperty();
    const range = this.#parseClassExpression(0);
    this.#expect(")");
    return this.#dataFactory.getOWLObjectPropertyRangeAxiom(property, range);
  }

  #parseInstance() {
    const individual = this.#parseIndividual();
    const classExpression = this.#parseClassExpression(0);
    this.#expect(")");
    return this.#dataFactory.getOWLClassAssertionAxiom(
      classExpression,
      individual,
    );
  }

  #parseRelated() {
    const subject = this.#parseIndividual();
    const property = this.#parseNamedObjectProperty();
    const object = this.#parseIndividual();
    this.#expect(")");
    return this.#dataFactory.getOWLObjectPropertyAssertionAxiom(
      property,
      subject,
      object,
    );
  }

  #parseIndividualIdentity(kind) {
    const individuals = [this.#parseIndividual(), this.#parseIndividual()];
    this.#expect(")");
    return kind === "same"
      ? this.#dataFactory.getOWLSameIndividualAxiom(individuals)
      : this.#dataFactory.getOWLDifferentIndividualsAxiom(individuals);
  }

  #parseBinaryClassExpressions() {
    const values = [
      this.#parseClassExpression(0),
      this.#parseClassExpression(0),
    ];
    this.#expect(")");
    return values;
  }

  #parseClassExpression(depth) {
    this.#checkExpressionDepth(depth);
    const token = this.#lexer.peek();
    if (this.#isNameToken(token)) {
      return this.#parseNamedClass();
    }
    this.#expect("(");
    const operation = this.#expect("SYMBOL");
    switch (operation.value.toLowerCase()) {
      case "and":
        return this.#parseNaryExpression(depth, "intersection");
      case "or":
        return this.#parseNaryExpression(depth, "union");
      case "not":
        return this.#parseComplement(depth);
      case "some":
        return this.#parseQuantifiedRestriction(depth, "some");
      case "all":
        return this.#parseQuantifiedRestriction(depth, "all");
      case "at-least":
        return this.#parseCardinalityRestriction(depth, "minimum");
      case "at-most":
        return this.#parseCardinalityRestriction(depth, "maximum");
      case "exactly":
        return this.#parseCardinalityRestriction(depth, "exact");
      default:
        this.#syntax(
          `Unsupported ${this.#policy.label} class expression`,
          operation,
          {
            found: operation.value,
          },
        );
    }
  }

  #parseNaryExpression(depth, kind) {
    const operands = [];
    while (this.#lexer.peek().type !== ")") {
      operands.push(this.#parseClassExpression(depth + 1));
    }
    const closing = this.#expect(")");
    const unique = uniqueStructuralValues(operands);
    if (unique.length < this.#policy.minimumBooleanOperands) {
      this.#syntax(
        `A ${this.#policy.label} Boolean expression requires ${this.#policy.minimumBooleanOperands} operand${this.#policy.minimumBooleanOperands === 1 ? "" : "s"}`,
        closing,
      );
    }
    return kind === "intersection"
      ? this.#dataFactory.getOWLObjectIntersectionOf(unique)
      : this.#dataFactory.getOWLObjectUnionOf(unique);
  }

  #parseComplement(depth) {
    const operand = this.#parseClassExpression(depth + 1);
    this.#expect(")");
    return this.#dataFactory.getOWLObjectComplementOf(operand);
  }

  #parseQuantifiedRestriction(depth, quantifier) {
    const property = this.#parseObjectPropertyExpression();
    const filler = this.#parseClassExpression(depth + 1);
    this.#expect(")");
    return quantifier === "some"
      ? this.#dataFactory.getOWLObjectSomeValuesFrom(property, filler)
      : this.#dataFactory.getOWLObjectAllValuesFrom(property, filler);
  }

  #parseCardinalityRestriction(depth, kind) {
    const cardinalityToken = this.#expect("INTEGER");
    const cardinality = Number.parseInt(cardinalityToken.value, 10);
    if (!Number.isSafeInteger(cardinality)) {
      this.#syntax(
        `The ${this.#policy.label} cardinality is outside the safe integer range`,
        cardinalityToken,
        { found: cardinalityToken.value },
      );
    }
    const property = this.#parseObjectPropertyExpression();
    // KRSS permits an omitted qualifier; OWL Thing is the structural OWL
    // default and keeps unqualified cardinalities canonical across formats.
    const filler =
      !this.#policy.cardinalityFillerRequired && this.#lexer.peek().type === ")"
        ? this.#owlThing()
        : this.#parseClassExpression(depth + 1);
    this.#expect(")");
    const methods = {
      exact: "getOWLObjectExactCardinality",
      maximum: "getOWLObjectMaxCardinality",
      minimum: "getOWLObjectMinCardinality",
    };
    return this.#dataFactory[methods[kind]](cardinality, property, filler);
  }

  #parseNamedClass() {
    return this.#dataFactory.getOWLClass(this.#iri(this.#expectName()));
  }

  #parseObjectPropertyExpression() {
    if (this.#lexer.peek().type !== "(") {
      return this.#parseNamedObjectProperty();
    }
    if (!this.#policy.inverseRoleExpressions) {
      this.#syntax(
        `${this.#policy.label} requires a named role in this position`,
        this.#lexer.peek(),
        { found: "(" },
      );
    }
    this.#expect("(");
    const operation = this.#expect("SYMBOL");
    if (operation.value.toLowerCase() !== "inv") {
      this.#syntax(
        `Expected the ${this.#policy.label} inverse role operator`,
        operation,
        {
          expected: "inv",
          found: operation.value,
        },
      );
    }
    const property = this.#dataFactory.getOWLObjectProperty(
      this.#iri(this.#expectName()),
    );
    this.#expect(")");
    return this.#dataFactory.getOWLObjectInverseOf(property);
  }

  #parseNamedObjectProperty() {
    return this.#dataFactory.getOWLObjectProperty(
      this.#iri(this.#expectName()),
    );
  }

  #parseIndividual() {
    return this.#dataFactory.getOWLNamedIndividual(
      this.#iri(this.#expectName()),
    );
  }

  #acceptKeyword(value) {
    const token = this.#lexer.peek();
    if (
      token.type !== "SYMBOL" ||
      token.value.toLowerCase() !== value.toLowerCase()
    ) {
      return undefined;
    }
    return this.#lexer.consume();
  }

  #expectName() {
    const token = this.#lexer.peek();
    if (!this.#isNameToken(token)) {
      this.#syntax(`Expected a ${this.#policy.label} entity name`, token, {
        found: token.value || token.type,
      });
    }
    if (
      token.type === "SYMBOL" &&
      RESERVED_NAME_KEYWORDS.has(token.value.toLowerCase())
    ) {
      this.#syntax(
        `A reserved ${this.#policy.label} keyword cannot be an entity name`,
        token,
        {
          found: token.value,
        },
      );
    }
    return this.#lexer.consume();
  }

  #isNameToken(token) {
    if (token.type === "FULL_IRI") {
      return this.#policy.fullIriNames;
    }
    if (token.type !== "SYMBOL" && token.type !== "INTEGER") {
      return false;
    }
    return (
      this.#policy.namePattern === undefined ||
      this.#policy.namePattern.test(token.value)
    );
  }

  #iri(token) {
    if (token.type === "FULL_IRI" || ABSOLUTE_IRI.test(token.value)) {
      return IRI.create(token.value);
    }
    switch (token.value.toLowerCase()) {
      case "top":
      case "*top*":
        return IRI.create(OWL_THING_IRI);
      case "bottom":
      case "*bottom*":
        return IRI.create(OWL_NOTHING_IRI);
      default:
        // KRSS has no ontology header or prefix declaration. Resolving bare
        // names against the document IRI gives each source a stable namespace
        // without leaking identifiers between independent loads.
        return IRI.create(`${this.#namespace}${token.value}`);
    }
  }

  #owlThing() {
    return this.#dataFactory.getOWLClass(IRI.create(OWL_THING_IRI));
  }

  #checkExpressionDepth(depth) {
    if (depth <= this.#configuration.maxExpressionDepth) {
      return;
    }
    const token = this.#lexer.peek();
    throw new ResourceLimitError(
      `The ${this.#policy.label} expression depth limit was exceeded`,
      {
        ...this.#location(token),
        limit: this.#configuration.maxExpressionDepth,
        observed: depth,
        resource: "maxExpressionDepth",
      },
    );
  }

  #expect(type) {
    const token = this.#lexer.peek();
    if (token.type !== type) {
      this.#syntax(`Expected ${this.#policy.label} token ${type}`, token, {
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
