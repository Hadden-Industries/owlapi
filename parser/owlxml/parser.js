import {
  OWLDocumentFormats,
  OWLSyntaxError,
  ParserMismatchError,
  ResourceLimitError,
} from "../../io/index.js";
import { IRI } from "../../model/index.js";
import { xmlParserAdapter } from "../xml/xmlParserAdapter.js";

import { OWLXML_GRAMMAR } from "./grammar.js";

const OWL_NAMESPACE = "http://www.w3.org/2002/07/owl#";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const LANGUAGE_TAG = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const IRI_REFERENCE =
  /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/u;
const ENTITY_CONSTRUCTORS = Object.freeze({
  AnnotationProperty: "getOWLAnnotationProperty",
  Class: "getOWLClass",
  DataProperty: "getOWLDataProperty",
  Datatype: "getOWLDatatype",
  NamedIndividual: "getOWLNamedIndividual",
  ObjectProperty: "getOWLObjectProperty",
});
const CLASS_EXPRESSION_ELEMENTS = new Set(OWLXML_GRAMMAR.classExpressions);
const DATA_RANGE_ELEMENTS = new Set(OWLXML_GRAMMAR.dataRanges);
const ANNOTATION_AXIOM_ELEMENTS = new Set([
  "AnnotationAssertion",
  "AnnotationPropertyDomain",
  "AnnotationPropertyRange",
  "SubAnnotationPropertyOf",
]);
const AXIOM_ELEMENTS = new Set(OWLXML_GRAMMAR.axioms);

let anonymousDocumentSequence = 0;

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

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

const isXmlNameStartCodePoint = (codePoint) =>
  codePoint === 0x5f ||
  (codePoint >= 0x41 && codePoint <= 0x5a) ||
  (codePoint >= 0x61 && codePoint <= 0x7a) ||
  (codePoint >= 0xc0 && codePoint <= 0xd6) ||
  (codePoint >= 0xd8 && codePoint <= 0xf6) ||
  (codePoint >= 0xf8 && codePoint <= 0x2ff) ||
  (codePoint >= 0x370 && codePoint <= 0x37d) ||
  (codePoint >= 0x37f && codePoint <= 0x1fff) ||
  (codePoint >= 0x200c && codePoint <= 0x200d) ||
  (codePoint >= 0x2070 && codePoint <= 0x218f) ||
  (codePoint >= 0x2c00 && codePoint <= 0x2fef) ||
  (codePoint >= 0x3001 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
  (codePoint >= 0xfdf0 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0xeffff);

const isXmlNameCodePoint = (codePoint) =>
  isXmlNameStartCodePoint(codePoint) ||
  codePoint === 0x2d ||
  codePoint === 0x2e ||
  codePoint === 0xb7 ||
  (codePoint >= 0x30 && codePoint <= 0x39) ||
  (codePoint >= 0x300 && codePoint <= 0x36f) ||
  (codePoint >= 0x203f && codePoint <= 0x2040);

const codePoints = (value) =>
  [...value].map((character) => character.codePointAt(0));

const isNcName = (value) => {
  const points = codePoints(value);
  return (
    points.length > 0 &&
    isXmlNameStartCodePoint(points[0]) &&
    points.slice(1).every(isXmlNameCodePoint)
  );
};

const isPnCharsBaseCodePoint = (codePoint) =>
  codePoint !== 0x5f && isXmlNameStartCodePoint(codePoint);

const isPnCharsCodePoint = (codePoint) =>
  codePoint !== 0x2e && isXmlNameCodePoint(codePoint);

const hasValidPnTail = (points) =>
  points.length === 1 ||
  (points
    .slice(1, -1)
    .every(
      (codePoint) => codePoint === 0x2e || isPnCharsCodePoint(codePoint),
    ) &&
    isPnCharsCodePoint(points.at(-1)));

const isPnPrefix = (value) => {
  const points = codePoints(value);
  return (
    points.length === 0 ||
    (isPnCharsBaseCodePoint(points[0]) && hasValidPnTail(points))
  );
};

const isPnLocal = (value) => {
  const points = codePoints(value);
  return (
    points.length === 0 ||
    ((isPnCharsBaseCodePoint(points[0]) ||
      points[0] === 0x5f ||
      (points[0] >= 0x30 && points[0] <= 0x39)) &&
      hasValidPnTail(points))
  );
};

const parseIriReference = (value) => {
  const match = IRI_REFERENCE.exec(value);
  if (!match) {
    return undefined;
  }
  return {
    authority: match[2],
    fragment: match[5],
    path: match[3],
    query: match[4],
    scheme: match[1],
  };
};

const removeLastPathSegment = (path) => {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "" : path.slice(0, separator);
};

const removeDotSegments = (path) => {
  let input = path;
  let output = "";
  while (input.length > 0) {
    if (input.startsWith("../")) {
      input = input.slice(3);
    } else if (input.startsWith("./")) {
      input = input.slice(2);
    } else if (input.startsWith("/./")) {
      input = input.slice(2);
    } else if (input === "/.") {
      input = "/";
    } else if (input.startsWith("/../")) {
      input = input.slice(3);
      output = removeLastPathSegment(output);
    } else if (input === "/..") {
      input = "/";
      output = removeLastPathSegment(output);
    } else if (input === "." || input === "..") {
      input = "";
    } else {
      const nextSeparator = input.indexOf("/", input.startsWith("/") ? 1 : 0);
      const length = nextSeparator < 0 ? input.length : nextSeparator;
      output += input.slice(0, length);
      input = input.slice(length);
    }
  }
  return output;
};

const mergeIriPaths = (base, referencePath) => {
  if (base.authority !== undefined && base.path.length === 0) {
    return `/${referencePath}`;
  }
  const separator = base.path.lastIndexOf("/");
  return `${separator < 0 ? "" : base.path.slice(0, separator + 1)}${referencePath}`;
};

const serializeIriReference = ({ authority, fragment, path, query, scheme }) =>
  `${scheme ? `${scheme}:` : ""}${authority === undefined ? "" : `//${authority}`}${path}${query === undefined ? "" : `?${query}`}${fragment === undefined ? "" : `#${fragment}`}`;

const resolveIriReference = (referenceValue, baseValue) => {
  const reference = parseIriReference(referenceValue);
  const base = parseIriReference(baseValue);
  if (!reference || !base?.scheme) {
    return undefined;
  }
  if (reference.scheme) {
    return serializeIriReference({
      ...reference,
      path: removeDotSegments(reference.path),
    });
  }

  const target = {
    authority: reference.authority,
    fragment: reference.fragment,
    path: reference.path,
    query: reference.query,
    scheme: base.scheme,
  };
  if (reference.authority !== undefined) {
    target.path = removeDotSegments(reference.path);
  } else {
    target.authority = base.authority;
    if (reference.path.length === 0) {
      target.path = base.path;
      target.query = reference.query ?? base.query;
    } else {
      target.path = removeDotSegments(
        reference.path.startsWith("/")
          ? reference.path
          : mergeIriPaths(base, reference.path),
      );
    }
  }
  return serializeIriReference(target);
};

export class OWLXMLParser {
  #anonymousIndividuals = new Map();
  #configuration;
  #dataFactory;
  #documentScope;
  #lastYieldAt;
  #prefixes = new Map();
  #source;
  #startedAt;
  #transaction;

  async parse(source, transaction, configuration) {
    this.#configuration = configuration;
    this.#dataFactory = transaction.getOWLDataFactory();
    this.#source = source;
    this.#transaction = transaction;
    this.#startedAt = monotonicNow();
    this.#lastYieldAt = this.#startedAt;
    this.#documentScope =
      source.getDocumentIRI()?.value ??
      `urn:owlapi-js:owlxml-document:${++anonymousDocumentSequence}`;
    this.#checkExecutionBudget();

    const document = await xmlParserAdapter.parseXml(
      source.getText(),
      configuration,
    );
    this.#checkExecutionBudget();
    await this.#validateXmlTree(document);
    const root = document.documentElement;
    if (root.localName !== "Ontology" || root.namespaceURI !== OWL_NAMESPACE) {
      throw new ParserMismatchError(
        "The XML document root is not an OWL/XML Ontology element",
        this.#details(root),
      );
    }

    this.#validateAttributes(root, ["ontologyIRI", "versionIRI"], {
      allowSchemaLocation: true,
    });
    const ontologyIri = root.hasAttribute("ontologyIRI")
      ? this.#resolveAnyUri(root, root.getAttribute("ontologyIRI"))
      : undefined;
    const versionIri = root.hasAttribute("versionIRI")
      ? this.#resolveAnyUri(root, root.getAttribute("versionIRI"))
      : undefined;
    if (versionIri && !ontologyIri) {
      this.#syntax("versionIRI requires ontologyIRI", root, {
        attribute: "versionIRI",
      });
    }
    transaction.setOntologyID(
      this.#dataFactory.getOWLOntologyID(ontologyIri, versionIri),
    );

    const children = this.#children(root);
    let offset = 0;
    while (children[offset]?.localName === "Prefix") {
      this.#parsePrefix(children[offset]);
      offset += 1;
    }
    while (children[offset]?.localName === "Import") {
      this.#parseImport(children[offset]);
      offset += 1;
    }
    while (children[offset]?.localName === "Annotation") {
      transaction.addAnnotation(this.#parseAnnotation(children[offset], 1));
      offset += 1;
    }
    while (offset < children.length) {
      const element = children[offset];
      if (
        element.localName === "Prefix" ||
        element.localName === "Import" ||
        element.localName === "Annotation"
      ) {
        this.#syntax(
          `OWL/XML element ${element.localName} appears out of ontology sequence`,
          element,
          { construct: element.localName },
        );
      }
      const axiom = this.#parseAxiom(element);
      if (
        configuration.loadAnnotationAxioms ||
        !ANNOTATION_AXIOM_ELEMENTS.has(element.localName)
      ) {
        transaction.addAxiom(axiom);
      }
      offset += 1;
      await this.#cooperate();
    }

    transaction.setDocumentFormat(OWLDocumentFormats.OWL_XML);
    return OWLDocumentFormats.OWL_XML;
  }

  #parsePrefix(element) {
    this.#validateAttributes(element, ["IRI", "name"], {
      allowXmlSpecial: false,
    });
    this.#expectChildren(element, 0);
    if (!element.hasAttribute("name") || !element.hasAttribute("IRI")) {
      this.#syntax("Prefix requires name and IRI attributes", element, {
        construct: "Prefix",
      });
    }
    const name = element.getAttribute("name");
    if (!isPnPrefix(name)) {
      this.#syntax("Prefix name is not a valid OWL/XML prefix", element, {
        prefixName: name,
      });
    }
    if (this.#prefixes.has(name)) {
      this.#syntax(
        `The prefix ${name || ":"} is declared more than once`,
        element,
        {
          prefixName: name,
        },
      );
    }
    const iri = this.#resolveAnyUri(element, element.getAttribute("IRI"));
    this.#prefixes.set(name, iri.value);
  }

  #parseImport(element) {
    this.#validateAttributes(element, []);
    const value = this.#simpleText(element).trim();
    if (value.length === 0) {
      this.#syntax("Import requires an IRI", element, {
        construct: "Import",
      });
    }
    this.#transaction.addImportsDeclaration(
      this.#dataFactory.getOWLImportsDeclaration(
        this.#resolveAnyUri(element, value),
      ),
    );
  }

  #parseAxiom(element) {
    if (!AXIOM_ELEMENTS.has(element.localName)) {
      this.#syntax(`Unknown OWL/XML axiom ${element.localName}`, element, {
        construct: element.localName,
      });
    }
    switch (element.localName) {
      case "Declaration":
        return this.#parseDeclaration(element);
      case "SubClassOf":
        return this.#parseSubClassOf(element);
      case "EquivalentClasses":
        return this.#parseNaryAxiom(
          element,
          "getOWLEquivalentClassesAxiom",
          (operand) => this.#parseClassExpression(operand, 1),
        );
      case "DisjointClasses":
        return this.#parseNaryAxiom(
          element,
          "getOWLDisjointClassesAxiom",
          (operand) => this.#parseClassExpression(operand, 1),
        );
      case "DisjointUnion":
        return this.#parseDisjointUnion(element);
      case "SubObjectPropertyOf":
        return this.#parseSubObjectPropertyOf(element);
      case "EquivalentObjectProperties":
        return this.#parseNaryAxiom(
          element,
          "getOWLEquivalentObjectPropertiesAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "DisjointObjectProperties":
        return this.#parseNaryAxiom(
          element,
          "getOWLDisjointObjectPropertiesAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "InverseObjectProperties":
        return this.#parseBinaryAxiom(
          element,
          "getOWLInverseObjectPropertiesAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "ObjectPropertyDomain":
        return this.#parseBinaryAxiom(
          element,
          "getOWLObjectPropertyDomainAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
          (operand) => this.#parseClassExpression(operand, 1),
        );
      case "ObjectPropertyRange":
        return this.#parseBinaryAxiom(
          element,
          "getOWLObjectPropertyRangeAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
          (operand) => this.#parseClassExpression(operand, 1),
        );
      case "FunctionalObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLFunctionalObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "InverseFunctionalObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLInverseFunctionalObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "ReflexiveObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLReflexiveObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "IrreflexiveObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLIrreflexiveObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "SymmetricObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLSymmetricObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "AsymmetricObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLAsymmetricObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "TransitiveObjectProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLTransitiveObjectPropertyAxiom",
          (operand) => this.#parseObjectPropertyExpression(operand),
        );
      case "SubDataPropertyOf":
        return this.#parseBinaryAxiom(
          element,
          "getOWLSubDataPropertyOfAxiom",
          (operand) => this.#parseDataPropertyExpression(operand),
          (operand) => this.#parseDataPropertyExpression(operand),
        );
      case "EquivalentDataProperties":
        return this.#parseNaryAxiom(
          element,
          "getOWLEquivalentDataPropertiesAxiom",
          (operand) => this.#parseDataPropertyExpression(operand),
        );
      case "DisjointDataProperties":
        return this.#parseNaryAxiom(
          element,
          "getOWLDisjointDataPropertiesAxiom",
          (operand) => this.#parseDataPropertyExpression(operand),
        );
      case "DataPropertyDomain":
        return this.#parseBinaryAxiom(
          element,
          "getOWLDataPropertyDomainAxiom",
          (operand) => this.#parseDataPropertyExpression(operand),
          (operand) => this.#parseClassExpression(operand, 1),
        );
      case "DataPropertyRange":
        return this.#parseBinaryAxiom(
          element,
          "getOWLDataPropertyRangeAxiom",
          (operand) => this.#parseDataPropertyExpression(operand),
          (operand) => this.#parseDataRange(operand, 1),
        );
      case "FunctionalDataProperty":
        return this.#parseUnaryAxiom(
          element,
          "getOWLFunctionalDataPropertyAxiom",
          (operand) => this.#parseDataPropertyExpression(operand),
        );
      case "DatatypeDefinition":
        return this.#parseBinaryAxiom(
          element,
          "getOWLDatatypeDefinitionAxiom",
          (operand) => this.#requireDatatype(operand),
          (operand) => this.#parseDataRange(operand, 1),
        );
      case "HasKey":
        return this.#parseHasKey(element);
      case "SameIndividual":
        return this.#parseNaryAxiom(
          element,
          "getOWLSameIndividualAxiom",
          (operand) => this.#parseIndividual(operand),
        );
      case "DifferentIndividuals":
        return this.#parseNaryAxiom(
          element,
          "getOWLDifferentIndividualsAxiom",
          (operand) => this.#parseIndividual(operand),
        );
      case "ClassAssertion":
        return this.#parseBinaryAxiom(
          element,
          "getOWLClassAssertionAxiom",
          (operand) => this.#parseClassExpression(operand, 1),
          (operand) => this.#parseIndividual(operand),
        );
      case "ObjectPropertyAssertion":
        return this.#parseObjectPropertyAssertion(
          element,
          "getOWLObjectPropertyAssertionAxiom",
        );
      case "NegativeObjectPropertyAssertion":
        return this.#parseObjectPropertyAssertion(
          element,
          "getOWLNegativeObjectPropertyAssertionAxiom",
        );
      case "DataPropertyAssertion":
        return this.#parseDataPropertyAssertion(
          element,
          "getOWLDataPropertyAssertionAxiom",
        );
      case "NegativeDataPropertyAssertion":
        return this.#parseDataPropertyAssertion(
          element,
          "getOWLNegativeDataPropertyAssertionAxiom",
        );
      case "AnnotationAssertion":
        return this.#parseAnnotationAssertion(element);
      case "SubAnnotationPropertyOf":
        return this.#parseBinaryAxiom(
          element,
          "getOWLSubAnnotationPropertyOfAxiom",
          (operand) => this.#requireAnnotationProperty(operand),
          (operand) => this.#requireAnnotationProperty(operand),
        );
      case "AnnotationPropertyDomain":
        return this.#parseBinaryAxiom(
          element,
          "getOWLAnnotationPropertyDomainAxiom",
          (operand) => this.#requireAnnotationProperty(operand),
          (operand) => this.#parseAnnotationIri(operand),
        );
      case "AnnotationPropertyRange":
        return this.#parseBinaryAxiom(
          element,
          "getOWLAnnotationPropertyRangeAxiom",
          (operand) => this.#requireAnnotationProperty(operand),
          (operand) => this.#parseAnnotationIri(operand),
        );
      default:
        this.#syntax(`Unknown OWL/XML axiom ${element.localName}`, element, {
          construct: element.localName,
        });
    }
  }

  #parseDeclaration(element) {
    this.#validateAttributes(element, []);
    const children = this.#children(element);
    const { annotations, offset } = this.#leadingAnnotations(children);
    if (children.length - offset !== 1) {
      this.#syntax("Declaration requires exactly one entity", element, {
        construct: "Declaration",
      });
    }
    const entity = this.#parseEntity(children[offset]);
    return this.#dataFactory.getOWLDeclarationAxiom(entity, annotations);
  }

  #parseSubClassOf(element) {
    this.#validateAttributes(element, []);
    const children = this.#children(element);
    const { annotations, offset } = this.#leadingAnnotations(children);
    if (children.length - offset !== 2) {
      this.#syntax(
        "SubClassOf requires exactly two class expressions",
        element,
        {
          construct: "SubClassOf",
        },
      );
    }
    return this.#dataFactory.getOWLSubClassOfAxiom(
      this.#parseClassExpression(children[offset], 1),
      this.#parseClassExpression(children[offset + 1], 1),
      annotations,
    );
  }

  #parseNaryAxiom(element, constructor, parseOperand) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 2, Number.POSITIVE_INFINITY);
    return this.#dataFactory[constructor](
      operands.map((operand) => parseOperand(operand)),
      annotations,
    );
  }

  #parseUnaryAxiom(element, constructor, parseOperand) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 1, 1);
    return this.#dataFactory[constructor](
      parseOperand(operands[0]),
      annotations,
    );
  }

  #parseBinaryAxiom(element, constructor, parseFirst, parseSecond) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 2, 2);
    return this.#dataFactory[constructor](
      parseFirst(operands[0]),
      parseSecond(operands[1]),
      annotations,
    );
  }

  #parseDisjointUnion(element) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 3, Number.POSITIVE_INFINITY);
    if (operands[0].localName !== "Class") {
      this.#syntax("DisjointUnion must begin with a named Class", operands[0], {
        found: operands[0].localName,
      });
    }
    return this.#dataFactory.getOWLDisjointUnionAxiom(
      this.#parseEntity(operands[0]),
      operands
        .slice(1)
        .map((operand) => this.#parseClassExpression(operand, 1)),
      annotations,
    );
  }

  #parseSubObjectPropertyOf(element) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 2, 2);
    const superProperty = this.#parseObjectPropertyExpression(operands[1]);
    if (operands[0].localName !== "ObjectPropertyChain") {
      return this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
        this.#parseObjectPropertyExpression(operands[0]),
        superProperty,
        annotations,
      );
    }
    const chainElement = operands[0];
    this.#validateAttributes(chainElement, []);
    const chain = this.#requireArity(
      chainElement,
      this.#children(chainElement),
      2,
      Number.POSITIVE_INFINITY,
    ).map((operand) => this.#parseObjectPropertyExpression(operand));
    return this.#dataFactory.getOWLSubPropertyChainOfAxiom(
      chain,
      superProperty,
      annotations,
    );
  }

  #parseHasKey(element) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 2, Number.POSITIVE_INFINITY);
    const classExpression = this.#parseClassExpression(operands[0], 1);
    const objectProperties = [];
    const dataProperties = [];
    let readingDataProperties = false;
    for (const operand of operands.slice(1)) {
      if (operand.localName === "DataProperty") {
        readingDataProperties = true;
        dataProperties.push(this.#parseDataPropertyExpression(operand));
      } else if (!readingDataProperties) {
        objectProperties.push(this.#parseObjectPropertyExpression(operand));
      } else {
        this.#syntax(
          "HasKey object properties must precede all data properties",
          operand,
          { found: operand.localName },
        );
      }
    }
    return this.#dataFactory.getOWLHasKeyAxiom(
      classExpression,
      objectProperties,
      dataProperties,
      annotations,
    );
  }

  #parseObjectPropertyAssertion(element, constructor) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 3, 3);
    return this.#dataFactory[constructor](
      this.#parseObjectPropertyExpression(operands[0]),
      this.#parseIndividual(operands[1]),
      this.#parseIndividual(operands[2]),
      annotations,
    );
  }

  #parseDataPropertyAssertion(element, constructor) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 3, 3);
    return this.#dataFactory[constructor](
      this.#parseDataPropertyExpression(operands[0]),
      this.#parseIndividual(operands[1]),
      this.#requireLiteral(operands[2]),
      annotations,
    );
  }

  #parseAnnotationAssertion(element) {
    const { annotations, operands } = this.#axiomOperands(element);
    this.#requireArity(element, operands, 3, 3);
    return this.#dataFactory.getOWLAnnotationAssertionAxiom(
      this.#requireAnnotationProperty(operands[0]),
      this.#parseAnnotationSubject(operands[1]),
      this.#parseAnnotationValue(operands[2]),
      annotations,
    );
  }

  #axiomOperands(element) {
    this.#validateAttributes(element, []);
    const children = this.#children(element);
    const { annotations, offset } = this.#leadingAnnotations(children);
    return { annotations, operands: children.slice(offset) };
  }

  #requireDatatype(element) {
    if (element.localName !== "Datatype") {
      this.#syntax(
        `Expected a Datatype but found ${element.localName}`,
        element,
        {
          found: element.localName,
        },
      );
    }
    return this.#parseEntity(element);
  }

  #requireAnnotationProperty(element) {
    if (element.localName !== "AnnotationProperty") {
      this.#syntax(
        `Expected an AnnotationProperty but found ${element.localName}`,
        element,
        { found: element.localName },
      );
    }
    return this.#parseEntity(element);
  }

  #parseAnnotationSubject(element) {
    if (element.localName === "AnonymousIndividual") {
      return this.#parseAnonymousIndividual(element);
    }
    return this.#parseAnnotationIri(element);
  }

  #parseAnnotationIri(element) {
    if (element.localName === "IRI") {
      this.#validateAttributes(element, []);
      return this.#resolveAnyUri(element, this.#simpleText(element).trim());
    }
    if (element.localName === "AbbreviatedIRI") {
      this.#validateAttributes(element, []);
      return this.#expandAbbreviatedIri(
        element,
        this.#simpleText(element).trim(),
      );
    }
    this.#syntax(
      `Expected IRI or AbbreviatedIRI but found ${element.localName}`,
      element,
      { found: element.localName },
    );
  }

  #parseClassExpression(element, depth) {
    this.#checkExpressionDepth(element, depth);
    if (!CLASS_EXPRESSION_ELEMENTS.has(element.localName)) {
      this.#syntax(
        `Expected a class expression but found ${element.localName}`,
        element,
        { found: element.localName },
      );
    }
    switch (element.localName) {
      case "Class":
        return this.#parseEntity(element);
      case "ObjectIntersectionOf":
        return this.#parseNaryClassExpression(
          element,
          depth,
          "getOWLObjectIntersectionOf",
        );
      case "ObjectUnionOf":
        return this.#parseNaryClassExpression(
          element,
          depth,
          "getOWLObjectUnionOf",
        );
      case "ObjectComplementOf": {
        this.#validateAttributes(element, []);
        const [operand] = this.#requireArity(
          element,
          this.#children(element),
          1,
          1,
        );
        return this.#dataFactory.getOWLObjectComplementOf(
          this.#parseClassExpression(operand, depth + 1),
        );
      }
      case "ObjectOneOf": {
        this.#validateAttributes(element, []);
        const children = this.#requireArity(
          element,
          this.#children(element),
          1,
          Number.POSITIVE_INFINITY,
        );
        return this.#dataFactory.getOWLObjectOneOf(
          children.map((child) => this.#parseIndividual(child)),
        );
      }
      case "ObjectSomeValuesFrom":
        return this.#parseObjectRestriction(
          element,
          depth,
          "getOWLObjectSomeValuesFrom",
          "class",
        );
      case "ObjectAllValuesFrom":
        return this.#parseObjectRestriction(
          element,
          depth,
          "getOWLObjectAllValuesFrom",
          "class",
        );
      case "ObjectHasValue":
        return this.#parseObjectRestriction(
          element,
          depth,
          "getOWLObjectHasValue",
          "individual",
        );
      case "ObjectHasSelf": {
        this.#validateAttributes(element, []);
        const [property] = this.#requireArity(
          element,
          this.#children(element),
          1,
          1,
        );
        return this.#dataFactory.getOWLObjectHasSelf(
          this.#parseObjectPropertyExpression(property),
        );
      }
      case "ObjectMinCardinality":
        return this.#parseObjectCardinality(
          element,
          depth,
          "getOWLObjectMinCardinality",
        );
      case "ObjectMaxCardinality":
        return this.#parseObjectCardinality(
          element,
          depth,
          "getOWLObjectMaxCardinality",
        );
      case "ObjectExactCardinality":
        return this.#parseObjectCardinality(
          element,
          depth,
          "getOWLObjectExactCardinality",
        );
      case "DataSomeValuesFrom":
        return this.#parseDataQuantifiedRestriction(
          element,
          depth,
          "getOWLDataSomeValuesFrom",
        );
      case "DataAllValuesFrom":
        return this.#parseDataQuantifiedRestriction(
          element,
          depth,
          "getOWLDataAllValuesFrom",
        );
      case "DataHasValue": {
        this.#validateAttributes(element, []);
        const [property, literal] = this.#requireArity(
          element,
          this.#children(element),
          2,
          2,
        );
        return this.#dataFactory.getOWLDataHasValue(
          this.#parseDataPropertyExpression(property),
          this.#requireLiteral(literal),
        );
      }
      case "DataMinCardinality":
        return this.#parseDataCardinality(
          element,
          depth,
          "getOWLDataMinCardinality",
        );
      case "DataMaxCardinality":
        return this.#parseDataCardinality(
          element,
          depth,
          "getOWLDataMaxCardinality",
        );
      case "DataExactCardinality":
        return this.#parseDataCardinality(
          element,
          depth,
          "getOWLDataExactCardinality",
        );
    }
  }

  #parseNaryClassExpression(element, depth, constructor) {
    this.#validateAttributes(element, []);
    const children = this.#requireArity(
      element,
      this.#children(element),
      2,
      Number.POSITIVE_INFINITY,
    );
    return this.#dataFactory[constructor](
      children.map((child) => this.#parseClassExpression(child, depth + 1)),
    );
  }

  #parseObjectRestriction(element, depth, constructor, fillerType) {
    this.#validateAttributes(element, []);
    const [property, filler] = this.#requireArity(
      element,
      this.#children(element),
      2,
      2,
    );
    return this.#dataFactory[constructor](
      this.#parseObjectPropertyExpression(property),
      fillerType === "individual"
        ? this.#parseIndividual(filler)
        : this.#parseClassExpression(filler, depth + 1),
    );
  }

  #parseObjectCardinality(element, depth, constructor) {
    this.#validateAttributes(element, ["cardinality"]);
    const children = this.#requireArity(element, this.#children(element), 1, 2);
    const filler = children[1]
      ? this.#parseClassExpression(children[1], depth + 1)
      : undefined;
    return this.#dataFactory[constructor](
      this.#parseCardinality(element),
      this.#parseObjectPropertyExpression(children[0]),
      filler,
    );
  }

  #parseDataQuantifiedRestriction(element, depth, constructor) {
    this.#validateAttributes(element, []);
    const children = this.#requireArity(
      element,
      this.#children(element),
      2,
      Number.POSITIVE_INFINITY,
    );
    const filler = children.at(-1);
    if (!DATA_RANGE_ELEMENTS.has(filler.localName)) {
      this.#syntax(`${element.localName} must end with a data range`, filler, {
        construct: element.localName,
      });
    }
    return this.#dataFactory[constructor](
      children
        .slice(0, -1)
        .map((child) => this.#parseDataPropertyExpression(child)),
      this.#parseDataRange(filler, depth + 1),
    );
  }

  #parseDataCardinality(element, depth, constructor) {
    this.#validateAttributes(element, ["cardinality"]);
    const children = this.#requireArity(element, this.#children(element), 1, 2);
    const filler = children[1]
      ? this.#parseDataRange(children[1], depth + 1)
      : undefined;
    return this.#dataFactory[constructor](
      this.#parseCardinality(element),
      this.#parseDataPropertyExpression(children[0]),
      filler,
    );
  }

  #parseCardinality(element) {
    if (!element.hasAttribute("cardinality")) {
      this.#syntax(`${element.localName} requires cardinality`, element, {
        attribute: "cardinality",
      });
    }
    const lexical = element.getAttribute("cardinality").trim();
    if (!/^\+?\d+$/u.test(lexical)) {
      this.#syntax("Cardinality must be a non-negative integer", element, {
        cardinality: lexical,
      });
    }
    const cardinality = Number(lexical);
    if (!Number.isSafeInteger(cardinality)) {
      this.#syntax("Cardinality exceeds the safe integer range", element, {
        cardinality: lexical,
      });
    }
    return cardinality;
  }

  #parseObjectPropertyExpression(element) {
    if (element.localName === "ObjectProperty") {
      return this.#parseEntity(element);
    }
    if (element.localName !== "ObjectInverseOf") {
      this.#syntax(
        `Expected an object property expression but found ${element.localName}`,
        element,
        { found: element.localName },
      );
    }
    this.#validateAttributes(element, []);
    const [property] = this.#requireArity(
      element,
      this.#children(element),
      1,
      1,
    );
    if (property.localName !== "ObjectProperty") {
      this.#syntax(
        "ObjectInverseOf requires a named ObjectProperty",
        property,
        {
          found: property.localName,
        },
      );
    }
    return this.#dataFactory.getOWLObjectInverseOf(this.#parseEntity(property));
  }

  #parseDataPropertyExpression(element) {
    if (element.localName !== "DataProperty") {
      this.#syntax(
        `Expected a data property but found ${element.localName}`,
        element,
        { found: element.localName },
      );
    }
    return this.#parseEntity(element);
  }

  #parseIndividual(element) {
    if (element.localName === "NamedIndividual") {
      return this.#parseEntity(element);
    }
    if (element.localName === "AnonymousIndividual") {
      return this.#parseAnonymousIndividual(element);
    }
    this.#syntax(
      `Expected an individual but found ${element.localName}`,
      element,
      {
        found: element.localName,
      },
    );
  }

  #parseDataRange(element, depth) {
    this.#checkExpressionDepth(element, depth);
    if (!DATA_RANGE_ELEMENTS.has(element.localName)) {
      this.#syntax(
        `Expected a data range but found ${element.localName}`,
        element,
        {
          found: element.localName,
        },
      );
    }
    switch (element.localName) {
      case "Datatype":
        return this.#parseEntity(element);
      case "DataIntersectionOf":
        return this.#parseNaryDataRange(
          element,
          depth,
          "getOWLDataIntersectionOf",
        );
      case "DataUnionOf":
        return this.#parseNaryDataRange(element, depth, "getOWLDataUnionOf");
      case "DataComplementOf": {
        this.#validateAttributes(element, []);
        const [operand] = this.#requireArity(
          element,
          this.#children(element),
          1,
          1,
        );
        return this.#dataFactory.getOWLDataComplementOf(
          this.#parseDataRange(operand, depth + 1),
        );
      }
      case "DataOneOf": {
        this.#validateAttributes(element, []);
        const children = this.#requireArity(
          element,
          this.#children(element),
          1,
          Number.POSITIVE_INFINITY,
        );
        return this.#dataFactory.getOWLDataOneOf(
          children.map((child) => this.#requireLiteral(child)),
        );
      }
      case "DatatypeRestriction": {
        this.#validateAttributes(element, []);
        const children = this.#requireArity(
          element,
          this.#children(element),
          2,
          Number.POSITIVE_INFINITY,
        );
        if (children[0].localName !== "Datatype") {
          this.#syntax(
            "DatatypeRestriction must begin with a Datatype",
            children[0],
            {
              found: children[0].localName,
            },
          );
        }
        return this.#dataFactory.getOWLDatatypeRestriction(
          this.#parseEntity(children[0]),
          children.slice(1).map((child) => this.#parseFacetRestriction(child)),
        );
      }
    }
  }

  #parseNaryDataRange(element, depth, constructor) {
    this.#validateAttributes(element, []);
    const children = this.#requireArity(
      element,
      this.#children(element),
      2,
      Number.POSITIVE_INFINITY,
    );
    return this.#dataFactory[constructor](
      children.map((child) => this.#parseDataRange(child, depth + 1)),
    );
  }

  #parseFacetRestriction(element) {
    if (element.localName !== "FacetRestriction") {
      this.#syntax(
        `Expected FacetRestriction but found ${element.localName}`,
        element,
        {
          found: element.localName,
        },
      );
    }
    this.#validateAttributes(element, ["facet"]);
    if (!element.hasAttribute("facet")) {
      this.#syntax("FacetRestriction requires facet", element, {
        attribute: "facet",
      });
    }
    const [literal] = this.#requireArity(
      element,
      this.#children(element),
      1,
      1,
    );
    return this.#dataFactory.getOWLFacetRestriction(
      this.#resolveAnyUri(element, element.getAttribute("facet")),
      this.#requireLiteral(literal),
    );
  }

  #requireLiteral(element) {
    if (element.localName !== "Literal") {
      this.#syntax(
        `Expected a Literal but found ${element.localName}`,
        element,
        {
          found: element.localName,
        },
      );
    }
    return this.#parseLiteral(element);
  }

  #parseEntity(element) {
    const constructor = ENTITY_CONSTRUCTORS[element.localName];
    if (!constructor) {
      this.#syntax(
        `Expected an OWL entity but found ${element.localName}`,
        element,
        {
          found: element.localName,
        },
      );
    }
    this.#validateAttributes(element, ["IRI", "abbreviatedIRI"]);
    this.#expectChildren(element, 0);
    return this.#dataFactory[constructor](this.#entityIri(element));
  }

  #entityIri(element) {
    const hasIri = element.hasAttribute("IRI");
    const hasAbbreviatedIri = element.hasAttribute("abbreviatedIRI");
    if (hasIri === hasAbbreviatedIri) {
      this.#syntax(
        `${element.localName} requires exactly one of IRI or abbreviatedIRI`,
        element,
        { construct: element.localName },
      );
    }
    return hasIri
      ? this.#resolveAnyUri(element, element.getAttribute("IRI"))
      : this.#expandAbbreviatedIri(
          element,
          element.getAttribute("abbreviatedIRI"),
        );
  }

  #parseAnnotation(element, depth) {
    if (depth > this.#configuration.maxAnnotationDepth) {
      throw new ResourceLimitError(
        "The OWL annotation nesting depth limit was exceeded",
        this.#details(element, {
          limit: this.#configuration.maxAnnotationDepth,
          observed: depth,
          resource: "maxAnnotationDepth",
        }),
      );
    }
    this.#validateAttributes(element, []);
    const children = this.#children(element);
    const annotations = [];
    let offset = 0;
    while (children[offset]?.localName === "Annotation") {
      annotations.push(this.#parseAnnotation(children[offset], depth + 1));
      offset += 1;
    }
    if (
      children.length - offset !== 2 ||
      children[offset].localName !== "AnnotationProperty"
    ) {
      this.#syntax(
        "Annotation requires an annotation property and one annotation value",
        element,
        { construct: "Annotation" },
      );
    }
    const property = this.#parseEntity(children[offset]);
    const value = this.#parseAnnotationValue(children[offset + 1]);
    return this.#dataFactory.getOWLAnnotation(property, value, annotations);
  }

  #parseAnnotationValue(element) {
    switch (element.localName) {
      case "IRI":
        this.#validateAttributes(element, []);
        return this.#resolveAnyUri(element, this.#simpleText(element).trim());
      case "AbbreviatedIRI":
        this.#validateAttributes(element, []);
        return this.#expandAbbreviatedIri(
          element,
          this.#simpleText(element).trim(),
        );
      case "AnonymousIndividual":
        return this.#parseAnonymousIndividual(element);
      case "Literal":
        return this.#parseLiteral(element);
      default:
        this.#syntax(
          `Expected an annotation value but found ${element.localName}`,
          element,
          { found: element.localName },
        );
    }
  }

  #parseLiteral(element) {
    this.#validateAttributes(element, ["datatypeIRI"]);
    const lexicalForm = this.#simpleText(element);
    const language = this.#effectiveXmlLanguage(element);
    const hasDatatype = element.hasAttribute("datatypeIRI");
    if (language && hasDatatype) {
      this.#syntax(
        "OWL/XML literals cannot specify both xml:lang and datatypeIRI",
        element,
        { construct: "Literal" },
      );
    }
    if (language && !LANGUAGE_TAG.test(language)) {
      this.#syntax("The literal language tag is invalid", element, {
        language,
      });
    }
    if (hasDatatype) {
      return this.#dataFactory.getOWLLiteral(
        lexicalForm,
        this.#resolveAnyUri(element, element.getAttribute("datatypeIRI")),
      );
    }
    return this.#dataFactory.getOWLLiteral(lexicalForm, language || undefined);
  }

  #parseAnonymousIndividual(element) {
    this.#validateAttributes(element, ["nodeID"]);
    this.#expectChildren(element, 0);
    const nodeId = element.getAttribute("nodeID");
    if (!element.hasAttribute("nodeID") || !isNcName(nodeId)) {
      this.#syntax("AnonymousIndividual requires a valid nodeID", element, {
        nodeID: nodeId,
      });
    }
    const canonicalNodeId = `_:${nodeId}`;
    let individual = this.#anonymousIndividuals.get(canonicalNodeId);
    if (individual) {
      return individual;
    }
    if (this.#anonymousIndividuals.size >= this.#configuration.maxBlankNodes) {
      throw new ResourceLimitError(
        "The anonymous individual limit was exceeded",
        this.#details(element, {
          limit: this.#configuration.maxBlankNodes,
          resource: "maxBlankNodes",
        }),
      );
    }
    individual = this.#dataFactory.getOWLAnonymousIndividual(
      canonicalNodeId,
      this.#documentScope,
    );
    this.#anonymousIndividuals.set(canonicalNodeId, individual);
    return individual;
  }

  #leadingAnnotations(children) {
    const annotations = [];
    let offset = 0;
    while (children[offset]?.localName === "Annotation") {
      annotations.push(this.#parseAnnotation(children[offset], 1));
      offset += 1;
    }
    return { annotations, offset };
  }

  #children(element) {
    const children = [];
    for (const child of element.childNodes) {
      if (child.nodeType === 1) {
        if (child.namespaceURI !== OWL_NAMESPACE) {
          this.#syntax(
            `Element ${child.nodeName} is not in the OWL namespace`,
            child,
            { construct: child.localName || child.nodeName },
          );
        }
        children.push(child);
      } else if (
        (child.nodeType === 3 || child.nodeType === 4) &&
        child.nodeValue.trim().length > 0
      ) {
        this.#syntax(
          `Unexpected character data inside ${element.localName}`,
          element,
          { construct: element.localName },
        );
      }
    }
    return children;
  }

  #simpleText(element) {
    let value = "";
    for (const child of element.childNodes) {
      if (child.nodeType === 1) {
        this.#syntax(
          `${element.localName} cannot contain child elements`,
          child,
          { construct: element.localName },
        );
      }
      if (child.nodeType === 3 || child.nodeType === 4) {
        value += child.nodeValue;
      }
    }
    return value;
  }

  #expectChildren(element, expected) {
    const children = this.#children(element);
    if (children.length !== expected) {
      this.#syntax(
        `${element.localName} requires ${expected} child elements`,
        element,
        { actual: children.length, expected },
      );
    }
    return children;
  }

  #requireArity(element, children, minimum, maximum) {
    if (children.length < minimum || children.length > maximum) {
      const expected =
        minimum === maximum
          ? String(minimum)
          : maximum === Number.POSITIVE_INFINITY
            ? `at least ${minimum}`
            : `${minimum} to ${maximum}`;
      this.#syntax(
        `${element.localName} requires ${expected} child elements`,
        element,
        {
          actual: children.length,
          maximum,
          minimum,
        },
      );
    }
    return children;
  }

  #checkExpressionDepth(element, depth) {
    if (depth > this.#configuration.maxExpressionDepth) {
      throw new ResourceLimitError(
        "The OWL expression nesting depth limit was exceeded",
        this.#details(element, {
          limit: this.#configuration.maxExpressionDepth,
          observed: depth,
          resource: "maxExpressionDepth",
        }),
      );
    }
    this.#checkExecutionBudget();
  }

  #expandAbbreviatedIri(element, value) {
    const colon = value.indexOf(":");
    const prefixName = value.slice(0, colon);
    const localName = value.slice(colon + 1);
    if (
      colon < 0 ||
      colon !== value.lastIndexOf(":") ||
      !isPnPrefix(prefixName) ||
      !isPnLocal(localName)
    ) {
      this.#syntax("The abbreviated IRI is not valid OWL/XML syntax", element, {
        abbreviatedIRI: value,
      });
    }
    const namespace = this.#prefixes.get(prefixName);
    if (namespace === undefined) {
      this.#syntax(
        `The prefix ${prefixName || ":"} has not been declared in this OWL/XML document`,
        element,
        { prefixName },
      );
    }
    const expanded = `${namespace}${localName}`;
    if (!isAbsoluteIri(expanded)) {
      this.#syntax(
        "The abbreviated IRI does not expand to an absolute IRI",
        element,
        {
          abbreviatedIRI: value,
          iri: expanded,
        },
      );
    }
    return IRI.create(expanded);
  }

  #resolveAnyUri(element, value) {
    if (typeof value !== "string" || hasForbiddenIriCharacter(value)) {
      this.#syntax("The OWL/XML IRI value is invalid", element, { iri: value });
    }
    let resolved = value;
    if (!isAbsoluteIri(resolved)) {
      const base = this.#effectiveBaseIri(element);
      if (!base) {
        this.#syntax(
          "A relative OWL/XML IRI requires an absolute document or xml:base IRI",
          element,
          { iri: value },
        );
      }
      resolved = resolveIriReference(value, base);
      if (!resolved) {
        this.#syntax("The OWL/XML IRI could not be resolved", element, {
          baseIRI: base,
          iri: value,
        });
      }
    }
    if (!isAbsoluteIri(resolved)) {
      this.#syntax("OWL/XML requires an absolute resolved IRI", element, {
        iri: resolved,
      });
    }
    return IRI.create(resolved);
  }

  #effectiveBaseIri(element) {
    const ancestors = [];
    let current = element;
    while (current?.nodeType === 1) {
      ancestors.push(current);
      current = current.parentNode;
    }
    ancestors.reverse();
    let base = this.#source.getDocumentIRI()?.value;
    for (const ancestor of ancestors) {
      if (!ancestor.hasAttributeNS(XML_NAMESPACE, "base")) {
        continue;
      }
      const declared = ancestor.getAttributeNS(XML_NAMESPACE, "base");
      if (isAbsoluteIri(declared)) {
        base = declared;
      } else if (base) {
        const resolved = resolveIriReference(declared, base);
        if (!resolved) {
          this.#syntax("The xml:base IRI could not be resolved", ancestor, {
            baseIRI: base,
            iri: declared,
          });
        }
        base = resolved;
      } else {
        this.#syntax(
          "A relative xml:base requires an absolute parent base",
          ancestor,
          {
            iri: declared,
          },
        );
      }
      if (!isAbsoluteIri(base)) {
        this.#syntax("xml:base must resolve to an absolute IRI", ancestor, {
          iri: base,
        });
      }
    }
    return base;
  }

  #effectiveXmlLanguage(element) {
    let current = element;
    while (current?.nodeType === 1) {
      if (current.hasAttributeNS(XML_NAMESPACE, "lang")) {
        return current.getAttributeNS(XML_NAMESPACE, "lang").toLowerCase();
      }
      current = current.parentNode;
    }
    return "";
  }

  #validateAttributes(
    element,
    allowedNames,
    { allowSchemaLocation = false, allowXmlSpecial = true } = {},
  ) {
    const allowed = new Set(allowedNames);
    for (const attribute of element.attributes) {
      if (attribute.namespaceURI === XMLNS_NAMESPACE) {
        continue;
      }
      if (attribute.namespaceURI === XML_NAMESPACE) {
        if (
          allowXmlSpecial &&
          ["base", "lang", "space"].includes(attribute.localName)
        ) {
          continue;
        }
        this.#syntax(
          `XML attribute ${attribute.nodeName} is not allowed on ${element.localName}`,
          element,
          { attribute: attribute.nodeName },
        );
      }
      if (
        allowSchemaLocation &&
        attribute.namespaceURI === XSI_NAMESPACE &&
        ["schemaLocation", "noNamespaceSchemaLocation"].includes(
          attribute.localName,
        )
      ) {
        continue;
      }
      if (
        attribute.namespaceURI ||
        !allowed.has(attribute.localName || attribute.name)
      ) {
        this.#syntax(
          `Attribute ${attribute.nodeName} is not allowed on ${element.localName}`,
          element,
          { attribute: attribute.nodeName },
        );
      }
    }
  }

  async #validateXmlTree(document) {
    const root = document.documentElement;
    const stack = root ? [{ depth: 1, node: root }] : [];
    let visited = 0;
    while (stack.length > 0) {
      const { depth, node } = stack.pop();
      if (depth > this.#configuration.maxXmlNestingDepth) {
        throw new ResourceLimitError(
          "The XML element nesting depth limit was exceeded",
          this.#details(node, {
            limit: this.#configuration.maxXmlNestingDepth,
            observed: depth,
            resource: "maxXmlNestingDepth",
          }),
        );
      }
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        const child = node.childNodes[index];
        if (child.nodeType === 1) {
          stack.push({ depth: depth + 1, node: child });
        }
      }
      visited += 1;
      if (visited % 512 === 0) {
        await this.#cooperate();
      }
    }
  }

  async #cooperate() {
    this.#checkExecutionBudget();
    if (monotonicNow() - this.#lastYieldAt < COOPERATIVE_YIELD_INTERVAL_MS) {
      return;
    }
    const scheduler = Reflect.get(globalThis, "scheduler");
    if (typeof scheduler?.yield === "function") {
      await scheduler.yield();
    } else {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }
    this.#lastYieldAt = monotonicNow();
    this.#checkExecutionBudget();
  }

  #checkExecutionBudget() {
    const { signal, timeoutMs } = this.#configuration;
    if (signal?.aborted) {
      if (typeof signal.throwIfAborted === "function") {
        signal.throwIfAborted();
      }
      const error = new Error("The ontology load was aborted");
      error.name = "AbortError";
      throw error;
    }
    const elapsed = monotonicNow() - this.#startedAt;
    if (elapsed > timeoutMs) {
      throw new ResourceLimitError(
        "The ontology parsing timeout was exceeded",
        {
          limit: timeoutMs,
          observed: Math.ceil(elapsed),
          resource: "timeoutMs",
        },
      );
    }
  }

  #details(node, details = {}) {
    if (!this.#configuration.sourceLocations) {
      return details;
    }
    return {
      ...(Number.isSafeInteger(node?.columnNumber)
        ? { column: node.columnNumber }
        : {}),
      ...(Number.isSafeInteger(node?.lineNumber)
        ? { line: node.lineNumber }
        : {}),
      ...details,
    };
  }

  #syntax(message, node, details = {}) {
    throw new OWLSyntaxError(message, this.#details(node, details));
  }
}
