import { parseIri } from "@hyperjump/uri";
import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";
import { parse as parseLanguageTag } from "bcp-47";
import { OWLOntologyStorageError } from "../../../io/errors.js";
import { RDF_NAMESPACE } from "../../rdfjs/vocabulary.js";

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const TEXT_NODE = 3;
const LANG_STRING = `${RDF_NAMESPACE}langString`;
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

const serializeGraph = (dataset) => {
  const document = new DOMImplementation().createDocument(
    RDF_NAMESPACE,
    "rdf:RDF",
  );
  const serializer = new XMLSerializer();
  const serialize = (node) =>
    serializer.serializeToString(node, { requireWellFormed: true });
  const root = document.documentElement;
  const validatedIris = new Set();
  const requireNamedNode = (term) => {
    if (term?.termType !== "NamedNode" || typeof term.value !== "string") {
      notRepresentable("This RDF position requires a named node");
    }
    if (!validatedIris.has(term.value)) {
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
    // RDF/XML 1.1 section 8 explicitly excludes this RDF 1.1 datatype.
    if (term.datatype.value === `${RDF_NAMESPACE}HTML`) {
      notRepresentable("RDF/XML 1.1 cannot serialize the rdf:HTML datatype");
    }
  };

  const predicateNames = new Map();
  const predicateName = (iri) => {
    if (predicateNames.has(iri)) return predicateNames.get(iri);
    if (RESERVED_PREDICATES.has(iri)) {
      notRepresentable(
        "An RDF/XML syntax name cannot be serialized as a predicate",
      );
    }
    const characters = [...iri];
    for (let split = characters.length - 1; split > 0; split -= 1) {
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
    serialize(document.createTextNode(value));
    element.setAttributeNS(namespace, name, value);
  };
  const prefixes = new Map([[RDF_NAMESPACE, "rdf"]]);
  attribute(root, XMLNS_NAMESPACE, "xmlns:rdf", RDF_NAMESPACE);
  const namespaces = [
    ...new Set([...predicateNames.values()].map(({ namespace }) => namespace)),
  ]
    .filter((namespace) => namespace !== RDF_NAMESPACE)
    .sort(compareCodeUnits);
  namespaces.forEach((namespace, index) => {
    const prefix = `ns${index}`;
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
  let currentSubject;
  let description;
  for (const { quad, name, keys } of triples) {
    if (keys[0] !== currentSubject) {
      currentSubject = keys[0];
      description = document.createElementNS(RDF_NAMESPACE, "rdf:Description");
      resourceAttribute(description, quad.subject, "rdf:about");
      root.appendChild(description);
    }
    const property = document.createElementNS(
      name.namespace,
      `${prefixes.get(name.namespace)}:${name.local}`,
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
    } else {
      resourceAttribute(property, quad.object, "rdf:resource");
    }
    description.appendChild(property);
  }
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
  return `<?xml version="1.0" encoding="UTF-8"?>\n${text}\n`;
};

/** Serialize one ordinary RDF/JS default graph without ontology inference. */
export const writeRdfXmlGraph = (dataset) => {
  try {
    return serializeGraph(dataset);
  } catch (cause) {
    if (cause instanceof OWLOntologyStorageError) throw cause;
    return notRepresentable("The RDF graph cannot be represented in RDF/XML", {
      cause,
    });
  }
};
