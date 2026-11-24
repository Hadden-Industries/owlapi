import {
  defaultDocumentStoragePolicy,
  resolveOntologyBehaviorDefinition,
} from "../../behavior/ontologyBehaviorContext.js";
import {
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  OWL_NAMESPACE,
  RDFS_NAMESPACE,
  XSD_NAMESPACE,
} from "../../rdfjs/vocabulary.js";
import { parseIri } from "@hyperjump/uri";
import { validateEmbeddedXmlLiteral } from "./xmlLiteralValidation.js";
import { isNcName } from "../../parsing/xml/xmlNames.js";
import {
  xmlAttribute,
  xmlTextChunks,
  isXmlText,
  utf8Length as byteLength,
} from "../xmlTokens.js";
import { isCompactRdfGraph } from "../../rdfjs/compactRdfGraph.js";
import { compareJsonStrings } from "../../collections/structuralComparator.js";
import {
  collectStorageText,
  failAfterStoragePrefix,
} from "../storageFailureOutput.js";
import { parse as parseLanguageTag } from "bcp-47";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import {
  OWLOntologyWriterConfiguration,
  readOntologyWriterConfiguration,
} from "../../../model/owlOntologyWriterConfiguration.js";
import { RDF_NAMESPACE } from "../../rdfjs/vocabulary.js";

const LANG_STRING = `${RDF_NAMESPACE}langString`;
const nativeCommentPolicies = new Map(
  [
    defaultDocumentStoragePolicy,
    resolveOntologyBehaviorDefinition("java-owlapi-5.5.1")
      .documentStoragePolicy,
  ].map((policy) => [policy, policy.requiresXml10Characters]),
);

const TYPE_IRI = `${RDF_NAMESPACE}type`;
const FIRST_IRI = `${RDF_NAMESPACE}first`;
const REST_IRI = `${RDF_NAMESPACE}rest`;
const NIL_IRI = `${RDF_NAMESPACE}nil`;
// Aligned with the storer's 32 MiB reparse admission; bounded before padding.

const TYPE_PRIORITY = [
  ...[
    "Ontology",
    "AnnotationProperty",
    "ObjectProperty",
    "DatatypeProperty",
    "Class",
    "NamedIndividual",
    "Restriction",
    "Axiom",
    "AllDifferent",
    "AllDisjointClasses",
    "AllDisjointProperties",
    "NegativePropertyAssertion",
  ].map((name) => `${OWL_NAMESPACE}${name}`),
];
TYPE_PRIORITY.splice(2, 0, `${RDFS_NAMESPACE}Datatype`);
const STANDARD_PREFIXES = new Map([
  [RDF_NAMESPACE, "rdf"],
  [OWL_NAMESPACE, "owl"],
  [RDFS_NAMESPACE, "rdfs"],
  [XSD_NAMESPACE, "xsd"],
  ["http://www.w3.org/2004/02/skos/core#", "skos"],
  ["http://purl.org/dc/elements/1.1/", "dc"],
  ["http://purl.org/dc/terms/", "dcterms"],
]);
const PREDICATE_PRIORITY = new Map(
  [
    TYPE_IRI,
    FIRST_IRI,
    REST_IRI,
    `${OWL_NAMESPACE}equivalentClass`,
    `${OWL_NAMESPACE}equivalentProperty`,
    `${RDFS_NAMESPACE}subClassOf`,
    `${RDFS_NAMESPACE}subPropertyOf`,
    `${RDFS_NAMESPACE}domain`,
    `${RDFS_NAMESPACE}range`,
    `${OWL_NAMESPACE}disjointWith`,
    `${OWL_NAMESPACE}onProperty`,
    `${OWL_NAMESPACE}dataRange`,
    `${OWL_NAMESPACE}onClass`,
    `${OWL_NAMESPACE}annotatedSource`,
    `${OWL_NAMESPACE}annotatedProperty`,
    `${OWL_NAMESPACE}annotatedTarget`,
    `${OWL_NAMESPACE}versionIRI`,
    `${OWL_NAMESPACE}imports`,
  ].map((iri, index) => [iri, index]),
);
import { rdfEntitySectionName } from "../rdfEntitySections.js";
// RDF/XML 1.1 sections 7.2.2-7.2.6 and 7.4: rdf:li rewrites to rdf:_n,
// so it too cannot represent a predicate with its literal input identity.
const RESERVED_PREDICATES = new Set(
  [
    "RDF",
    "ID",
    "about",
    "parseType",
    "resource",
    "nodeID",
    "datatype",
    "Description",
    "li",
    "aboutEach",
    "aboutEachPrefix",
    "bagID",
  ].map((local) => `${RDF_NAMESPACE}${local}`),
);
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

/** A subject owns an interval in one sorted row index, independent of its degree. */
class SubjectTriples {
  constructor(rows, start, end, read) {
    this.rows = rows;
    this.start = start;
    this.end = end;
    this.read = read;
  }

  get length() {
    return this.end - this.start;
  }

  *[Symbol.iterator]() {
    for (let i = this.start; i < this.end; i++) yield this.read(this.rows[i]);
  }

  find(predicate) {
    return this[Symbol.iterator]().find(predicate);
  }

  filter(predicate) {
    return this[Symbol.iterator]().filter(predicate).toArray();
  }
}
const notRepresentable = (message, details = {}) => {
  throw new OWLOntologyStorageError(message, {
    ...details,
    reason: "ONTOLOGY_NOT_REPRESENTABLE",
  });
};

const requireLanguageTag = (language) => {
  let invalid = false;
  const parsed = parseLanguageTag(language, {
    normalize: false,
    forgiving: false,
    warning() {
      invalid = true;
    },
  });
  if (
    invalid ||
    !(
      parsed.language ||
      parsed.regular ||
      parsed.irregular ||
      parsed.privateuse.length
    )
  ) {
    notRepresentable(
      "RDF language literals require a valid BCP 47 language tag",
    );
  }
  if (language !== language.toLowerCase()) {
    notRepresentable("RDF literal language tags must already be normalized");
  }
};

function* serializeGraph(dataset, policy, context) {
  const compact = isCompactRdfGraph(dataset);
  // Only cache encoded primitive identities, within this write. Read the term
  // fields in their original order on every call, including foreign getters.
  // Literal lexical/language/datatype metadata retains its full encoding path.
  const resourceKeys = new Map([
    ["NamedNode", new Map()],
    ["BlankNode", new Map()],
  ]);
  const termKey = compact
    ? (term) => dataset.termId(term)
    : (term) => {
        const type = term.termType;
        const value = term.value;
        const literal = term.termType === "Literal";
        const cache =
          !literal && typeof value === "string" && resourceKeys.get(type);
        if (cache) {
          let key = cache.get(value);
          if (key === undefined) {
            // json-identity-contract: ordered-tuple; owner: RDF/XML graph writer; reason: Preserve the existing ordered RDF term type/value encoding used for deterministic graph order.
            key = JSON.stringify([type, value]);
            cache.set(value, key);
          }
          return key;
        }
        return JSON.stringify([
          type,
          value,
          ...(literal ? [term.language, term.datatype.value] : []),
        ]);
      };
  const documentStoragePolicy =
    context.documentStoragePolicy ?? defaultDocumentStoragePolicy;
  const indentationSize = policy.indenting ? Math.max(0, policy.indentSize) : 0;
  const nativeCommentPolicy = nativeCommentPolicies.get(documentStoragePolicy);
  const checkCharacters = (value) => {
    if (documentStoragePolicy.requiresXml10Characters && !isXmlText(value))
      notRepresentable("RDF/XML requires XML 1.0-compatible characters");
  };
  let constructionBytes = 0;
  const requireTextBudget = (value) => {
    // The existing escaped-text counter charges at most six bytes per UTF-16 unit.
    if (
      typeof value === "string" &&
      value.length * 6 <= documentStoragePolicy.maxOutputBytes
    )
      return;
    let bytes = 0;
    for (const character of value) {
      const code = character.codePointAt(0);
      bytes +=
        character === "&"
          ? 5
          : character === "<" || character === ">"
            ? 4
            : character === "\r"
              ? 6
              : code > 0xffff
                ? 4
                : code > 0x7ff
                  ? 3
                  : code > 0x7f
                    ? 2
                    : 1;
      if (bytes > documentStoragePolicy.maxOutputBytes)
        throw new ResourceLimitError("RDF/XML term budget exceeded", {
          limit: documentStoragePolicy.maxOutputBytes,
        });
    }
  };
  const element = (namespace, name) => ({ namespace, name, attributes: [] });
  const opening = (node) =>
    node.opening ??
    "<" + node.name + node.attributes.map((a) => " " + a.text).join("");
  // Previous admission charges standalone elements, including namespace
  // declarations needed outside their normal document scope.
  const standaloneSize = (node, text) => {
    if (documentStoragePolicy.maxOutputBytes === Infinity) return 0;
    const bound = new Map();
    for (const a of node.attributes)
      if (a.namespace === XMLNS_NAMESPACE)
        bound.set(a.name === "xmlns" ? "" : a.name.slice(6), a.value);
    const qualify = (name, namespace) => {
      if (
        !namespace ||
        namespace === XMLNS_NAMESPACE ||
        namespace === XML_NAMESPACE
      )
        return 0;
      const prefix = name.includes(":") ? name.split(":")[0] : "";
      if (bound.get(prefix) === namespace) return 0;
      bound.set(prefix, namespace);
      return byteLength(
        " " + xmlAttribute(prefix ? "xmlns:" + prefix : "xmlns", namespace),
      );
    };
    let bytes = byteLength(opening(node)) + qualify(node.name, node.namespace);
    for (const a of node.attributes) bytes += qualify(a.name, a.namespace);
    if (text === undefined) return bytes + 2;
    for (const fragment of xmlTextChunks(text, "native"))
      bytes += byteLength(fragment);
    return bytes + byteLength("></" + node.name + ">");
  };
  const chargeConstruction = (bytes) => {
    constructionBytes += bytes;
    if (constructionBytes > documentStoragePolicy.maxOutputBytes)
      throw new ResourceLimitError("RDF/XML construction budget exceeded", {
        limit: documentStoragePolicy.maxOutputBytes,
      });
  };
  const admitNode = (node, text) => {
    // Native finite budgets charge the same detached header during
    // construction and output prediction. Only the active node retains it.
    if (nativeCommentPolicy === true) node.opening = opening(node);
    const size = standaloneSize(node, text);
    if (nativeCommentPolicy === true) node.standaloneBytes = size;
    chargeConstruction(size);
  };
  const root = element(RDF_NAMESPACE, "rdf:RDF");
  const validatedIris = new Set();
  const requireNamedNode = (term) => {
    if (term?.termType !== "NamedNode" || typeof term.value !== "string") {
      notRepresentable("This RDF position requires a named node");
    }
    if (!validatedIris.has(term.value)) {
      requireTextBudget(term.value);
      if (!term.value.isWellFormed()) {
        notRepresentable("RDF/XML requires well-formed full IRIs");
      }
      try {
        parseIri(term.value);
      } catch {
        notRepresentable("RDF/XML requires well-formed full IRIs");
      }
      validatedIris.add(term.value);
    }
  };
  const requireResource = (term) => {
    if (term?.termType === "BlankNode") {
      if (typeof term.value !== "string" || !term.value) {
        notRepresentable("RDF blank nodes require a nonempty identifier");
      }
    } else {
      requireNamedNode(term);
    }
  };
  const requireObject = (term) => {
    if (term?.termType !== "Literal") return requireResource(term);
    if (
      typeof term.value !== "string" ||
      typeof term.language !== "string" ||
      (term.direction !== undefined && term.direction !== "")
    ) {
      notRepresentable("Only ordinary RDF 1.1 literal metadata is supported");
    }
    requireNamedNode(term.datatype);
    if (Boolean(term.language) !== (term.datatype.value === LANG_STRING)) {
      notRepresentable(
        "An RDF language tag and rdf:langString datatype must occur together",
      );
    }
    if (term.language && documentStoragePolicy.validatesRdfLanguageTags)
      requireLanguageTag(term.language);
    requireTextBudget(term.value);
    // RDF/XML 1.1 section 8 explicitly excludes this RDF 1.1 datatype.
    if (term.datatype.value === `${RDF_NAMESPACE}HTML`) {
      notRepresentable("RDF/XML 1.1 cannot serialize the rdf:HTML datatype");
    }
  };

  const predicateNames = new Map();
  let qnameWork = 0;
  const predicateName = (iri) => {
    if (predicateNames.has(iri)) return predicateNames.get(iri);
    if (RESERVED_PREDICATES.has(iri)) {
      notRepresentable(
        "An RDF/XML syntax name cannot be serialized as a predicate",
      );
    }
    const characters = [...iri];
    const splits = [...characters.keys()]
      .filter((split) => split > 0)
      .reverse();
    const boundaries = splits.filter((split) =>
      ["#", "/", ":"].includes(characters[split - 1]),
    );
    const boundarySet = new Set(boundaries);
    for (const split of [
      ...boundaries,
      ...splits.filter((split) => !boundarySet.has(split)),
    ]) {
      // Charge candidate character work before copying or validating suffixes.
      // Native QName grammar remains authoritative, including fallback splits.
      qnameWork += iri.length;
      if (qnameWork > documentStoragePolicy.maxOutputBytes)
        throw new ResourceLimitError("RDF/XML QName work budget exceeded", {
          limit: documentStoragePolicy.maxOutputBytes,
        });
      const namespace = characters.slice(0, split).join("");
      // RDF/XML section 5.1 forbids extending the RDF namespace name.
      if (
        (namespace.startsWith(RDF_NAMESPACE) && namespace !== RDF_NAMESPACE) ||
        namespace === XMLNS_NAMESPACE ||
        namespace === XML_NAMESPACE
      )
        continue;
      try {
        parseIri(namespace);
      } catch {
        continue;
      }
      const local = characters.slice(split).join("");
      if (!isNcName(local)) continue;
      const name = { namespace, local };
      predicateNames.set(iri, name);
      return name;
    }
    notRepresentable("The RDF predicate has no legal RDF/XML QName split");
  };

  function admitQuad(quad) {
    if (
      quad?.termType !== "Quad" ||
      quad.value !== "" ||
      quad.graph?.termType !== "DefaultGraph" ||
      quad.graph.value !== ""
    ) {
      notRepresentable("RDF/XML storage requires one ordinary default graph");
    }
    requireResource(quad.subject);
    requireNamedNode(quad.predicate);
    requireObject(quad.object);
    return predicateName(quad.predicate.value);
  }
  let sortedRows, compareKeys, tripleAt;
  if (compact) {
    const count = dataset.termCount;
    const order = Uint32Array.from({ length: count }, (_, id) => id);
    order.sort((a, b) => {
      const left = dataset.termById(a),
        right = dataset.termById(b);
      return (
        compareJsonStrings(left.termType, right.termType) ||
        compareJsonStrings(left.value, right.value) ||
        (left.termType === "Literal"
          ? compareJsonStrings(left.language, right.language) ||
            compareJsonStrings(left.datatype.value, right.datatype.value)
          : 0)
      );
    });
    const ranks = new Uint32Array(count);
    order.forEach((id, rank) => {
      ranks[id] = rank;
    });
    compareKeys = (a, b) => ranks[a] - ranks[b];
    for (const quad of dataset) admitQuad(quad);
    sortedRows = new Uint32Array(dataset.size);
    let index = 0;
    dataset.forEachMatchingRow(
      undefined,
      undefined,
      undefined,
      undefined,
      (row) => {
        sortedRows[index++] = row;
      },
    );
    sortedRows.sort((left, right) => {
      for (let column = 0; column < 3; column++) {
        const a = dataset.rowTermId(left, column),
          b = dataset.rowTermId(right, column);
        if (column === 1) {
          const priority =
            (PREDICATE_PRIORITY.get(dataset.termById(a).value) ?? 1000) -
            (PREDICATE_PRIORITY.get(dataset.termById(b).value) ?? 1000);
          if (priority) return priority;
        }
        if (a !== b) return compareKeys(a, b);
      }
      return 0;
    });
    tripleAt = (row) => {
      const quad = dataset.statementAt(row);
      return {
        row,
        quad,
        name: predicateNames.get(quad.predicate.value),
        keys: [
          dataset.rowTermId(row, 0),
          dataset.rowTermId(row, 1),
          dataset.rowTermId(row, 2),
        ],
      };
    };
  } else {
    // Foreign terms retain their own getters and the established ordered key
    // encoding. The package graph is the only trusted integer dictionary.
    sortedRows = [];
    for (const quad of dataset)
      sortedRows.push({
        quad,
        name: admitQuad(quad),
        keys: [quad.subject, quad.predicate, quad.object].map(termKey),
      });
    compareKeys = compareCodeUnits;
    sortedRows.sort((left, right) => {
      for (let index = 0; index < 3; index++) {
        if (index === 1) {
          const rank =
            (PREDICATE_PRIORITY.get(left.quad.predicate.value) ?? 1000) -
            (PREDICATE_PRIORITY.get(right.quad.predicate.value) ?? 1000);
          if (rank) return rank;
        }
        const order = compareKeys(left.keys[index], right.keys[index]);
        if (order) return order;
      }
      return 0;
    });
    tripleAt = (entry) => entry;
  }
  const declarations = new Map(context.prefixes ?? []);
  if (
    ![...declarations].some(
      ([name, namespace]) => name !== ":" && namespace === RDF_NAMESPACE,
    )
  ) {
    let name = "rdf";
    while (declarations.has(`${name}:`)) name += "_";
    declarations.set(`${name}:`, RDF_NAMESPACE);
  }
  const defaultNamespace = declarations.get(":") ?? context.defaultNamespace;
  const rdfAliases = [...declarations]
    .filter(([name, namespace]) => name !== ":" && namespace === RDF_NAMESPACE)
    .map(([name]) => name.slice(0, -1));
  const rdfAttributePrefix =
    defaultNamespace === RDF_NAMESPACE ? rdfAliases[0] : rdfAliases.at(-1);
  const attribute = (node, namespace, name, value) => {
    requireTextBudget(value);
    checkCharacters(value);
    if (namespace === RDF_NAMESPACE)
      name = rdfAttributePrefix + ":" + name.split(":").at(-1);
    if (!name.split(":").every(isNcName))
      notRepresentable("The namespace prefix is not an XML name");
    node.attributes.push({
      namespace,
      name,
      value,
      text: xmlAttribute(name, value),
    });
  };
  const subjects = new Map();
  const incoming = new Map();
  for (let index = 0; index < sortedRows.length;) {
    const start = index,
      first = tripleAt(sortedRows[index]),
      key = first.keys[0];
    do {
      const triple = tripleAt(sortedRows[index]);
      if (triple.keys[0] !== key) break;
      if (triple.quad.object.termType === "BlankNode")
        incoming.set(triple.keys[2], (incoming.get(triple.keys[2]) ?? 0) + 1);
      index++;
    } while (index < sortedRows.length);
    const triples = new SubjectTriples(sortedRows, start, index, tripleAt);
    subjects.set(key, { term: first.quad.subject, triples, type: null });
  }
  for (const subject of subjects.values()) {
    if (compact) {
      let best = Infinity;
      for (const triple of subject.triples) {
        if (
          triple.quad.predicate.value !== TYPE_IRI ||
          triple.quad.object.termType !== "NamedNode"
        )
          continue;
        const rank = TYPE_PRIORITY.indexOf(triple.quad.object.value);
        if (rank >= 0 && rank < best) {
          best = rank;
          subject.type = triple;
        }
      }
    } else
      subject.type =
        TYPE_PRIORITY.map((iri) =>
          subject.triples.find(
            ({ quad }) =>
              quad.predicate.value === TYPE_IRI &&
              quad.object.termType === "NamedNode" &&
              quad.object.value === iri,
          ),
        ).find(Boolean) ?? null;
    if (subject.type) predicateName(subject.type.quad.object.value);
  }
  const prefixes = new Map();
  if (defaultNamespace) {
    requireNamedNode({ termType: "NamedNode", value: defaultNamespace });
    attribute(root, XMLNS_NAMESPACE, "xmlns", defaultNamespace);
    attribute(
      root,
      XML_NAMESPACE,
      "xml:base",
      defaultNamespace.endsWith("#")
        ? defaultNamespace.slice(0, -1)
        : defaultNamespace,
    );
  }
  for (const [name, namespace] of declarations)
    if (name !== ":") prefixes.set(namespace, name.slice(0, -1));
  if (defaultNamespace) prefixes.set(defaultNamespace, "");
  const namespaces = [
    ...new Set([...predicateNames.values()].map(({ namespace }) => namespace)),
  ].sort(compareCodeUnits);
  const usedPrefixes = new Set([
    ...STANDARD_PREFIXES.values(),
    ...[...declarations.keys()].map((name) => name.slice(0, -1)),
  ]);
  namespaces.forEach((namespace, index) => {
    if (prefixes.has(namespace)) return;
    let prefix = STANDARD_PREFIXES.get(namespace);
    if (
      prefix &&
      declarations.has(`${prefix}:`) &&
      declarations.get(`${prefix}:`) !== namespace
    )
      prefix = undefined;
    if (!prefix) {
      const segments = namespace.replace(/[#/:]+$/u, "").split(/[#/:]/u);
      const candidate = segments.at(-1);
      try {
        if (!isNcName(candidate)) throw new Error("Invalid XML prefix");
        if (
          !candidate ||
          candidate.toLowerCase().startsWith("xml") ||
          usedPrefixes.has(candidate)
        )
          throw new Error("Unavailable prefix");
        prefix = candidate;
      } catch {
        prefix = `ns${index}`;
      }
      while (usedPrefixes.has(prefix)) prefix += "_";
    }
    usedPrefixes.add(prefix);
    prefixes.set(namespace, prefix);
    declarations.set(`${prefix}:`, namespace);
  });
  for (const [name, namespace] of [...declarations]
    .filter(([name]) => name !== ":")
    .sort(([a], [b]) => a.length - b.length || compareCodeUnits(a, b)))
    attribute(root, XMLNS_NAMESPACE, `xmlns:${name.slice(0, -1)}`, namespace);
  const rdfPrefix = prefixes.get(RDF_NAMESPACE);
  root.name = rdfPrefix ? rdfPrefix + ":RDF" : "RDF";

  const blankLabels = new Map();
  const resourceAttribute = (element, term, namedAttribute) => {
    if (term.termType === "NamedNode") {
      attribute(element, RDF_NAMESPACE, namedAttribute, term.value);
    } else {
      if (!blankLabels.has(term.value))
        blankLabels.set(term.value, `genid${blankLabels.size}`);
      attribute(
        element,
        RDF_NAMESPACE,
        "rdf:nodeID",
        blankLabels.get(term.value),
      );
    }
  };
  const emitted = new Set();
  const nested = new Set();
  // Collection syntax allocates fresh cells. Admit only an exclusive chain of
  // pure, untyped cells, resource members, and the exact rdf:nil terminator.
  const collection = (term, ancestors) => {
    if (term.termType !== "BlankNode") return null;
    const cells = [];
    const members = [];
    const seen = new Set(ancestors);
    let current = term;
    while (current.termType === "BlankNode") {
      const key = termKey(current);
      const cell = subjects.get(key);
      if (
        seen.has(key) ||
        emitted.has(key) ||
        incoming.get(key) !== 1 ||
        !cell ||
        cell.triples.length !== 2
      )
        return null;
      seen.add(key);
      const first = cell.triples.find(
        ({ quad }) => quad.predicate.value === FIRST_IRI,
      );
      const rest = cell.triples.find(
        ({ quad }) => quad.predicate.value === REST_IRI,
      );
      if (!first || !rest || first.quad.object.termType === "Literal")
        return null;
      cells.push(key);
      members.push(first.quad.object);
      current = rest.quad.object;
    }
    if (
      current.termType !== "NamedNode" ||
      current.value !== NIL_IRI ||
      members.some((member) => seen.has(termKey(member)))
    )
      return null;
    return { cells, members };
  };
  const elementName = (name) =>
    prefixes.get(name.namespace)
      ? `${prefixes.get(name.namespace)}:${name.local}`
      : name.local;
  const renderNode = function* (
    term,
    ancestors = new Set(),
    depth = 1,
    referenceOnly = false,
  ) {
    if (depth > documentStoragePolicy.maxRdfXmlNodeDepth)
      throw new ResourceLimitError("RDF/XML nesting limit exceeded", {
        limit: documentStoragePolicy.maxRdfXmlNodeDepth,
      });
    const key = termKey(term);
    const subject = referenceOnly ? undefined : subjects.get(key);
    const typeName = subject?.type
      ? predicateName(subject.type.quad.object.value)
      : { namespace: RDF_NAMESPACE, local: "Description" };
    const description = element(typeName.namespace, elementName(typeName));
    const persistId =
      policy.saveIds &&
      (context.anonymousIndividuals?.has(term.value) ||
        [
          "Axiom",
          "AllDifferent",
          "AllDisjointClasses",
          "AllDisjointProperties",
          "NegativePropertyAssertion",
        ].some(
          (name) =>
            subject?.type?.quad.object.value === `${OWL_NAMESPACE}${name}`,
        ));
    if (
      term.termType !== "BlankNode" ||
      referenceOnly ||
      persistId ||
      incoming.get(key) > 1 ||
      (depth === 1 && incoming.has(key))
    )
      resourceAttribute(description, term, "rdf:about");
    admitNode(description);
    yield { kind: "start", node: description };
    if (!subject || emitted.has(key)) {
      yield { kind: "end" };
      return;
    }
    emitted.add(key);
    const path = new Set([...ancestors, key]);
    for (const triple of subject.triples) {
      if (
        triple === subject.type ||
        (compact && triple.row === subject.type?.row)
      )
        continue;
      const { quad, name, keys } = triple;
      const property = element(name.namespace, elementName(name));
      if (quad.object.termType === "Literal") {
        const embedsXmlLiteral =
          documentStoragePolicy.xmlLiteralRepresentation === "embedded" &&
          quad.object.datatype.value === RDF_NAMESPACE + "XMLLiteral";
        if (embedsXmlLiteral) {
          attribute(property, RDF_NAMESPACE, "rdf:parseType", "Literal");
        } else if (quad.object.language) {
          attribute(property, XML_NAMESPACE, "xml:lang", quad.object.language);
        } else if (
          context.forceXsdString ||
          quad.object.datatype.value !== XSD_NAMESPACE + "string"
        ) {
          attribute(
            property,
            RDF_NAMESPACE,
            "rdf:datatype",
            quad.object.datatype.value,
          );
        }
        checkCharacters(quad.object.value);
        admitNode(property, quad.object.value);
        yield {
          kind: "literal",
          node: property,
          text: quad.object.value,
          embedded: embedsXmlLiteral,
        };
      } else {
        const list =
          depth < documentStoragePolicy.maxRdfXmlNodeDepth
            ? collection(quad.object, path)
            : null;
        if (list) {
          attribute(property, RDF_NAMESPACE, "rdf:parseType", "Collection");
          admitNode(property);
          yield { kind: "start", node: property };
          for (const cell of list.cells) {
            emitted.add(cell);
            nested.add(cell);
          }
          for (const member of list.members)
            yield* renderNode(member, path, depth + 1, true);
        } else if (
          quad.object.termType === "BlankNode" &&
          depth < documentStoragePolicy.maxRdfXmlNodeDepth &&
          incoming.get(keys[2]) === 1 &&
          (subjects.has(keys[2]) ||
            (documentStoragePolicy.inlinesEmptyAnonymousIndividuals &&
              !policy.saveIds &&
              context.anonymousIndividuals?.has(quad.object.value))) &&
          !path.has(keys[2]) &&
          !emitted.has(keys[2])
        ) {
          admitNode(property);
          yield { kind: "start", node: property };
          nested.add(keys[2]);
          yield* renderNode(quad.object, path, depth + 1);
        } else {
          resourceAttribute(property, quad.object, "rdf:resource");
          admitNode(property);
          yield { kind: "start", node: property };
        }
        yield { kind: "end" };
      }
    }
    yield { kind: "end" };
  };
  const groupRank = (subject) =>
    context.anonymousIndividuals?.has(subject.term.value)
      ? TYPE_PRIORITY.indexOf(`${OWL_NAMESPACE}NamedIndividual`)
      : subject.type
        ? TYPE_PRIORITY.indexOf(subject.type.quad.object.value)
        : TYPE_PRIORITY.length;
  const orderedSubjects = [...subjects.entries()].sort(
    ([leftKey, left], [rightKey, right]) =>
      groupRank(left) - groupRank(right) ||
      Number(left.term.termType === "BlankNode") -
        Number(right.term.termType === "BlankNode") ||
      compareKeys(leftKey, rightKey),
  );
  const safeComment = (label) => {
    const content = label
      .replace(/--+/gu, (match) => [...match].join(" "))
      .replace(/-$/u, "- ");
    if (nativeCommentPolicy !== false) checkCharacters(content);
    const text = "<!--" + content + "-->";
    chargeConstruction(byteLength(text));
    return { kind: "comment", text };
  };
  let previousGroup;
  const annotations = new Map();
  for (const entry of orderedSubjects) {
    if (entry[1].type?.quad.object.value !== `${OWL_NAMESPACE}Axiom`) continue;
    const source = entry[1].triples.find(
      ({ quad }) => quad.predicate.value === `${OWL_NAMESPACE}annotatedSource`,
    );
    if (source?.quad.object.termType !== "NamedNode") continue;
    const owner = termKey(source.quad.object);
    if (!subjects.has(owner)) continue;
    if (!annotations.has(owner)) annotations.set(owner, []);
    annotations.get(owner).push(entry);
  }
  const appendSubject = function* ([key, subject]) {
    if (emitted.has(key) || nested.has(key)) return;
    const type = subject.type?.quad.object.value;
    const group = context.anonymousIndividuals?.has(subject.term.value)
      ? "Individuals"
      : (rdfEntitySectionName(type) ?? "General axioms");
    if (policy.banners && type !== `${OWL_NAMESPACE}Ontology`) {
      if (previousGroup !== group) {
        const width = policy.indenting ? indentationSize : 0;
        if (
          width * 7 >
          documentStoragePolicy.maxOutputBytes - constructionBytes
        )
          throw new ResourceLimitError(
            "RDF/XML banner indentation budget exceeded",
            { limit: documentStoragePolicy.maxOutputBytes },
          );
        const padding = " ".repeat(width);
        yield safeComment(
          ` \n${padding}${"/".repeat(87)}\n${padding}//\n${padding}// ${group}\n${padding}//\n${padding}${"/".repeat(87)}\n${padding} `,
        );
      }
      previousGroup = group;
      if (subject.term.termType === "NamedNode") {
        const labels = subject.triples
          .filter(
            ({ quad }) =>
              quad.predicate.value === `${RDFS_NAMESPACE}label` &&
              quad.object.termType === "Literal",
          )
          .sort(
            (left, right) =>
              compareCodeUnits(
                left.quad.object.language,
                right.quad.object.language,
              ) ||
              compareCodeUnits(
                left.quad.object.value,
                right.quad.object.value,
              ) ||
              compareCodeUnits(
                left.quad.object.datatype.value,
                right.quad.object.datatype.value,
              ),
          );
        const identity =
          policy.labelsAsBanner && labels.length
            ? labels[0].quad.object.value
            : policy.labelsAsBanner
              ? (() => {
                  const parsed = parseIri(subject.term.value);
                  return (
                    parsed.fragment ||
                    parsed.path.split(/[/:]/u).at(-1) ||
                    subject.term.value
                  );
                })()
              : subject.term.value;
        yield safeComment(` ${identity} `);
      }
    }
    yield* renderNode(subject.term);
    for (const [annotationKey, annotation] of annotations.get(key) ?? []) {
      if (!emitted.has(annotationKey)) yield* renderNode(annotation.term);
    }
  };
  function* events() {
    // Emit owned roots first. Cycles and shared nodes retain explicit IDs.
    yield { kind: "start", node: root };
    for (const entry of orderedSubjects)
      if (
        entry[1].term.termType !== "BlankNode" ||
        incoming.get(entry[0]) !== 1
      )
        yield* appendSubject(entry);
    for (const entry of orderedSubjects) yield* appendSubject(entry);
    yield { kind: "end" };
  }

  const limit = documentStoragePolicy.maxOutputBytes;
  let predicted = 0;
  const charge = (amount, kind = "output") => {
    predicted += amount;
    if (!Number.isSafeInteger(predicted) || predicted > limit)
      throw new ResourceLimitError("RDF/XML " + kind + " budget exceeded", {
        limit,
      });
  };
  const padding = (depth) => {
    const width = depth * indentationSize;
    if (!Number.isSafeInteger(width) || width > limit)
      throw new ResourceLimitError("RDF/XML indentation budget exceeded", {
        limit,
      });
    return " ".repeat(width);
  };
  const wrap = indentationSize + 1;
  if (wrap * root.attributes.length > limit)
    throw new ResourceLimitError(
      "RDF/XML root attribute padding budget exceeded",
      { limit },
    );
  const rootStart =
    "<" +
    root.name +
    root.attributes
      .map((a, i) => (i ? "\n" + " ".repeat(wrap) : " ") + a.text)
      .join("");
  const declaration =
    documentStoragePolicy.xmlDeclaration ??
    '<?xml version="1.0" encoding="UTF-8"?>';
  const stack = [];
  yield declaration + "\n";
  for (const event of events()) {
    const parent = stack.at(-1);
    if (event.kind === "end") {
      const finished = stack.pop();
      if (finished.children) {
        charge(1 + stack.length * indentationSize, "indentation");
        yield "\n" + padding(stack.length) + "</" + finished.node.name + ">";
      } else yield finished.start + "/>";
      continue;
    }
    const comment = event.kind === "comment";
    if (parent) {
      if (!parent.children) yield parent.start + ">";
      const depth = stack.length;
      charge(7 + depth * indentationSize * 2, "indentation");
      const indent = padding(depth);
      const spacing = comment
        ? parent.comment
          ? "\n\n\n" + indent + "\n\n\n"
          : "\n" + indent + "\n\n\n"
        : parent.comment
          ? "\n\n\n"
          : "\n";
      yield spacing + indent;
      parent.children = true;
      parent.comment = comment;
    }
    if (comment) {
      charge(byteLength(event.text));
      yield event.text;
      continue;
    }
    charge(
      event.node.standaloneBytes ?? standaloneSize(event.node, event.text),
    );
    const start = parent ? opening(event.node) : rootStart;
    if (event.kind === "start") {
      stack.push({ node: event.node, start, children: false, comment: false });
    } else {
      yield start + ">";
      if (event.embedded) {
        try {
          validateEmbeddedXmlLiteral(event.text);
        } catch (cause) {
          failAfterStoragePrefix(
            new OWLOntologyStorageError("XML literal is not self contained", {
              cause,
            }),
          );
        }
        yield event.text;
      } else yield* xmlTextChunks(event.text, "rdf");
      yield "</" + event.node.name + ">";
    }
  }
  charge(wrap * root.attributes.length, "root attribute padding");
  yield "\n\n\n\n<!-- Generated by @hadden-industries/owlapi (JavaScript implementation; version 0.1.0-rc.1) https://github.com/Hadden-Industries/owlapi -->\n\n\n";
}

/** Deterministic output fragments; only embedded XML literals use an XML parser. */
export function* rdfXmlGraphChunks(
  dataset,
  policy = readOntologyWriterConfiguration(
    new OWLOntologyWriterConfiguration(),
  ),
  context = {},
) {
  try {
    const limit = (
      context.documentStoragePolicy ?? defaultDocumentStoragePolicy
    ).maxOutputBytes;
    let bytes = 0;
    for (const fragment of serializeGraph(dataset, policy, context)) {
      if (limit !== Infinity) bytes += byteLength(fragment);
      if (bytes > limit)
        throw new ResourceLimitError("RDF/XML output budget exceeded", {
          limit,
        });
      yield fragment;
    }
  } catch (cause) {
    if (
      cause instanceof OWLOntologyStorageError ||
      cause instanceof ResourceLimitError
    )
      throw cause;
    notRepresentable("The RDF graph cannot be represented in RDF/XML", {
      cause,
    });
  }
}

/** Serialize one ordinary RDF/JS default graph without ontology inference. */
export const writeRdfXmlGraph = (...args) =>
  collectStorageText(rdfXmlGraphChunks(...args));
