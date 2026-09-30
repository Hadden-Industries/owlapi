import {
  OWLSyntaxError,
  ResourceLimitError,
  UnsupportedConstructError,
} from "../../io/errors.js";
import {
  OWLDataFactory,
  createSourcePreservingDataFactory,
} from "../../model/owlDataFactory.js";
import { OWLObjectKind } from "../../model/kinds.js";
import { OWLOntology } from "../../model/owlOntology.js";
import { OWLOntologyLoaderConfiguration } from "../../model/owlOntologyLoaderConfiguration.js";
import { IRI, StructuralSet } from "../../model/structural.js";
import { normalizeCardinality } from "../model/cardinality.js";
import { selectOntologyGraph } from "../rdfjs/graphPolicy.js";
import {
  BUILT_IN_ANNOTATION_PROPERTIES,
  OWL_NAMESPACE,
  OWL_VOCABULARY,
  RDF_NAMESPACE,
  RDF_VOCABULARY,
  RDFS_NAMESPACE,
  RDFS_VOCABULARY,
  XSD_NAMESPACE,
} from "../rdfjs/vocabulary.js";

const COOPERATIVE_YIELD_INTERVAL_MS = 50;
const CHECK_INTERVAL = 512;
const DECLARATION_CONSTRUCTORS = new Map([
  [OWL_VOCABULARY.AnnotationProperty, "getOWLAnnotationProperty"],
  [OWL_VOCABULARY.Class, "getOWLClass"],
  [OWL_VOCABULARY.DataRange, "getOWLDatatype"],
  [OWL_VOCABULARY.DatatypeProperty, "getOWLDataProperty"],
  [OWL_VOCABULARY.NamedIndividual, "getOWLNamedIndividual"],
  [OWL_VOCABULARY.ObjectProperty, "getOWLObjectProperty"],
  [OWL_VOCABULARY.OntologyProperty, "getOWLAnnotationProperty"],
  [RDFS_VOCABULARY.Datatype, "getOWLDatatype"],
]);
const SUBJECT_TERM_TYPES = new Set(["BlankNode", "NamedNode"]);
// Characteristics OWL 2 defines only for object properties, so asserting one is
// evidence that a punned IRI was meant as an object property. `owl:inverseOf` is
// handled separately because it is evidence about both of its arguments.
const OBJECT_ONLY_CHARACTERISTICS = new Set([
  OWL_VOCABULARY.AsymmetricProperty,
  OWL_VOCABULARY.InverseFunctionalProperty,
  OWL_VOCABULARY.IrreflexiveProperty,
  OWL_VOCABULARY.ReflexiveProperty,
  OWL_VOCABULARY.SymmetricProperty,
  OWL_VOCABULARY.TransitiveProperty,
]);
const NON_ASSERTION_TYPES = new Set([
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
  // These type entities rather than assert membership in a class.
  RDF_VOCABULARY.Property,
  RDFS_VOCABULARY.Class,
  RDFS_VOCABULARY.Datatype,
]);

const OBJECT_TERM_TYPES = new Set(["BlankNode", "Literal", "NamedNode"]);
const GRAPH_TERM_TYPES = new Set(["BlankNode", "DefaultGraph", "NamedNode"]);
const SOURCE_LOCATION_FIELDS = Object.freeze([
  ["column", 1],
  ["line", 1],
  ["offset", 0],
]);
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
let nextRoleProofScope = 0n;

const monotonicNow = () =>
  typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();

const integerValueOfLiteral = (term, preserve = false) => {
  if (term.termType !== "Literal") {
    return undefined;
  }
  const datatype = term.datatype.value;
  const lexicalForm = term.value.trim();
  if (preserve && lexicalForm !== term.value) return undefined;
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
  if (preserve && datatype === `${OWL_NAMESPACE}rational`) {
    const match = /^([+-]?[0-9]+)\/([0-9]+)$/u.exec(lexicalForm);
    if (!match || !/[1-9]/u.test(match[2])) return undefined;
    const numerator = BigInt(match[1]),
      denominator = BigInt(match[2]);
    return numerator % denominator === 0n ? numerator / denominator : undefined;
  }
  if (!preserve && XSD_FLOATING_DATATYPES.has(datatype)) {
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
      term.direction ?? "",
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

const rdfTermDescriptor = (term) => {
  const descriptor = {
    termType: term.termType,
    value: term.value,
  };
  if (term.termType === "Literal") {
    descriptor.datatype = Object.freeze({
      termType: term.datatype.termType,
      value: term.datatype.value,
    });
    if (term.direction) {
      descriptor.direction = term.direction;
    }
    descriptor.language = term.language;
  }
  return Object.freeze(descriptor);
};

const statementCanEnterConfiguredReconstructionGraph = (
  quad,
  configuration,
) => {
  if (configuration.rdfDatasetGraphPolicy === "defaultGraphOnly") {
    return quad.graph.termType === "DefaultGraph";
  }
  if (configuration.rdfDatasetGraphPolicy === "selectGraph") {
    return quad.graph.equals(configuration.selectedGraph);
  }
  return true;
};

const shouldCaptureUnconsumedStatementSourceLocations = (quad, configuration) =>
  configuration.sourceLocations &&
  (configuration.parsingMode !== "compatible" ||
    configuration.collectWarnings) &&
  statementCanEnterConfiguredReconstructionGraph(quad, configuration);

const snapshotQuadSourceLocation = (quad, configuration) => {
  if (!shouldCaptureUnconsumedStatementSourceLocations(quad, configuration)) {
    return undefined;
  }
  const sourceLocation = quad.sourceLocation;
  if (!sourceLocation || typeof sourceLocation !== "object") {
    return undefined;
  }
  const snapshot = {};
  for (const [field, minimum] of SOURCE_LOCATION_FIELDS) {
    const value = sourceLocation[field];
    if (Number.isSafeInteger(value) && value >= minimum) {
      snapshot[field] = value;
    }
  }
  return Object.keys(snapshot).length === 0
    ? undefined
    : Object.freeze(snapshot);
};

const reconstructionInputSourceLocations = async (
  sourceDataset,
  sourceLocatedStatements,
  graphSelection,
  execution,
) => {
  const locationsByTriple = new Map();
  if (sourceLocatedStatements.length === 0) {
    return locationsByTriple;
  }

  const selectedGraphKey = termKey(graphSelection.selectedGraph);
  const occurrenceCountByTriple = graphSelection.merged ? new Map() : undefined;
  let observed = 0;
  for (const statement of sourceLocatedStatements) {
    if (graphSelection.merged || statement.graphKey === selectedGraphKey) {
      locationsByTriple.set(statement.tripleKey, statement.sourceLocation);
      occurrenceCountByTriple?.set(statement.tripleKey, 0);
    }
    observed += 1;
    if (observed % CHECK_INTERVAL === 0) {
      await execution.cooperate();
    }
  }
  if (!graphSelection.merged || locationsByTriple.size === 0) {
    execution.check();
    return locationsByTriple;
  }

  observed = 0;
  for (const currentQuad of sourceDataset) {
    const key = tripleKey(
      currentQuad.subject,
      currentQuad.predicate,
      currentQuad.object,
    );
    if (occurrenceCountByTriple.has(key)) {
      occurrenceCountByTriple.set(key, occurrenceCountByTriple.get(key) + 1);
    }
    observed += 1;
    if (observed % CHECK_INTERVAL === 0) {
      await execution.cooperate();
    }
  }
  observed = 0;
  for (const [key, occurrenceCount] of occurrenceCountByTriple) {
    if (occurrenceCount !== 1) {
      locationsByTriple.delete(key);
    }
    observed += 1;
    if (observed % CHECK_INTERVAL === 0) {
      await execution.cooperate();
    }
  }
  execution.check();
  return locationsByTriple;
};

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
  #pausedAt;
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
    const elapsed = (this.#pausedAt ?? monotonicNow()) - this.#startedAt;
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

  pause() {
    this.check();
    this.#pausedAt ??= monotonicNow();
  }

  resume() {
    if (this.#pausedAt === undefined) return;
    const now = monotonicNow();
    this.#startedAt += now - this.#pausedAt;
    this.#lastYieldAt = now;
    this.#pausedAt = undefined;
    this.check();
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
  #retainedAxiomAnnotationBases = new Set();
  #retainedAnnotationBases = new Set();
  #reificationNodes = new Set();
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
  #evidenceIndex;
  #recoveredAnnotationPropertyIris = new Set();
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
  #ontologyHeaderReferencePropertyIris = new Set([
    OWL_VOCABULARY.backwardCompatibleWith,
    OWL_VOCABULARY.incompatibleWith,
    OWL_VOCABULARY.priorVersion,
  ]);
  #ontologyID;
  #selectedGraph;
  #sourceLocationsByTriple;
  #rdfsRoles = new Map();
  #rdfsClassTerms = new Map();
  #rdfsPropertyIris = new Set();
  #discoveredRoleUses = new Map();
  #discoveredDefaultRoles = new Map();
  #roleProofs = new Map();
  #roleProofScope;
  #retainedStatements = [];
  #transaction;

  constructor({
    configuration,
    dataFactory,
    dataset,
    declarationEntities = [],
    sourceRoles = [],
    diagnostics,
    documentScope,
    execution,
    ontologyID,
    roleProofScope,
    selectedGraph,
    sourceLocationsByTriple,
    transaction,
  }) {
    this.#configuration = configuration;
    this.#dataFactory = dataFactory;
    this.#dataset = dataset;
    this.#diagnostics = diagnostics;
    this.#documentScope = documentScope;
    this.#execution = execution;
    this.#selectedGraph = selectedGraph;
    this.#sourceLocationsByTriple = sourceLocationsByTriple;
    this.#transaction = transaction;
    this.#ontologyID = ontologyID;
    this.#roleProofScope = roleProofScope;
    for (const [type, values] of this.#namedRoleSets())
      for (const value of values)
        this.#mergeRoleProofs(
          this.#roleProofs,
          { termType: "NamedNode", value },
          type,
          [[]],
        );
    for (const entity of declarationEntities) {
      this.#recordDeclarationEntity(entity);
    }
    for (const role of sourceRoles) {
      if (role.iri === undefined) continue; // Anonymous identity is document local.
      this.#namedRoleSets().get(role.type)?.add(role.iri);
      this.#mergeRoleProofs(
        this.#roleProofs,
        { termType: "NamedNode", value: role.iri },
        role.type,
        role.supports ?? [[]],
      );
      if (role.type === RDFS_VOCABULARY.Class)
        this.#rdfsClassTerms.set(
          termKey({ termType: "NamedNode", value: role.iri }),
          { termType: "NamedNode", value: role.iri },
        );
      if (role.type === RDF_VOCABULARY.Property)
        this.#rdfsPropertyIris.add(role.iri);
    }
  }

  #recordDeclarationEntity(entity) {
    const declarationsByKind = new Map([
      [OWLObjectKind.ANNOTATION_PROPERTY, this.#annotationPropertyIris],
      [OWLObjectKind.CLASS, this.#classIris],
      [OWLObjectKind.DATA_PROPERTY, this.#dataPropertyIris],
      [OWLObjectKind.DATATYPE, this.#datatypeIris],
      [OWLObjectKind.NAMED_INDIVIDUAL, this.#individualIris],
      [OWLObjectKind.OBJECT_PROPERTY, this.#objectPropertyIris],
    ]);
    declarationsByKind.get(entity.kind)?.add(entity.iri.value);
    for (const [type, values] of this.#namedRoleSets())
      if (values === declarationsByKind.get(entity.kind))
        this.#mergeRoleProofs(
          this.#roleProofs,
          { termType: "NamedNode", value: entity.iri.value },
          type,
          [[]],
        );
  }

  #namedRoleSets() {
    return new Map([
      [OWL_VOCABULARY.Class, this.#classIris],
      [RDFS_VOCABULARY.Datatype, this.#datatypeIris],
      [OWL_VOCABULARY.ObjectProperty, this.#objectPropertyIris],
      [OWL_VOCABULARY.DatatypeProperty, this.#dataPropertyIris],
      [OWL_VOCABULARY.AnnotationProperty, this.#annotationPropertyIris],
      [OWL_VOCABULARY.NamedIndividual, this.#individualIris],
    ]);
  }

  // This is a private parsing signature, not source evidence or a collection
  // of Declaration axioms. Merely mentioning a name must not echo an imported
  // provisional role back through an import cycle.
  discoveredNamedRoles() {
    return [...this.#rdfsRoles.values(), ...this.#discoveredRoleUses.values()];
  }

  discoveredDefaultRoles() {
    return [...this.#discoveredDefaultRoles.values()];
  }

  // Minimal supporting rule sets retain alternative independent evidence.
  // A rule cannot use a proof containing itself, even after that proof has
  // travelled through several imported documents and other restrictions.
  #mergeRoleProofs(target, term, type, supports) {
    const key = `${type}\u0000${termKey(term)}`;
    let proofs = target.get(key) ?? [];
    let changed = false;
    for (const support of supports) {
      this.#execution.check();
      const candidate = [...new Set(support)].sort();
      if (
        proofs.some((proof) => {
          this.#execution.check();
          return proof.every((step) => candidate.includes(step));
        })
      )
        continue;
      proofs = proofs.filter((proof) => {
        this.#execution.check();
        return !candidate.every((step) => proof.includes(step));
      });
      proofs.push(candidate);
      changed = true;
    }
    if (changed) target.set(key, proofs);
    return changed;
  }

  #proofsFor(term, type, excluded) {
    if (
      type === RDFS_VOCABULARY.Datatype &&
      term.termType === "NamedNode" &&
      term.value.startsWith(XSD_NAMESPACE)
    )
      return [[]];
    return (this.#roleProofs.get(`${type}\u0000${termKey(term)}`) ?? []).filter(
      (proof) => !proof.includes(excluded),
    );
  }

  #retractRoleRule(rule) {
    for (const [key, proofs] of this.#roleProofs) {
      this.#execution.check();
      const retained = proofs.filter((proof) => !proof.includes(rule));
      if (retained.length === proofs.length) continue;
      if (retained.length) this.#roleProofs.set(key, retained);
      else {
        this.#roleProofs.delete(key);
        const separator = key.indexOf("\u0000"),
          type = key.slice(0, separator);
        const term = key.slice(separator + 1),
          [termType, value] = JSON.parse(term);
        if (termType === "NamedNode")
          this.#namedRoleSets().get(type)?.delete(value);
        else if (type === OWL_VOCABULARY.Class)
          this.#anonymousClassNodes.delete(term);
        else if (type === RDFS_VOCABULARY.Datatype)
          this.#anonymousDataRangeNodes.delete(term);
      }
    }
    for (const [key, role] of this.#discoveredRoleUses) {
      const supports = role.supports.filter((proof) => !proof.includes(rule));
      if (supports.length)
        this.#discoveredRoleUses.set(key, { ...role, supports });
      else this.#discoveredRoleUses.delete(key);
    }
  }

  #roleProofState() {
    return JSON.stringify(
      [...this.#roleProofs]
        .map(([key, proofs]) => [
          key,
          proofs.map((proof) => JSON.stringify(proof)).sort(),
        ])
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
    );
  }

  #recordDiscoveredRole(term, type, supports = [[]]) {
    const changed = this.#mergeRoleProofs(
      this.#roleProofs,
      term,
      type,
      supports,
    );
    if (term.termType === "NamedNode") {
      const key = `${type}\u0000${term.value}`;
      const existing = this.#discoveredRoleUses.get(key);
      const proofs = new Map();
      this.#mergeRoleProofs(proofs, term, type, existing?.supports ?? []);
      this.#mergeRoleProofs(proofs, term, type, supports);
      this.#discoveredRoleUses.set(key, {
        iri: term.value,
        type,
        origin: "use",
        supports: proofs.get(`${type}\u0000${termKey(term)}`) ?? [],
      });
    }
    return changed;
  }

  async discoverSourceRoles(stage) {
    this.#discoverRdfsRoles();
    await this.#readDeclarations(false);
    await this.#discoverOwlUseRoles(stage !== "explicit");
    if (["rdfs", "complete"].includes(stage)) await this.#propagateRdfsRoles();
    if (stage === "complete") {
      // Generic roles have reached closure before applying the ordinary OWL
      // reading of otherwise untyped subclass endpoints and class assertions.
      for (const quad of this.#dataset) {
        if (
          quad.predicate.value === RDFS_VOCABULARY.subClassOf &&
          ![quad.subject, quad.object].some((term) =>
            this.#isRdfsClassOnly(term),
          )
        ) {
          for (const term of [quad.subject, quad.object])
            if (term.termType === "NamedNode" && !this.#isDataRangeTerm(term)) {
              this.#classIris.add(term.value);
              this.#recordDiscoveredRole(term, OWL_VOCABULARY.Class);
              this.#discoveredDefaultRoles.set(term.value, {
                iri: term.value,
                type: OWL_VOCABULARY.Class,
                origin: "use",
              });
            }
        }
        if (
          quad.predicate.value === RDF_VOCABULARY.type &&
          quad.object.termType === "NamedNode" &&
          !NON_ASSERTION_TYPES.has(quad.object.value) &&
          ![
            OWL_VOCABULARY.DeprecatedClass,
            OWL_VOCABULARY.DeprecatedProperty,
          ].includes(quad.object.value) &&
          !this.#isRdfsClassOnly(quad.object) &&
          !this.#isDataRangeTerm(quad.object)
        ) {
          this.#classIris.add(quad.object.value);
          this.#recordDiscoveredRole(quad.object, OWL_VOCABULARY.Class);
          this.#discoveredDefaultRoles.set(quad.object.value, {
            iri: quad.object.value,
            type: OWL_VOCABULARY.Class,
            origin: "use",
          });
        }
        await this.#execution.cooperate();
      }
      await this.#discoverOwlUseRoles();
    }
  }

  // Discover roles forced by OWL syntax without reconstructing, consuming or
  // repairing a triple. Ambiguous FunctionalProperty/hasKey/restriction uses
  // stay unresolved for the final parser to reject. Lists are read without
  // touching the reconstruction ownership/accounting tables.
  async #discoverOwlUseRoles(resolveConditional = true) {
    const C = OWL_VOCABULARY.Class,
      D = RDFS_VOCABULARY.Datatype,
      OP = OWL_VOCABULARY.ObjectProperty,
      DP = OWL_VOCABULARY.DatatypeProperty,
      NI = OWL_VOCABULARY.NamedIndividual;
    const roleSets = this.#namedRoleSets();
    let previousState;
    const mark = (term, type, supports = [[]]) => {
      const values =
        term.termType === "NamedNode"
          ? roleSets.get(type)
          : term.termType === "BlankNode"
            ? type === C
              ? this.#anonymousClassNodes
              : type === D
                ? this.#anonymousDataRangeNodes
                : undefined
            : undefined;
      if (!values) return;
      if (!supports.length) return;
      this.#recordDiscoveredRole(term, type, supports);
      const key = term.termType === "NamedNode" ? term.value : termKey(term);
      if (!values.has(key)) {
        values.add(key);
      }
    };
    const listCache = new Map();
    const list = async (head) => {
      const key = termKey(head);
      if (listCache.has(key)) return listCache.get(key);
      const terms = [],
        seen = new Set();
      let current = head;
      while (!(
        current.termType === "NamedNode" && current.value === RDF_VOCABULARY.nil
      )) {
        const id = termKey(current);
        const first = this.#outgoing(current, RDF_VOCABULARY.first);
        const rest = this.#outgoing(current, RDF_VOCABULARY.rest);
        if (seen.has(id) || first.length !== 1 || rest.length !== 1) {
          listCache.set(key, []);
          return [];
        }
        seen.add(id);
        terms.push(first[0].object);
        current = rest[0].object;
        await this.#execution.cooperate();
      }
      listCache.set(key, terms);
      return terms;
    };
    do {
      previousState = this.#roleProofState();
      if (resolveConditional) this.#inferImplicitPropertyCategories();
      for (const sourceQuad of this.#dataset) {
        const { subject, predicate, object } = sourceQuad;
        const p = predicate.value;
        if (object.termType === "Literal") mark(object.datatype, D);
        if (p === RDF_VOCABULARY.type) {
          if (OBJECT_ONLY_CHARACTERISTICS.has(object.value)) mark(subject, OP);
          if (object.value === OWL_VOCABULARY.Restriction) mark(subject, C);
          if (object.value === OWL_VOCABULARY.Class) mark(subject, C);
          if (
            [RDFS_VOCABULARY.Datatype, OWL_VOCABULARY.DataRange].includes(
              object.value,
            )
          )
            mark(subject, D);
          if (this.#isKnownClassExpressionTerm(object)) mark(subject, NI);
        } else if (p === OWL_VOCABULARY.inverseOf) {
          mark(subject, OP);
          mark(object, OP);
        } else if (p === OWL_VOCABULARY.propertyChainAxiom) {
          mark(subject, OP);
          for (const member of await list(object)) mark(member, OP);
        } else if (
          [OWL_VOCABULARY.disjointWith, OWL_VOCABULARY.complementOf].includes(p)
        ) {
          mark(subject, C);
          mark(object, C);
        } else if (
          [
            OWL_VOCABULARY.datatypeComplementOf,
            OWL_VOCABULARY.onDatatype,
          ].includes(p)
        ) {
          mark(subject, D);
          mark(object, D);
        } else if (p === OWL_VOCABULARY.disjointUnionOf) {
          mark(subject, C);
          for (const member of await list(object)) mark(member, C);
        } else if (
          [OWL_VOCABULARY.onClass, OWL_VOCABULARY.onDataRange].includes(p)
        ) {
          const data = p === OWL_VOCABULARY.onDataRange;
          mark(subject, C);
          mark(object, data ? D : C);
          for (const { object: property } of this.#outgoing(
            subject,
            OWL_VOCABULARY.onProperty,
          ))
            mark(property, data ? DP : OP);
        } else if (p === OWL_VOCABULARY.onProperties) {
          mark(subject, C);
          for (const member of await list(object)) mark(member, DP);
          for (const filler of [
            OWL_VOCABULARY.someValuesFrom,
            OWL_VOCABULARY.allValuesFrom,
          ])
            for (const { object: term } of this.#outgoing(subject, filler))
              mark(term, D);
        } else if (p === OWL_VOCABULARY.onProperty) {
          mark(subject, C);
          for (const quad of this.#outgoing(subject)) {
            if (quad.predicate.value === OWL_VOCABULARY.hasValue)
              mark(object, quad.object.termType === "Literal" ? DP : OP);
            if (quad.predicate.value === OWL_VOCABULARY.hasSelf)
              mark(object, OP);
            if (
              resolveConditional &&
              [
                OWL_VOCABULARY.someValuesFrom,
                OWL_VOCABULARY.allValuesFrom,
              ].includes(quad.predicate.value)
            ) {
              const rule = `${this.#roleProofScope}|restriction|${quadKey(quad)}`;
              this.#retractRoleRule(rule);
              const propertyProofs = [DP, OP].map((type) =>
                type === OP && object.termType === "BlankNode"
                  ? [[]]
                  : this.#proofsFor(object, type, rule),
              );
              const fillerProofs = [D, C].map((type) =>
                this.#proofsFor(quad.object, type, rule),
              );
              const propertyKnown = propertyProofs.some(
                (proofs) => proofs.length,
              );
              const fillerKnown = fillerProofs.some((proofs) => proofs.length);
              const candidates = [0, 1].filter(
                (index) =>
                  (!propertyKnown || propertyProofs[index].length) &&
                  (!fillerKnown || fillerProofs[index].length),
              );
              if (candidates.length === 1) {
                const index = candidates[0],
                  other = 1 - index;
                const supports = [
                  ...(!propertyProofs[other].length
                    ? propertyProofs[index]
                    : []),
                  ...(!fillerProofs[other].length ? fillerProofs[index] : []),
                ].map((proof) => [...proof, rule]);
                mark(object, index === 0 ? DP : OP, supports);
                mark(quad.object, index === 0 ? D : C, supports);
              }
            }
          }
        } else if (
          [OWL_VOCABULARY.intersectionOf, OWL_VOCABULARY.unionOf].includes(p)
        ) {
          const rule = `${this.#roleProofScope}|boolean|${quadKey(sourceQuad)}`;
          this.#retractRoleRule(rule);
          const dataProofs = this.#proofsFor(subject, D, rule),
            objectProofs = this.#proofsFor(subject, C, rule);
          const data = dataProofs.length > 0,
            objectRole = objectProofs.length > 0;
          if (data !== objectRole)
            for (const member of await list(object))
              mark(
                member,
                data ? D : C,
                (data ? dataProofs : objectProofs).map((proof) => [
                  ...proof,
                  rule,
                ]),
              );
        } else if (p === OWL_VOCABULARY.equivalentClass) {
          const rule = `${this.#roleProofScope}|equivalent|${quadKey(sourceQuad)}`;
          this.#retractRoleRule(rule);
          const dataProofs = this.#proofsFor(subject, D, rule),
            objectProofs = this.#proofsFor(subject, C, rule);
          const data = dataProofs.length > 0,
            objectRole = objectProofs.length > 0;
          if (data !== objectRole)
            mark(
              object,
              data ? D : C,
              (data ? dataProofs : objectProofs).map((proof) => [
                ...proof,
                rule,
              ]),
            );
        } else if (
          resolveConditional &&
          [RDFS_VOCABULARY.domain, RDFS_VOCABULARY.range].includes(p)
        ) {
          const rule = `${this.#roleProofScope}|${p}|${termKey(subject)}|${termKey(object)}`;
          this.#retractRoleRule(rule);
          const roles = [OWL_VOCABULARY.AnnotationProperty, DP, OP]
            .map((type) => ({
              type,
              proofs:
                type === OP && subject.termType === "BlankNode"
                  ? [[]]
                  : this.#proofsFor(subject, type, rule),
            }))
            .filter(({ proofs }) => proofs.length);
          if (
            roles.length === 1 &&
            roles[0].type !== OWL_VOCABULARY.AnnotationProperty
          )
            mark(
              object,
              p === RDFS_VOCABULARY.domain || roles[0].type === OP ? C : D,
              roles[0].proofs.map((proof) => [...proof, rule]),
            );
        }
        await this.#execution.cooperate();
      }
    } while (previousState !== this.#roleProofState());
  }

  /** CP 2: use the same declaration normalization, without reading annotations. */
  async discoverDeclarationsAndImports() {
    this.#discoverRdfsRoles();
    await this.#readDeclarations(false);
    await this.#propagateRdfsRoles();
    await this.#readOntologyHeader(false);
  }

  async interpret() {
    this.#discoverRdfsRoles();
    await this.#readDeclarations();
    if (this.#configuration.parsingMode === "preserve")
      await this.#discoverOwlUseRoles();
    await this.#propagateRdfsRoles();
    await this.#readOntologyHeader();
    await this.#readExpressionDefinitions();
    await this.#readNamedDatatypeRestrictions();
    await this.#readRetainedRdfs();
    await this.#readClassAxioms();
    await this.#readPropertyAxioms();
    await this.#readNaryAxioms();
    await this.#readKeysAndAssertions();
    await this.#accountForUnconsumedTriples();
  }

  #recordRdfsRole(term, type, origin = "use") {
    if (type === RDF_VOCABULARY.Property) {
      requireNamedNode(term, "An RDF property role requires an IRI");
      this.#rdfsPropertyIris.add(term.value);
    } else this.#rdfsClassTerms.set(termKey(term), term);
    const key = `${type}:${termKey(term)}`;
    if (this.#rdfsRoles.get(key)?.origin === "declaration") return;
    this.#rdfsRoles.set(
      key,
      Object.freeze({
        ...(term.termType === "NamedNode"
          ? { iri: term.value }
          : { subject: this.#annotationSubject(term) }),
        type,
        origin,
      }),
    );
  }

  #discoverRdfsRoles() {
    if (this.#configuration.parsingMode !== "preserve") return;
    for (const quad of this.#dataset) {
      if (
        quad.predicate.value !== RDF_VOCABULARY.type ||
        quad.object.termType !== "NamedNode"
      )
        continue;
      if (
        [RDF_VOCABULARY.Property, RDFS_VOCABULARY.Class].includes(
          quad.object.value,
        )
      )
        this.#recordRdfsRole(quad.subject, quad.object.value, "declaration");
    }
  }

  #isRdfsClassOnly(term) {
    return (
      this.#rdfsClassTerms.has(termKey(term)) &&
      !this.#isKnownClassExpressionTerm(term) &&
      !this.#isDataRangeTerm(term)
    );
  }

  #isRdfsPropertyOnly(term) {
    return (
      term.termType === "NamedNode" &&
      this.#rdfsPropertyIris.has(term.value) &&
      this.#propertyCategories(term.value).length === 0
    );
  }

  async #retainedClassTerm(term) {
    if (this.#isKnownClassExpressionTerm(term))
      return this.#classExpression(term, 0);
    if (term.termType === "Literal" || this.#isDataRangeTerm(term))
      throw new OWLSyntaxError(
        "An RDFS class relation requires a class endpoint",
        { reason: "RDF_CLASS_ENDPOINT_INVALID" },
      );
    if (
      term.termType === "BlankNode" &&
      [
        OWL_VOCABULARY.intersectionOf,
        OWL_VOCABULARY.unionOf,
        OWL_VOCABULARY.complementOf,
        OWL_VOCABULARY.oneOf,
        OWL_VOCABULARY.onProperty,
        OWL_VOCABULARY.onProperties,
      ].some((predicate) => this.#outgoing(term, predicate).length)
    )
      return this.#classExpression(term, 0);
    this.#recordRdfsRole(term, RDFS_VOCABULARY.Class);
    return this.#annotationSubject(term);
  }

  async #retainStatement(quad, subject, object) {
    this.#retainedStatements.push(
      Object.freeze({
        subject,
        predicate: IRI.create(quad.predicate.value),
        object,
        annotations: Object.freeze(await this.#axiomAnnotations(quad)),
      }),
    );
    this.#consume(quad);
  }

  async #propagateRdfsRoles() {
    if (this.#configuration.parsingMode !== "preserve") return;
    // Linear traversal of explicit relations, seeded by identified generic
    // categories. It infers no membership or logical consequences.
    for (const [predicate, type] of [
      [RDFS_VOCABULARY.subPropertyOf, RDF_VOCABULARY.Property],
      [RDFS_VOCABULARY.subClassOf, RDFS_VOCABULARY.Class],
    ]) {
      // A generic property's domain is an unambiguous class position. Seed
      // it only after property discovery, but before any class propagation or
      // statement dispatch. Discovery does not reject endpoints: imports may
      // supply a more specific role before reconstruction validates the use.
      if (type === RDFS_VOCABULARY.Class) {
        for (const quad of this.#dataset) {
          if (
            quad.predicate.value === RDFS_VOCABULARY.domain &&
            this.#isRdfsPropertyOnly(quad.subject) &&
            quad.object.termType !== "Literal" &&
            !this.#isKnownClassExpressionTerm(quad.object) &&
            !this.#isDataRangeTerm(quad.object)
          )
            this.#recordRdfsRole(quad.object, RDFS_VOCABULARY.Class);
          await this.#execution.cooperate();
        }
      }
      const adjacent = new Map();
      const pending = [],
        seen = new Set();
      for (const quad of this.#dataset) {
        if (quad.predicate.value !== predicate) continue;
        for (const [left, right] of [
          [quad.subject, quad.object],
          [quad.object, quad.subject],
        ]) {
          const id = termKey(left);
          if (!adjacent.has(id)) adjacent.set(id, []);
          adjacent.get(id).push(right);
          if (
            (type === RDFS_VOCABULARY.Class
              ? this.#isRdfsClassOnly(left)
              : this.#isRdfsPropertyOnly(left)) &&
            !seen.has(id)
          ) {
            this.#recordRdfsRole(left, type);
            seen.add(id);
            pending.push(id);
          }
        }
        await this.#execution.cooperate();
      }
      while (pending.length) {
        const id = pending.pop();
        for (const term of adjacent.get(id) ?? []) {
          if (type === RDFS_VOCABULARY.Class) {
            if (term.termType === "Literal" || this.#isDataRangeTerm(term))
              continue;
            if (this.#isKnownClassExpressionTerm(term)) continue;
          } else {
            if (term.termType !== "NamedNode") continue;
            if (this.#propertyCategories(term.value).length) continue;
          }
          const next = termKey(term);
          if (seen.has(next)) continue;
          this.#recordRdfsRole(term, type);
          seen.add(next);
          pending.push(next);
        }
        await this.#execution.cooperate();
      }
    }
  }

  async #readRetainedRdfs() {
    if (this.#configuration.parsingMode !== "preserve") return;
    for (const quad of this.#dataset) {
      if (this.#isConsumed(quad)) continue;
      const predicate = quad.predicate.value;
      if (
        predicate === RDF_VOCABULARY.type &&
        quad.object.termType === "NamedNode" &&
        [RDF_VOCABULARY.Property, RDFS_VOCABULARY.Class].includes(
          quad.object.value,
        )
      ) {
        await this.#retainStatement(
          quad,
          this.#annotationSubject(quad.subject),
          IRI.create(quad.object.value),
        );
      } else if (
        predicate === RDFS_VOCABULARY.subClassOf &&
        [quad.subject, quad.object].some((term) => this.#isRdfsClassOnly(term))
      ) {
        await this.#retainStatement(
          quad,
          await this.#retainedClassTerm(quad.subject),
          await this.#retainedClassTerm(quad.object),
        );
      } else if (
        predicate === RDFS_VOCABULARY.subPropertyOf &&
        [quad.subject, quad.object].some((term) =>
          this.#isRdfsPropertyOnly(term),
        )
      ) {
        if (
          ![quad.subject, quad.object].every((term) =>
            this.#isRdfsPropertyOnly(term),
          )
        )
          throw new OWLSyntaxError(
            "A generic subproperty relation cannot select a specific OWL role",
            { reason: "RDF_AMBIGUOUS_PROPERTY_ROLE" },
          );
        for (const term of [quad.subject, quad.object])
          this.#recordRdfsRole(term, RDF_VOCABULARY.Property);
        await this.#retainStatement(
          quad,
          this.#annotationSubject(quad.subject),
          this.#annotationSubject(quad.object),
        );
      } else if (
        [RDFS_VOCABULARY.domain, RDFS_VOCABULARY.range].includes(predicate) &&
        this.#isRdfsPropertyOnly(quad.subject)
      ) {
        this.#recordRdfsRole(quad.subject, RDF_VOCABULARY.Property);
        if (
          predicate === RDFS_VOCABULARY.range &&
          this.#isDataRangeTerm(quad.object) ===
            (this.#isKnownClassExpressionTerm(quad.object) ||
              this.#isRdfsClassOnly(quad.object))
        )
          throw new OWLSyntaxError(
            "A generic property range does not identify a class or datatype role",
            { reason: "RDF_AMBIGUOUS_RANGE_ROLE" },
          );
        const object =
          predicate === RDFS_VOCABULARY.range &&
          this.#isDataRangeTerm(quad.object)
            ? await this.#dataRange(quad.object, 0)
            : await this.#retainedClassTerm(quad.object);
        await this.#retainStatement(
          quad,
          this.#annotationSubject(quad.subject),
          object,
        );
      } else if (
        predicate === RDF_VOCABULARY.type &&
        this.#isRdfsClassOnly(quad.object)
      ) {
        await this.#retainStatement(
          quad,
          this.#individual(quad.subject),
          await this.#retainedClassTerm(quad.object),
        );
      }
      await this.#execution.cooperate();
    }
  }

  sourceStructure() {
    return Object.freeze({
      roles: Object.freeze([...this.#rdfsRoles.values()]),
      statements: Object.freeze([...this.#retainedStatements]),
      expressions: Object.freeze([
        ...this.#classExpressionCache.values(),
        ...this.#dataRangeCache.values(),
        ...this.#objectPropertyExpressionCache.values(),
      ]),
    });
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

  async #readNamedDatatypeRestrictions() {
    if (this.#configuration.parsingMode !== "compatible") return;
    // OWL 2 RDF-Based Semantics tables 5.7 and 5.9 give a named restriction
    // the same datatype extension as a DatatypeDefinition with that restriction.
    // The OWL 2 DL RDF mapping instead requires an anonymous expression; this
    // is an explicit compatible-mode recovery, never a strict mapping rule.
    for (const currentQuad of this.#dataset) {
      if (
        currentQuad.subject.termType !== "NamedNode" ||
        currentQuad.predicate.value !== OWL_VOCABULARY.onDatatype ||
        !this.#datatypeIris.has(currentQuad.subject.value)
      )
        continue;
      const datatype = this.#dataFactory.getOWLDatatype(
        IRI.create(currentQuad.subject.value),
      );
      const restriction = await this.#datatypeRestriction(currentQuad.subject);
      // Both consumed links jointly encode the recovered definition. Preserve
      // reified annotations on either link, including their nested annotations.
      const annotations = [
        ...(await this.#axiomAnnotations(currentQuad)),
        ...(await this.#axiomAnnotations(
          this.#exactlyOne(
            currentQuad.subject,
            OWL_VOCABULARY.withRestrictions,
          ),
        )),
      ];
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDatatypeDefinitionAxiom(
          datatype,
          restriction,
          annotations,
        ),
      );
      if (this.#configuration.collectWarnings) {
        this.#diagnostics.push({
          code: "RDF_NAMED_DATATYPE_RESTRICTION",
          iri: currentQuad.subject.value,
          message:
            "A named RDF datatype restriction was preserved as a datatype definition",
          severity: "warning",
        });
      }
      await this.#execution.cooperate();
    }
  }

  async #readDeclarations(includeAxiomAnnotations = true) {
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
      const constructorName = DECLARATION_CONSTRUCTORS.get(
        currentQuad.object.value,
      );
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
        if (currentQuad.object.value === OWL_VOCABULARY.OntologyProperty) {
          this.#ontologyHeaderReferencePropertyIris.add(subject.value);
        }
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

    this.#resolvePropertyCategoryPunning();
    if (this.#configuration.parsingMode !== "preserve")
      this.#inferImplicitPropertyCategories();
    if (includeAxiomAnnotations) this.#indexReifications();
    for (const { constructorName, currentQuad, subject } of declarations) {
      this.#recordDiscoveredRole(
        subject,
        currentQuad.object.value === OWL_VOCABULARY.DataRange
          ? RDFS_VOCABULARY.Datatype
          : currentQuad.object.value === OWL_VOCABULARY.OntologyProperty
            ? OWL_VOCABULARY.AnnotationProperty
            : currentQuad.object.value,
      );
      const entity = this.#dataFactory[constructorName](
        IRI.create(subject.value),
      );
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDeclarationAxiom(
          entity,
          includeAxiomAnnotations
            ? await this.#axiomAnnotations(currentQuad)
            : [],
        ),
      );
      this.#consume(currentQuad);
    }
    // OWL 1 characteristic types identify their subject as an object property;
    // retain that declaration recovery while avoiding a duplicate when the OWL
    // 2 declaration triple is also present.
    for (const iri of inferredObjectPropertyIris) {
      if (
        explicitObjectPropertyIris.has(iri) ||
        this.#configuration.parsingMode === "preserve"
      ) {
        continue;
      }
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDeclarationAxiom(
          this.#dataFactory.getOWLObjectProperty(IRI.create(iri)),
        ),
      );
    }
    this.#declareRdfsClasses();
    this.#declareUntypedProperties();
    this.#declareUndeclaredAnnotationProperties();
    this.#consumeRedundantOwl1Types();
  }

  // Whether a triple using an undeclared predicate can be read as an annotation.
  // A literal object settles it: no object property can hold one. An IRI object
  // is only taken where the subject is a class or a property, because an object
  // property assertion there would have to pun the subject into an individual
  // and so change the ontology's structure; on an individual subject the
  // assertion is a real reading and the triple is left alone.
  #isRecoverableAnnotation(quad, subjectIris, annotationCarriers) {
    // A triple hanging off an ontology, `owl:Axiom` or `owl:Annotation` node is an
    // annotation by construction: the mapping makes every triple on such a node
    // beyond the three `owl:annotated*` ones part of the annotation set. The
    // object may be anything, so no further test applies.
    if (annotationCarriers.has(termKey(quad.subject))) return true;
    if (quad.subject.termType !== "NamedNode") {
      return false;
    }
    if (quad.object.termType === "Literal") {
      return true;
    }
    return (
      quad.object.termType === "NamedNode" &&
      subjectIris.has(quad.subject.value)
    );
  }

  // OWL 2 Mapping to RDF Graphs admits an annotation assertion only where the
  // predicate is a declared annotation property, and real vocabularies annotate
  // with undeclared ones constantly, so compatible mode declares them. What
  // matters is *when*: this runs in the declaration phase, before any axiom is
  // read.
  //
  // The reason is `owl:Axiom` reification. A reification names the assertion it
  // annotates through `owl:annotatedSource`, `owl:annotatedProperty` and
  // `owl:annotatedTarget`, and can only attach to an assertion that already
  // exists when reifications are indexed. Reconstructing the assertion later,
  // while sweeping up unconsumed triples, is too late - the reification has
  // already failed to find it, and its own annotations go with it.
  // `universal_reference-data_20260714` declares eight annotation properties and
  // uses dozens, so this cost it 144 annotations.
  //
  // The sets that decide whether an IRI-valued triple qualifies are captured
  // before the scan, so declaring one property cannot change the verdict for a
  // later one and the outcome does not depend on the order triples arrive in.
  #declareUndeclaredAnnotationProperties() {
    if (this.#configuration.parsingMode !== "compatible") {
      return;
    }

    const subjectIris = new Set([
      ...this.#classIris,
      ...this.#annotationPropertyIris,
      ...this.#dataPropertyIris,
      ...this.#objectPropertyIris,
    ]);
    const annotationCarriers = new Set();
    for (const quad of this.#dataset.match(null, null, null, null)) {
      if (
        quad.predicate.value === RDF_VOCABULARY.type &&
        (quad.object.value === OWL_VOCABULARY.Ontology ||
          (quad.subject.termType === "BlankNode" &&
            (quad.object.value === OWL_VOCABULARY.Axiom ||
              quad.object.value === OWL_VOCABULARY.Annotation)))
      ) {
        annotationCarriers.add(termKey(quad.subject));
      }
    }
    const recovered = new Set();

    for (const quad of this.#dataset.match(null, null, null, null)) {
      const iri = quad.predicate.value;
      if (
        recovered.has(iri) ||
        this.#annotationPropertyIris.has(iri) ||
        this.#dataPropertyIris.has(iri) ||
        this.#objectPropertyIris.has(iri) ||
        iri.startsWith(RDF_NAMESPACE) ||
        iri.startsWith(RDFS_NAMESPACE) ||
        iri.startsWith(OWL_NAMESPACE) ||
        !this.#isRecoverableAnnotation(quad, subjectIris, annotationCarriers)
      ) {
        continue;
      }
      recovered.add(iri);
      this.#annotationPropertyIris.add(iri);

      if (this.#configuration.collectWarnings) {
        this.#diagnostics.push({
          code: "RDF_UNDECLARED_ANNOTATION_PROPERTY",
          iri,
          message:
            "A property used in an assertion was undeclared and was taken as an annotation property",
          severity: "warning",
        });
      }
    }
  }

  // `x rdf:type rdfs:Class` says the subject is a class, but says it in the
  // RDFS vocabulary that OWL 1 admitted and OWL 2 replaced with `owl:Class`. It
  // matches no declaration pattern in OWL 2 Mapping to RDF Graphs, so a
  // document relying on it is not OWL 2 DL and strict mode leaves it alone.
  //
  // Compatible mode recovers it, because dropping it discards the vocabulary
  // rather than repairing it: `dcmitype.rdf` types all twelve of its classes
  // this way and declares no `owl:Class` at all. Unlike the bare `rdf:Property`
  // case below there is nothing to infer - a class is a class - so no evidence
  // is required and none is consulted.
  #declareRdfsClasses() {
    if (this.#configuration.parsingMode !== "compatible") {
      return;
    }

    for (const quad of this.#dataset.match(null, null, null, null)) {
      if (
        quad.predicate.value !== RDF_VOCABULARY.type ||
        quad.object.value !== RDFS_VOCABULARY.Class ||
        quad.subject.termType !== "NamedNode"
      ) {
        continue;
      }
      const iri = quad.subject.value;
      // A datatype is not re-read as a class, and an existing declaration
      // already says what this triple says.
      if (this.#classIris.has(iri) || this.#datatypeIris.has(iri)) {
        continue;
      }
      this.#classIris.add(iri);
      this.#transaction.addAxiom(
        this.#dataFactory.getOWLDeclarationAxiom(
          this.#dataFactory.getOWLClass(IRI.create(iri)),
        ),
      );
      this.#consume(quad);

      if (this.#configuration.collectWarnings) {
        this.#diagnostics.push({
          code: "RDF_RDFS_CLASS",
          iri,
          message:
            "A class was declared with rdfs:Class and was recovered as an OWL class",
          severity: "warning",
        });
      }
    }
  }

  // A bare `rdf:Property` is not an OWL property: OWL 2 requires every property
  // to be declared object, data or annotation, and `x rdf:type rdf:Property`
  // matches no declaration pattern in OWL 2 Mapping to RDF Graphs. A document
  // relying on it is therefore not OWL 2 DL, and strict mode leaves the triple
  // unreconstructed as it should.
  //
  // Real vocabularies rely on it heavily - `doap.rdf` declares all 43 of its
  // properties this way and no OWL property at all - so emitting nothing would
  // discard the entire vocabulary. Compatible mode recovers, taking the category
  // from the same evidence ADR 0005 uses for punning: a literal range means a
  // data property, a class range an object property. A property with no range
  // evidence is left alone, because guessing its category would invent a
  // distinction the document does not make.
  #declareUntypedProperties() {
    if (this.#configuration.parsingMode !== "compatible") {
      return;
    }
    const index = this.#propertyEvidenceIndex();
    const alreadyTyped = (iri) =>
      this.#objectPropertyIris.has(iri) ||
      this.#dataPropertyIris.has(iri) ||
      this.#annotationPropertyIris.has(iri);

    for (const quad of this.#dataset.match(null, null, null, null)) {
      if (
        quad.predicate.value !== RDF_VOCABULARY.type ||
        quad.object.value !== RDF_VOCABULARY.Property ||
        quad.subject.termType !== "NamedNode"
      ) {
        continue;
      }
      const iri = quad.subject.value;
      if (alreadyTyped(iri)) {
        continue;
      }
      const category = this.#categoryFromRanges(iri, index);
      if (!category) {
        continue;
      }

      if (category === "data") {
        this.#dataPropertyIris.add(iri);
        this.#transaction.addAxiom(
          this.#dataFactory.getOWLDeclarationAxiom(
            this.#dataFactory.getOWLDataProperty(IRI.create(iri)),
          ),
        );
      } else {
        this.#objectPropertyIris.add(iri);
        this.#transaction.addAxiom(
          this.#dataFactory.getOWLDeclarationAxiom(
            this.#dataFactory.getOWLObjectProperty(IRI.create(iri)),
          ),
        );
      }

      if (this.#configuration.collectWarnings) {
        this.#diagnostics.push({
          code: "RDF_UNTYPED_PROPERTY",
          iri,
          message:
            "A property was declared only as rdf:Property and its category was recovered from its range",
          resolvedCategory: category,
          severity: "warning",
        });
      }
    }
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
      if (
        this.#configuration.parsingMode === "preserve" &&
        [RDFS_VOCABULARY.Class, RDF_VOCABULARY.Property].includes(object)
      )
        continue; // The authored statement still owns its annotations.
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

  async #readOntologyHeader(includeAnnotations = true) {
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
    // OWL 2 RDF mapping Table 4 excludes references through owl:OntologyProperty,
    // not arbitrary annotation properties. Keep the legacy OWL 1 versioning
    // properties and explicit ontology-property declarations in this category.
    for (const currentQuad of this.#dataset) {
      if (
        !ontologyNodeKeys.has(termKey(currentQuad.subject)) ||
        !ontologyNodeKeys.has(termKey(currentQuad.object)) ||
        !this.#ontologyHeaderReferencePropertyIris.has(
          currentQuad.predicate.value,
        )
      ) {
        continue;
      }
      referencedOntologyNodeKeys.add(termKey(currentQuad.object));
    }
    const ontologyTypeQuads = allOntologyTypeQuads.filter(
      ({ subject }) => !referencedOntologyNodeKeys.has(termKey(subject)),
    );
    if (ontologyTypeQuads.length > 1) {
      // OWL 2 expects a document to carry one ontology header, so strict mode
      // rejects the graph. Real vocabularies violate this: protege-dc.owl
      // declares both itself and the Dublin Core elements vocabulary, and
      // prov.owl merges fifteen PROV modules into a single document.
      //
      // Compatible mode selects one deterministically, preferring the header
      // whose IRI is the document's own. That is the ontology the document *is*,
      // as opposed to one it merely describes, and it is the choice the pinned
      // oracle makes for protege-dc.owl.
      //
      // Where no header is the document, there is no fact about which ontology
      // the document is, so the rule only has to be a function of the ontology.
      // Document order is not one: RDF is an unordered graph, so the same
      // ontology may serialise its type triples in any order and a
      // first-declared rule would answer differently for identical input.
      //
      // The shortest IRI wins instead, because authors name the core vocabulary
      // most briefly and extend it with suffixes for modules - `prov#` against
      // `prov-dictionary#`. Code-point comparison breaks ties; `localeCompare`
      // weights `#` and `-` as punctuation and would reverse that very case.
      // The oracle's own pick for prov.owl is not derivable from any rule and is
      // recorded as a governed difference rather than reproduced.
      if (this.#configuration.parsingMode !== "compatible") {
        throw new OWLSyntaxError(
          "An RDF graph cannot identify more than one OWL ontology header",
          { observed: ontologyTypeQuads.length },
        );
      }
      // `#documentScope` is the document IRI, or a synthetic per-document urn
      // when the caller supplied none. The synthetic form matches no header, so
      // an anonymous document falls through to the first declared.
      const shortestThenCodePoint = (left, right) => {
        if (left.subject.value.length !== right.subject.value.length) {
          return left.subject.value.length - right.subject.value.length;
        }
        return left.subject.value < right.subject.value ? -1 : 1;
      };
      const selected =
        ontologyTypeQuads.find(
          ({ subject }) => subject.value === this.#documentScope,
        ) || [...ontologyTypeQuads].sort(shortestThenCodePoint)[0];
      if (this.#configuration.collectWarnings) {
        this.#diagnostics.push({
          // Every candidate is named so the discarded ones stay visible rather
          // than being silently dropped.
          candidateOntologyIRIs: ontologyTypeQuads.map(
            ({ subject }) => subject.value,
          ),
          code: "RDF_MULTIPLE_ONTOLOGY_HEADERS",
          message:
            "The RDF graph declared more than one OWL ontology header and one was selected",
          observed: ontologyTypeQuads.length,
          selectedOntologyIRI: selected.subject.value,
          severity: "warning",
        });
      }
      for (const quad of ontologyTypeQuads) {
        if (quad !== selected) {
          this.#consume(quad);
        }
      }
      ontologyTypeQuads.length = 0;
      ontologyTypeQuads.push(selected);
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
      !ontologyIRI && this.#ontologyID
        ? this.#ontologyID
        : this.#dataFactory.getOWLOntologyID(ontologyIRI, versionIRI),
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

    if (!includeAnnotations) return;
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
      this.#reificationNodes.add(termKey(currentQuad.subject));
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
    const key = tripleKey(
      baseQuad.subject,
      baseQuad.predicate,
      baseQuad.object,
    );
    this.#retainedAxiomAnnotationBases.add(key);
    const nodes = this.#axiomReifications.get(key) || [];
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
    this.#retainedAnnotationBases.add(
      tripleKey(currentQuad.subject, currentQuad.predicate, currentQuad.object),
    );
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
      if (this.#isConsumed(currentQuad)) continue;
      if (
        ![
          RDFS_VOCABULARY.subClassOf,
          OWL_VOCABULARY.equivalentClass,
          OWL_VOCABULARY.disjointWith,
          OWL_VOCABULARY.disjointUnionOf,
          OWL_VOCABULARY.complementOf,
          OWL_VOCABULARY.intersectionOf,
          OWL_VOCABULARY.oneOf,
          OWL_VOCABULARY.unionOf,
        ].includes(currentQuad.predicate.value)
      )
        continue;
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
        let dataDefinition = this.#isDataRangeTerm(currentQuad.subject);
        if (
          this.#configuration.parsingMode === "preserve" &&
          dataDefinition &&
          this.#isKnownClassExpressionTerm(currentQuad.subject)
        ) {
          const data = this.#isDataRangeTerm(currentQuad.object);
          const object = this.#isKnownClassExpressionTerm(currentQuad.object);
          if (data === object)
            throw new OWLSyntaxError(
              "The equivalence does not identify one class or datatype role",
              { reason: "RDF_AMBIGUOUS_CLASS_ROLE" },
            );
          dataDefinition = data;
        }
        if (dataDefinition) {
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
        if (this.#configuration.parsingMode === "preserve")
          throw new OWLSyntaxError(
            "Named OWL 1 class-expression recovery is unavailable in preserve mode",
            { reason: "RDF_LEGACY_CLASS_RECOVERY" },
          );
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
    return left.equals(right) && this.#configuration.parsingMode !== "preserve"
      ? undefined
      : this.#dataFactory.getOWLEquivalentClassesAxiom(
          [left, right],
          annotations,
        );
  }

  #normalizedObjectBooleanExpression(predicate, operands) {
    if (this.#configuration.parsingMode === "preserve")
      this.#requireListArity(operands, 2, predicate);
    if (
      operands.length === 1 &&
      this.#configuration.parsingMode !== "preserve"
    ) {
      return operands[0];
    }
    if (
      operands.length === 0 &&
      this.#configuration.parsingMode !== "preserve"
    ) {
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
      if (this.#isConsumed(currentQuad)) continue;
      const predicate = currentQuad.predicate.value;
      if (
        ![
          RDFS_VOCABULARY.subPropertyOf,
          RDFS_VOCABULARY.domain,
          RDFS_VOCABULARY.range,
          OWL_VOCABULARY.propertyChainAxiom,
          OWL_VOCABULARY.equivalentProperty,
          OWL_VOCABULARY.propertyDisjointWith,
          OWL_VOCABULARY.inverseOf,
        ].includes(predicate)
      )
        continue;
      const selectedCategory = this.#preservedAxiomCategory(currentQuad);
      let axiom;
      const annotations = await this.#axiomAnnotations(currentQuad);
      if (predicate === RDFS_VOCABULARY.subPropertyOf) {
        // Strict mode is left to the dispatch below, whose strict accessors
        // already reject the document and say more precisely why. Only the
        // compatible-mode recovery is at issue here.
        if (
          this.#configuration.parsingMode === "compatible" &&
          this.#isCrossCategorySubProperty(currentQuad)
        ) {
          this.#consume(currentQuad);
          if (this.#configuration.collectWarnings) {
            this.#diagnostics.push({
              code: "RDF_CROSS_CATEGORY_SUBPROPERTY",
              message:
                "A sub-property triple related two different property categories and was ignored",
              severity: "warning",
              subProperty: currentQuad.subject.value,
              superProperty: currentQuad.object.value,
            });
          }
          continue;
        }
        if (
          this.#isAnnotationPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
          axiom = this.#dataFactory.getOWLSubAnnotationPropertyOfAxiom(
            this.#annotationProperty(currentQuad.subject),
            this.#annotationProperty(currentQuad.object),
            annotations,
          );
        } else if (
          this.#isDataPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
          axiom = this.#dataFactory.getOWLSubDataPropertyOfAxiom(
            this.#dataProperty(currentQuad.subject),
            this.#dataPropertyForAxiom(currentQuad.object),
            annotations,
          );
        } else if (
          this.#isObjectPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
          axiom = this.#dataFactory.getOWLSubObjectPropertyOfAxiom(
            await this.#objectPropertyExpression(currentQuad.subject, 0),
            await this.#objectPropertyExpressionForAxiom(currentQuad.object, 0),
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
        if (this.#isDataPropertyTerm(currentQuad.subject, selectedCategory)) {
          axiom = this.#dataFactory.getOWLEquivalentDataPropertiesAxiom(
            [
              this.#dataProperty(currentQuad.subject),
              this.#dataProperty(currentQuad.object),
            ],
            annotations,
          );
        } else if (
          this.#isObjectPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
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
        if (this.#isDataPropertyTerm(currentQuad.subject, selectedCategory)) {
          axiom = this.#dataFactory.getOWLDisjointDataPropertiesAxiom(
            [
              this.#dataProperty(currentQuad.subject),
              this.#dataProperty(currentQuad.object),
            ],
            annotations,
          );
        } else if (
          this.#isObjectPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
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
        if (
          this.#isAnnotationPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
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
        } else if (
          this.#isDataPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
          axiom = this.#dataFactory.getOWLDataPropertyDomainAxiom(
            this.#dataProperty(currentQuad.subject),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
        } else if (
          this.#isObjectPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
          axiom = this.#dataFactory.getOWLObjectPropertyDomainAxiom(
            await this.#objectPropertyExpression(currentQuad.subject, 0),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
        } else {
          continue;
        }
      } else if (predicate === RDFS_VOCABULARY.range) {
        if (
          this.#isAnnotationPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
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
        } else if (
          this.#isDataPropertyTerm(currentQuad.subject, selectedCategory) &&
          this.#isKnownClassExpressionTerm(currentQuad.object)
        ) {
          const details = {
            property: currentQuad.subject.value,
            range: currentQuad.object.value,
          };
          if (this.#configuration.parsingMode !== "compatible") {
            throw new OWLSyntaxError(
              "An OWL class expression cannot be used as a data property range",
              details,
            );
          }
          axiom = this.#dataFactory.getOWLObjectPropertyRangeAxiom(
            this.#dataFactory.getOWLObjectProperty(
              IRI.create(currentQuad.subject.value),
            ),
            await this.#classExpression(currentQuad.object, 0),
            annotations,
          );
          if (this.#configuration.collectWarnings) {
            this.#diagnostics.push({
              code: "RDF_OWL_FULL_DATA_PROPERTY_RANGE_AS_CLASS",
              message:
                "An OWL Full data-property range encoded as a class expression was reconstructed as an object-property range",
              severity: "warning",
              ...details,
            });
          }
        } else if (
          this.#isDataPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
          axiom = this.#dataFactory.getOWLDataPropertyRangeAxiom(
            this.#dataProperty(currentQuad.subject),
            await this.#dataRange(currentQuad.object, 0),
            annotations,
          );
        } else if (
          this.#isObjectPropertyTerm(currentQuad.subject, selectedCategory)
        ) {
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
      if (
        currentQuad.object.value !== OWL_VOCABULARY.FunctionalProperty &&
        !characteristicMethods.has(currentQuad.object.value)
      )
        continue;
      let axiom;
      const annotations = await this.#axiomAnnotations(currentQuad);
      if (currentQuad.object.value === OWL_VOCABULARY.FunctionalProperty) {
        const selectedCategory = this.#preservedUniqueCategory(
          [currentQuad.subject],
          ["data", "object"],
        );
        axiom = this.#isDataPropertyTerm(currentQuad.subject, selectedCategory)
          ? this.#dataFactory.getOWLFunctionalDataPropertyAxiom(
              this.#dataProperty(currentQuad.subject),
              annotations,
            )
          : this.#dataFactory.getOWLFunctionalObjectPropertyAxiom(
              await this.#objectPropertyExpressionForAxiom(
                currentQuad.subject,
                0,
              ),
              annotations,
            );
      } else {
        const method = characteristicMethods.get(currentQuad.object.value);
        if (!method) {
          continue;
        }
        // A property characteristic is an axiom, so it uses the
        // recovery-capable entry point: in compatible mode a property punned
        // into another category is still honoured for this one axiom and the
        // reuse is recorded, rather than the whole document being rejected.
        axiom = this.#dataFactory[method](
          await this.#objectPropertyExpressionForAxiom(currentQuad.subject, 0),
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
        const selectedCategory = this.#preservedUniqueCategory(memberTerms, [
          "data",
          "object",
        ]);
        if (
          memberTerms.every((term) =>
            this.#isDataPropertyTerm(term, selectedCategory),
          )
        ) {
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

    let visited = 0;
    for (const currentQuad of this.#dataset) {
      if (this.#isConsumed(currentQuad)) {
        continue;
      }
      const predicate = currentQuad.predicate.value;
      // Reification payload belongs to its original owner even if that owner
      // is encountered later. It must never become an assertion about the
      // reification blank node merely because the dataset order changed.
      if (this.#reificationNodes.has(termKey(currentQuad.subject))) continue;
      const selectedCategory = this.#preservedUniqueCategory(
        [currentQuad.predicate],
        currentQuad.object.termType === "Literal"
          ? ["annotation", "data"]
          : ["annotation", "object"],
        true,
      );
      if (
        (predicate === RDF_VOCABULARY.type &&
          currentQuad.object.termType === "NamedNode" &&
          NON_ASSERTION_TYPES.has(currentQuad.object.value)) ||
        (![
          RDF_VOCABULARY.type,
          OWL_VOCABULARY.sameAs,
          OWL_VOCABULARY.differentFrom,
        ].includes(predicate) &&
          !this.#isAnnotationPropertyTerm(
            currentQuad.predicate,
            selectedCategory,
          ) &&
          !this.#isDataPropertyTerm(currentQuad.predicate, selectedCategory) &&
          !this.#isObjectPropertyTerm(currentQuad.predicate, selectedCategory))
      )
        continue;
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
          NON_ASSERTION_TYPES.has(currentQuad.object.value)
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
      } else if (
        this.#isAnnotationPropertyTerm(currentQuad.predicate, selectedCategory)
      ) {
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
      } else if (
        this.#isObjectPropertyTerm(currentQuad.predicate, selectedCategory)
      ) {
        if (currentQuad.object.termType === "Literal") {
          // An object property assertion cannot take a literal object, so this
          // graph is OWL Full. Unlike a category conflict there is no competing
          // logical reading to prefer: the object-property reading is
          // impossible, so the choice is between preserving the statement as an
          // annotation and discarding it. Strict discards; compatible preserves
          // it and records the recovery.
          if (this.#configuration.parsingMode !== "compatible") {
            throw new OWLSyntaxError(
              "An object property assertion requires an individual object",
              {
                object: currentQuad.object.value,
                predicate: currentQuad.predicate.value,
                subject: currentQuad.subject.value,
              },
            );
          }
          if (this.#configuration.collectWarnings) {
            this.#diagnostics.push({
              code: "RDF_OWL_FULL_OBJECT_PROPERTY_LITERAL",
              message:
                "An object property was asserted with a literal object and was recovered as an annotation",
              object: currentQuad.object.value,
              predicate: currentQuad.predicate.value,
              severity: "warning",
              subject: currentQuad.subject.value,
            });
          }
          this.#consume(currentQuad);
          if (!this.#configuration.loadAnnotationAxioms) {
            continue;
          }
          this.#transaction.addAxiom(
            this.#dataFactory.getOWLAnnotationAssertionAxiom(
              this.#dataFactory.getOWLAnnotationProperty(
                IRI.create(currentQuad.predicate.value),
              ),
              this.#annotationSubject(currentQuad.subject),
              this.#annotationValue(currentQuad.object),
              annotations,
            ),
          );
          continue;
        }
        axiom = this.#dataFactory.getOWLObjectPropertyAssertionAxiom(
          await this.#objectPropertyExpression(currentQuad.predicate, 0),
          this.#individual(currentQuad.subject),
          this.#individual(currentQuad.object),
          annotations,
        );
      } else if (
        this.#isDataPropertyTerm(currentQuad.predicate, selectedCategory)
      ) {
        axiom = this.#dataFactory.getOWLDataPropertyAssertionAxiom(
          this.#dataProperty(currentQuad.predicate),
          this.#individual(currentQuad.subject),
          this.#literal(currentQuad.object),
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

  // The OWL 2 Structural Specification's typing constraints forbid an IRI being
  // declared in more than one property category: no IRI is declared "to be both
  // object and data, object and annotation, or data and annotation property".
  // Strict mode therefore rejects such a document.
  //
  // Compatible mode explicitly does not claim OWL 2 DL conformance, so it
  // resolves the conflict rather than rejecting the ontology. Resolution is
  // mandatory, not cosmetic: the category predicates are independent, so an IRI
  // left in two sets makes two of them report true and the effective category
  // would depend on which predicate a code path happens to evaluate first.
  // Removing the losing categories keeps the sets mutually exclusive.
  //
  // Resolution asks the ontology before it consults a table. See ADR 0005.
  //
  //   1. Direct evidence about the property. `rdfs:range` decides: a datatype or
  //      `rdfs:Literal` range is only meaningful for a data property, a class
  //      range only for an object property. It outranks a characteristic that
  //      disagrees, being the author's most direct statement of what the
  //      property relates.
  //   2. Evidence inferred by bounded propagation across `rdfs:subPropertyOf`
  //      and `owl:equivalentProperty` to a property declared in exactly one
  //      category. This is syntactic traversal of two relations, deliberately
  //      not DL reasoning - entailment closure is a different undertaking, and
  //      the corpus register already treats reasoner-derived axioms as an
  //      expected difference class.
  //   3. The fixed precedence data > object > annotation, as a deterministic
  //      fallback when the ontology offers nothing. Object and data properties
  //      carry logical meaning where OWL 2 annotation properties are explicitly
  //      non-logical, so a logical category preserves more of the semantics.
  //
  // A fixed precedence alone was tried first and rejected: every punned property
  // in the pinned corpus declares `rdfs:range rdfs:Literal`, and any rule that
  // ignores that discards the author's own statement. Resolution by document
  // order was rejected outright - RDF is an unordered graph, so it answers
  // differently for the same ontology depending on how it was serialised.
  //
  // Scope is the document. The import closure is best-effort - a missing import
  // is a diagnostic, not a failure - so consulting it would make the rendering
  // depend on what the network returned, reintroducing by another route the
  // environment-dependence that document order was rejected for. Strict-mode
  // conformance is a separate question and keeps the specification's scope.
  #resolvePropertyCategoryPunning() {
    // Preservation retains every authored category. Dispatch must prove the
    // role of each use; the compatible-mode precedence policy is inapplicable.
    if (this.#configuration.parsingMode === "preserve") return;
    const precedence = ["data", "object", "annotation"];
    const categorySets = new Map([
      ["annotation", this.#annotationPropertyIris],
      ["data", this.#dataPropertyIris],
      ["object", this.#objectPropertyIris],
    ]);

    const declaredCategories = new Map();
    for (const [name, values] of categorySets) {
      for (const iri of values) {
        const existing = declaredCategories.get(iri);
        if (existing) {
          existing.push(name);
        } else {
          declaredCategories.set(iri, [name]);
        }
      }
    }

    for (const [iri, categories] of declaredCategories) {
      if (categories.length < 2) {
        continue;
      }
      if (this.#configuration.parsingMode !== "compatible") {
        throw new OWLSyntaxError(
          "An IRI cannot identify conflicting OWL property categories",
          { iri, propertyCategories: categories },
        );
      }

      const evidenced = this.#categoryFromEvidence(
        iri,
        categories,
        declaredCategories,
      );
      const resolvedCategory =
        evidenced?.category ??
        precedence.find((name) => categories.includes(name));
      const evidence = evidenced?.evidence ?? "precedence";
      for (const name of categories) {
        if (name !== resolvedCategory) {
          categorySets.get(name).delete(iri);
        }
      }

      if (this.#configuration.collectWarnings) {
        // The object/annotation pair is principled but has never been observed
        // in the pinned corpus, so it carries its own code and the first real
        // occurrence announces itself instead of passing as a routine recovery.
        const unobserved =
          evidence === "precedence" && !categories.includes("data");
        this.#diagnostics.push({
          code: unobserved
            ? "RDF_PROPERTY_CATEGORY_PUNNING_UNEVIDENCED"
            : "RDF_PROPERTY_CATEGORY_PUNNING",
          declaredCategories: [...categories].sort(),
          // Which step decided, so a reader can tell a reasoned resolution from
          // a defaulted one.
          evidence,
          iri,
          message: "An IRI was declared in more than one OWL property category",
          resolvedCategory,
          severity: "warning",
        });
      }
    }
  }

  // OWL entities need not have Declaration axioms. When an undeclared property
  // is connected by subPropertyOf or equivalentProperty to a property whose
  // category is known, that relation provides enough syntactic evidence to
  // classify it before anonymous restrictions are reconstructed. This bounded
  // propagation changes only the interpreter's category index: it must not
  // manufacture a Declaration axiom that was absent from the RDF graph.
  #inferImplicitPropertyCategories() {
    let changed = false;
    const categories = [
      this.#annotationPropertyIris,
      this.#dataPropertyIris,
      this.#objectPropertyIris,
    ];
    const relatedByIri = new Map();
    const relate = (left, right) => {
      if (!relatedByIri.has(left)) {
        relatedByIri.set(left, new Set());
      }
      relatedByIri.get(left).add(right);
    };
    for (const quad of this.#dataset) {
      if (
        quad.subject.termType !== "NamedNode" ||
        quad.object.termType !== "NamedNode" ||
        ![
          RDFS_VOCABULARY.subPropertyOf,
          OWL_VOCABULARY.equivalentProperty,
        ].includes(quad.predicate.value)
      ) {
        continue;
      }
      relate(quad.subject.value, quad.object.value);
      relate(quad.object.value, quad.subject.value);
    }

    // Classify whole connected components in linear time. A component seeded
    // by conflicting categories is intentionally left unresolved: choosing a
    // category by traversal order would make semantics depend on serialization.
    const visited = new Set();
    for (const start of relatedByIri.keys()) {
      if (visited.has(start)) {
        continue;
      }
      const component = [];
      const pending = [start];
      visited.add(start);
      while (pending.length > 0) {
        const current = pending.pop();
        component.push(current);
        for (const related of relatedByIri.get(current) ?? []) {
          if (!visited.has(related)) {
            visited.add(related);
            pending.push(related);
          }
        }
      }

      if (this.#configuration.parsingMode === "preserve") {
        const rule = `${this.#roleProofScope}|property-component|${[...component].sort().join("\u0000")}`;
        this.#retractRoleRule(rule);
        const seeded = [
          OWL_VOCABULARY.AnnotationProperty,
          OWL_VOCABULARY.DatatypeProperty,
          OWL_VOCABULARY.ObjectProperty,
        ]
          .map((type, index) => ({
            type,
            values: categories[index],
            proofs: component.flatMap((value) =>
              this.#proofsFor({ termType: "NamedNode", value }, type, rule),
            ),
          }))
          .filter(({ proofs }) => proofs.length);
        if (seeded.length === 1) {
          const { type, values, proofs } = seeded[0];
          for (const value of component) {
            values.add(value);
            if (
              this.#recordDiscoveredRole(
                { termType: "NamedNode", value },
                type,
                proofs.map((proof) => [...proof, rule]),
              )
            )
              changed = true;
          }
        }
        continue;
      }
      const seededCategories = categories.filter((values) =>
        component.some((iri) => values.has(iri)),
      );
      if (seededCategories.length === 1) {
        for (const iri of component) {
          seededCategories[0].add(iri);
        }
      }
    }
    return changed;
  }

  // OWL 2 Mapping to RDF Graphs admits an annotation assertion only where the
  // predicate is a declared annotation property, so a document that annotates
  // with an undeclared one leaves triples matching no pattern. Strict mode is
  // right to reject them; compatible mode recovers.
  //
  // Only a literal object is recovered. A literal cannot belong to an object
  // property, and a data property assertion would be nonsense on a class, so an
  // annotation is the reading that keeps the statement while asserting nothing
  // logically. An IRI object is left alone, because there it is genuinely
  // ambiguous whether an object property assertion was meant.
  //
  // Real vocabularies rely on this: `spatial.rdf` annotates sixteen properties
  // and a class with `vs:term_status` while declaring no annotation property at
  // all, so without the recovery it renders with no annotations whatsoever.
  #recoverUndeclaredAnnotation(quad) {
    if (
      this.#configuration.parsingMode !== "compatible" ||
      quad.subject.termType !== "NamedNode"
    ) {
      return false;
    }
    // A literal object settles it on its own: no object property can hold one.
    // An IRI object is only recovered where the subject is a class or a
    // property, because an object property assertion there would have to pun
    // the subject into an individual and so change the ontology's structure. On
    // an individual subject the assertion is a real reading and the triple is
    // left alone rather than guessed at.
    if (
      quad.object.termType !== "Literal" &&
      !(
        quad.object.termType === "NamedNode" &&
        (this.#classIris.has(quad.subject.value) ||
          this.#annotationPropertyIris.has(quad.subject.value) ||
          this.#dataPropertyIris.has(quad.subject.value) ||
          this.#objectPropertyIris.has(quad.subject.value))
      )
    ) {
      return false;
    }
    const iri = quad.predicate.value;
    // The recovery invents a declaration, and the RDF, RDFS and OWL namespaces
    // are reserved: an IRI from them cannot be given a meaning the standard did
    // not give it. The built-in annotation properties are already declared and
    // never reach this path, so what is refused here is exactly the terms that
    // have no standard meaning to fall back on.
    if (
      iri.startsWith(RDF_NAMESPACE) ||
      iri.startsWith(RDFS_NAMESPACE) ||
      iri.startsWith(OWL_NAMESPACE)
    ) {
      return false;
    }
    // Recovering the first assertion declares the property, so asking only
    // whether it is declared would refuse every assertion after the first. The
    // recovered set is tracked separately for that reason: a property recovered
    // here stays eligible, while one the document genuinely declared does not
    // reach this path at all.
    if (
      !this.#recoveredAnnotationPropertyIris.has(iri) &&
      (this.#annotationPropertyIris.has(iri) ||
        this.#dataPropertyIris.has(iri) ||
        this.#objectPropertyIris.has(iri))
    ) {
      return false;
    }

    this.#recoveredAnnotationPropertyIris.add(iri);
    this.#annotationPropertyIris.add(iri);
    this.#transaction.addAxiom(
      this.#dataFactory.getOWLAnnotationAssertionAxiom(
        this.#dataFactory.getOWLAnnotationProperty(IRI.create(iri)),
        IRI.create(quad.subject.value),
        this.#annotationValue(quad.object),
      ),
    );
    this.#consume(quad);

    if (this.#configuration.collectWarnings) {
      this.#diagnostics.push({
        code: "RDF_UNDECLARED_ANNOTATION_PROPERTY",
        iri,
        message:
          "An assertion used an undeclared property and was kept as an annotation",
        severity: "warning",
        subject: quad.subject.value,
      });
    }
    return true;
  }

  async #accountForUnconsumedTriples() {
    if (
      this.#configuration.parsingMode === "preserve" &&
      this.#configuration.loadAnnotationAxioms
    ) {
      for (const [reifications, retained] of [
        [this.#axiomReifications, this.#retainedAxiomAnnotationBases],
        [this.#annotationReifications, this.#retainedAnnotationBases],
      ])
        for (const key of reifications.keys()) {
          if (!retained.has(key))
            throw new UnsupportedConstructError(
              "An RDF annotation has no retained owning axiom or annotation",
              { reason: "RDF_ANNOTATION_ANCHOR_UNSUPPORTED" },
            );
          await this.#execution.cooperate();
        }
    }
    let visited = 0;
    for (const currentQuad of this.#dataset) {
      if (this.#isConsumed(currentQuad)) {
        continue;
      }
      if (this.#configuration.parsingMode !== "compatible") {
        throw new UnsupportedConstructError(
          "The RDF graph presented for OWL reconstruction contains an unconsumed statement",
          this.#unconsumedStatementDetails(currentQuad),
        );
      }
      const owlSignificant = this.#isOwlSignificant(currentQuad);
      if (owlSignificant && this.#recoverUndeclaredAnnotation(currentQuad)) {
        continue;
      }
      if (this.#configuration.collectWarnings) {
        const details = this.#unconsumedStatementDetails(currentQuad);
        this.#diagnostics.push({
          code: owlSignificant
            ? "RDF_UNCONSUMED_OWL_TRIPLE"
            : "RDF_UNCONSUMED_TRIPLE",
          message:
            "An RDF statement could not be reconstructed and was ignored",
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

  #unconsumedStatementDetails(currentQuad) {
    const sourceLocation = this.#sourceLocationsByTriple.get(
      tripleKey(currentQuad.subject, currentQuad.predicate, currentQuad.object),
    );
    return {
      graph: this.#selectedGraph.value,
      object: currentQuad.object.value,
      predicate: currentQuad.predicate.value,
      quad: Object.freeze({
        graph: rdfTermDescriptor(this.#selectedGraph),
        object: rdfTermDescriptor(currentQuad.object),
        predicate: rdfTermDescriptor(currentQuad.predicate),
        subject: rdfTermDescriptor(currentQuad.subject),
      }),
      ...(sourceLocation ?? {}),
      subject: currentQuad.subject.value,
    };
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
        const selectedCategory = this.#preservedUniqueCategory(
          [term],
          ["data", "object"],
        );
        if (this.#isDataPropertyTerm(term, selectedCategory)) {
          dataProperties.push(this.#dataProperty(term));
        } else if (this.#isObjectPropertyTerm(term, selectedCategory)) {
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
      if (
        this.#isDataRangeTerm(term) &&
        !(
          this.#configuration.parsingMode === "preserve" &&
          this.#classIris.has(term.value)
        )
      ) {
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
        if (this.#configuration.parsingMode === "preserve")
          this.#requireListArity(individuals, 1, OWL_VOCABULARY.oneOf);
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
      const selectedCategory = this.#preservedUniqueCategory(
        [propertyTerm],
        this.#preservedRangeCategories(fillerQuad.object, false),
      );
      if (this.#isDataPropertyTerm(propertyTerm, selectedCategory)) {
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
    const selectedCategory = this.#preservedUniqueCategory(
      [propertyTerm],
      onDataRange ? ["data"] : onClass ? ["object"] : ["data", "object"],
    );
    if (
      onDataRange ||
      this.#isDataPropertyTerm(propertyTerm, selectedCategory)
    ) {
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
        if (
          values.length === 0 &&
          this.#owl1DataRangeNodes.has(key) &&
          this.#configuration.parsingMode !== "preserve"
        ) {
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
        dataRange = await this.#datatypeRestriction(term);
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

  async #datatypeRestriction(term) {
    const onDatatype = this.#exactlyOne(term, OWL_VOCABULARY.onDatatype);
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
    this.#requireListArity(restrictions, 1, OWL_VOCABULARY.withRestrictions);
    return this.#dataFactory.getOWLDatatypeRestriction(datatype, restrictions);
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
      const conflictingCategories = this.#propertyCategories(term.value).filter(
        (category) => category !== "object",
      );
      if (
        conflictingCategories.length > 0 &&
        !(
          this.#configuration.parsingMode === "preserve" &&
          this.#objectPropertyIris.has(term.value)
        )
      ) {
        throw new OWLSyntaxError(
          "A property in another OWL category cannot be used as an object property expression",
          { iri: term.value, propertyCategories: conflictingCategories },
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

  async #objectPropertyExpressionForAxiom(term, depth) {
    if (term.termType === "NamedNode") {
      const conflictingCategories = this.#propertyCategories(term.value).filter(
        (category) => category !== "object",
      );
      if (conflictingCategories.length > 0) {
        this.#requireCompatiblePropertyCategoryReuse(
          term.value,
          "object",
          conflictingCategories,
        );
        return this.#dataFactory.getOWLObjectProperty(IRI.create(term.value));
      }
    }
    return this.#objectPropertyExpression(term, depth);
  }

  #dataProperty(term) {
    const named = requireNamedNode(
      term,
      "OWL data property expressions require an IRI",
    );
    const conflictingCategories = this.#propertyCategories(named.value).filter(
      (category) => category !== "data",
    );
    if (
      conflictingCategories.length > 0 &&
      !(
        this.#configuration.parsingMode === "preserve" &&
        this.#dataPropertyIris.has(named.value)
      )
    ) {
      throw new OWLSyntaxError(
        "A property in another OWL category cannot be used as a data property expression",
        { iri: named.value, propertyCategories: conflictingCategories },
      );
    }
    this.#dataPropertyIris.add(named.value);
    return this.#dataFactory.getOWLDataProperty(IRI.create(named.value));
  }

  #dataPropertyForAxiom(term) {
    const named = requireNamedNode(
      term,
      "OWL data property expressions require an IRI",
    );
    const conflictingCategories = this.#propertyCategories(named.value).filter(
      (category) => category !== "data",
    );
    if (conflictingCategories.length > 0) {
      this.#requireCompatiblePropertyCategoryReuse(
        named.value,
        "data",
        conflictingCategories,
      );
      return this.#dataFactory.getOWLDataProperty(IRI.create(named.value));
    }
    return this.#dataProperty(named);
  }

  #propertyCategories(iri) {
    return [
      ["annotation", this.#annotationPropertyIris],
      ["data", this.#dataPropertyIris],
      ["object", this.#objectPropertyIris],
    ]
      .filter(([, values]) => values.has(iri))
      .map(([category]) => category);
  }

  #preservedUniqueCategory(
    terms,
    allowed = ["annotation", "data", "object"],
    knownPredicatesOnly = false,
  ) {
    if (this.#configuration.parsingMode !== "preserve") return undefined;
    const categories = terms.map((term) =>
      term.termType === "NamedNode"
        ? this.#propertyCategories(term.value)
        : ["object"],
    );
    // The assertion loop also visits rdf:type and other structural predicates.
    // Unknown ordinary predicates remain unconsumed and fail final accounting;
    // their literal/resource object alone cannot distinguish an annotation.
    if (knownPredicatesOnly && categories.every((values) => !values.length))
      return undefined;
    const candidates = allowed.filter((category) =>
      categories.every((values) => !values.length || values.includes(category)),
    );
    if (candidates.length !== 1)
      throw new OWLSyntaxError(
        "The RDF statement does not identify one OWL property role",
        {
          reason: candidates.length
            ? "RDF_AMBIGUOUS_PROPERTY_ROLE"
            : "RDF_INCOMPATIBLE_PROPERTY_ROLES",
          properties: terms.map((term) => term.value),
          propertyCategories: candidates,
        },
      );
    return candidates[0];
  }

  #preservedRangeCategories(term, annotationAllowed = true) {
    const data = this.#isDataRangeTerm(term),
      object = this.#isKnownClassExpressionTerm(term);
    return [
      ...(annotationAllowed && term.termType === "NamedNode"
        ? ["annotation"]
        : []),
      ...(!object || data ? ["data"] : []),
      ...(!data || object ? ["object"] : []),
    ];
  }

  #preservedAxiomCategory(quad) {
    if (this.#configuration.parsingMode !== "preserve") return undefined;
    if (
      [
        RDFS_VOCABULARY.subPropertyOf,
        OWL_VOCABULARY.equivalentProperty,
        OWL_VOCABULARY.propertyDisjointWith,
      ].includes(quad.predicate.value)
    ) {
      return this.#preservedUniqueCategory(
        [quad.subject, quad.object],
        quad.predicate.value === RDFS_VOCABULARY.subPropertyOf
          ? undefined
          : ["data", "object"],
      );
    }
    if (quad.predicate.value === RDFS_VOCABULARY.domain)
      return this.#preservedUniqueCategory(
        [quad.subject],
        quad.object.termType === "NamedNode" ? undefined : ["data", "object"],
      );
    if (quad.predicate.value === RDFS_VOCABULARY.range)
      return this.#preservedUniqueCategory(
        [quad.subject],
        this.#preservedRangeCategories(quad.object),
      );
    return undefined;
  }

  #requireCompatiblePropertyCategoryReuse(
    iri,
    requestedCategory,
    existingCategories,
  ) {
    if (
      this.#configuration.parsingMode === "preserve" &&
      this.#propertyCategories(iri).includes(requestedCategory)
    )
      return;
    if (this.#configuration.parsingMode !== "compatible") {
      throw new OWLSyntaxError(
        "An IRI cannot be reused in another OWL property category",
        { existingCategories, iri, requestedCategory },
      );
    }
    if (this.#configuration.collectWarnings) {
      this.#diagnostics.push({
        code: "RDF_PROPERTY_CATEGORY_REUSE",
        existingCategories,
        iri,
        message:
          "A property was reused in another OWL property category for this axiom",
        requestedCategory,
        severity: "warning",
      });
    }
  }

  #annotationProperty(term) {
    const named = requireNamedNode(
      term,
      "OWL annotation properties require an IRI",
    );
    if (
      (this.#dataPropertyIris.has(named.value) ||
        this.#objectPropertyIris.has(named.value)) &&
      !(
        this.#configuration.parsingMode === "preserve" &&
        this.#annotationPropertyIris.has(named.value)
      )
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
    const value = integerValueOfLiteral(
      term,
      this.#configuration.parsingMode === "preserve",
    );
    if (value === undefined || value < 0) {
      throw new OWLSyntaxError(
        "OWL cardinalities require a non-negative integer literal",
      );
    }
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      throw new ResourceLimitError(
        "The OWL cardinality is not a safe integer",
        {
          observed: term.value,
          resource: "cardinality",
        },
      );
    }
    return normalizeCardinality(String(value));
  }

  #booleanLiteral(term) {
    return (
      term.termType === "Literal" &&
      (term.value === "true" || term.value === "1") &&
      term.datatype.value === `${XSD_NAMESPACE}boolean`
    );
  }

  #isDataPropertyTerm(term, selectedCategory) {
    if (selectedCategory !== undefined) return selectedCategory === "data";
    return (
      term.termType === "NamedNode" && this.#dataPropertyIris.has(term.value)
    );
  }

  #isKnownClassExpressionTerm(term) {
    if (term.termType === "NamedNode") {
      return this.#classIris.has(term.value);
    }
    return (
      term.termType === "BlankNode" &&
      (this.#anonymousClassNodes.has(termKey(term)) ||
        this.#classExpressionCache.has(termKey(term)))
    );
  }

  #isObjectPropertyTerm(term, selectedCategory) {
    if (selectedCategory !== undefined) return selectedCategory === "object";
    return (
      (term.termType === "NamedNode" &&
        this.#objectPropertyIris.has(term.value)) ||
      term.termType === "BlankNode"
    );
  }

  // Each of the three `rdfs:subPropertyOf` patterns constrains both ends to the
  // same property category, so a triple whose ends sit in different categories
  // matches none of them. It cannot be repaired by moving one end either:
  // section 3.2.1 allows at most one of OPE(x), DPE(x) and AP(x) to be defined
  // for any x, so reading `rdfs:label` as an object property because an object
  // property is declared beneath it would define OPE for an IRI that already
  // has AP.
  //
  // Only named ends are judged. A blank-node object is a property expression
  // such as `owl:inverseOf`, which carries no category of its own.
  #propertyCategoryOf(term) {
    if (term.termType !== "NamedNode") {
      return null;
    }
    if (this.#annotationPropertyIris.has(term.value)) {
      return "annotation";
    }
    if (this.#dataPropertyIris.has(term.value)) {
      return "data";
    }
    return this.#objectPropertyIris.has(term.value) ? "object" : null;
  }

  // Only a crossing that involves the annotation category is refused. ADR 0005
  // has evidence for recovering `data` against `object` - the oracle renders
  // `foaf:mbox_sha1sum` and `sioc:delivered_at`, and FOAF needs the axiom-local
  // reuse to load at all - so that recovery is left exactly as it is. It has no
  // evidence for the annotation pairs, and manufacturing an object property out
  // of an annotation property is what drew `rdfs:label` as a node of its own.
  #isCrossCategorySubProperty(quad) {
    const subject = this.#propertyCategoryOf(quad.subject);
    const object = this.#propertyCategoryOf(quad.object);
    if (!subject || !object || subject === object) {
      return false;
    }
    return subject === "annotation" || object === "annotation";
  }

  #isAnnotationPropertyTerm(term, selectedCategory) {
    if (selectedCategory !== undefined)
      return selectedCategory === "annotation";
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

  // Evidence about one punned IRI, gathered from the document in a single pass.
  // Returns undefined when the ontology says nothing, leaving the caller to fall
  // back to the fixed precedence.
  #categoryFromEvidence(iri, categories, declaredCategories) {
    const permitted = new Set(categories);
    const index = this.#propertyEvidenceIndex();
    const evidence = index.get(iri);

    // 1. `rdfs:range` decides, and outranks a characteristic that disagrees.
    for (const rangeIri of evidence?.ranges ?? []) {
      const category = this.#categoryForRange(rangeIri, index);
      if (category && permitted.has(category)) {
        return { category, evidence: "range" };
      }
    }

    // 2. A characteristic that exists only for object properties.
    if (evidence?.objectOnlyCharacteristic && permitted.has("object")) {
      return { category: "object", evidence: "characteristic" };
    }

    // 3. Bounded propagation to a property declared in exactly one category.
    //    Breadth-first over two relations with a visited set, so a cyclic
    //    hierarchy terminates and no entailment closure is attempted.
    const visited = new Set([iri]);
    const pending = [...(evidence?.related ?? [])];
    while (pending.length > 0) {
      const candidate = pending.shift();
      if (visited.has(candidate)) {
        continue;
      }
      visited.add(candidate);
      const declared = declaredCategories.get(candidate);
      if (declared?.length === 1 && permitted.has(declared[0])) {
        return { category: declared[0], evidence: "inferred" };
      }
      pending.push(...(index.get(candidate)?.related ?? []));
    }

    return undefined;
  }

  // A range names a datatype when it is declared one, sits in the XML Schema
  // namespace, or is `rdfs:Literal`. Anything else cannot be a data range, so it
  // implies an object property - whether or not the range IRI happens to carry a
  // local class declaration. `doap:blog` ranges over `rdfs:Resource` and
  // `sioct:Weblog`, neither declared in that document, and is an object property
  // all the same.
  #categoryForRange(rangeIri, index) {
    if (
      rangeIri === RDFS_VOCABULARY.Literal ||
      rangeIri.startsWith(XSD_NAMESPACE) ||
      index.get(rangeIri)?.isDatatype
    ) {
      return "data";
    }
    return "object";
  }

  // Ranges are a set, not a sequence: several corpus properties declare both a
  // literal and a class range, and taking whichever arrived first would make the
  // answer depend on how the document was serialised. A literal range can only
  // belong to a data property, so its presence decides; otherwise any range at
  // all implies an object property. No range means no evidence.
  #categoryFromRanges(iri, index) {
    const categories = (index.get(iri)?.ranges ?? []).map((rangeIri) =>
      this.#categoryForRange(rangeIri, index),
    );
    if (categories.includes("data")) {
      return "data";
    }
    return categories.includes("object") ? "object" : undefined;
  }

  #propertyEvidenceIndex() {
    if (this.#evidenceIndex) {
      return this.#evidenceIndex;
    }
    const index = new Map();
    const entryFor = (key) => {
      let entry = index.get(key);
      if (!entry) {
        entry = {
          isClass: false,
          isDatatype: false,
          objectOnlyCharacteristic: false,
          ranges: [],
          related: [],
        };
        index.set(key, entry);
      }
      return entry;
    };

    for (const quad of this.#dataset.match(null, null, null, null)) {
      const subject = quad.subject.value;
      const object = quad.object.value;
      switch (quad.predicate.value) {
        case RDFS_VOCABULARY.range:
          entryFor(subject).ranges.push(object);
          break;
        case RDFS_VOCABULARY.subPropertyOf:
        case OWL_VOCABULARY.equivalentProperty:
          entryFor(subject).related.push(object);
          entryFor(object).related.push(subject);
          break;
        case RDF_VOCABULARY.type:
          if (OBJECT_ONLY_CHARACTERISTICS.has(object)) {
            entryFor(subject).objectOnlyCharacteristic = true;
          } else if (object === OWL_VOCABULARY.Class) {
            entryFor(subject).isClass = true;
          } else if (
            object === RDFS_VOCABULARY.Datatype ||
            object === RDFS_VOCABULARY.Class
          ) {
            entryFor(subject).isDatatype = object === RDFS_VOCABULARY.Datatype;
            entryFor(subject).isClass ||= object === RDFS_VOCABULARY.Class;
          }
          break;
        default:
          break;
      }
    }

    // `owl:inverseOf` only relates object properties, on either side.
    for (const quad of this.#dataset.match(null, null, null, null)) {
      if (quad.predicate.value === OWL_VOCABULARY.inverseOf) {
        entryFor(quad.subject.value).objectOnlyCharacteristic = true;
        entryFor(quad.object.value).objectOnlyCharacteristic = true;
      }
    }

    this.#evidenceIndex = index;
    return index;
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
  const sourceLocatedStatements = [];
  let observed = 0;
  for (const currentQuad of dataset) {
    requireQuad(currentQuad);
    const sourceLocation = snapshotQuadSourceLocation(
      currentQuad,
      configuration,
    );
    if (sourceLocation) {
      sourceLocatedStatements.push(
        Object.freeze({
          graphKey: termKey(currentQuad.graph),
          sourceLocation,
          tripleKey: tripleKey(
            currentQuad.subject,
            currentQuad.predicate,
            currentQuad.object,
          ),
        }),
      );
    }
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
  return Object.freeze(sourceLocatedStatements);
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

  async #prepareReconstructionInput(
    dataset,
    { baseIRI, configuration, documentIRI } = {},
  ) {
    const normalizedConfiguration = normalizeConfiguration(configuration);
    // RFC 3986 section 5.1: a base embedded in the content outranks the URI the
    // document was retrieved from. `baseIRI` is therefore what the document
    // calls itself, and is what decides which ontology header the document *is*.
    const effectiveIRI = baseIRI ?? documentIRI;
    const normalizedDocumentIRI =
      effectiveIRI === undefined ? undefined : IRI.create(effectiveIRI);
    const execution = new ExecutionController(normalizedConfiguration);
    const sourceLocatedStatements = await validateDataset(
      dataset,
      normalizedConfiguration,
      execution,
    );
    const graphSelection = selectOntologyGraph(
      dataset,
      normalizedConfiguration,
    );
    execution.check();
    const diagnostics = [...graphSelection.diagnostics];
    const sourceLocationsByTriple = await reconstructionInputSourceLocations(
      dataset,
      sourceLocatedStatements,
      graphSelection,
      execution,
    );

    return {
      configuration: normalizedConfiguration,
      dataFactory:
        normalizedConfiguration.parsingMode === "preserve"
          ? createSourcePreservingDataFactory(this.#dataFactory)
          : this.#dataFactory,
      dataset: graphSelection.dataset,
      diagnostics,
      documentIRI: normalizedDocumentIRI,
      documentScope: documentScopeFor(normalizedDocumentIRI),
      // Source base IRIs and blank labels can repeat in different documents.
      // This private scope remains stable across every pass of one preparation.
      roleProofScope: (nextRoleProofScope++).toString(),
      execution,
      merged: graphSelection.merged,
      selectedGraph: graphSelection.selectedGraph,
      sourceComplete:
        graphSelection.merged || graphSelection.dataset.size === dataset.size,
      sourceLocationsByTriple,
    };
  }

  /** Prepare a document once; the manager supplies AllDecl after resolving imports. */
  async prepare(dataset, options = {}) {
    const input = await this.#prepareReconstructionInput(dataset, options);
    const transaction = new OntologyTransaction(
      this.#dataFactory,
      input.configuration,
    );
    const interpreter = new RdfGraphInterpreter({
      ...input,
      diagnostics: [],
      transaction,
    });
    await interpreter.discoverDeclarationsAndImports();
    const { ontology } = transaction.commit({ diagnostics: [] });
    const declarations = Object.freeze(
      [...ontology.getAxioms()]
        .filter(({ kind }) => kind === OWLObjectKind.DECLARATION_AXIOM)
        .map(({ entity }) => entity),
    );
    // Network/file retrieval and parsing other documents are not work on this
    // RDF document. Preserve its spent budget across the import-discovery gap.
    input.execution.pause();
    return {
      declarations,
      sourceComplete: input.sourceComplete,
      sourceRoles: interpreter.sourceStructure().roles,
      ontology,
      discoverSourceRoles: async (declarationEntities, sourceRoles, stage) => {
        input.execution.resume();
        const discovery = new RdfGraphInterpreter({
          ...input,
          declarationEntities,
          sourceRoles,
          diagnostics: [],
          transaction: new OntologyTransaction(
            this.#dataFactory,
            input.configuration,
          ),
        });
        try {
          await discovery.discoverSourceRoles(stage);
          return {
            roles: discovery.discoveredNamedRoles(),
            defaultRoles: discovery.discoveredDefaultRoles(),
          };
        } finally {
          input.execution.pause();
        }
      },
      reconstruct: (declarationEntities, sourceRoles) => {
        input.execution.resume();
        return this.#reconstruct(
          input,
          declarationEntities,
          ontology.getOntologyID(),
          sourceRoles,
        );
      },
    };
  }

  async translate(dataset, options = {}) {
    return this.#reconstruct(
      await this.#prepareReconstructionInput(dataset, options),
    );
  }

  async #reconstruct(
    input,
    declarationEntities = [],
    ontologyID,
    sourceRoles = [],
  ) {
    const transaction = new OntologyTransaction(
      this.#dataFactory,
      input.configuration,
    );
    if (ontologyID) transaction.setOntologyID(ontologyID);
    const diagnostics = [...input.diagnostics];
    const interpreter = new RdfGraphInterpreter({
      ...input,
      declarationEntities,
      sourceRoles,
      diagnostics,
      ontologyID,
      transaction,
    });
    await interpreter.interpret();
    input.execution.check();

    return transaction.commit({
      diagnostics,
      ...(input.configuration.parsingMode === "preserve"
        ? { sourceStructure: interpreter.sourceStructure() }
        : {}),
      documentIRI: input.documentIRI,
      merged: input.merged,
      selectedGraph: input.selectedGraph,
    });
  }
}
