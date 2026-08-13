import {
  OWLOntologyLoaderConfiguration,
  OWLSyntaxError,
  ResourceLimitError,
  UnsupportedConstructError,
} from "../io/index.js";
import {
  IRI,
  OWLDataFactory,
  OWLOntology,
  StructuralSet,
} from "../model/index.js";
import { selectOntologyGraph } from "./graphPolicy.js";
import {
  BUILT_IN_ANNOTATION_PROPERTIES,
  OWL_NAMESPACE,
  OWL_VOCABULARY,
  RDF_NAMESPACE,
  RDF_VOCABULARY,
  RDFS_NAMESPACE,
  RDFS_VOCABULARY,
  XSD_NAMESPACE,
} from "./vocabulary.js";

const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const CHECK_INTERVAL = 512;
const SUBJECT_TERM_TYPES = new Set(["BlankNode", "NamedNode"]);
const OBJECT_TERM_TYPES = new Set(["BlankNode", "Literal", "NamedNode"]);
const GRAPH_TERM_TYPES = new Set(["BlankNode", "DefaultGraph", "NamedNode"]);
const XSD_INTEGER_DATATYPE_BOUNDS = new Map([
  [`${XSD_NAMESPACE}integer`, {}],
  [`${XSD_NAMESPACE}nonPositiveInteger`, { maximum: 0n }],
  [`${XSD_NAMESPACE}negativeInteger`, { maximum: -1n }],
  [
    `${XSD_NAMESPACE}long`,
    { minimum: -9223372036854775808n, maximum: 9223372036854775807n },
  ],
  [`${XSD_NAMESPACE}int`, { minimum: -2147483648n, maximum: 2147483647n }],
  [`${XSD_NAMESPACE}short`, { minimum: -32768n, maximum: 32767n }],
  [`${XSD_NAMESPACE}byte`, { minimum: -128n, maximum: 127n }],
  [`${XSD_NAMESPACE}nonNegativeInteger`, { minimum: 0n }],
  [
    `${XSD_NAMESPACE}unsignedLong`,
    { minimum: 0n, maximum: 18446744073709551615n },
  ],
  [`${XSD_NAMESPACE}unsignedInt`, { minimum: 0n, maximum: 4294967295n }],
  [`${XSD_NAMESPACE}unsignedShort`, { minimum: 0n, maximum: 65535n }],
  [`${XSD_NAMESPACE}unsignedByte`, { minimum: 0n, maximum: 255n }],
  [`${XSD_NAMESPACE}positiveInteger`, { minimum: 1n }],
]);
const XSD_FLOATING_DATATYPES = new Set([
  `${XSD_NAMESPACE}double`,
  `${XSD_NAMESPACE}float`,
]);
const INTEGER_LEXICAL_PATTERN = /^[+-]?[0-9]+$/u;
const DECIMAL_LEXICAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/u;
const FLOATING_LEXICAL_PATTERN =
  /^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)$/u;

let nextAnonymousDocumentScope = 0;

const monotonicNow = () =>
  typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();

const integerValueOfLiteral = (term) => {
  if (term.termType !== "Literal") {
    return undefined;
  }
  const datatype = term.datatype.value;
  const lexicalForm = term.value.trim();
  const bounds = XSD_INTEGER_DATATYPE_BOUNDS.get(datatype);
  if (bounds) {
    if (!INTEGER_LEXICAL_PATTERN.test(lexicalForm)) {
      return undefined;
    }
    const unsignedLexicalForm = lexicalForm.startsWith("+")
      ? lexicalForm.slice(1)
      : lexicalForm;
    const value = BigInt(unsignedLexicalForm);
    if (
      (bounds.minimum !== undefined && value < bounds.minimum) ||
      (bounds.maximum !== undefined && value > bounds.maximum)
    ) {
      return undefined;
    }
    return value;
  }
  if (datatype === `${XSD_NAMESPACE}decimal`) {
    const match = DECIMAL_LEXICAL_PATTERN.exec(lexicalForm);
    if (!match) {
      return undefined;
    }
    const fraction = match[3] ?? match[4] ?? "";
    if (/[^0]/u.test(fraction)) {
      return undefined;
    }
    const magnitude = BigInt(match[2] || "0");
    return match[1] === "-" ? -magnitude : magnitude;
  }
  if (XSD_FLOATING_DATATYPES.has(datatype)) {
    if (!FLOATING_LEXICAL_PATTERN.test(lexicalForm)) {
      return undefined;
    }
    const parsed = Number(lexicalForm);
    const value =
      datatype === `${XSD_NAMESPACE}float` ? Math.fround(parsed) : parsed;
    return Number.isFinite(value) && Number.isInteger(value)
      ? value
      : undefined;
  }
  return undefined;
};

const normalizeConfiguration = (configuration) =>
  configuration instanceof OWLOntologyLoaderConfiguration
    ? configuration
    : new OWLOntologyLoaderConfiguration(configuration);

const termKey = (term) => {
  if (!term || typeof term.termType !== "string") {
    throw new TypeError("RDF values must implement the RDF/JS Term contract");
  }
  if (term.termType === "Literal") {
    return JSON.stringify([
      term.termType,
      term.value,
      term.language,
      term.datatype?.termType,
      term.datatype?.value,
    ]);
  }
  return JSON.stringify([term.termType, term.value]);
};

const quadKey = (quad) =>
  JSON.stringify([
    termKey(quad.subject),
    termKey(quad.predicate),
    termKey(quad.object),
    termKey(quad.graph),
  ]);

const tripleKey = (subject, predicate, object) =>
  JSON.stringify([termKey(subject), termKey(predicate), termKey(object)]);

const requireTerm = (term, allowedTypes, name) => {
  if (
    !term ||
    !allowedTypes.has(term.termType) ||
    typeof term.value !== "string" ||
    typeof term.equals !== "function"
  ) {
    throw new TypeError(`${name} must be a valid RDF/JS term`);
  }
};

const requireQuad = (quad) => {
  if (!quad || quad.termType !== "Quad" || typeof quad.equals !== "function") {
    throw new TypeError("dataset values must be RDF/JS quads");
  }
  if (quad.subject?.termType === "Quad" || quad.object?.termType === "Quad") {
    throw new UnsupportedConstructError(
      "RDF 1.2 triple terms have no OWL 2 structural mapping",
      { termType: "Quad" },
    );
  }
  requireTerm(quad.subject, SUBJECT_TERM_TYPES, "quad.subject");
  requireTerm(quad.predicate, new Set(["NamedNode"]), "quad.predicate");
  requireTerm(quad.object, OBJECT_TERM_TYPES, "quad.object");
  requireTerm(quad.graph, GRAPH_TERM_TYPES, "quad.graph");
  if (quad.object.termType === "Literal") {
    requireTerm(
      quad.object.datatype,
      new Set(["NamedNode"]),
      "literal.datatype",
    );
    if (typeof quad.object.language !== "string") {
      throw new TypeError("literal.language must be a string");
    }
  }
};

const requireNamedNode = (term, message, details = {}) => {
  if (term?.termType !== "NamedNode") {
    throw new OWLSyntaxError(message, details);
  }
  return term;
};

const freezeDiagnostic = (diagnostic) => Object.freeze({ ...diagnostic });

class ExecutionController {
  #configuration;
  #lastYieldAt;
  #startedAt;

  constructor(configuration) {
    this.#configuration = configuration;
    this.#startedAt = monotonicNow();
    this.#lastYieldAt = this.#startedAt;
  }

  check() {
    const { signal, timeoutMs } = this.#configuration;
    if (signal?.aborted) {
      if (typeof signal.throwIfAborted === "function") {
        signal.throwIfAborted();
      }
      const error = new Error("The RDF-to-OWL translation was aborted");
      error.name = "AbortError";
      throw error;
    }
    const elapsed = monotonicNow() - this.#startedAt;
    if (elapsed > timeoutMs) {
      throw new ResourceLimitError(
        "The RDF-to-OWL translation timeout was exceeded",
        {
          limit: timeoutMs,
          observed: Math.ceil(elapsed),
          resource: "timeoutMs",
        },
      );
    }
  }

  async cooperate() {
    this.check();
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
    this.check();
  }
}

class OntologyTransaction {
  #annotations = new StructuralSet();
  #axioms = new StructuralSet();
  #configuration;
  #dataFactory;
  #imports = new StructuralSet();
  #ontologyID;

  constructor(dataFactory, configuration) {
    this.#configuration = configuration;
    this.#dataFactory = dataFactory;
  }

  addAnnotation(annotation) {
    this.#annotations.add(annotation);
  }

  addAxiom(axiom) {
    if (this.#axioms.has(axiom)) {
      return;
    }
    if (this.#axioms.size >= this.#configuration.maxAxioms) {
      throw new ResourceLimitError("The ontology axiom limit was exceeded", {
        limit: this.#configuration.maxAxioms,
        resource: "maxAxioms",
      });
    }
    this.#axioms.add(axiom);
  }

  addImportsDeclaration(declaration) {
    this.#imports.add(declaration);
  }

  setOntologyID(ontologyID) {
    this.#ontologyID = ontologyID;
  }

  commit(context) {
    const ontology = new OWLOntology({
      annotations: this.#annotations,
      axioms: this.#axioms,
      imports: this.#imports,
      ontologyID: this.#ontologyID || this.#dataFactory.getOWLOntologyID(),
    });
    const frozenContext = Object.freeze({
      ...context,
      diagnostics: Object.freeze(context.diagnostics.map(freezeDiagnostic)),
    });
    return Object.freeze({ context: frozenContext, ontology });
  }
}

class RdfGraphInterpreter {
  #anonymousClassNodes = new Set();
  #anonymousDataRangeNodes = new Set();
  #annotationReifications = new Map();
  #annotationPropertyIris = new Set(BUILT_IN_ANNOTATION_PROPERTIES);
  #axiomReifications = new Map();
  #classExpressionCache = new Map();
  #classExpressionStack = new Set();
  #classIris = new Set([OWL_VOCABULARY.Nothing, OWL_VOCABULARY.Thing]);
  #configuration;
  #consumed = new Set();
  #dataPropertyIris = new Set([
    OWL_VOCABULARY.bottomDataProperty,
    OWL_VOCABULARY.topDataProperty,
  ]);
  #dataRangeCache = new Map();
  #dataRangeStack = new Set();
  #dataFactory;
  #dataset;
  #datatypeIris = new Set([
    RDF_VOCABULARY.langString,
    RDF_VOCABULARY.xmlLiteral,
    RDFS_VOCABULARY.Literal,
  ]);
  #diagnostics;
  #documentScope;
  #execution;
  #individualIris = new Set();
  #listOwners = new Map();
  #objectPropertyExpressionCache = new Map();
  #objectPropertyExpressionStack = new Set();
  #objectPropertyIris = new Set([
    OWL_VOCABULARY.bottomObjectProperty,
    OWL_VOCABULARY.topObjectProperty,
  ]);
  #owl1DataRangeNodes = new Set();
  #transaction;

  constructor({
    configuration,
    dataFactory,
    dataset,
    diagnostics,
    documentScope,
    execution,
    transaction,
  }) {
    this.#configuration = configuration;
    this.#dataFactory = dataFactory;
    this.#dataset = dataset;
    this.#diagnostics = diagnostics;
    this.#documentScope = documentScope;
    this.#execution = execution;
    this.#transaction = transaction;
  }

  async interpret() {
    await this.#readDeclarations();
    await this.#readOntologyHeader();
    await this.#readExpressionDefinitions();
    await this.#readClassAxioms();
    await this.#readPropertyAxioms();
    await this.#readNaryAxioms();
    await this.#readKeysAndAssertions();
    await this.#accountForUnconsumedTriples();
  }

  async #readExpressionDefinitions() {
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      if (
        this.#isConsumed(currentQuad) ||
        currentQuad.subject.termType !== "BlankNode"
      ) {
        continue;
      }
      if (
        currentQuad.predicate.value === RDF_VOCABULARY.type &&
        currentQuad.object.termType === "NamedNode"
      ) {
        if (
          [OWL_VOCABULARY.Class, OWL_VOCABULARY.Restriction].includes(
            currentQuad.object.value,
          )
        ) {
          await this.#classExpression(currentQuad.subject, 0);
        } else if (
          [OWL_VOCABULARY.DataRange, RDFS_VOCABULARY.Datatype].includes(
            currentQuad.object.value,
          )
        ) {
          await this.#dataRange(currentQuad.subject, 0);
        }
      } else if (currentQuad.predicate.value === OWL_VOCABULARY.inverseOf) {
        await this.#objectPropertyExpression(currentQuad.subject, 0);
      }
      visited += 1;
      if (visited % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }
  }

  async #readDeclarations() {
    const owl1ObjectPropertyTypes = new Set([
      OWL_VOCABULARY.InverseFunctionalProperty,
      OWL_VOCABULARY.SymmetricProperty,
      OWL_VOCABULARY.TransitiveProperty,
    ]);
    const inferredObjectPropertyIris = new Set();
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.subject.termType === "NamedNode" &&
        currentQuad.predicate.value === RDF_VOCABULARY.type &&
        currentQuad.object.termType === "NamedNode" &&
        owl1ObjectPropertyTypes.has(currentQuad.object.value)
      ) {
        inferredObjectPropertyIris.add(currentQuad.subject.value);
        this.#objectPropertyIris.add(currentQuad.subject.value);
      }
    }
    const declarationTypes = new Map([
      [OWL_VOCABULARY.AnnotationProperty, "getOWLAnnotationProperty"],
      [OWL_VOCABULARY.Class, "getOWLClass"],
      [OWL_VOCABULARY.DataRange, "getOWLDatatype"],
      [OWL_VOCABULARY.DatatypeProperty, "getOWLDataProperty"],
      [OWL_VOCABULARY.NamedIndividual, "getOWLNamedIndividual"],
      [OWL_VOCABULARY.ObjectProperty, "getOWLObjectProperty"],
      [OWL_VOCABULARY.OntologyProperty, "getOWLAnnotationProperty"],
      [RDFS_VOCABULARY.Datatype, "getOWLDatatype"],
    ]);
    const declarations = [];
    const explicitObjectPropertyIris = new Set();
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode"
      ) {
        continue;
      }
      const constructorName = declarationTypes.get(currentQuad.object.value);
      if (!constructorName) {
        continue;
      }
      if (currentQuad.subject.termType === "BlankNode") {
        if (currentQuad.object.value === OWL_VOCABULARY.Class) {
          this.#anonymousClassNodes.add(termKey(currentQuad.subject));
          continue;
        }
        if (currentQuad.object.value === RDFS_VOCABULARY.Datatype) {
          this.#anonymousDataRangeNodes.add(termKey(currentQuad.subject));
          continue;
        }
        if (currentQuad.object.value === OWL_VOCABULARY.DataRange) {
          const key = termKey(currentQuad.subject);
          this.#anonymousDataRangeNodes.add(key);
          this.#owl1DataRangeNodes.add(key);
          continue;
        }
        if (currentQuad.object.value === OWL_VOCABULARY.NamedIndividual) {
          this.#consume(currentQuad);
          continue;
        }
      }
      const subject = requireNamedNode(
        currentQuad.subject,
        "OWL entity declarations require an IRI subject",
        { predicate: currentQuad.predicate.value },
      );
      declarations.push({ constructorName, currentQuad, subject });
      if (
        [
          OWL_VOCABULARY.AnnotationProperty,
          OWL_VOCABULARY.OntologyProperty,
        ].includes(currentQuad.object.value)
      ) {
        this.#annotationPropertyIris.add(subject.value);
      } else if (currentQuad.object.value === OWL_VOCABULARY.Class) {
        this.#classIris.add(subject.value);
      } else if (currentQuad.object.value === OWL_VOCABULARY.DatatypeProperty) {
        this.#dataPropertyIris.add(subject.value);
      } else if (currentQuad.object.value === OWL_VOCABULARY.ObjectProperty) {
        this.#objectPropertyIris.add(subject.value);
        explicitObjectPropertyIris.add(subject.value);
      } else if (currentQuad.object.value === OWL_VOCABULARY.NamedIndividual) {
        this.#individualIris.add(subject.value);
      } else if (currentQuad.object.value === RDFS_VOCABULARY.Datatype) {
        this.#datatypeIris.add(subject.value);
      }
      visited += 1;
      if (visited % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }

    this.#assertCompatiblePropertyCategories();
    this.#indexReifications();
    for (const { constructorName, currentQuad, subject } of declarations) {
      const entity = this.#dataFactory[constructorName](
        IRI.create(subject.value),
      );
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDeclarationAxiom(
          entity,
          await this.#axiomAnnotations(currentQuad),
        ),
      );
      this.#consume(currentQuad);
    }
    for (const iri of inferredObjectPropertyIris) {
      if (explicitObjectPropertyIris.has(iri)) {
        continue;
      }
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDeclarationAxiom(
          this.#dataFactory.getOWLObjectProperty(IRI.create(iri)),
        ),
      );
    }
    this.#consumeRedundantOwl1Types();
  }

  #consumeRedundantOwl1Types() {
    const rdfsClassSubjects = new Set([
      OWL_VOCABULARY.Class,
      OWL_VOCABULARY.DataRange,
      OWL_VOCABULARY.Restriction,
      RDFS_VOCABULARY.Datatype,
    ]);
    const rdfPropertySubjects = new Set([
      OWL_VOCABULARY.AnnotationProperty,
      OWL_VOCABULARY.AsymmetricProperty,
      OWL_VOCABULARY.DatatypeProperty,
      OWL_VOCABULARY.FunctionalProperty,
      OWL_VOCABULARY.InverseFunctionalProperty,
      OWL_VOCABULARY.IrreflexiveProperty,
      OWL_VOCABULARY.ObjectProperty,
      OWL_VOCABULARY.OntologyProperty,
      OWL_VOCABULARY.ReflexiveProperty,
      OWL_VOCABULARY.SymmetricProperty,
      OWL_VOCABULARY.TransitiveProperty,
    ]);
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode"
      ) {
        continue;
      }
      const object = currentQuad.object.value;
      const subjectTypes = new Set(
        this.#outgoing(currentQuad.subject, RDF_VOCABULARY.type)
          .filter(({ object: type }) => type.termType === "NamedNode")
          .map(({ object: type }) => type.value),
      );
      if (
        (object === RDFS_VOCABULARY.Class &&
          [...rdfsClassSubjects].some((type) => subjectTypes.has(type))) ||
        (object === RDF_VOCABULARY.Property &&
          [...rdfPropertySubjects].some((type) => subjectTypes.has(type))) ||
        (object === RDF_VOCABULARY.List &&
          this.#outgoing(currentQuad.subject, RDF_VOCABULARY.first).length ===
            1 &&
          this.#outgoing(currentQuad.subject, RDF_VOCABULARY.rest).length === 1)
      ) {
        this.#consume(currentQuad);
      }
    }
  }

  async #readOntologyHeader() {
    const allOntologyTypeQuads = [
      ...this.#dataset.match(null, undefined, undefined, undefined),
    ].filter(
      (currentQuad) =>
        currentQuad.predicate.value === RDF_VOCABULARY.type &&
        currentQuad.object.termType === "NamedNode" &&
        currentQuad.object.value === OWL_VOCABULARY.Ontology,
    );
    const ontologyNodeKeys = new Set(
      allOntologyTypeQuads.map(({ subject }) => termKey(subject)),
    );
    const referencedOntologyNodeKeys = new Set();
    for (const currentQuad of this.#dataset) {
      if (
        !ontologyNodeKeys.has(termKey(currentQuad.subject)) ||
        !ontologyNodeKeys.has(termKey(currentQuad.object)) ||
        !this.#annotationPropertyIris.has(currentQuad.predicate.value)
      ) {
        continue;
      }
      referencedOntologyNodeKeys.add(termKey(currentQuad.object));
    }
    const ontologyTypeQuads = allOntologyTypeQuads.filter(
      ({ subject }) => !referencedOntologyNodeKeys.has(termKey(subject)),
    );
    if (ontologyTypeQuads.length > 1) {
      throw new OWLSyntaxError(
        "An RDF graph cannot identify more than one OWL ontology header",
        { observed: ontologyTypeQuads.length },
      );
    }
    if (ontologyTypeQuads.length === 0) {
      return;
    }

    const ontologyTypeQuad = ontologyTypeQuads[0];
    const ontologyNode = ontologyTypeQuad.subject;
    this.#consume(ontologyTypeQuad);
    for (const referencedTypeQuad of allOntologyTypeQuads) {
      if (referencedOntologyNodeKeys.has(termKey(referencedTypeQuad.subject))) {
        this.#consume(referencedTypeQuad);
      }
    }
    const ontologyIRI =
      ontologyNode.termType === "NamedNode"
        ? IRI.create(ontologyNode.value)
        : undefined;
    const versionQuads = this.#outgoing(
      ontologyNode,
      OWL_VOCABULARY.versionIRI,
    );
    if (versionQuads.length > 1) {
      throw new OWLSyntaxError("An ontology header has multiple version IRIs", {
        observed: versionQuads.length,
      });
    }
    let versionIRI;
    if (versionQuads.length === 1) {
      if (!ontologyIRI) {
        throw new OWLSyntaxError(
          "An anonymous ontology cannot declare a version IRI",
        );
      }
      versionIRI = IRI.create(
        requireNamedNode(
          versionQuads[0].object,
          "owl:versionIRI requires an IRI object",
          { predicate: OWL_VOCABULARY.versionIRI },
        ).value,
      );
      this.#consume(versionQuads[0]);
    }
    this.#transaction.setOntologyID(
      this.#dataFactory.getOWLOntologyID(ontologyIRI, versionIRI),
    );

    const importQuads = this.#outgoing(ontologyNode, OWL_VOCABULARY.imports);
    for (const currentQuad of importQuads) {
      const imported = requireNamedNode(
        currentQuad.object,
        "owl:imports requires an IRI object",
        { predicate: OWL_VOCABULARY.imports },
      );
      this.#transaction.addImportsDeclaration(
        this.#dataFactory.getOWLImportsDeclaration(IRI.create(imported.value)),
      );
      this.#consume(currentQuad);
    }

    for (const currentQuad of this.#outgoing(ontologyNode)) {
      if (!this.#annotationPropertyIris.has(currentQuad.predicate.value)) {
        continue;
      }
      const annotation = await this.#annotationFromQuad(currentQuad, 0);
      if (annotation) {
        this.#transaction.addAnnotation(annotation);
      }
    }
    await this.#execution.cooperate();
  }

  #indexReifications() {
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode" ||
        ![OWL_VOCABULARY.Annotation, OWL_VOCABULARY.Axiom].includes(
          currentQuad.object.value,
        )
      ) {
        continue;
      }
      const source = this.#exactlyOne(
        currentQuad.subject,
        OWL_VOCABULARY.annotatedSource,
      );
      const property = this.#exactlyOne(
        currentQuad.subject,
        OWL_VOCABULARY.annotatedProperty,
      );
      const target = this.#exactlyOne(
        currentQuad.subject,
        OWL_VOCABULARY.annotatedTarget,
      );
      requireNamedNode(
        property.object,
        "owl:annotatedProperty requires an IRI object",
      );
      const key = tripleKey(source.object, property.object, target.object);
      const index =
        currentQuad.object.value === OWL_VOCABULARY.Axiom
          ? this.#axiomReifications
          : this.#annotationReifications;
      const nodes = index.get(key) || [];
      nodes.push(currentQuad.subject);
      index.set(key, nodes);
      this.#consume(currentQuad);
      this.#consume(source);
      this.#consume(property);
      this.#consume(target);
    }
  }

  async #axiomAnnotations(baseQuad) {
    if (!this.#configuration.loadAnnotationAxioms) {
      return [];
    }
    const nodes =
      this.#axiomReifications.get(
        tripleKey(baseQuad.subject, baseQuad.predicate, baseQuad.object),
      ) || [];
    const annotations = [];
    for (const node of nodes) {
      annotations.push(...(await this.#nodeAnnotations(node, 0)));
    }
    return annotations;
  }

  async #nodeAnnotations(node, depth) {
    this.#checkAnnotationDepth(depth);
    const annotations = [];
    for (const currentQuad of this.#outgoing(node)) {
      if (!this.#annotationPropertyIris.has(currentQuad.predicate.value)) {
        continue;
      }
      const annotation = await this.#annotationFromQuad(currentQuad, depth);
      if (annotation) {
        annotations.push(annotation);
      }
    }
    return annotations;
  }

  async #annotationFromQuad(currentQuad, depth) {
    this.#checkAnnotationDepth(depth);
    this.#consume(currentQuad);
    if (!this.#configuration.loadAnnotationAxioms) {
      return undefined;
    }
    const nestedNodes =
      this.#annotationReifications.get(
        tripleKey(
          currentQuad.subject,
          currentQuad.predicate,
          currentQuad.object,
        ),
      ) || [];
    const nested = [];
    for (const node of nestedNodes) {
      nested.push(...(await this.#nodeAnnotations(node, depth + 1)));
    }
    return this.#dataFactory.getOWLAnnotation(
      this.#annotationProperty(currentQuad.predicate),
      this.#annotationValue(currentQuad.object),
      nested,
    );
  }

  async #readClassAxioms() {
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      let axiom;
      const annotations = await this.#axiomAnnotations(currentQuad);
      if (currentQuad.predicate.value === RDFS_VOCABULARY.subClassOf) {
        axiom = this.#dataFactory.getOWLSubClassOfAxiom(
          await this.#classExpression(currentQuad.subject, 0),
          await this.#classExpression(currentQuad.object, 0),
          annotations,
        );
      } else if (
        currentQuad.predicate.value === OWL_VOCABULARY.equivalentClass
      ) {
        if (this.#isDataRangeTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLDatatypeDefinitionAxiom(
            this.#dataFactory.getOWLDatatype(
              IRI.create(
                requireNamedNode(
                  currentQuad.subject,
                  "A datatype definition requires an IRI datatype",
                ).value,
              ),
            ),
            await this.#dataRange(currentQuad.object, 0),
            annotations,
          );
        } else {
          axiom = this.#equivalentClassesAxiom(
            await this.#classExpression(currentQuad.subject, 0),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
        }
      } else if (currentQuad.predicate.value === OWL_VOCABULARY.disjointWith) {
        axiom = this.#dataFactory.getOWLDisjointClassesAxiom(
          [
            await this.#classExpression(currentQuad.subject, 0),
            await this.#classExpression(currentQuad.object, 0),
          ],
          annotations,
        );
      } else if (
        currentQuad.predicate.value === OWL_VOCABULARY.disjointUnionOf
      ) {
        const owlClass = this.#dataFactory.getOWLClass(
          IRI.create(
            requireNamedNode(
              currentQuad.subject,
              "owl:disjointUnionOf requires an IRI class subject",
            ).value,
          ),
        );
        const classExpressions = await this.#rdfList(
          currentQuad.object,
          (item) => this.#classExpression(item, 1),
          quadKey(currentQuad),
        );
        this.#requireListArity(
          classExpressions,
          2,
          OWL_VOCABULARY.disjointUnionOf,
        );
        axiom = this.#dataFactory.getOWLDisjointUnionAxiom(
          owlClass,
          classExpressions,
          annotations,
        );
      } else if (
        currentQuad.subject.termType === "NamedNode" &&
        [
          OWL_VOCABULARY.complementOf,
          OWL_VOCABULARY.intersectionOf,
          OWL_VOCABULARY.oneOf,
          OWL_VOCABULARY.unionOf,
        ].includes(currentQuad.predicate.value)
      ) {
        axiom = await this.#owl1CompatibleNamedClassAxiom(
          currentQuad,
          annotations,
        );
      } else {
        continue;
      }
      if (axiom) {
        this.#transaction.addAxiom(axiom);
      }
      this.#consume(currentQuad);
      visited += 1;
      if (visited % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }
  }

  async #owl1CompatibleNamedClassAxiom(currentQuad, annotations) {
    const namedClass = await this.#classExpression(currentQuad.subject, 0);
    let expression;
    if (currentQuad.predicate.value === OWL_VOCABULARY.complementOf) {
      expression = this.#dataFactory.getOWLObjectComplementOf(
        await this.#classExpression(currentQuad.object, 1),
      );
    } else if (currentQuad.predicate.value === OWL_VOCABULARY.oneOf) {
      const individuals = await this.#rdfList(
        currentQuad.object,
        (item) =>
          this.#individual(
            requireNamedNode(
              item,
              "An OWL 1 compatible named-class enumeration requires named individuals",
            ),
          ),
        quadKey(currentQuad),
      );
      expression =
        individuals.length === 0
          ? this.#dataFactory.getOWLClass(IRI.create(OWL_VOCABULARY.Nothing))
          : this.#dataFactory.getOWLObjectOneOf(individuals);
    } else {
      const operands = await this.#rdfList(
        currentQuad.object,
        (item) => this.#classExpression(item, 1),
        quadKey(currentQuad),
      );
      expression = this.#normalizedObjectBooleanExpression(
        currentQuad.predicate.value,
        operands,
      );
    }
    return this.#equivalentClassesAxiom(namedClass, expression, annotations);
  }

  #equivalentClassesAxiom(left, right, annotations) {
    return left.equals(right)
      ? undefined
      : this.#dataFactory.getOWLEquivalentClassesAxiom(
          [left, right],
          annotations,
        );
  }

  #normalizedObjectBooleanExpression(predicate, operands) {
    if (operands.length === 1) {
      return operands[0];
    }
    if (operands.length === 0) {
      return this.#dataFactory.getOWLClass(
        IRI.create(
          predicate === OWL_VOCABULARY.intersectionOf
            ? OWL_VOCABULARY.Thing
            : OWL_VOCABULARY.Nothing,
        ),
      );
    }
    return predicate === OWL_VOCABULARY.intersectionOf
      ? this.#dataFactory.getOWLObjectIntersectionOf(operands)
      : this.#dataFactory.getOWLObjectUnionOf(operands);
  }

  async #readPropertyAxioms() {
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      const predicate = currentQuad.predicate.value;
      let axiom;
      const annotations = await this.#axiomAnnotations(currentQuad);
      if (predicate === RDFS_VOCABULARY.subPropertyOf) {
        if (this.#isAnnotationPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLSubAnnotationPropertyOfAxiom(
            this.#annotationProperty(currentQuad.subject),
            this.#annotationProperty(currentQuad.object),
            annotations,
          );
        } else if (this.#isDataPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLSubDataPropertyOfAxiom(
            this.#dataProperty(currentQuad.subject),
            this.#dataProperty(currentQuad.object),
            annotations,
          );
        } else if (this.#isObjectPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
            await this.#objectPropertyExpression(currentQuad.subject, 0),
            await this.#objectPropertyExpression(currentQuad.object, 0),
            annotations,
          );
        } else {
          continue;
        }
      } else if (predicate === OWL_VOCABULARY.propertyChainAxiom) {
        const chain = await this.#rdfList(
          currentQuad.object,
          (item) => this.#objectPropertyExpression(item, 1),
          quadKey(currentQuad),
        );
        this.#requireListArity(chain, 2, OWL_VOCABULARY.propertyChainAxiom);
        axiom = this.#dataFactory.getOWLSubPropertyChainOfAxiom(
          chain,
          await this.#objectPropertyExpression(currentQuad.subject, 0),
          annotations,
        );
      } else if (predicate === OWL_VOCABULARY.equivalentProperty) {
        if (this.#isDataPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLEquivalentDataPropertiesAxiom(
            [
              this.#dataProperty(currentQuad.subject),
              this.#dataProperty(currentQuad.object),
            ],
            annotations,
          );
        } else if (this.#isObjectPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLEquivalentObjectPropertiesAxiom(
            [
              await this.#objectPropertyExpression(currentQuad.subject, 0),
              await this.#objectPropertyExpression(currentQuad.object, 0),
            ],
            annotations,
          );
        } else {
          continue;
        }
      } else if (predicate === OWL_VOCABULARY.propertyDisjointWith) {
        if (this.#isDataPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLDisjointDataPropertiesAxiom(
            [
              this.#dataProperty(currentQuad.subject),
              this.#dataProperty(currentQuad.object),
            ],
            annotations,
          );
        } else if (this.#isObjectPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLDisjointObjectPropertiesAxiom(
            [
              await this.#objectPropertyExpression(currentQuad.subject, 0),
              await this.#objectPropertyExpression(currentQuad.object, 0),
            ],
            annotations,
          );
        } else {
          continue;
        }
      } else if (predicate === RDFS_VOCABULARY.domain) {
        if (this.#isAnnotationPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLAnnotationPropertyDomainAxiom(
            this.#annotationProperty(currentQuad.subject),
            IRI.create(
              requireNamedNode(
                currentQuad.object,
                "An annotation property domain requires an IRI",
              ).value,
            ),
            annotations,
          );
        } else if (this.#isDataPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLDataPropertyDomainAxiom(
            this.#dataProperty(currentQuad.subject),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
        } else if (this.#isObjectPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLObjectPropertyDomainAxiom(
            await this.#objectPropertyExpression(currentQuad.subject, 0),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
        } else {
          continue;
        }
      } else if (predicate === RDFS_VOCABULARY.range) {
        if (this.#isAnnotationPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLAnnotationPropertyRangeAxiom(
            this.#annotationProperty(currentQuad.subject),
            IRI.create(
              requireNamedNode(
                currentQuad.object,
                "An annotation property range requires an IRI",
              ).value,
            ),
            annotations,
          );
        } else if (this.#isDataPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLDataPropertyRangeAxiom(
            this.#dataProperty(currentQuad.subject),
            await this.#dataRange(currentQuad.object, 0),
            annotations,
          );
        } else if (this.#isObjectPropertyTerm(currentQuad.subject)) {
          axiom = this.#dataFactory.getOWLObjectPropertyRangeAxiom(
            await this.#objectPropertyExpression(currentQuad.subject, 0),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
        } else {
          continue;
        }
      } else if (
        predicate === OWL_VOCABULARY.inverseOf &&
        currentQuad.subject.termType === "NamedNode" &&
        this.#isObjectPropertyTerm(currentQuad.subject)
      ) {
        axiom = this.#dataFactory.getOWLInverseObjectPropertiesAxiom(
          await this.#objectPropertyExpression(currentQuad.subject, 0),
          await this.#objectPropertyExpression(currentQuad.object, 0),
          annotations,
        );
      } else {
        continue;
      }
      this.#transaction.addAxiom(axiom);
      this.#consume(currentQuad);
      visited += 1;
      if (visited % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }

    const characteristicMethods = new Map([
      [
        OWL_VOCABULARY.AsymmetricProperty,
        "getOWLAsymmetricObjectPropertyAxiom",
      ],
      [
        OWL_VOCABULARY.InverseFunctionalProperty,
        "getOWLInverseFunctionalObjectPropertyAxiom",
      ],
      [
        OWL_VOCABULARY.IrreflexiveProperty,
        "getOWLIrreflexiveObjectPropertyAxiom",
      ],
      [OWL_VOCABULARY.ReflexiveProperty, "getOWLReflexiveObjectPropertyAxiom"],
      [OWL_VOCABULARY.SymmetricProperty, "getOWLSymmetricObjectPropertyAxiom"],
      [
        OWL_VOCABULARY.TransitiveProperty,
        "getOWLTransitiveObjectPropertyAxiom",
      ],
    ]);
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode"
      ) {
        continue;
      }
      let axiom;
      const annotations = await this.#axiomAnnotations(currentQuad);
      if (currentQuad.object.value === OWL_VOCABULARY.FunctionalProperty) {
        axiom = this.#isDataPropertyTerm(currentQuad.subject)
          ? this.#dataFactory.getOWLFunctionalDataPropertyAxiom(
              this.#dataProperty(currentQuad.subject),
              annotations,
            )
          : this.#dataFactory.getOWLFunctionalObjectPropertyAxiom(
              await this.#objectPropertyExpression(currentQuad.subject, 0),
              annotations,
            );
      } else {
        const method = characteristicMethods.get(currentQuad.object.value);
        if (!method) {
          continue;
        }
        axiom = this.#dataFactory[method](
          await this.#objectPropertyExpression(currentQuad.subject, 0),
          annotations,
        );
      }
      this.#transaction.addAxiom(axiom);
      this.#consume(currentQuad);
    }
  }

  async #readNaryAxioms() {
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode"
      ) {
        continue;
      }
      if (currentQuad.object.value === OWL_VOCABULARY.AllDisjointClasses) {
        const membersQuad = this.#exactlyOne(
          currentQuad.subject,
          OWL_VOCABULARY.members,
        );
        const members = await this.#rdfList(
          membersQuad.object,
          (item) => this.#classExpression(item, 0),
          quadKey(membersQuad),
        );
        this.#requireListArity(members, 2, OWL_VOCABULARY.members);
        const annotations = [
          ...(await this.#axiomAnnotations(currentQuad)),
          ...(await this.#axiomAnnotations(membersQuad)),
          ...(await this.#nodeAnnotations(currentQuad.subject, 0)),
        ];
        this.#transaction.addAxiom(
          this.#dataFactory.getOWLDisjointClassesAxiom(members, annotations),
        );
        this.#consume(currentQuad);
        this.#consume(membersQuad);
      } else if (
        currentQuad.object.value === OWL_VOCABULARY.AllDisjointProperties
      ) {
        const membersQuad = this.#exactlyOne(
          currentQuad.subject,
          OWL_VOCABULARY.members,
        );
        const memberTerms = await this.#rdfList(
          membersQuad.object,
          (item) => item,
          quadKey(membersQuad),
        );
        this.#requireListArity(memberTerms, 2, OWL_VOCABULARY.members);
        const annotations = [
          ...(await this.#axiomAnnotations(currentQuad)),
          ...(await this.#axiomAnnotations(membersQuad)),
          ...(await this.#nodeAnnotations(currentQuad.subject, 0)),
        ];
        if (memberTerms.every((term) => this.#isDataPropertyTerm(term))) {
          this.#transaction.addAxiom(
            this.#dataFactory.getOWLDisjointDataPropertiesAxiom(
              memberTerms.map((term) => this.#dataProperty(term)),
              annotations,
            ),
          );
        } else {
          this.#transaction.addAxiom(
            this.#dataFactory.getOWLDisjointObjectPropertiesAxiom(
              await Promise.all(
                memberTerms.map((term) =>
                  this.#objectPropertyExpression(term, 0),
                ),
              ),
              annotations,
            ),
          );
        }
        this.#consume(currentQuad);
        this.#consume(membersQuad);
      }
    }
  }

  async #readKeysAndAssertions() {
    await this.#readKeys();
    await this.#readDifferentIndividuals();
    await this.#readNegativeAssertions();

    const nonAssertionTypes = new Set([
      OWL_VOCABULARY.AllDifferent,
      OWL_VOCABULARY.AllDisjointClasses,
      OWL_VOCABULARY.AllDisjointProperties,
      OWL_VOCABULARY.Annotation,
      OWL_VOCABULARY.AnnotationProperty,
      OWL_VOCABULARY.AsymmetricProperty,
      OWL_VOCABULARY.Axiom,
      OWL_VOCABULARY.Class,
      OWL_VOCABULARY.DatatypeProperty,
      OWL_VOCABULARY.FunctionalProperty,
      OWL_VOCABULARY.InverseFunctionalProperty,
      OWL_VOCABULARY.IrreflexiveProperty,
      OWL_VOCABULARY.NamedIndividual,
      OWL_VOCABULARY.NegativePropertyAssertion,
      OWL_VOCABULARY.ObjectProperty,
      OWL_VOCABULARY.Ontology,
      OWL_VOCABULARY.ReflexiveProperty,
      OWL_VOCABULARY.Restriction,
      OWL_VOCABULARY.SymmetricProperty,
      OWL_VOCABULARY.TransitiveProperty,
      RDFS_VOCABULARY.Datatype,
    ]);
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      if (this.#isConsumed(currentQuad)) {
        continue;
      }
      const predicate = currentQuad.predicate.value;
      const annotations = await this.#axiomAnnotations(currentQuad);
      let axiom;
      if (predicate === RDF_VOCABULARY.type) {
        if (
          currentQuad.object.termType === "NamedNode" &&
          [
            OWL_VOCABULARY.DeprecatedClass,
            OWL_VOCABULARY.DeprecatedProperty,
          ].includes(currentQuad.object.value)
        ) {
          axiom = this.#dataFactory.getOWLAnnotationAssertionAxiom(
            this.#dataFactory.getOWLAnnotationProperty(
              IRI.create(OWL_VOCABULARY.deprecated),
            ),
            IRI.create(
              requireNamedNode(
                currentQuad.subject,
                "OWL deprecated entity markers require an IRI subject",
              ).value,
            ),
            this.#dataFactory.getOWLLiteral(
              "true",
              IRI.create(`${XSD_NAMESPACE}boolean`),
            ),
            annotations,
          );
        } else if (
          currentQuad.object.termType === "NamedNode" &&
          nonAssertionTypes.has(currentQuad.object.value)
        ) {
          continue;
        } else {
          axiom = this.#dataFactory.getOWLClassAssertionAxiom(
            await this.#classExpression(currentQuad.object, 0),
            this.#individual(currentQuad.subject),
            annotations,
          );
        }
      } else if (predicate === OWL_VOCABULARY.sameAs) {
        axiom = this.#dataFactory.getOWLSameIndividualAxiom(
          [
            this.#individual(currentQuad.subject),
            this.#individual(currentQuad.object),
          ],
          annotations,
        );
      } else if (predicate === OWL_VOCABULARY.differentFrom) {
        axiom = this.#dataFactory.getOWLDifferentIndividualsAxiom(
          [
            this.#individual(currentQuad.subject),
            this.#individual(currentQuad.object),
          ],
          annotations,
        );
      } else if (this.#isObjectPropertyTerm(currentQuad.predicate)) {
        axiom = this.#dataFactory.getOWLObjectPropertyAssertionAxiom(
          await this.#objectPropertyExpression(currentQuad.predicate, 0),
          this.#individual(currentQuad.subject),
          this.#individual(currentQuad.object),
          annotations,
        );
      } else if (this.#isDataPropertyTerm(currentQuad.predicate)) {
        axiom = this.#dataFactory.getOWLDataPropertyAssertionAxiom(
          this.#dataProperty(currentQuad.predicate),
          this.#individual(currentQuad.subject),
          this.#literal(currentQuad.object),
          annotations,
        );
      } else if (this.#isAnnotationPropertyTerm(currentQuad.predicate)) {
        this.#consume(currentQuad);
        if (!this.#configuration.loadAnnotationAxioms) {
          continue;
        }
        axiom = this.#dataFactory.getOWLAnnotationAssertionAxiom(
          this.#annotationProperty(currentQuad.predicate),
          this.#annotationSubject(currentQuad.subject),
          this.#annotationValue(currentQuad.object),
          annotations,
        );
      } else {
        continue;
      }
      this.#transaction.addAxiom(axiom);
      this.#consume(currentQuad);
      visited += 1;
      if (visited % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }
  }

  #assertCompatiblePropertyCategories() {
    const categories = [
      ["annotation", this.#annotationPropertyIris],
      ["data", this.#dataPropertyIris],
      ["object", this.#objectPropertyIris],
    ];
    for (let leftIndex = 0; leftIndex < categories.length; leftIndex += 1) {
      const [leftName, leftValues] = categories[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < categories.length;
        rightIndex += 1
      ) {
        const [rightName, rightValues] = categories[rightIndex];
        for (const iri of leftValues) {
          if (rightValues.has(iri)) {
            throw new OWLSyntaxError(
              "An IRI cannot identify conflicting OWL property categories",
              { iri, propertyCategories: [leftName, rightName] },
            );
          }
        }
      }
    }
  }

  async #accountForUnconsumedTriples() {
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      if (
        this.#isConsumed(currentQuad) ||
        !this.#isOwlSignificant(currentQuad)
      ) {
        continue;
      }
      const details = {
        object: currentQuad.object.value,
        predicate: currentQuad.predicate.value,
        subject: currentQuad.subject.value,
      };
      if (this.#configuration.parsingMode === "strict") {
        throw new UnsupportedConstructError(
          "The RDF graph contains an unconsumed OWL-significant triple",
          details,
        );
      }
      if (this.#configuration.collectWarnings) {
        this.#diagnostics.push({
          code: "RDF_UNCONSUMED_OWL_TRIPLE",
          message:
            "An OWL-significant RDF triple could not be reconstructed and was ignored",
          severity: "warning",
          ...details,
        });
      }
      visited += 1;
      if (visited % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }
  }

  #isOwlSignificant(currentQuad) {
    const predicate = currentQuad.predicate.value;
    if (
      predicate.startsWith(OWL_NAMESPACE) ||
      predicate.startsWith(RDFS_NAMESPACE) ||
      predicate === RDF_VOCABULARY.type ||
      predicate === RDF_VOCABULARY.first ||
      predicate === RDF_VOCABULARY.rest ||
      this.#annotationPropertyIris.has(predicate) ||
      this.#dataPropertyIris.has(predicate) ||
      this.#objectPropertyIris.has(predicate)
    ) {
      return true;
    }
    if (currentQuad.subject.termType === "NamedNode") {
      return [
        this.#classIris,
        this.#datatypeIris,
        this.#individualIris,
        this.#annotationPropertyIris,
        this.#dataPropertyIris,
        this.#objectPropertyIris,
      ].some((values) => values.has(currentQuad.subject.value));
    }
    return (
      currentQuad.object.termType === "NamedNode" &&
      (currentQuad.object.value.startsWith(OWL_NAMESPACE) ||
        currentQuad.object.value.startsWith(RDFS_NAMESPACE) ||
        currentQuad.object.value.startsWith(RDF_NAMESPACE))
    );
  }

  async #readKeys() {
    for (const currentQuad of this.#dataset) {
      if (currentQuad.predicate.value !== OWL_VOCABULARY.hasKey) {
        continue;
      }
      const propertyTerms = await this.#rdfList(
        currentQuad.object,
        (item) => item,
        quadKey(currentQuad),
      );
      this.#requireListArity(propertyTerms, 1, OWL_VOCABULARY.hasKey);
      const objectProperties = [];
      const dataProperties = [];
      for (const term of propertyTerms) {
        if (this.#isDataPropertyTerm(term)) {
          dataProperties.push(this.#dataProperty(term));
        } else if (this.#isObjectPropertyTerm(term)) {
          objectProperties.push(await this.#objectPropertyExpression(term, 0));
        } else {
          throw new OWLSyntaxError(
            "owl:hasKey members must be declared object or data properties",
            { property: term.value },
          );
        }
      }
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLHasKeyAxiom(
          await this.#classExpression(currentQuad.subject, 0),
          objectProperties,
          dataProperties,
          await this.#axiomAnnotations(currentQuad),
        ),
      );
      this.#consume(currentQuad);
    }
  }

  async #readDifferentIndividuals() {
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode" ||
        currentQuad.object.value !== OWL_VOCABULARY.AllDifferent
      ) {
        continue;
      }
      const members = [
        ...this.#outgoing(currentQuad.subject, OWL_VOCABULARY.members),
        ...this.#outgoing(currentQuad.subject, OWL_VOCABULARY.distinctMembers),
      ];
      if (members.length !== 1) {
        throw new OWLSyntaxError(
          "owl:AllDifferent requires exactly one members collection",
          { observed: members.length },
        );
      }
      const memberQuad = members[0];
      const individuals = await this.#rdfList(
        memberQuad.object,
        (item) => this.#individual(item),
        quadKey(memberQuad),
      );
      this.#requireListArity(individuals, 2, memberQuad.predicate.value);
      const annotations = [
        ...(await this.#axiomAnnotations(currentQuad)),
        ...(await this.#axiomAnnotations(memberQuad)),
        ...(await this.#nodeAnnotations(currentQuad.subject, 0)),
      ];
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDifferentIndividualsAxiom(
          individuals,
          annotations,
        ),
      );
      this.#consume(currentQuad);
      this.#consume(memberQuad);
    }
  }

  async #readNegativeAssertions() {
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.predicate.value !== RDF_VOCABULARY.type ||
        currentQuad.object.termType !== "NamedNode" ||
        currentQuad.object.value !== OWL_VOCABULARY.NegativePropertyAssertion
      ) {
        continue;
      }
      const source = this.#exactlyOne(
        currentQuad.subject,
        OWL_VOCABULARY.sourceIndividual,
      );
      const property = this.#exactlyOne(
        currentQuad.subject,
        OWL_VOCABULARY.assertionProperty,
      );
      const individualTargets = this.#outgoing(
        currentQuad.subject,
        OWL_VOCABULARY.targetIndividual,
      );
      const valueTargets = this.#outgoing(
        currentQuad.subject,
        OWL_VOCABULARY.targetValue,
      );
      if (individualTargets.length + valueTargets.length !== 1) {
        throw new OWLSyntaxError(
          "A negative property assertion requires exactly one target",
        );
      }
      const target = individualTargets[0] || valueTargets[0];
      const annotations = [
        ...(await this.#axiomAnnotations(currentQuad)),
        ...(await this.#nodeAnnotations(currentQuad.subject, 0)),
      ];
      const axiom = individualTargets.length
        ? this.#dataFactory.getOWLNegativeObjectPropertyAssertionAxiom(
            await this.#objectPropertyExpression(property.object, 0),
            this.#individual(source.object),
            this.#individual(target.object),
            annotations,
          )
        : this.#dataFactory.getOWLNegativeDataPropertyAssertionAxiom(
            this.#dataProperty(property.object),
            this.#individual(source.object),
            this.#literal(target.object),
            annotations,
          );
      this.#transaction.addAxiom(axiom);
      this.#consume(currentQuad);
      this.#consume(source);
      this.#consume(property);
      this.#consume(target);
    }
  }

  async #classExpression(term, depth) {
    this.#checkExpressionDepth(depth);
    if (term.termType === "NamedNode") {
      if (this.#isDataRangeTerm(term)) {
        throw new OWLSyntaxError(
          "A datatype cannot be used as a class expression",
          {
            iri: term.value,
          },
        );
      }
      this.#classIris.add(term.value);
      return this.#dataFactory.getOWLClass(IRI.create(term.value));
    }
    if (term.termType !== "BlankNode") {
      throw new OWLSyntaxError("Invalid RDF term for an OWL class expression", {
        termType: term.termType,
      });
    }

    const key = termKey(term);
    if (this.#anonymousDataRangeNodes.has(key)) {
      throw new OWLSyntaxError(
        "An anonymous data range cannot be used as a class expression",
      );
    }
    if (this.#classExpressionCache.has(key)) {
      return this.#classExpressionCache.get(key);
    }
    if (this.#classExpressionStack.has(key)) {
      throw new OWLSyntaxError("Cyclic RDF class-expression structure");
    }
    this.#classExpressionStack.add(key);
    try {
      const intersection = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.intersectionOf,
      );
      const union = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.unionOf);
      const complement = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.complementOf,
      );
      const oneOf = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.oneOf);
      const patterns = [intersection, union, complement, oneOf].filter(Boolean);
      const hasRestrictionShape =
        this.#outgoing(term, OWL_VOCABULARY.onProperty).length > 0 ||
        this.#outgoing(term, OWL_VOCABULARY.onProperties).length > 0;
      if (patterns.length + Number(hasRestrictionShape) !== 1) {
        throw new OWLSyntaxError(
          "An anonymous class expression must have exactly one recognized OWL shape",
          { nodeID: term.value },
        );
      }

      let expression;
      if (intersection) {
        this.#consume(intersection);
        const operands = await this.#rdfList(
          intersection.object,
          (item) => this.#classExpression(item, depth + 1),
          quadKey(intersection),
        );
        expression = this.#normalizedObjectBooleanExpression(
          OWL_VOCABULARY.intersectionOf,
          operands,
        );
      } else if (union) {
        this.#consume(union);
        const operands = await this.#rdfList(
          union.object,
          (item) => this.#classExpression(item, depth + 1),
          quadKey(union),
        );
        expression = this.#normalizedObjectBooleanExpression(
          OWL_VOCABULARY.unionOf,
          operands,
        );
      } else if (complement) {
        this.#consume(complement);
        expression = this.#dataFactory.getOWLObjectComplementOf(
          await this.#classExpression(complement.object, depth + 1),
        );
      } else if (oneOf) {
        this.#consume(oneOf);
        const individuals = await this.#rdfList(
          oneOf.object,
          (item) => this.#individual(item),
          quadKey(oneOf),
        );
        expression =
          individuals.length === 0
            ? this.#dataFactory.getOWLClass(IRI.create(OWL_VOCABULARY.Nothing))
            : this.#dataFactory.getOWLObjectOneOf(individuals);
      } else {
        expression = await this.#restriction(term, depth);
      }
      for (const typeQuad of this.#outgoing(term, RDF_VOCABULARY.type)) {
        if (
          typeQuad.object.termType === "NamedNode" &&
          typeQuad.object.value === OWL_VOCABULARY.Class
        ) {
          this.#consume(typeQuad);
        }
      }
      this.#classExpressionCache.set(key, expression);
      return expression;
    } finally {
      this.#classExpressionStack.delete(key);
    }
  }

  async #restriction(term, depth) {
    const restrictionTypes = this.#outgoing(term, RDF_VOCABULARY.type).filter(
      ({ object }) =>
        object.termType === "NamedNode" &&
        object.value === OWL_VOCABULARY.Restriction,
    );
    if (restrictionTypes.length > 1) {
      throw new OWLSyntaxError(
        "A restriction has duplicate owl:Restriction types",
      );
    }
    if (restrictionTypes.length === 1) {
      this.#consume(restrictionTypes[0]);
    }

    const onProperties = this.#exactlyZeroOrOne(
      term,
      OWL_VOCABULARY.onProperties,
    );
    if (onProperties) {
      this.#consume(onProperties);
      const properties = await this.#rdfList(
        onProperties.object,
        (item) => this.#dataProperty(item),
        quadKey(onProperties),
      );
      this.#requireListArity(properties, 1, OWL_VOCABULARY.onProperties);
      const someValuesFrom = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.someValuesFrom,
      );
      const allValuesFrom = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.allValuesFrom,
      );
      if (
        Number(Boolean(someValuesFrom)) + Number(Boolean(allValuesFrom)) !==
        1
      ) {
        throw new OWLSyntaxError(
          "owl:onProperties requires exactly one data value restriction",
        );
      }
      const fillerQuad = someValuesFrom || allValuesFrom;
      this.#consume(fillerQuad);
      const filler = await this.#dataRange(fillerQuad.object, depth + 1);
      return someValuesFrom
        ? this.#dataFactory.getOWLDataSomeValuesFrom(properties, filler)
        : this.#dataFactory.getOWLDataAllValuesFrom(properties, filler);
    }

    const onProperty = this.#exactlyOne(term, OWL_VOCABULARY.onProperty);
    this.#consume(onProperty);
    const propertyTerm = onProperty.object;
    const someValuesFrom = this.#exactlyZeroOrOne(
      term,
      OWL_VOCABULARY.someValuesFrom,
    );
    const allValuesFrom = this.#exactlyZeroOrOne(
      term,
      OWL_VOCABULARY.allValuesFrom,
    );
    const hasValue = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.hasValue);
    const hasSelf = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.hasSelf);
    const cardinalities = [
      [OWL_VOCABULARY.minCardinality, "min", false],
      [OWL_VOCABULARY.maxCardinality, "max", false],
      [OWL_VOCABULARY.cardinality, "exact", false],
      [OWL_VOCABULARY.minQualifiedCardinality, "min", true],
      [OWL_VOCABULARY.maxQualifiedCardinality, "max", true],
      [OWL_VOCABULARY.qualifiedCardinality, "exact", true],
    ]
      .map(([predicate, cardinalityKind, qualified]) => ({
        cardinalityKind,
        quad: this.#exactlyZeroOrOne(term, predicate),
        qualified,
      }))
      .filter(({ quad }) => quad);
    const restrictionCount =
      Number(Boolean(someValuesFrom)) +
      Number(Boolean(allValuesFrom)) +
      Number(Boolean(hasValue)) +
      Number(Boolean(hasSelf)) +
      cardinalities.length;
    if (restrictionCount !== 1) {
      throw new OWLSyntaxError(
        "An OWL restriction must contain exactly one restriction predicate",
        { nodeID: term.value },
      );
    }

    if (hasValue) {
      this.#consume(hasValue);
      if (hasValue.object.termType === "Literal") {
        return this.#dataFactory.getOWLDataHasValue(
          this.#dataProperty(propertyTerm),
          this.#literal(hasValue.object),
        );
      }
      return this.#dataFactory.getOWLObjectHasValue(
        await this.#objectPropertyExpression(propertyTerm, depth + 1),
        this.#individual(hasValue.object),
      );
    }
    if (hasSelf) {
      this.#consume(hasSelf);
      if (!this.#booleanLiteral(hasSelf.object)) {
        throw new OWLSyntaxError("owl:hasSelf requires the literal true");
      }
      return this.#dataFactory.getOWLObjectHasSelf(
        await this.#objectPropertyExpression(propertyTerm, depth + 1),
      );
    }
    if (someValuesFrom || allValuesFrom) {
      const fillerQuad = someValuesFrom || allValuesFrom;
      this.#consume(fillerQuad);
      if (this.#isDataPropertyTerm(propertyTerm)) {
        const property = this.#dataProperty(propertyTerm);
        const filler = await this.#dataRange(fillerQuad.object, depth + 1);
        return someValuesFrom
          ? this.#dataFactory.getOWLDataSomeValuesFrom([property], filler)
          : this.#dataFactory.getOWLDataAllValuesFrom([property], filler);
      }
      const property = await this.#objectPropertyExpression(
        propertyTerm,
        depth + 1,
      );
      const filler = await this.#classExpression(fillerQuad.object, depth + 1);
      return someValuesFrom
        ? this.#dataFactory.getOWLObjectSomeValuesFrom(property, filler)
        : this.#dataFactory.getOWLObjectAllValuesFrom(property, filler);
    }

    const [{ cardinalityKind, quad: cardinalityQuad, qualified }] =
      cardinalities;
    this.#consume(cardinalityQuad);
    const cardinality = this.#cardinality(cardinalityQuad.object);
    const onClass = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.onClass);
    const onDataRange = this.#exactlyZeroOrOne(
      term,
      OWL_VOCABULARY.onDataRange,
    );
    if (
      qualified &&
      Number(Boolean(onClass)) + Number(Boolean(onDataRange)) !== 1
    ) {
      throw new OWLSyntaxError(
        "A qualified cardinality requires exactly one owl:onClass or owl:onDataRange",
      );
    }
    if (!qualified && (onClass || onDataRange)) {
      throw new OWLSyntaxError(
        "An unqualified cardinality cannot use owl:onClass or owl:onDataRange",
      );
    }
    if (onDataRange || this.#isDataPropertyTerm(propertyTerm)) {
      const property = this.#dataProperty(propertyTerm);
      let filler;
      if (onDataRange) {
        this.#consume(onDataRange);
        filler = await this.#dataRange(onDataRange.object, depth + 1);
      }
      const method = {
        exact: "getOWLDataExactCardinality",
        max: "getOWLDataMaxCardinality",
        min: "getOWLDataMinCardinality",
      }[cardinalityKind];
      return this.#dataFactory[method](cardinality, property, filler);
    }
    const property = await this.#objectPropertyExpression(
      propertyTerm,
      depth + 1,
    );
    let filler;
    if (onClass) {
      this.#consume(onClass);
      filler = await this.#classExpression(onClass.object, depth + 1);
    }
    const method = {
      exact: "getOWLObjectExactCardinality",
      max: "getOWLObjectMaxCardinality",
      min: "getOWLObjectMinCardinality",
    }[cardinalityKind];
    return this.#dataFactory[method](cardinality, property, filler);
  }

  async #dataRange(term, depth) {
    this.#checkExpressionDepth(depth);
    if (term.termType === "NamedNode") {
      this.#datatypeIris.add(term.value);
      return this.#dataFactory.getOWLDatatype(IRI.create(term.value));
    }
    if (term.termType !== "BlankNode") {
      throw new OWLSyntaxError("Invalid RDF term for an OWL data range", {
        termType: term.termType,
      });
    }
    const key = termKey(term);
    if (this.#anonymousClassNodes.has(key)) {
      throw new OWLSyntaxError(
        "An anonymous class expression cannot be used as a data range",
      );
    }
    if (this.#dataRangeCache.has(key)) {
      return this.#dataRangeCache.get(key);
    }
    if (this.#dataRangeStack.has(key)) {
      throw new OWLSyntaxError("Cyclic RDF data-range structure");
    }
    this.#dataRangeStack.add(key);
    try {
      const intersection = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.intersectionOf,
      );
      const union = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.unionOf);
      const complement = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.datatypeComplementOf,
      );
      const oneOf = this.#exactlyZeroOrOne(term, OWL_VOCABULARY.oneOf);
      const onDatatype = this.#exactlyZeroOrOne(
        term,
        OWL_VOCABULARY.onDatatype,
      );
      const patterns = [
        intersection,
        union,
        complement,
        oneOf,
        onDatatype,
      ].filter(Boolean);
      if (patterns.length !== 1) {
        throw new OWLSyntaxError(
          "An anonymous data range must have exactly one recognized OWL shape",
          { nodeID: term.value },
        );
      }
      let dataRange;
      if (intersection || union) {
        const pattern = intersection || union;
        this.#consume(pattern);
        const operands = await this.#rdfList(
          pattern.object,
          (item) => this.#dataRange(item, depth + 1),
          quadKey(pattern),
        );
        this.#requireListArity(operands, 2, pattern.predicate.value);
        dataRange = intersection
          ? this.#dataFactory.getOWLDataIntersectionOf(operands)
          : this.#dataFactory.getOWLDataUnionOf(operands);
      } else if (complement) {
        this.#consume(complement);
        dataRange = this.#dataFactory.getOWLDataComplementOf(
          await this.#dataRange(complement.object, depth + 1),
        );
      } else if (oneOf) {
        this.#consume(oneOf);
        const values = await this.#rdfList(
          oneOf.object,
          (item) => this.#literal(item),
          quadKey(oneOf),
        );
        if (values.length === 0 && this.#owl1DataRangeNodes.has(key)) {
          dataRange = this.#dataFactory.getOWLDataComplementOf(
            this.#dataFactory.getOWLDatatype(
              IRI.create(RDFS_VOCABULARY.Literal),
            ),
          );
        } else {
          this.#requireListArity(values, 1, OWL_VOCABULARY.oneOf);
          dataRange = this.#dataFactory.getOWLDataOneOf(values);
        }
      } else {
        this.#consume(onDatatype);
        const datatype = this.#dataFactory.getOWLDatatype(
          IRI.create(
            requireNamedNode(
              onDatatype.object,
              "owl:onDatatype requires an IRI datatype",
            ).value,
          ),
        );
        const withRestrictions = this.#exactlyOne(
          term,
          OWL_VOCABULARY.withRestrictions,
        );
        this.#consume(withRestrictions);
        const restrictions = await this.#rdfList(
          withRestrictions.object,
          (item) => this.#facetRestriction(item),
          quadKey(withRestrictions),
        );
        this.#requireListArity(
          restrictions,
          1,
          OWL_VOCABULARY.withRestrictions,
        );
        dataRange = this.#dataFactory.getOWLDatatypeRestriction(
          datatype,
          restrictions,
        );
      }
      for (const typeQuad of this.#outgoing(term, RDF_VOCABULARY.type)) {
        if (
          typeQuad.object.termType === "NamedNode" &&
          [OWL_VOCABULARY.DataRange, RDFS_VOCABULARY.Datatype].includes(
            typeQuad.object.value,
          )
        ) {
          this.#consume(typeQuad);
        }
      }
      this.#dataRangeCache.set(key, dataRange);
      return dataRange;
    } finally {
      this.#dataRangeStack.delete(key);
    }
  }

  #facetRestriction(term) {
    if (term.termType !== "BlankNode") {
      throw new OWLSyntaxError(
        "A datatype facet restriction must be a blank node",
      );
    }
    const candidates = this.#outgoing(term).filter(
      ({ object, predicate }) =>
        object.termType === "Literal" &&
        predicate.value !== RDF_VOCABULARY.type,
    );
    if (candidates.length !== 1) {
      throw new OWLSyntaxError(
        "A datatype facet restriction must contain exactly one facet value",
        { observed: candidates.length },
      );
    }
    const currentQuad = candidates[0];
    this.#consume(currentQuad);
    return this.#dataFactory.getOWLFacetRestriction(
      IRI.create(currentQuad.predicate.value),
      this.#literal(currentQuad.object),
    );
  }

  async #objectPropertyExpression(term, depth) {
    this.#checkExpressionDepth(depth);
    if (term.termType === "NamedNode") {
      if (this.#dataPropertyIris.has(term.value)) {
        throw new OWLSyntaxError(
          "A data property cannot be used as an object property expression",
          { iri: term.value },
        );
      }
      this.#objectPropertyIris.add(term.value);
      return this.#dataFactory.getOWLObjectProperty(IRI.create(term.value));
    }
    if (term.termType !== "BlankNode") {
      throw new OWLSyntaxError(
        "Invalid RDF term for an object property expression",
      );
    }
    const key = termKey(term);
    if (this.#objectPropertyExpressionCache.has(key)) {
      return this.#objectPropertyExpressionCache.get(key);
    }
    if (this.#objectPropertyExpressionStack.has(key)) {
      throw new OWLSyntaxError("Cyclic inverse object-property expression");
    }
    this.#objectPropertyExpressionStack.add(key);
    try {
      const inverse = this.#exactlyOne(term, OWL_VOCABULARY.inverseOf);
      this.#consume(inverse);
      const expression = this.#dataFactory.getOWLObjectInverseOf(
        await this.#objectPropertyExpression(inverse.object, depth + 1),
      );
      this.#objectPropertyExpressionCache.set(key, expression);
      return expression;
    } finally {
      this.#objectPropertyExpressionStack.delete(key);
    }
  }

  #dataProperty(term) {
    const named = requireNamedNode(
      term,
      "OWL data property expressions require an IRI",
    );
    if (this.#objectPropertyIris.has(named.value)) {
      throw new OWLSyntaxError(
        "An object property cannot be used as a data property expression",
        { iri: named.value },
      );
    }
    this.#dataPropertyIris.add(named.value);
    return this.#dataFactory.getOWLDataProperty(IRI.create(named.value));
  }

  #annotationProperty(term) {
    const named = requireNamedNode(
      term,
      "OWL annotation properties require an IRI",
    );
    if (
      this.#dataPropertyIris.has(named.value) ||
      this.#objectPropertyIris.has(named.value)
    ) {
      throw new OWLSyntaxError(
        "An object or data property cannot be used as an annotation property",
        { iri: named.value },
      );
    }
    this.#annotationPropertyIris.add(named.value);
    return this.#dataFactory.getOWLAnnotationProperty(IRI.create(named.value));
  }

  #individual(term) {
    if (term.termType === "NamedNode") {
      this.#individualIris.add(term.value);
      return this.#dataFactory.getOWLNamedIndividual(IRI.create(term.value));
    }
    if (term.termType === "BlankNode") {
      return this.#dataFactory.getOWLAnonymousIndividual(
        term.value,
        this.#documentScope,
      );
    }
    throw new OWLSyntaxError("An OWL individual cannot be an RDF literal");
  }

  #annotationSubject(term) {
    if (term.termType === "NamedNode") {
      return IRI.create(term.value);
    }
    if (term.termType === "BlankNode") {
      return this.#dataFactory.getOWLAnonymousIndividual(
        term.value,
        this.#documentScope,
      );
    }
    throw new OWLSyntaxError(
      "An annotation assertion subject must be an IRI or blank node",
    );
  }

  #literal(term) {
    if (term.termType !== "Literal") {
      throw new OWLSyntaxError("An OWL literal requires an RDF literal term");
    }
    return term.language
      ? this.#dataFactory.getOWLLiteral(term.value, term.language)
      : this.#dataFactory.getOWLLiteral(
          term.value,
          IRI.create(term.datatype.value),
        );
  }

  async #rdfList(head, decodeItem, owner) {
    if (head.termType === "NamedNode" && head.value === RDF_VOCABULARY.nil) {
      return [];
    }
    const result = [];
    const path = new Set();
    let node = head;
    while (!(
      node.termType === "NamedNode" && node.value === RDF_VOCABULARY.nil
    )) {
      if (node.termType !== "BlankNode") {
        const isUnstructuredNamedTerminator =
          node.termType === "NamedNode" &&
          result.length > 0 &&
          this.#outgoing(node, RDF_VOCABULARY.first).length === 0 &&
          this.#outgoing(node, RDF_VOCABULARY.rest).length === 0;
        if (
          this.#configuration.parsingMode === "compatible" &&
          isUnstructuredNamedTerminator
        ) {
          if (this.#configuration.collectWarnings) {
            this.#diagnostics.push({
              code: "RDF_LIST_NON_NIL_TERMINATOR",
              message:
                "A legacy RDF list ended at an unstructured IRI instead of rdf:nil",
              severity: "warning",
              terminator: node.value,
            });
          }
          break;
        }
        throw new OWLSyntaxError(
          "An RDF collection must terminate in rdf:nil and use blank list nodes",
        );
      }
      const key = termKey(node);
      if (path.has(key)) {
        throw new OWLSyntaxError("Cyclic RDF list");
      }
      path.add(key);
      const existingOwner = this.#listOwners.get(key);
      if (existingOwner !== undefined && existingOwner !== owner) {
        throw new OWLSyntaxError(
          "Shared or crossed RDF list tails are not allowed",
        );
      }
      this.#listOwners.set(key, owner);
      if (result.length >= this.#configuration.maxRdfListLength) {
        throw new ResourceLimitError("The RDF list length limit was exceeded", {
          limit: this.#configuration.maxRdfListLength,
          observed: result.length + 1,
          resource: "maxRdfListLength",
        });
      }
      const first = this.#exactlyOne(node, RDF_VOCABULARY.first);
      const rest = this.#exactlyOne(node, RDF_VOCABULARY.rest);
      this.#consume(first);
      this.#consume(rest);
      result.push(await decodeItem(first.object));
      node = rest.object;
      if (result.length % CHECK_INTERVAL === 0) {
        await this.#execution.cooperate();
      }
    }
    return result;
  }

  #exactlyOne(subject, predicate) {
    const matches = this.#outgoing(subject, predicate);
    if (matches.length !== 1) {
      throw new OWLSyntaxError(
        `Expected exactly one RDF triple for ${predicate}`,
        { observed: matches.length, predicate },
      );
    }
    return matches[0];
  }

  #exactlyZeroOrOne(subject, predicate) {
    const matches = this.#outgoing(subject, predicate);
    if (matches.length > 1) {
      throw new OWLSyntaxError(
        `Expected at most one RDF triple for ${predicate}`,
        { observed: matches.length, predicate },
      );
    }
    return matches[0];
  }

  #requireListArity(values, minimum, predicate) {
    if (values.length < minimum) {
      throw new OWLSyntaxError(
        `The RDF list for ${predicate} requires at least ${minimum} item(s)`,
        { observed: values.length, predicate },
      );
    }
  }

  #checkExpressionDepth(depth) {
    if (depth > this.#configuration.maxExpressionDepth) {
      throw new ResourceLimitError(
        "The OWL expression nesting depth limit was exceeded",
        {
          limit: this.#configuration.maxExpressionDepth,
          observed: depth,
          resource: "maxExpressionDepth",
        },
      );
    }
  }

  #checkAnnotationDepth(depth) {
    if (depth > this.#configuration.maxAnnotationDepth) {
      throw new ResourceLimitError(
        "The OWL annotation nesting depth limit was exceeded",
        {
          limit: this.#configuration.maxAnnotationDepth,
          observed: depth,
          resource: "maxAnnotationDepth",
        },
      );
    }
  }

  #cardinality(term) {
    const value = integerValueOfLiteral(term);
    if (value === undefined || value < 0) {
      throw new OWLSyntaxError(
        "OWL cardinalities require a non-negative integer literal",
      );
    }
    if (
      (typeof value === "bigint" && value > BigInt(Number.MAX_SAFE_INTEGER)) ||
      (typeof value === "number" && !Number.isSafeInteger(value))
    ) {
      throw new ResourceLimitError(
        "The OWL cardinality is not a safe integer",
        {
          observed: term.value,
          resource: "cardinality",
        },
      );
    }
    return Number(value);
  }

  #booleanLiteral(term) {
    return (
      term.termType === "Literal" &&
      (term.value === "true" || term.value === "1") &&
      term.datatype.value === `${XSD_NAMESPACE}boolean`
    );
  }

  #isDataPropertyTerm(term) {
    return (
      term.termType === "NamedNode" && this.#dataPropertyIris.has(term.value)
    );
  }

  #isObjectPropertyTerm(term) {
    return (
      (term.termType === "NamedNode" &&
        this.#objectPropertyIris.has(term.value)) ||
      term.termType === "BlankNode"
    );
  }

  #isAnnotationPropertyTerm(term) {
    return (
      term.termType === "NamedNode" &&
      this.#annotationPropertyIris.has(term.value)
    );
  }

  #isDataRangeTerm(term) {
    return (
      (term.termType === "NamedNode" &&
        (this.#datatypeIris.has(term.value) ||
          term.value.startsWith(XSD_NAMESPACE))) ||
      (term.termType === "BlankNode" &&
        this.#anonymousDataRangeNodes.has(termKey(term)))
    );
  }

  #annotationValue(term) {
    switch (term.termType) {
      case "NamedNode":
        return IRI.create(term.value);
      case "BlankNode":
        return this.#dataFactory.getOWLAnonymousIndividual(
          term.value,
          this.#documentScope,
        );
      case "Literal":
        return term.language
          ? this.#dataFactory.getOWLLiteral(term.value, term.language)
          : this.#dataFactory.getOWLLiteral(
              term.value,
              IRI.create(term.datatype.value),
            );
      default:
        throw new OWLSyntaxError("Invalid OWL annotation value", {
          termType: term.termType,
        });
    }
  }

  #consume(quad) {
    this.#consumed.add(quadKey(quad));
  }

  #isConsumed(quad) {
    return this.#consumed.has(quadKey(quad));
  }

  #outgoing(subject, predicate) {
    return [...this.#dataset.match(subject, null, null, null)].filter(
      (currentQuad) =>
        predicate === undefined || currentQuad.predicate.value === predicate,
    );
  }
}

const validateDataset = async (dataset, configuration, execution) => {
  if (
    !dataset ||
    typeof dataset[Symbol.iterator] !== "function" ||
    typeof dataset.match !== "function" ||
    typeof dataset.add !== "function" ||
    typeof dataset.delete !== "function" ||
    typeof dataset.has !== "function" ||
    !Number.isSafeInteger(dataset.size) ||
    dataset.size < 0
  ) {
    throw new TypeError("dataset must implement RDF/JS DatasetCore");
  }
  if (dataset.size > configuration.maxQuads) {
    throw new ResourceLimitError("The RDF quad limit was exceeded", {
      limit: configuration.maxQuads,
      observed: dataset.size,
      resource: "maxQuads",
    });
  }

  const blankNodes = new Set();
  let observed = 0;
  for (const currentQuad of dataset) {
    requireQuad(currentQuad);
    observed += 1;
    for (const term of [
      currentQuad.subject,
      currentQuad.object,
      currentQuad.graph,
    ]) {
      if (term.termType === "BlankNode") {
        blankNodes.add(termKey(term));
      }
    }
    if (blankNodes.size > configuration.maxBlankNodes) {
      throw new ResourceLimitError("The RDF blank-node limit was exceeded", {
        limit: configuration.maxBlankNodes,
        observed: blankNodes.size,
        resource: "maxBlankNodes",
      });
    }
    if (observed % CHECK_INTERVAL === 0) {
      await execution.cooperate();
    }
  }
  if (observed !== dataset.size) {
    throw new TypeError("dataset.size must equal its iterable quad count");
  }
  execution.check();
};

const documentScopeFor = (documentIRI) => {
  if (documentIRI !== undefined) {
    const normalized = IRI.create(documentIRI);
    return normalized.value;
  }
  const scope = `urn:owlapi-js:rdf-document:${nextAnonymousDocumentScope}`;
  nextAnonymousDocumentScope += 1;
  return scope;
};

export class RdfToOwlTranslator {
  #dataFactory;

  constructor({ dataFactory = new OWLDataFactory() } = {}) {
    if (typeof dataFactory?.getOWLOntologyID !== "function") {
      throw new TypeError(
        "dataFactory must implement the OWLDataFactory contract",
      );
    }
    this.#dataFactory = dataFactory;
  }

  async translate(dataset, { configuration, documentIRI } = {}) {
    const normalizedConfiguration = normalizeConfiguration(configuration);
    const normalizedDocumentIRI =
      documentIRI === undefined ? undefined : IRI.create(documentIRI);
    const execution = new ExecutionController(normalizedConfiguration);
    await validateDataset(dataset, normalizedConfiguration, execution);
    const graphSelection = selectOntologyGraph(
      dataset,
      normalizedConfiguration,
    );
    execution.check();
    const diagnostics = [...graphSelection.diagnostics];

    const transaction = new OntologyTransaction(
      this.#dataFactory,
      normalizedConfiguration,
    );
    const interpreter = new RdfGraphInterpreter({
      configuration: normalizedConfiguration,
      dataFactory: this.#dataFactory,
      dataset: graphSelection.dataset,
      diagnostics,
      documentScope: documentScopeFor(normalizedDocumentIRI),
      execution,
      transaction,
    });
    await interpreter.interpret();
    execution.check();

    return transaction.commit({
      diagnostics,
      documentIRI: normalizedDocumentIRI,
      merged: graphSelection.merged,
      selectedGraph: graphSelection.selectedGraph,
    });
  }
}
