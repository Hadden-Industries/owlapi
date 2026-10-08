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

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const TEXT_NODE = 3;
const LANG_STRING = `${RDF_NAMESPACE}langString`;
const OWL_NAMESPACE = "http://www.w3.org/2002/07/owl#";
const RDFS_NAMESPACE = "http://www.w3.org/2000/01/rdf-schema#";
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
    "DatatypeProperty",
    "ObjectProperty",
    "Class",
    "NamedIndividual",
    "Restriction",
    "Axiom",
    "AllDifferent",
    "AllDisjointClasses",
    "AllDisjointProperties",
    "NegativePropertyAssertion",
  ].map((name) => `${OWL_NAMESPACE}${name}`),
  `${RDFS_NAMESPACE}Datatype`,
];
const STANDARD_PREFIXES = new Map([
  [RDF_NAMESPACE, "rdf"],
  [OWL_NAMESPACE, "owl"],
  [RDFS_NAMESPACE, "rdfs"],
  ["http://www.w3.org/2001/XMLSchema#", "xsd"],
  ["http://www.w3.org/2004/02/skos/core#", "skos"],
  ["http://purl.org/dc/elements/1.1/", "dc"],
  ["http://purl.org/dc/terms/", "dcterms"],
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

const serializeGraph = (dataset, policy) => {
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
  const root = document.documentElement;
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
      const order = compareCodeUnits(left.keys[index], right.keys[index]);
      if (order) return order;
    }
    return 0;
  });

  const attribute = (element, namespace, name, value) => {
    // xmldom validates characters of text nodes, but not attribute values.
    // Reuse its XML Char validator before its native attribute escaping.
    requireTextBudget(value);
    serialize(document.createTextNode(value));
    element.setAttributeNS(namespace, name, value);
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
  const prefixes = new Map([[RDF_NAMESPACE, "rdf"]]);
  attribute(root, XMLNS_NAMESPACE, "xmlns:rdf", RDF_NAMESPACE);
  const namespaces = [
    ...new Set([...predicateNames.values()].map(({ namespace }) => namespace)),
  ]
    .filter((namespace) => namespace !== RDF_NAMESPACE)
    .sort(compareCodeUnits);
  const usedPrefixes = new Set(STANDARD_PREFIXES.values());
  namespaces.forEach((namespace, index) => {
    let prefix = STANDARD_PREFIXES.get(namespace);
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
    attribute(root, XMLNS_NAMESPACE, `xmlns:${prefix}`, namespace);
  });

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
  const elementName = (name) => `${prefixes.get(name.namespace)}:${name.local}`;
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
        } else {
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
    subject.type
      ? TYPE_PRIORITY.indexOf(subject.type.quad.object.value)
      : TYPE_PRIORITY.length;
  const orderedSubjects = [...subjects.entries()].sort(
    ([leftKey, left], [rightKey, right]) =>
      groupRank(left) - groupRank(right) || compareCodeUnits(leftKey, rightKey),
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
  const appendSubject = ([key, subject]) => {
    if (emitted.has(key) || nested.has(key)) return;
    const group = subject.type?.quad.object.value ?? "Other resources";
    if (policy.banners) {
      if (previousGroup !== group) root.appendChild(safeComment(` ${group} `));
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
            : subject.term.value;
        root.appendChild(safeComment(` ${identity} `));
      }
    }
    root.appendChild(renderNode(subject.term));
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
      children.length * (1 + indentation) +
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
    for (const child of children) {
      formatted.appendChild(document.createTextNode(`\n${padding}`));
      if (child.nodeType === 1)
        formatted.appendChild(formatElement(child, depth + 1));
      else {
        charge(serialize(child));
        formatted.appendChild(child.cloneNode(true));
      }
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
      if (node.nodeType === TEXT_NODE && node.data.includes("\r")) {
        return node.data
          .split("\r")
          .map((part) => serialize(document.createTextNode(part)))
          .join("&#xD;");
      }
      return node;
    },
  });
  const output = `<?xml version="1.0" encoding="UTF-8"?>\n${text}\n`;
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
) => {
  try {
    return serializeGraph(dataset, policy);
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
