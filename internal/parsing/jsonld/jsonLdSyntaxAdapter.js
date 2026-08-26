import {
  DocumentLoadError,
  OWLSyntaxError,
  ResourceLimitError,
  SecurityPolicyError,
} from "../../../io/errors.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/owlOntologyLoaderConfiguration.js";
import { IRI } from "../../../model/structural.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdfjs/environment.js";

import {
  prepareJsonLd10Document,
  rejectJsonLd10ListsOfLists,
} from "./jsonLd10Compatibility.js";

// One browser-compatible ESM implementation serves Node and browser consumers;
// keeping the import lazy preserves startup cost without inventing conditional
// package exports or a second platform-specific public surface.
const defaultImplementationLoader = () => import("jsonld/dist/jsonld.esm.js");

const freezeJson = (value) => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeJson));
  }
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)]),
      ),
    );
  }
  return value;
};

const normalizeTerm = (term) => {
  switch (term?.termType) {
    case "BlankNode":
      return rdfDataFactory.blankNode(term.value);
    case "DefaultGraph":
      return rdfDataFactory.defaultGraph();
    case "Literal":
      return rdfDataFactory.literal(
        term.value,
        term.language || rdfDataFactory.namedNode(term.datatype.value),
      );
    case "NamedNode":
      return rdfDataFactory.namedNode(term.value);
    default:
      throw new TypeError(`Unsupported JSON-LD RDF term: ${term?.termType}`);
  }
};

const isAbsoluteIri = (value) =>
  typeof value === "string" &&
  /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) &&
  !/[\s<>"{}|\\^`]/u.test(value) &&
  (value.match(/#/gu)?.length || 0) <= 1;

const isLanguageTag = (value) =>
  value === "" ||
  /^(?:[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*|[ix](?:-[A-Za-z0-9]{1,8})+)$/iu.test(
    value,
  );

const isWellFormedTerm = (term, role) => {
  if (!term) {
    return false;
  }
  if (term.termType === "BlankNode") {
    return role !== "predicate";
  }
  if (term.termType === "DefaultGraph") {
    return role === "graph";
  }
  if (term.termType === "NamedNode") {
    return isAbsoluteIri(term.value);
  }
  if (term.termType !== "Literal" || role !== "object") {
    return false;
  }
  if (
    term.datatype?.termType !== "NamedNode" ||
    typeof term.datatype.value !== "string"
  ) {
    throw new OWLSyntaxError(
      "JSON-LD produced a literal without one valid datatype IRI",
      { syntax: "JSON-LD" },
    );
  }
  return (
    isAbsoluteIri(term.datatype.value) && isLanguageTag(term.language || "")
  );
};

const isWellFormedQuad = (quad) =>
  isWellFormedTerm(quad.subject, "subject") &&
  isWellFormedTerm(quad.predicate, "predicate") &&
  isWellFormedTerm(quad.object, "object") &&
  (quad.graph === undefined || isWellFormedTerm(quad.graph, "graph"));

const normalizeImplementation = (module) => module.default || module;
const textEncoder = new TextEncoder();
const JSON_LD_PROCESSING_MODES = new Set(["json-ld-1.0", "json-ld-1.1"]);
const JSON_LD_RDF_DIRECTIONS = new Set(["compound-literal", "i18n-datatype"]);
const RDF_DIRECTION = "http://www.w3.org/1999/02/22-rdf-syntax-ns#direction";
const RDF_LANGUAGE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#language";
const RDF_VALUE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#value";

const replaceDirectionalValuesWithCompoundLiterals = (value) => {
  if (Array.isArray(value)) {
    return value.map(replaceDirectionalValuesWithCompoundLiterals);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Object.hasOwn(value, "@value")) {
    if (!Object.hasOwn(value, "@direction")) {
      return value;
    }
    // jsonld.js 9 expands directional value objects correctly but deliberately
    // omits the JSON-LD 1.1 compound-literal RDF representation. Rewriting only
    // the expanded value object keeps context, node-map, list, and IRI behavior
    // delegated to the standards processor.
    return {
      [RDF_DIRECTION]: [{ "@value": value["@direction"] }],
      ...(Object.hasOwn(value, "@language")
        ? { [RDF_LANGUAGE]: [{ "@value": value["@language"].toLowerCase() }] }
        : {}),
      [RDF_VALUE]: [{ "@value": value["@value"] }],
    };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      replaceDirectionalValuesWithCompoundLiterals(entry),
    ]),
  );
};

const jsonLdOptionsFrom = (configuration) => {
  const format = configuration.format;
  if (
    !format ||
    typeof format !== "object" ||
    format.key !== "jsonld" ||
    typeof format.getParameter !== "function"
  ) {
    return {};
  }

  const processingMode = format.getParameter("processingMode");
  if (
    processingMode !== undefined &&
    !JSON_LD_PROCESSING_MODES.has(processingMode)
  ) {
    throw new RangeError(`Unknown JSON-LD processingMode: ${processingMode}`);
  }
  const rdfDirection = format.getParameter("rdfDirection");
  if (
    rdfDirection !== undefined &&
    rdfDirection !== null &&
    !JSON_LD_RDF_DIRECTIONS.has(rdfDirection)
  ) {
    throw new RangeError(`Unknown JSON-LD rdfDirection: ${rdfDirection}`);
  }
  const expandContext = format.getParameter("expandContext");

  // These are JSON-LD processor settings, not generic loader policy. Keeping
  // them on OWLDocumentFormat mirrors OWLAPI's format-parameter seam and
  // prevents a narrower consuming UI from defining the reusable parser surface.
  return {
    ...(expandContext === undefined ? {} : { expandContext }),
    ...(processingMode === undefined ? {} : { processingMode }),
    ...(rdfDirection === undefined ? {} : { rdfDirection }),
  };
};

const abortError = (signal) => {
  if (typeof signal?.throwIfAborted === "function") {
    try {
      signal.throwIfAborted();
    } catch (error) {
      return error;
    }
  }
  const error = new Error("The JSON-LD parse was aborted");
  error.name = "AbortError";
  return error;
};

const isPrivateIpv4 = (hostname) => {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second, third] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 &&
      (second === 168 || (second === 0 && [0, 2].includes(third)))) ||
    (first === 198 &&
      ([18, 19].includes(second) || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && [0, 113].includes(third)) ||
    first >= 224
  );
};

const requireSafeRemoteUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SecurityPolicyError("The JSON-LD context IRI is not a URL", {
      resource: "jsonLdContextIRI",
    });
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv6 =
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("::ffff:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    /^fe[89ab]/.test(hostname) ||
    hostname.startsWith("ff") ||
    hostname.startsWith("2001:db8:");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    hostname === "100.100.100.200" ||
    isPrivateIpv4(hostname) ||
    privateIpv6
  ) {
    throw new SecurityPolicyError(
      "The JSON-LD context IRI is blocked by the loading security policy",
      { resource: "jsonLdContextIRI" },
    );
  }
  return url;
};

const findProjectError = (error) => {
  const visited = new Set();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    if (
      current.name === "AbortError" ||
      current.code === "DOCUMENT_LOAD_FAILED" ||
      current.code === "SECURITY_POLICY_VIOLATION" ||
      current.code === "RESOURCE_LIMIT_EXCEEDED"
    ) {
      return current;
    }
    visited.add(current);
    current = current.cause || current.details?.cause;
  }
  return undefined;
};

const awaitControlledLoad = (loading, configuration) => {
  const { signal, timeoutMs } = configuration;
  if (signal?.aborted) {
    return Promise.reject(abortError(signal));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const controls = {};
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(controls.timeout);
      signal?.removeEventListener("abort", controls.onAbort);
      callback(value);
    };
    controls.onAbort = () => finish(reject, abortError(signal));
    controls.timeout = globalThis.setTimeout(
      () =>
        finish(
          reject,
          new ResourceLimitError("JSON-LD context loading timed out", {
            limit: timeoutMs,
            observed: timeoutMs,
            resource: "timeoutMs",
          }),
        ),
      timeoutMs,
    );
    signal?.addEventListener("abort", controls.onAbort, { once: true });
    Promise.resolve(loading).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });
};

export class JsonLdSyntaxAdapter {
  #documentLoader;
  #loadImplementation;

  constructor({
    documentLoader,
    loadImplementation = defaultImplementationLoader,
  } = {}) {
    if (
      documentLoader !== undefined &&
      typeof documentLoader?.load !== "function"
    ) {
      throw new TypeError("documentLoader must implement load()");
    }
    if (typeof loadImplementation !== "function") {
      throw new TypeError("loadImplementation must be a function");
    }
    this.#documentLoader = documentLoader;
    this.#loadImplementation = loadImplementation;
  }

  #createContextDocumentLoader(configuration, processingMode) {
    return async (contextIRI) => {
      if (!configuration.remoteJsonLdContexts) {
        throw new SecurityPolicyError("Remote JSON-LD contexts are disabled", {
          resource: "remoteJsonLdContexts",
        });
      }
      if (!this.#documentLoader) {
        throw new SecurityPolicyError(
          "No document loader is configured for remote JSON-LD contexts",
          { resource: "documentLoader" },
        );
      }
      const url = requireSafeRemoteUrl(contextIRI);
      let loaded;
      try {
        loaded = await awaitControlledLoad(
          this.#documentLoader.load(IRI.create(url.href), {
            config: configuration,
            purpose: "jsonld-context",
            signal: configuration.signal,
          }),
          configuration,
        );
      } catch (error) {
        const projectError = findProjectError(error);
        if (projectError) {
          throw projectError;
        }
        throw new DocumentLoadError(
          "The injected loader could not load a JSON-LD context",
          {
            cause: error,
            documentIRI: IRI.create(url.href),
            resource: "jsonLdContext",
          },
        );
      }
      const text =
        typeof loaded === "string"
          ? loaded
          : typeof loaded?.getText === "function"
            ? loaded.getText()
            : undefined;
      if (typeof text !== "string") {
        throw new TypeError(
          "The JSON-LD context loader must return a string or document source",
        );
      }
      const byteLength = textEncoder.encode(text).byteLength;
      if (byteLength > configuration.maxRemoteDocumentBytes) {
        throw new ResourceLimitError(
          "The remote JSON-LD context byte limit was exceeded",
          {
            limit: configuration.maxRemoteDocumentBytes,
            observed: byteLength,
            resource: "maxRemoteDocumentBytes",
          },
        );
      }
      const finalUrl = loaded?.getDocumentIRI?.()?.value || url.href;
      requireSafeRemoteUrl(finalUrl);
      const redirects = finalUrl === url.href ? 0 : 1;
      if (redirects > configuration.maxRedirects) {
        throw new SecurityPolicyError(
          "The JSON-LD context redirect limit was exceeded",
          {
            limit: configuration.maxRedirects,
            observed: redirects,
            resource: "maxRedirects",
          },
        );
      }
      const parsedDocument = JSON.parse(text);
      return {
        contextUrl: null,
        // JSON-LD 1.0 compatibility must be applied at every document
        // boundary, including remotely loaded contexts and expandContext
        // documents—not only to the primary ontology document.
        document:
          processingMode === "json-ld-1.0"
            ? prepareJsonLd10Document(parsedDocument)
            : parsedDocument,
        documentUrl: finalUrl,
      };
    };
  }

  async parse(source, configuration = {}) {
    const normalizedConfiguration =
      configuration instanceof OWLOntologyLoaderConfiguration
        ? configuration
        : new OWLOntologyLoaderConfiguration(configuration);
    let document;
    try {
      document = JSON.parse(source.getText());
    } catch (error) {
      throw new OWLSyntaxError("The JSON-LD document is not valid JSON", {
        cause: error,
        syntax: "JSON-LD",
      });
    }
    const implementation = normalizeImplementation(
      await this.#loadImplementation(),
    );
    const jsonLdOptions = jsonLdOptionsFrom(normalizedConfiguration);
    let quads;
    try {
      const processorOptions = {
        base: source.getDocumentIRI()?.value,
        documentLoader: this.#createContextDocumentLoader(
          normalizedConfiguration,
          jsonLdOptions.processingMode,
        ),
        ...jsonLdOptions,
        // Generalized RDF permits blank-node predicates, which cannot cross
        // the ordinary RDF/JS-to-OWL property boundary. It remains an explicit
        // ontology-ingestion exclusion rather than an undocumented option.
        produceGeneralizedRdf: false,
      };
      if (jsonLdOptions.processingMode === "json-ld-1.0") {
        const expanded = await implementation.expand(
          prepareJsonLd10Document(document),
          processorOptions,
        );
        rejectJsonLd10ListsOfLists(expanded);
        quads = await implementation.toRDF(expanded, {
          ...processorOptions,
          skipExpansion: true,
        });
      } else if (jsonLdOptions.rdfDirection === "compound-literal") {
        const expanded = await implementation.expand(
          document,
          processorOptions,
        );
        quads = await implementation.toRDF(
          replaceDirectionalValuesWithCompoundLiterals(expanded),
          {
            ...processorOptions,
            rdfDirection: null,
            skipExpansion: true,
          },
        );
      } else {
        quads = await implementation.toRDF(document, processorOptions);
      }
    } catch (error) {
      // jsonld wraps document-loader failures in its own JsonLdError. Preserve
      // project policy errors so callers can handle them by stable error code.
      const projectError = findProjectError(error);
      if (projectError) {
        throw projectError;
      }
      throw new OWLSyntaxError(
        "The JSON-LD document could not be converted to RDF",
        { cause: error, syntax: "JSON-LD" },
      );
    }
    const dataset = rdfDatasetFactory.dataset();
    for (const quad of quads) {
      // JSON-LD's to-RDF algorithm emits only well-formed RDF statements.
      // Older processor releases can surface null/relative/ill-tagged terms;
      // filter those statements at the RDF/JS adapter boundary.
      if (!isWellFormedQuad(quad)) {
        continue;
      }
      dataset.add(
        rdfDataFactory.quad(
          normalizeTerm(quad.subject),
          normalizeTerm(quad.predicate),
          normalizeTerm(quad.object),
          quad.graph === undefined
            ? rdfDataFactory.defaultGraph()
            : normalizeTerm(quad.graph),
        ),
      );
    }
    const contexts = Object.hasOwn(document, "@context")
      ? [freezeJson(document["@context"])]
      : [];

    return Object.freeze({
      dataset,
      jsonLdContexts: Object.freeze(contexts),
      prefixes: Object.freeze({}),
    });
  }
}
