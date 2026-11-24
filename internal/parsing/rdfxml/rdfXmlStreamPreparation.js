import { ResourceLimitError, XmlParseError } from "../../../io/errors.js";
import { RDF_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { decodeStreamText } from "../streamByteReader.js";
import { createXmlEntityPreparation } from "../xml/xmlEntityPolicy.js";
import { XmlChunkTokens } from "../xml/xmlChunkTokens.js";
import { xmlProcessingPolicy } from "../xml/xmlProcessingPolicy.js";
import { xmlProviderLimitFailure } from "../xml/xmlParserAdapter.js";

const tagName = /^<\/?([^\s/>]+)/u;
const attributes = /\s+([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/gu;
const literalDatatype = RDF_NAMESPACE + "XMLLiteral";
const rdfWrapper = '<owlapiRdf:RDF xmlns:owlapiRdf="' + RDF_NAMESPACE + '">';
const encoder = new TextEncoder();
function resolve(value, baseIRI) {
  try {
    return new URL(value, baseIRI || undefined).href;
  } catch {
    return value;
  }
}

const escapeAttribute = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;")
    .replaceAll("\r", "&#xD;");

const references = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
function attributeValue(raw) {
  return raw
    .replace(/\r\n|[\t\r\n]/gu, " ")
    .replace(
      /&(?:#x([0-9A-Fa-f]+)|#([0-9]+)|(amp|apos|gt|lt|quot));/gu,
      (match, hex, decimal, named) => {
        if (named) return references[named];
        const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
        return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
      },
    );
}

function elementNamespace(name, namespaces, isAttribute = false) {
  const separator = name.indexOf(":");
  if (separator === -1) return isAttribute ? undefined : namespaces.get("");
  return namespaces.get(name.slice(0, separator));
}

function openElement(text, parent, inheritedBase) {
  const name = tagName.exec(text)?.[1];
  if (!name) throw new XmlParseError("The XML start tag has no name");
  let namespaces = parent?.namespaces ?? new Map();
  let baseIRI = parent?.baseIRI ?? inheritedBase;
  let parseType;
  let datatype;
  if (
    !parent ||
    text.includes("xmlns") ||
    text.includes("xml:base") ||
    text.includes("parseType") ||
    text.includes("datatype")
  ) {
    const entries = [...text.matchAll(attributes)];
    for (const [, name, , value] of entries) {
      if (name === "xml:base")
        baseIRI = resolve(attributeValue(value), baseIRI);
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        if (namespaces === parent?.namespaces) namespaces = new Map(namespaces);
        namespaces.set(
          name === "xmlns" ? "" : name.slice(6),
          attributeValue(value),
        );
      }
    }
    for (const entry of entries) {
      if (elementNamespace(entry[1], namespaces, true) !== RDF_NAMESPACE)
        continue;
      const localName = entry[1].split(":")[1];
      if (localName === "parseType") parseType = entry;
      if (localName === "datatype")
        datatype = resolve(attributeValue(entry[3]), baseIRI);
    }
  }
  return { name, namespaces, baseIRI, parseType, datatype };
}

const isRdfRoot = ({ name, namespaces }) =>
  name.split(":").at(-1) === "RDF" &&
  elementNamespace(name, namespaces) === RDF_NAMESPACE;

/** Read the root's namespaces and authored base after XML entity preparation. */
export function rdfXmlRootMetadata(startTag, retrievalIRI) {
  const root = openElement(startTag, undefined, retrievalIRI);
  return {
    baseIRI: root.baseIRI,
    namespaces: root.namespaces,
    hasRdfRoot: isRdfRoot(root),
  };
}

function normalizeParseType(text, entry) {
  const start = entry.index + entry[0].indexOf(entry[2]);
  return (
    text.slice(0, start + 1) +
    "Literal" +
    text.slice(start + entry[3].length + 1)
  );
}

async function literalMarkup(parts, namespaces, canonicalizeLiteral) {
  const declarations = [];
  for (const [prefix, value] of namespaces) {
    declarations.push(
      (prefix ? " xmlns:" + prefix : " xmlns") +
        '="' +
        escapeAttribute(value) +
        '"',
    );
  }
  return canonicalizeLiteral(
    "<literal" + declarations.join("") + ">" + parts.join("") + "</literal>",
  );
}

function checkBytes(resource, limit, observed) {
  if (observed > limit) {
    throw new ResourceLimitError("The RDF/XML byte limit was exceeded", {
      resource,
      limit,
      observed,
    });
  }
}

/** Prepare an RDF/XML byte stream for the same quad parser used by string sources. */
export async function* prepareRdfXmlStream({
  source,
  configuration,
  signal,
  metadata,
  canonicalizeLiteral,
  noteLiteral,
}) {
  const documentIRI = source.getDocumentIRI()?.value;
  const tokens = new XmlChunkTokens();
  const elements = [];
  let rootSeen = false;
  let wrapped = false;
  let prepareEntities;
  let literal;
  let expandedBytes = 0;
  let output = [];
  let xmlLiteralProbe = "";
  let foundXmlLiteralMarker = false;
  let providerFailure;
  const providerPolicy = xmlProcessingPolicy(configuration);

  const recordLiteral = (parts, frame) =>
    literalMarkup(parts, frame.namespaces, canonicalizeLiteral).then(
      noteLiteral,
    );

  function emitToken({ kind, text }) {
    if (kind === "open") {
      const parent = elements.at(-1);
      const frame = openElement(text, parent, documentIRI);
      if (
        !providerFailure &&
        text.length >
          Math.min(
            providerPolicy.maxXmlNameCodeUnits,
            5 * providerPolicy.maxAttributesPerElement,
          )
      ) {
        providerFailure = xmlProviderLimitFailure(
          frame.name,
          Array.from(text.matchAll(attributes), ([, name]) => name),
          providerPolicy,
        );
      }
      if (!parent) {
        if (rootSeen)
          throw new XmlParseError(
            "An XML document cannot contain more than one root element",
          );
        rootSeen = true;
        metadata.baseIRI = frame.baseIRI;
        metadata.namespaces = frame.namespaces;
        wrapped = !isRdfRoot(frame);
        if (wrapped) output.push(rdfWrapper);
      }
      const closed = text.endsWith("/>");
      const depth = elements.length + 1;
      if (!closed) elements.push(frame);
      if (elements.length > configuration.maxXmlNestingDepth) {
        throw new ResourceLimitError(
          "The XML nesting depth limit was exceeded",
          {
            resource: "maxXmlNestingDepth",
            limit: configuration.maxXmlNestingDepth,
            observed: elements.length,
          },
        );
      }
      if (literal) {
        literal.parts.push(text);
      } else if (frame.parseType) {
        const value = attributeValue(frame.parseType[3]);
        if (value !== "Resource" && value !== "Collection") {
          if (value !== "Literal")
            text = normalizeParseType(text, frame.parseType);
          if (closed) {
            noteLiteral("");
          } else {
            literal = { depth, parts: [] };
          }
        }
      } else if (frame.datatype === literalDatatype) {
        // A datatype attribute denotes an ordinary lexical literal.
        noteLiteral(undefined);
      }
    } else if (kind === "close") {
      const frame = elements.pop();
      const name = tagName.exec(text)?.[1];
      if (!frame || frame.name !== name)
        throw new XmlParseError(
          "The XML closing tag does not match its open element",
          {
            expectedElement: frame?.name,
            observedElement: name,
          },
        );
      if (literal?.depth === elements.length + 1) {
        const { parts } = literal;
        literal = undefined;
        output.push(text);
        return recordLiteral(parts, frame);
      }
      literal?.parts.push(text);
    } else {
      if (kind === "declaration" || kind === "doctype")
        throw new XmlParseError(
          "Unsupported XML declaration outside the bounded DOCTYPE policy",
        );
      if (
        elements.length === 0 &&
        (kind === "cdata" || (kind === "text" && text.trim()))
      )
        throw new XmlParseError(
          "XML character data is not allowed outside the root element",
        );
      literal?.parts.push(text);
    }
    output.push(text);
  }

  async function prepareChunk(text, final = false) {
    output = [];
    const preparedParts = [];
    for (const token of tokens.read(text, final)) {
      if (token.kind === "doctype") {
        if (rootSeen || prepareEntities)
          throw new XmlParseError(
            "One XML DOCTYPE is permitted before the document element",
          );
        const entityPreparation = createXmlEntityPreparation(
          token.text,
          configuration,
        );
        prepareEntities = entityPreparation.prepare;
        tokens.setEntityNameLimit(entityPreparation.longestEntityName);
        const lines = token.text.replace(/[^\r\n]/gu, "");
        output.push(lines);
        preparedParts.push(lines);
        continue;
      }
      const prepared = prepareEntities
        ? prepareEntities(token.text)
        : token.text;
      preparedParts.push(prepared);
      if (
        token.kind === "text" &&
        prepared !== token.text &&
        prepared.includes("<")
      ) {
        for (const fragment of new XmlChunkTokens().read(prepared, true)) {
          const pending = emitToken(fragment);
          if (pending) await pending;
        }
      } else {
        const pending = emitToken({ kind: token.kind, text: prepared });
        if (pending) await pending;
      }
    }
    const preparedChunk = preparedParts.join("");
    if (!foundXmlLiteralMarker) {
      const probe = xmlLiteralProbe + preparedChunk;
      foundXmlLiteralMarker =
        probe.includes("parseType") || probe.includes("XMLLiteral");
      xmlLiteralProbe = probe.slice(-9);
    }
    if (foundXmlLiteralMarker && providerFailure) throw providerFailure;
    expandedBytes += encoder.encode(preparedChunk).byteLength;
    checkBytes(
      "maxExpandedXmlBytes",
      configuration.maxExpandedXmlBytes,
      expandedBytes + tokens.pendingExpandedBytes(Boolean(prepareEntities)),
    );
    if (final) {
      if (!rootSeen || elements.length)
        throw new XmlParseError(
          rootSeen
            ? "The XML element is not closed"
            : "The XML document has no root element",
        );
      if (wrapped) output.push("</owlapiRdf:RDF>");
    }
    return output.join("");
  }

  const invalidEncoding = (cause) =>
    new XmlParseError("The RDF/XML source is not valid UTF-8", { cause });
  for await (const text of decodeStreamText(
    source,
    configuration,
    signal,
    invalidEncoding,
  )) {
    const prepared = await prepareChunk(text);
    if (prepared) yield prepared;
  }
  const last = await prepareChunk("", true);
  if (last) yield last;
}
