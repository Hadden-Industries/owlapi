import {
  XML_NAMESPACE,
  XMLNS_NAMESPACE,
  OWL_NAMESPACE,
  RDFS_NAMESPACE,
  XSD_NAMESPACE,
} from "../../rdfjs/vocabulary.js";
import { parseIri } from "@hyperjump/uri";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
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

const TEXT_NODE = 3;
const LANG_STRING = `${RDF_NAMESPACE}langString`;

const TYPE_IRI = `${RDF_NAMESPACE}type`;
const FIRST_IRI = `${RDF_NAMESPACE}first`;
const REST_IRI = `${RDF_NAMESPACE}rest`;
const NIL_IRI = `${RDF_NAMESPACE}nil`;
// Aligned with the storer's 32 MiB reparse admission; bounded before padding.
const MAX_OUTPUT_BYTES = 33554432;
const MAX_NODE_DEPTH = 128;
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
const SECTION_NAMES = new Map([
  [`${OWL_NAMESPACE}AnnotationProperty`, "Annotation properties"],
  [`${RDFS_NAMESPACE}Datatype`, "Datatypes"],
  [`${OWL_NAMESPACE}ObjectProperty`, "Object Properties"],
  [`${OWL_NAMESPACE}DatatypeProperty`, "Data properties"],
  [`${OWL_NAMESPACE}Class`, "Classes"],
  [`${OWL_NAMESPACE}NamedIndividual`, "Individuals"],
]);
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
const termKey = (term) =>
  JSON.stringify([
    term.termType,
    term.value,
    ...(term.termType === "Literal"
      ? [term.language, term.datatype.value]
      : []),
  ]);
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

const serializeGraph = (dataset, policy, context) => {
  const document = new DOMImplementation().createDocument(
    RDF_NAMESPACE,
    "rdf:RDF",
  );
  const serializer = new XMLSerializer();
  const serialize = (node) =>
    serializer.serializeToString(node, { requireWellFormed: true });
  const utf8 = new TextEncoder();
  let constructionBytes = 0;
  const requireTextBudget = (value) => {
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
      if (bytes > MAX_OUTPUT_BYTES)
        throw new ResourceLimitError("RDF/XML term budget exceeded", {
          limit: MAX_OUTPUT_BYTES,
        });
    }
  };
  const admitNode = (node) => {
    constructionBytes += utf8.encode(serialize(node.cloneNode(false))).length;
    if (constructionBytes > MAX_OUTPUT_BYTES)
      throw new ResourceLimitError("RDF/XML construction budget exceeded", {
        limit: MAX_OUTPUT_BYTES,
      });
  };
  let root = document.documentElement;
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
    if (term.language) requireLanguageTag(term.language);
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
      if (qnameWork > MAX_OUTPUT_BYTES)
        throw new ResourceLimitError("RDF/XML QName work budget exceeded", {
          limit: MAX_OUTPUT_BYTES,
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
      try {
        // The native XML implementation owns NCName/QName grammar, including
        // supplementary Unicode characters. Do not maintain a second regex.
        serialize(document.createElementNS(namespace, `ns:${local}`));
      } catch (error) {
        if (
          error.name === "InvalidCharacterError" ||
          error.name === "InvalidStateError"
        )
          continue;
        throw error;
      }
      const name = { namespace, local };
      predicateNames.set(iri, name);
      return name;
    }
    notRepresentable("The RDF predicate has no legal RDF/XML QName split");
  };

  const triples = [];
  for (const quad of dataset) {
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
    const name = predicateName(quad.predicate.value);
    triples.push({
      quad,
      name,
      keys: [quad.subject, quad.predicate, quad.object].map(termKey),
    });
  }
  triples.sort((left, right) => {
    for (let index = 0; index < left.keys.length; index += 1) {
      if (index === 1) {
        const rank =
          (PREDICATE_PRIORITY.get(left.quad.predicate.value) ?? 1000) -
          (PREDICATE_PRIORITY.get(right.quad.predicate.value) ?? 1000);
        if (rank) return rank;
      }
      const order = compareCodeUnits(left.keys[index], right.keys[index]);
      if (order) return order;
    }
    return 0;
  });

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
  const attribute = (element, namespace, name, value) => {
    // xmldom validates characters of text nodes, but not attribute values.
    // Reuse its XML Char validator before its native attribute escaping.
    requireTextBudget(value);
    serialize(document.createTextNode(value));
    element.setAttributeNS(
      namespace,
      namespace === RDF_NAMESPACE
        ? `${rdfAttributePrefix}:${name.split(":").at(-1)}`
        : name,
      value,
    );
  };
  const subjects = new Map();
  const incoming = new Map();
  for (const triple of triples) {
    if (!subjects.has(triple.keys[0]))
      subjects.set(triple.keys[0], {
        term: triple.quad.subject,
        triples: [],
        type: null,
      });
    subjects.get(triple.keys[0]).triples.push(triple);
    if (triple.quad.object.termType === "BlankNode")
      incoming.set(triple.keys[2], (incoming.get(triple.keys[2]) ?? 0) + 1);
  }
  for (const subject of subjects.values()) {
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
        serialize(document.createElementNS(namespace, `${candidate}:name`));
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
  const namedRoot = document.createElementNS(
    RDF_NAMESPACE,
    rdfPrefix ? `${rdfPrefix}:RDF` : "RDF",
  );
  for (const item of [...root.attributes])
    namedRoot.setAttributeNS(item.namespaceURI, item.name, item.value);
  document.replaceChild(namedRoot, root);
  root = namedRoot;

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
  const renderNode = (
    term,
    ancestors = new Set(),
    depth = 1,
    referenceOnly = false,
  ) => {
    if (depth > MAX_NODE_DEPTH)
      throw new ResourceLimitError("RDF/XML nesting limit exceeded", {
        limit: MAX_NODE_DEPTH,
      });
    const key = termKey(term);
    const subject = referenceOnly ? undefined : subjects.get(key);
    const typeName = subject?.type
      ? predicateName(subject.type.quad.object.value)
      : { namespace: RDF_NAMESPACE, local: "Description" };
    const description = document.createElementNS(
      typeName.namespace,
      elementName(typeName),
    );
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
    if (!subject || emitted.has(key)) return description;
    emitted.add(key);
    const path = new Set([...ancestors, key]);
    for (const triple of subject.triples) {
      if (triple === subject.type) continue;
      const { quad, name, keys } = triple;
      const property = document.createElementNS(
        name.namespace,
        elementName(name),
      );
      if (quad.object.termType === "Literal") {
        if (quad.object.language) {
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
        property.appendChild(document.createTextNode(quad.object.value));
        constructionBytes += utf8.encode(serialize(property)).length;
        if (constructionBytes > MAX_OUTPUT_BYTES)
          throw new ResourceLimitError("RDF/XML construction budget exceeded", {
            limit: MAX_OUTPUT_BYTES,
          });
      } else {
        const list =
          depth < MAX_NODE_DEPTH ? collection(quad.object, path) : null;
        if (list) {
          attribute(property, RDF_NAMESPACE, "rdf:parseType", "Collection");
          admitNode(property);
          for (const cell of list.cells) {
            emitted.add(cell);
            nested.add(cell);
          }
          for (const member of list.members)
            property.appendChild(renderNode(member, path, depth + 1, true));
        } else if (
          quad.object.termType === "BlankNode" &&
          depth < MAX_NODE_DEPTH &&
          incoming.get(keys[2]) === 1 &&
          subjects.has(keys[2]) &&
          !path.has(keys[2]) &&
          !emitted.has(keys[2])
        ) {
          admitNode(property);
          nested.add(keys[2]);
          property.appendChild(renderNode(quad.object, path, depth + 1));
        } else {
          resourceAttribute(property, quad.object, "rdf:resource");
          admitNode(property);
        }
      }
      description.appendChild(property);
    }
    return description;
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
      compareCodeUnits(leftKey, rightKey),
  );
  const safeComment = (text) => {
    const content = text
      .replace(/--+/gu, (match) => [...match].join(" "))
      .replace(/-$/u, "- ");
    // Validate XML Char before admitting a comment; sanitize presentation only.
    serialize(document.createTextNode(content));
    const comment = document.createComment(content);
    admitNode(comment);
    return comment;
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
  const appendSubject = ([key, subject]) => {
    if (emitted.has(key) || nested.has(key)) return;
    const type = subject.type?.quad.object.value;
    const group = context.anonymousIndividuals?.has(subject.term.value)
      ? "Individuals"
      : (SECTION_NAMES.get(type) ?? "General axioms");
    if (policy.banners && type !== `${OWL_NAMESPACE}Ontology`) {
      if (previousGroup !== group) {
        const width = policy.indenting ? policy.indentSize : 0;
        if (width * 7 > MAX_OUTPUT_BYTES - constructionBytes)
          throw new ResourceLimitError(
            "RDF/XML banner indentation budget exceeded",
            { limit: MAX_OUTPUT_BYTES },
          );
        const padding = " ".repeat(width);
        root.appendChild(
          safeComment(
            ` \n${padding}${"/".repeat(87)}\n${padding}//\n${padding}// ${group}\n${padding}//\n${padding}${"/".repeat(87)}\n${padding} `,
          ),
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
        root.appendChild(safeComment(` ${identity} `));
      }
    }
    root.appendChild(renderNode(subject.term));
    for (const [annotationKey, annotation] of annotations.get(key) ?? []) {
      if (!emitted.has(annotationKey))
        root.appendChild(renderNode(annotation.term));
    }
  };
  // Render owned roots first. A remaining cycle/shared node keeps explicit IDs.
  for (const entry of orderedSubjects)
    if (entry[1].term.termType !== "BlankNode" || incoming.get(entry[0]) !== 1)
      appendSubject(entry);
  for (const entry of orderedSubjects) appendSubject(entry);

  let predictedBytes = 0;
  const charge = (text) => {
    // UTF-8 cannot encode fewer than one byte per UTF-16 code unit here.
    if (text.length > MAX_OUTPUT_BYTES - predictedBytes)
      throw new ResourceLimitError("RDF/XML output budget exceeded", {
        limit: MAX_OUTPUT_BYTES,
      });
    predictedBytes += utf8.encode(text).length;
    if (predictedBytes > MAX_OUTPUT_BYTES)
      throw new ResourceLimitError("RDF/XML output budget exceeded", {
        limit: MAX_OUTPUT_BYTES,
      });
  };
  const formatElement = (element, depth) => {
    const children = [...element.childNodes];
    // A literal leaf is indivisible: never inject or normalize its whitespace.
    if (children.some((child) => child.nodeType === TEXT_NODE)) {
      charge(serialize(element));
      return element.cloneNode(true);
    }
    const formatted = element.cloneNode(false);
    charge(serialize(formatted));
    if (!children.length) return formatted;
    const indentation = policy.indenting ? depth * policy.indentSize : 0;
    if (
      !Number.isSafeInteger(indentation) ||
      indentation > MAX_OUTPUT_BYTES - predictedBytes
    )
      throw new ResourceLimitError("RDF/XML indentation budget exceeded", {
        limit: MAX_OUTPUT_BYTES,
      });
    // Charge all padding before constructing even a single large string.
    const whitespaceBytes =
      children.length * (7 + indentation * 2) +
      1 +
      (policy.indenting ? (depth - 1) * policy.indentSize : 0);
    if (
      !Number.isSafeInteger(whitespaceBytes) ||
      whitespaceBytes > MAX_OUTPUT_BYTES - predictedBytes
    )
      throw new ResourceLimitError("RDF/XML indentation budget exceeded", {
        limit: MAX_OUTPUT_BYTES,
      });
    predictedBytes += whitespaceBytes;
    const padding = " ".repeat(indentation);
    let previousChild;
    for (const child of children) {
      const spacing =
        child.nodeType === 8
          ? previousChild?.nodeType === 8
            ? `\n\n\n${padding}\n\n\n`
            : `\n${padding}\n\n\n`
          : previousChild?.nodeType === 8
            ? "\n\n\n"
            : "\n";
      formatted.appendChild(document.createTextNode(`${spacing}${padding}`));
      if (child.nodeType === 1)
        formatted.appendChild(formatElement(child, depth + 1));
      else {
        charge(serialize(child));
        formatted.appendChild(child.cloneNode(true));
      }
      previousChild = child;
    }
    formatted.appendChild(
      document.createTextNode(
        `\n${" ".repeat(policy.indenting ? (depth - 1) * policy.indentSize : 0)}`,
      ),
    );
    return formatted;
  };
  // Append-only construction avoids xmldom's full sibling reindex on insertion.
  document.replaceChild(formatElement(root, 1), root);
  const text = serializer.serializeToString(document, {
    requireWellFormed: true,
    nodeFilter(node) {
      // XML end-of-line normalization would turn literal CR into LF. Native
      // serialization still validates and escapes each intervening segment.
      if (node.nodeType === TEXT_NODE) {
        return node.data
          .split("\r")
          .map((part) =>
            serialize(document.createTextNode(part))
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&apos;"),
          )
          .join("&#xD;");
      }
      return node;
    },
  });
  // Only structural root attributes are wrapped; serialized attribute contents
  // cannot contain a raw quote, so this never rewrites a literal or entity.
  const rootEnd = text.indexOf(">");
  const wrapPadding = (policy.indenting ? policy.indentSize : 0) + 1;
  if (wrapPadding * root.attributes.length > MAX_OUTPUT_BYTES - predictedBytes)
    throw new ResourceLimitError(
      "RDF/XML root attribute padding budget exceeded",
      { limit: MAX_OUTPUT_BYTES },
    );
  const opening = text
    .slice(0, rootEnd)
    .replaceAll(/ (?=(?:xmlns(?::[^=\s]+)?|xml:base)=)/gu, (_, offset) =>
      offset === `<${root.nodeName}`.length
        ? " "
        : `\n${" ".repeat(wrapPadding)}`,
    );
  const output = `<?xml version="1.0" encoding="UTF-8"?>\n${opening}${text.slice(rootEnd)}\n\n\n\n<!-- Generated by @hadden-industries/owlapi (JavaScript implementation; version 0.1.0-rc.1) https://github.com/Hadden-Industries/owlapi -->\n\n\n`;
  if (
    output.length > MAX_OUTPUT_BYTES ||
    utf8.encode(output).length > MAX_OUTPUT_BYTES
  )
    throw new ResourceLimitError("RDF/XML output budget exceeded", {
      limit: MAX_OUTPUT_BYTES,
    });
  return output;
};

/** Serialize one ordinary RDF/JS default graph without ontology inference. */
export const writeRdfXmlGraph = (
  dataset,
  policy = readOntologyWriterConfiguration(
    new OWLOntologyWriterConfiguration(),
  ),
  context = {},
) => {
  try {
    return serializeGraph(dataset, policy, context);
  } catch (cause) {
    if (
      cause instanceof OWLOntologyStorageError ||
      cause instanceof ResourceLimitError
    )
      throw cause;
    return notRepresentable("The RDF graph cannot be represented in RDF/XML", {
      cause,
    });
  }
};
