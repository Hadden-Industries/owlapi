import {
  OWLOntologyLoaderConfiguration,
  OWLSyntaxError,
  ResourceLimitError,
  XmlParseError,
} from "../../io/index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdf/index.js";
import { prepareXml } from "../xml/xmlEntityPolicy.js";
import { xmlParserAdapter } from "../xml/xmlParserAdapter.js";

const CDATA_SECTION_NODE = 4;
const COMMENT_NODE = 8;
const DEFAULT_CHUNK_SIZE = 65_536;
const DOCUMENT_FRAGMENT_NODE = 11;
const ELEMENT_NODE = 1;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const PROCESSING_INSTRUCTION_NODE = 7;
const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDF_XML_LITERAL = `${RDF_NAMESPACE}XMLLiteral`;
const RDF_NON_LITERAL_PARSE_TYPES = new Set(["Collection", "Resource"]);
const TASK_YIELD_CHUNKS = 16;
const TEXT_NODE = 3;
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const XML_PREDEFINED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
});
const textEncoder = new TextEncoder();

const compareCodePoints = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeCanonicalText = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll("\r", "&#xD;");

const escapeCanonicalAttribute = (value) =>
  escapeCanonicalText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;");

const childNodes = (node) => Array.from(node?.childNodes || []);
const xmlAttributes = (element) => Array.from(element?.attributes || []);

const isNamespaceAttribute = (attribute) =>
  attribute.namespaceURI === XMLNS_NAMESPACE ||
  attribute.name === "xmlns" ||
  attribute.prefix === "xmlns";

const namespacePrefix = (node) => node.prefix || "";

const visibleNamespaces = (element, renderedNamespaces) => {
  const visible = new Map();
  const elementPrefix = namespacePrefix(element);
  if (elementPrefix !== "xml") {
    visible.set(elementPrefix, element.namespaceURI || "");
  }

  for (const attribute of xmlAttributes(element)) {
    const prefix = namespacePrefix(attribute);
    if (!isNamespaceAttribute(attribute) && prefix && prefix !== "xml") {
      visible.set(prefix, attribute.namespaceURI || "");
    }
  }

  return [...visible]
    .filter(
      ([prefix, namespaceURI]) =>
        (renderedNamespaces.get(prefix) || "") !== namespaceURI,
    )
    .sort(([left], [right]) => compareCodePoints(left, right));
};

const canonicalAttributes = (element) =>
  xmlAttributes(element)
    .filter((attribute) => !isNamespaceAttribute(attribute))
    .sort((left, right) => {
      const namespaceOrder = compareCodePoints(
        left.namespaceURI || "",
        right.namespaceURI || "",
      );
      return (
        namespaceOrder ||
        compareCodePoints(
          left.localName || left.name,
          right.localName || right.name,
        )
      );
    });

const canonicalizeNode = (node, renderedNamespaces) => {
  switch (node.nodeType) {
    case ELEMENT_NODE: {
      const namespaces = visibleNamespaces(node, renderedNamespaces);
      const childNamespaceContext = new Map(renderedNamespaces);
      let output = `<${node.nodeName}`;
      for (const [prefix, namespaceURI] of namespaces) {
        childNamespaceContext.set(prefix, namespaceURI);
        output += prefix
          ? ` xmlns:${prefix}="${escapeCanonicalAttribute(namespaceURI)}"`
          : ` xmlns="${escapeCanonicalAttribute(namespaceURI)}"`;
      }
      for (const attribute of canonicalAttributes(node)) {
        output += ` ${attribute.name}="${escapeCanonicalAttribute(
          attribute.value,
        )}"`;
      }
      output += ">";
      for (const child of childNodes(node)) {
        output += canonicalizeNode(child, childNamespaceContext);
      }
      return `${output}</${node.nodeName}>`;
    }
    case TEXT_NODE:
    case CDATA_SECTION_NODE:
      return escapeCanonicalText(node.data ?? node.nodeValue ?? "");
    case PROCESSING_INSTRUCTION_NODE: {
      const data = node.data || "";
      return `<?${node.target || node.nodeName}${data ? ` ${data}` : ""}?>`;
    }
    case COMMENT_NODE:
      return `<!--${node.data ?? node.nodeValue ?? ""}-->`;
    case DOCUMENT_FRAGMENT_NODE:
      return childNodes(node)
        .map((child) => canonicalizeNode(child, renderedNamespaces))
        .join("");
    default:
      return "";
  }
};

const canonicalizeChildren = (element) =>
  childNodes(element)
    .map((child) => canonicalizeNode(child, new Map()))
    .join("")
    .normalize("NFC");

const attributeNS = (element, namespaceURI, localName) =>
  xmlAttributes(element).find(
    (attribute) =>
      attribute.namespaceURI === namespaceURI &&
      (attribute.localName || attribute.name) === localName,
  );

const effectiveBaseIRI = (element, inheritedBaseIRI) => {
  const base = attributeNS(element, XML_NAMESPACE, "base")?.value;
  if (base === undefined) {
    return inheritedBaseIRI;
  }
  try {
    return new URL(base, inheritedBaseIRI || undefined).href;
  } catch {
    return base;
  }
};

const resolvedDatatypeIRI = (value, baseIRI) => {
  try {
    return new URL(value, baseIRI || undefined).href;
  } catch {
    return value;
  }
};

const classifyXmlLiterals = (
  element,
  inheritedBaseIRI,
  classifications,
  parseTypeAttributes,
  insideXmlLiteral = false,
) => {
  for (const attribute of xmlAttributes(element)) {
    if ((attribute.localName || attribute.name) === "parseType") {
      parseTypeAttributes.push({
        normalize:
          !insideXmlLiteral &&
          attribute.namespaceURI === RDF_NAMESPACE &&
          !RDF_NON_LITERAL_PARSE_TYPES.has(attribute.value) &&
          attribute.value !== "Literal",
      });
    }
  }

  if (insideXmlLiteral) {
    for (const child of childNodes(element)) {
      if (child.nodeType === ELEMENT_NODE) {
        classifyXmlLiterals(
          child,
          inheritedBaseIRI,
          classifications,
          parseTypeAttributes,
          true,
        );
      }
    }
    return;
  }

  const baseIRI = effectiveBaseIRI(element, inheritedBaseIRI);
  const parseType = attributeNS(element, RDF_NAMESPACE, "parseType")?.value;
  if (parseType !== undefined && !RDF_NON_LITERAL_PARSE_TYPES.has(parseType)) {
    classifications.push({
      canonicalValue: canonicalizeChildren(element),
      kind: "PARSE_TYPE_LITERAL",
    });
    for (const child of childNodes(element)) {
      if (child.nodeType === ELEMENT_NODE) {
        classifyXmlLiterals(
          child,
          baseIRI,
          classifications,
          parseTypeAttributes,
          true,
        );
      }
    }
    return;
  }

  const datatype = attributeNS(element, RDF_NAMESPACE, "datatype")?.value;
  if (
    datatype !== undefined &&
    resolvedDatatypeIRI(datatype, baseIRI) === RDF_XML_LITERAL
  ) {
    classifications.push({ kind: "EXPLICIT_TYPED_LITERAL" });
    for (const child of childNodes(element)) {
      if (child.nodeType === ELEMENT_NODE) {
        classifyXmlLiterals(
          child,
          baseIRI,
          classifications,
          parseTypeAttributes,
          true,
        );
      }
    }
    return;
  }

  for (const child of childNodes(element)) {
    if (child.nodeType === ELEMENT_NODE) {
      classifyXmlLiterals(child, baseIRI, classifications, parseTypeAttributes);
    }
  }
};

const collectXmlLiteralMetadata = async (text, documentIRI, configuration) => {
  if (!text.includes("parseType") && !text.includes("XMLLiteral")) {
    return { classifications: [], parseTypeAttributes: [] };
  }
  const document = await xmlParserAdapter.parseXml(text, configuration);
  const classifications = [];
  const parseTypeAttributes = [];
  classifyXmlLiterals(
    document.documentElement,
    documentIRI || undefined,
    classifications,
    parseTypeAttributes,
  );
  return { classifications, parseTypeAttributes };
};

const monotonicNow = () =>
  typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();

const normalizeConfiguration = (configuration) =>
  configuration instanceof OWLOntologyLoaderConfiguration
    ? configuration
    : new OWLOntologyLoaderConfiguration(configuration);

const sourceLocation = (text, offset) => {
  const prefix = text.slice(0, offset);
  const lines = prefix.split(/\r\n|\r|\n/u);
  return {
    column: [...lines.at(-1)].length + 1,
    line: lines.length,
    offset,
  };
};

const errorDetails = (text, offset, configuration, details = {}) =>
  configuration.sourceLocations
    ? { ...sourceLocation(text, offset), ...details }
    : details;

const xmlError = (message, text, offset, configuration, details) => {
  throw new XmlParseError(
    message,
    errorDetails(text, offset, configuration, details),
  );
};

const resourceLimit = (message, resource, limit, observed, details = {}) => {
  throw new ResourceLimitError(message, {
    ...details,
    limit,
    observed,
    resource,
  });
};

const closingDelimiter = (text, start, delimiter, configuration, kind) => {
  const end = text.indexOf(delimiter, start);
  if (end < 0) {
    xmlError(`The XML ${kind} is not terminated`, text, start, configuration);
  }
  return end + delimiter.length;
};

const startTagEnd = (text, start, configuration) => {
  let quote;
  for (let offset = start + 1; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return offset;
    }
  }
  xmlError("The XML start tag is not terminated", text, start, configuration);
};

const startTagIdentity = (text, start, end, configuration) => {
  const contents = text.slice(start + 1, end);
  const match = contents.match(/^\s*([^\s/>]+)/u);
  if (!match) {
    xmlError("The XML start tag has no name", text, start, configuration);
  }
  return {
    name: match[1],
    selfClosing: /\/\s*$/u.test(contents),
  };
};

const closingTagIdentity = (text, start, end, configuration) => {
  const contents = text.slice(start + 2, end);
  const match = contents.match(/^\s*([^\s>]+)\s*$/u);
  if (!match) {
    xmlError("The XML closing tag is malformed", text, start, configuration);
  }
  return match[1];
};

const validateXmlStructure = (text, configuration, execution) => {
  const elements = [];
  const startTags = [];
  let offset = 0;
  let root;
  let rootCount = 0;

  while (offset < text.length) {
    execution.check();
    if (text[offset] !== "<") {
      const nextMarkup = text.indexOf("<", offset);
      const end = nextMarkup < 0 ? text.length : nextMarkup;
      if (elements.length === 0 && text.slice(offset, end).trim().length > 0) {
        xmlError(
          "XML character data is not allowed outside the root element",
          text,
          offset,
          configuration,
        );
      }
      offset = end;
      continue;
    }

    if (text.startsWith("<!--", offset)) {
      offset = closingDelimiter(
        text,
        offset + 4,
        "-->",
        configuration,
        "comment",
      );
      continue;
    }
    if (text.startsWith("<![CDATA[", offset)) {
      if (elements.length === 0) {
        xmlError(
          "XML CDATA is not allowed outside the root element",
          text,
          offset,
          configuration,
        );
      }
      offset = closingDelimiter(
        text,
        offset + 9,
        "]]>",
        configuration,
        "CDATA section",
      );
      continue;
    }
    if (text.startsWith("<?", offset)) {
      offset = closingDelimiter(
        text,
        offset + 2,
        "?>",
        configuration,
        "processing instruction",
      );
      continue;
    }
    if (text.startsWith("</", offset)) {
      const end = text.indexOf(">", offset + 2);
      if (end < 0) {
        xmlError(
          "The XML closing tag is not terminated",
          text,
          offset,
          configuration,
        );
      }
      const actual = closingTagIdentity(text, offset, end, configuration);
      const expected = elements.at(-1);
      if (!expected) {
        xmlError(
          `The XML closing tag </${actual}> has no open element`,
          text,
          offset,
          configuration,
        );
      }
      if (actual !== expected.name) {
        xmlError(
          `The XML closing tag </${actual}> does not match <${expected.name}>`,
          text,
          offset,
          configuration,
          { expectedElement: expected.name, observedElement: actual },
        );
      }
      elements.pop();
      offset = end + 1;
      continue;
    }
    if (text.startsWith("<!", offset)) {
      xmlError(
        "Unsupported XML declaration outside the bounded DOCTYPE policy",
        text,
        offset,
        configuration,
      );
    }

    const end = startTagEnd(text, offset, configuration);
    const identity = startTagIdentity(text, offset, end, configuration);
    startTags.push({ end, start: offset });
    if (elements.length === 0) {
      rootCount += 1;
      if (rootCount > 1) {
        xmlError(
          "An XML document cannot contain more than one root element",
          text,
          offset,
          configuration,
        );
      }
      root = { end, name: identity.name, start: offset };
    }
    if (!identity.selfClosing) {
      elements.push({ name: identity.name, offset });
      if (elements.length > configuration.maxXmlNestingDepth) {
        resourceLimit(
          "The XML nesting depth limit was exceeded",
          "maxXmlNestingDepth",
          configuration.maxXmlNestingDepth,
          elements.length,
          errorDetails(text, offset, configuration),
        );
      }
    }
    offset = end + 1;
  }

  if (elements.length > 0) {
    const unclosed = elements.at(-1);
    xmlError(
      `The XML element <${unclosed.name}> is not closed`,
      text,
      unclosed.offset,
      configuration,
      { observedElement: unclosed.name },
    );
  }
  if (rootCount === 0) {
    xmlError("The XML document has no root element", text, 0, configuration);
  }
  return { ...root, startTags };
};

const parseTypeAttributeRanges = (text, startTags) => {
  const ranges = [];
  const attributePattern = /(?:^|\s)([^\s=/>]+)\s*=\s*(["'])([\s\S]*?)\2/gu;
  for (const tag of startTags) {
    const contents = text.slice(tag.start + 1, tag.end);
    for (const match of contents.matchAll(attributePattern)) {
      if (match[1].split(":").at(-1) !== "parseType") {
        continue;
      }
      const equalsOffset = match[0].indexOf("=");
      const quoteOffset = match[0].indexOf(match[2], equalsOffset + 1);
      const start = tag.start + 1 + match.index + quoteOffset + 1;
      ranges.push({ end: start + match[3].length, start });
    }
  }
  return ranges;
};

const normalizeOtherParseTypes = (text, startTags, parseTypeAttributes) => {
  const ranges = parseTypeAttributeRanges(text, startTags);
  if (ranges.length !== parseTypeAttributes.length) {
    throw new XmlParseError(
      "The RDF/XML parseType attributes could not be normalized deterministically",
      {
        observedDomAttributes: parseTypeAttributes.length,
        observedSourceAttributes: ranges.length,
      },
    );
  }
  let normalized = text;
  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    if (!parseTypeAttributes[index].normalize) {
      continue;
    }
    const { end, start } = ranges[index];
    normalized = `${normalized.slice(0, start)}Literal${normalized.slice(end)}`;
  }
  return normalized;
};

const decodeXmlAttributeValue = (value) =>
  value.replace(
    /&(?:#x([0-9A-Fa-f]+)|#([0-9]+)|(amp|apos|gt|lt|quot));/gu,
    (reference, hexadecimal, decimal, entityName) => {
      if (entityName) {
        return XML_PREDEFINED_ENTITIES[entityName];
      }
      const codePoint = Number.parseInt(
        hexadecimal || decimal,
        hexadecimal ? 16 : 10,
      );
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return reference;
      }
    },
  );

const rootNamespace = (text, root) => {
  const startTag = text.slice(root.start + 1, root.end);
  const separator = root.name.indexOf(":");
  const prefix = separator < 0 ? "" : root.name.slice(0, separator);
  const localName = separator < 0 ? root.name : root.name.slice(separator + 1);
  const namespaces = new Map();
  const declaration = /\s+xmlns(?::([^\s=/>]+))?\s*=\s*(["'])(.*?)\2/gsu;
  for (const match of startTag.matchAll(declaration)) {
    namespaces.set(match[1] || "", decodeXmlAttributeValue(match[3]));
  }
  return { localName, namespaceURI: namespaces.get(prefix) };
};

const splitXmlDeclaration = (text) => {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = text.slice(bom.length);
  const declaration = body.match(/^<\?xml\s[\s\S]*?\?>/u)?.[0] || "";
  return {
    body: body.slice(declaration.length),
    prolog: `${bom}${declaration}`,
  };
};

const normalizeOptionalRdfRoot = (text, hasRdfRoot) => {
  if (hasRdfRoot) {
    return text;
  }
  const { body, prolog } = splitXmlDeclaration(text);
  return `${prolog}<owlapiRdf:RDF xmlns:owlapiRdf="${RDF_NAMESPACE}">${body}</owlapiRdf:RDF>`;
};

const abortError = (signal, message) => {
  if (typeof signal?.throwIfAborted === "function") {
    try {
      signal.throwIfAborted();
    } catch (error) {
      return error;
    }
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
};

class ExecutionController {
  #configuration;
  #startedAt;

  constructor(configuration) {
    this.#configuration = configuration;
    this.#startedAt = monotonicNow();
  }

  elapsedMs() {
    return monotonicNow() - this.#startedAt;
  }

  remainingTimeoutMs() {
    return Math.max(0, this.#configuration.timeoutMs - this.elapsedMs());
  }

  timeoutError() {
    return new ResourceLimitError("The RDF/XML parsing timeout was exceeded", {
      limit: this.#configuration.timeoutMs,
      observed: Math.ceil(this.elapsedMs()),
      resource: "timeoutMs",
    });
  }

  check() {
    const { signal, timeoutMs } = this.#configuration;
    if (signal?.aborted) {
      throw abortError(signal, "The RDF/XML parse was aborted");
    }
    const elapsed = this.elapsedMs();
    if (elapsed > timeoutMs) {
      resourceLimit(
        "The RDF/XML parsing timeout was exceeded",
        "timeoutMs",
        timeoutMs,
        Math.ceil(elapsed),
      );
    }
  }

  async cooperate(chunkIndex) {
    this.check();
    if (chunkIndex % TASK_YIELD_CHUNKS === 0) {
      const scheduler = Reflect.get(globalThis, "scheduler");
      if (typeof scheduler?.yield === "function") {
        await scheduler.yield();
      } else {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }
    } else {
      await Promise.resolve();
    }
    this.check();
  }
}

const chunksOf = function* (text, chunkSize) {
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + chunkSize, text.length);
    if (
      end < text.length &&
      text.charCodeAt(end - 1) >= 0xd800 &&
      text.charCodeAt(end - 1) <= 0xdbff &&
      text.charCodeAt(end) >= 0xdc00 &&
      text.charCodeAt(end) <= 0xdfff
    ) {
      end += 1;
    }
    yield text.slice(start, end);
    start = end;
  }
};

const blankNodeKeys = (term, keys) => {
  if (term?.termType === "BlankNode") {
    keys.add(term.value);
  } else if (term?.termType === "Quad") {
    blankNodeKeys(term.subject, keys);
    blankNodeKeys(term.predicate, keys);
    blankNodeKeys(term.object, keys);
    blankNodeKeys(term.graph, keys);
  }
};

const xmlLiteralNormalizer = (classifications) => {
  const seenTerms = new WeakMap();
  let classificationIndex = 0;

  return (quad) => {
    const normalized = rdfDataFactory.fromQuad(quad);
    if (
      quad.object?.termType !== "Literal" ||
      quad.object.datatype?.value !== RDF_XML_LITERAL
    ) {
      return normalized;
    }

    let canonicalValue;
    if (seenTerms.has(quad.object)) {
      canonicalValue = seenTerms.get(quad.object);
    } else {
      const classification = classifications[classificationIndex];
      if (!classification) {
        return normalized;
      }
      classificationIndex += 1;
      canonicalValue = classification.canonicalValue;
      seenTerms.set(quad.object, canonicalValue);
    }

    if (canonicalValue === undefined) {
      return normalized;
    }
    return rdfDataFactory.quad(
      normalized.subject,
      normalized.predicate,
      rdfDataFactory.literal(
        canonicalValue,
        rdfDataFactory.namedNode(RDF_XML_LITERAL),
      ),
      normalized.graph,
    );
  };
};

const validateTokenLength = (value, termType, configuration) => {
  if (!value) {
    return;
  }
  const observed = textEncoder.encode(value).byteLength;
  if (observed > configuration.maxTokenLength) {
    resourceLimit(
      "An RDF/XML term exceeded the token byte limit",
      "maxTokenLength",
      configuration.maxTokenLength,
      observed,
      { termType },
    );
  }
};

const validateTermLength = (term, configuration) => {
  if (!term || term.termType === "DefaultGraph") {
    return;
  }
  if (term.termType === "Quad") {
    validateTermLength(term.subject, configuration);
    validateTermLength(term.predicate, configuration);
    validateTermLength(term.object, configuration);
    validateTermLength(term.graph, configuration);
    return;
  }
  validateTokenLength(term.value, term.termType, configuration);
  if (term.termType === "Literal") {
    validateTermLength(term.datatype, configuration);
    validateTokenLength(term.language, "LanguageTag", configuration);
    validateTokenLength(term.direction, "BaseDirection", configuration);
  }
};

const parserLocation = (message) => {
  const normalized = String(message || "");
  const explicit = normalized.match(/line\s+(\d+)\s+column\s+(\d+)/iu);
  if (explicit) {
    return {
      column: Number.parseInt(explicit[2], 10),
      line: Number.parseInt(explicit[1], 10),
    };
  }
  const compact = normalized.match(/(?:^|\s)(\d+):(\d+):/u);
  return compact
    ? {
        column: Number.parseInt(compact[2], 10),
        line: Number.parseInt(compact[1], 10),
      }
    : {};
};

const normalizeParserFailure = async (cause, text, configuration) => {
  if (
    cause?.code ||
    cause?.name === "AbortError" ||
    cause instanceof TypeError
  ) {
    return cause;
  }

  try {
    await xmlParserAdapter.parseXml(text, configuration);
  } catch (xmlCause) {
    if (xmlCause?.code) {
      return xmlCause;
    }
    return cause;
  }

  return new OWLSyntaxError("The RDF/XML document is not valid RDF/XML", {
    ...(configuration.sourceLocations ? parserLocation(cause?.message) : {}),
    cause,
    parserMessage: String(cause?.message || cause),
  });
};

const waitForDrain = (parser) =>
  new Promise((resolve, reject) => {
    function cleanup() {
      parser.removeListener("drain", onDrain);
      parser.removeListener("error", onError);
    }
    function onDrain() {
      cleanup();
      resolve();
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    parser.once("drain", onDrain);
    parser.once("error", onError);
  });

const defaultImplementationLoader = () => import("rdfxml-streaming-parser");

export class RdfXmlSyntaxAdapter {
  #chunkSize;
  #loadImplementation;

  constructor({
    chunkSize = DEFAULT_CHUNK_SIZE,
    loadImplementation = defaultImplementationLoader,
  } = {}) {
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError("chunkSize must be a positive safe integer");
    }
    if (typeof loadImplementation !== "function") {
      throw new TypeError("loadImplementation must be a function");
    }
    this.#chunkSize = chunkSize;
    this.#loadImplementation = loadImplementation;
  }

  async parse(source, configuration = {}) {
    if (
      !source ||
      typeof source.getText !== "function" ||
      typeof source.getDocumentIRI !== "function"
    ) {
      throw new TypeError(
        "source must implement the OWL document-source contract",
      );
    }
    const normalizedConfiguration = normalizeConfiguration(configuration);
    const execution = new ExecutionController(normalizedConfiguration);
    execution.check();

    const sourceText = source.getText();
    if (typeof sourceText !== "string") {
      throw new TypeError("RDF/XML source text must be a string");
    }
    const inputBytes = textEncoder.encode(sourceText).byteLength;
    if (inputBytes > normalizedConfiguration.maxInputBytes) {
      resourceLimit(
        "The RDF/XML input byte limit was exceeded",
        "maxInputBytes",
        normalizedConfiguration.maxInputBytes,
        inputBytes,
      );
    }

    const preparedText = prepareXml(sourceText, normalizedConfiguration);
    execution.check();
    const root = validateXmlStructure(
      preparedText,
      normalizedConfiguration,
      execution,
    );
    execution.check();
    const documentIRI = source.getDocumentIRI();
    const { classifications, parseTypeAttributes } =
      await collectXmlLiteralMetadata(
        preparedText,
        documentIRI?.value,
        normalizedConfiguration,
      );
    const parseTypeNormalizedText = normalizeOtherParseTypes(
      preparedText,
      root.startTags,
      parseTypeAttributes,
    );
    const identity = rootNamespace(preparedText, root);
    const normalizedText = normalizeOptionalRdfRoot(
      parseTypeNormalizedText,
      identity.localName === "RDF" && identity.namespaceURI === RDF_NAMESPACE,
    );
    const normalizeQuad = xmlLiteralNormalizer(classifications);

    const implementation = await this.#loadImplementation();
    execution.check();
    if (typeof implementation?.RdfXmlParser !== "function") {
      throw new TypeError(
        "The RDF/XML implementation must export RdfXmlParser",
      );
    }

    const parser = new implementation.RdfXmlParser({
      allowDuplicateRdfIds: false,
      baseIRI: documentIRI?.value || "",
      dataFactory: rdfDataFactory,
      defaultGraph: rdfDataFactory.defaultGraph(),
      parseUnsupportedVersions: false,
      strict: true,
      trackPosition: normalizedConfiguration.sourceLocations,
      validateUri: true,
    });
    if (
      !parser ||
      typeof parser.on !== "function" ||
      typeof parser.write !== "function" ||
      typeof parser.end !== "function" ||
      typeof parser.destroy !== "function"
    ) {
      throw new TypeError(
        "The RDF/XML implementation must provide a writable RDF/JS quad stream",
      );
    }

    const dataset = rdfDatasetFactory.dataset();
    const blankNodes = new Set();
    let emittedQuads = 0;
    let adapterFailure;
    const completion = new Promise((resolve, reject) => {
      parser.on("data", (quad) => {
        if (adapterFailure) {
          return;
        }
        try {
          execution.check();
          emittedQuads += 1;
          if (emittedQuads > normalizedConfiguration.maxQuads) {
            resourceLimit(
              "The RDF/XML quad limit was exceeded",
              "maxQuads",
              normalizedConfiguration.maxQuads,
              emittedQuads,
            );
          }
          const normalizedQuad = normalizeQuad(quad);
          for (const term of [
            normalizedQuad.subject,
            normalizedQuad.predicate,
            normalizedQuad.object,
            normalizedQuad.graph,
          ]) {
            validateTermLength(term, normalizedConfiguration);
            blankNodeKeys(term, blankNodes);
          }
          if (blankNodes.size > normalizedConfiguration.maxBlankNodes) {
            resourceLimit(
              "The RDF/XML blank-node limit was exceeded",
              "maxBlankNodes",
              normalizedConfiguration.maxBlankNodes,
              blankNodes.size,
            );
          }
          dataset.add(normalizedQuad);
        } catch (error) {
          adapterFailure = error;
          parser.destroy(error);
        }
      });
      parser.once("error", reject);
      parser.once("end", resolve);
    });
    completion.catch(() => {});

    const signal = normalizedConfiguration.signal;
    let timeoutId;
    const scheduleWatchdog = () => {
      const delay = Math.min(
        execution.remainingTimeoutMs(),
        MAX_TIMER_DELAY_MS,
      );
      timeoutId = globalThis.setTimeout(() => {
        if (adapterFailure) {
          return;
        }
        if (execution.remainingTimeoutMs() > 0) {
          scheduleWatchdog();
          return;
        }
        adapterFailure = execution.timeoutError();
        parser.destroy(adapterFailure);
      }, delay);
    };
    scheduleWatchdog();
    const onAbort = () => {
      if (!adapterFailure) {
        adapterFailure = abortError(signal, "The RDF/XML parse was aborted");
        parser.destroy(adapterFailure);
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      let chunkIndex = 0;
      for (const chunk of chunksOf(normalizedText, this.#chunkSize)) {
        execution.check();
        if (!parser.write(chunk)) {
          await waitForDrain(parser);
        }
        chunkIndex += 1;
        await execution.cooperate(chunkIndex);
      }
      parser.end();
      await completion;
      execution.check();
      return dataset;
    } catch (cause) {
      if (!parser.destroyed) {
        parser.destroy();
      }
      throw await normalizeParserFailure(
        adapterFailure || cause,
        normalizedText,
        normalizedConfiguration,
      );
    } finally {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
