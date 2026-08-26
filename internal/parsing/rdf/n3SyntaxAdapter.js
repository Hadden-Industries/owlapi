import { OWLSyntaxError, ResourceLimitError } from "../../../io/errors.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/owlOntologyLoaderConfiguration.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdfjs/environment.js";

const TURTLE_MEDIA_TYPE = "text/turtle";
const N_TRIPLES_MEDIA_TYPE = "application/n-triples";
const N_QUADS_MEDIA_TYPE = "application/n-quads";
const TRIG_MEDIA_TYPE = "application/trig";
const EXACT_FORMAT_POLICIES = Object.freeze(
  new Map([
    [
      TURTLE_MEDIA_TYPE,
      Object.freeze({
        implementationFormat: TURTLE_MEDIA_TYPE,
        lexerOptions: Object.freeze({ n3: false }),
        syntaxName: "Turtle",
      }),
    ],
    [
      N_TRIPLES_MEDIA_TYPE,
      Object.freeze({
        implementationFormat: "N-Triples",
        lexerOptions: Object.freeze({ lineMode: true, n3: false }),
        syntaxName: "N-Triples",
      }),
    ],
    [
      N_QUADS_MEDIA_TYPE,
      Object.freeze({
        implementationFormat: "N-Quads",
        lexerOptions: Object.freeze({ lineMode: true, n3: false }),
        syntaxName: "N-Quads",
      }),
    ],
    [
      TRIG_MEDIA_TYPE,
      Object.freeze({
        implementationFormat: "TriG",
        lexerOptions: Object.freeze({ lineMode: false, n3: false }),
        syntaxName: "TriG",
      }),
    ],
  ]),
);
const DEFAULT_CHUNK_SIZE = 65_536;
const MAIN_THREAD_BUDGET_MS = 50;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const textEncoder = new TextEncoder();

const defaultImplementationLoader = () => import("n3/browser/n3.min.js");

const normalizeConfiguration = (configuration) =>
  configuration instanceof OWLOntologyLoaderConfiguration
    ? configuration
    : new OWLOntologyLoaderConfiguration(configuration);

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

const resourceLimit = (message, resource, limit, observed, details = {}) => {
  throw new ResourceLimitError(message, {
    ...details,
    limit,
    observed,
    resource,
  });
};

const abortError = (signal, syntaxName) => {
  if (typeof signal?.throwIfAborted === "function") {
    try {
      signal.throwIfAborted();
    } catch (error) {
      return error;
    }
  }
  const error = new Error(`The ${syntaxName} parse was aborted`);
  error.name = "AbortError";
  return error;
};

class ExecutionController {
  #configuration;
  #nextYieldAt;
  #startedAt;
  #syntaxName;

  constructor(configuration, syntaxName) {
    this.#configuration = configuration;
    this.#syntaxName = syntaxName;
    this.#startedAt = monotonicNow();
    this.#nextYieldAt = this.#startedAt + MAIN_THREAD_BUDGET_MS;
  }

  elapsedMs() {
    return monotonicNow() - this.#startedAt;
  }

  remainingTimeoutMs() {
    return Math.max(0, this.#configuration.timeoutMs - this.elapsedMs());
  }

  timeoutError() {
    return new ResourceLimitError(`${this.#syntaxName} parsing timed out`, {
      limit: this.#configuration.timeoutMs,
      observed: Math.ceil(this.elapsedMs()),
      resource: "timeoutMs",
    });
  }

  check() {
    const { signal, timeoutMs } = this.#configuration;
    if (signal?.aborted) {
      throw abortError(signal, this.#syntaxName);
    }
    const elapsed = this.elapsedMs();
    if (elapsed >= timeoutMs) {
      resourceLimit(
        `${this.#syntaxName} parsing timed out`,
        "timeoutMs",
        timeoutMs,
        Math.ceil(elapsed),
      );
    }
  }

  cooperate() {
    this.check();
    if (monotonicNow() < this.#nextYieldAt) {
      return undefined;
    }
    const scheduler = Reflect.get(globalThis, "scheduler");
    const yielded =
      typeof scheduler?.yield === "function"
        ? scheduler.yield()
        : new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    return Promise.resolve(yielded).then(() => {
      this.#nextYieldAt = monotonicNow() + MAIN_THREAD_BUDGET_MS;
      this.check();
    });
  }
}

const tokenByteLength = (token) => {
  const valueBytes = textEncoder.encode(
    `${token?.prefix || ""}${token?.value || ""}`,
  ).byteLength;
  const lexicalWidth =
    Number.isSafeInteger(token?.start) && Number.isSafeInteger(token?.end)
      ? Math.max(0, token.end - token.start)
      : 0;
  return Math.max(valueBytes, lexicalWidth);
};

const createBudgetedLexer = (
  Lexer,
  configuration,
  lexerOptions,
  syntaxName,
) => {
  const lexer = new Lexer(lexerOptions);
  if (!lexer || typeof lexer.tokenize !== "function") {
    throw new TypeError(
      "The N3 implementation Lexer must implement tokenize()",
    );
  }
  const tokenize = lexer.tokenize.bind(lexer);
  let tokenCount = 0;

  lexer.tokenize = (input, callback) => {
    if (typeof callback !== "function") {
      throw new TypeError("The N3 stream parser must tokenize asynchronously");
    }
    let failed = false;
    return tokenize(input, (error, token) => {
      if (failed) {
        return;
      }
      if (error) {
        failed = true;
        callback(error);
        return;
      }
      try {
        if (token?.type !== "eof") {
          tokenCount += 1;
          if (tokenCount > configuration.maxTokenCount) {
            resourceLimit(
              `The ${syntaxName} lexer-token limit was exceeded`,
              "maxTokenCount",
              configuration.maxTokenCount,
              tokenCount,
            );
          }
          const observed = tokenByteLength(token);
          if (observed > configuration.maxTokenLength) {
            resourceLimit(
              `An ${syntaxName} token exceeded the token byte limit`,
              "maxTokenLength",
              configuration.maxTokenLength,
              observed,
              { tokenType: token.type },
            );
          }
        }
        callback(null, token);
      } catch (cause) {
        failed = true;
        callback(cause);
      }
    });
  };
  return lexer;
};

const errorColumn = (cause) => {
  const token = cause?.context?.token;
  const previous = cause?.context?.previousToken;
  if (!Number.isSafeInteger(token?.start)) {
    return Number.isSafeInteger(previous?.end) ? previous.end + 1 : undefined;
  }
  if (
    token.line === previous?.line &&
    Number.isSafeInteger(previous.end) &&
    token.start < previous.end
  ) {
    return previous.end + 1;
  }
  return token.start + 1;
};

const normalizeParserFailure = (cause, configuration, syntaxName) => {
  if (
    cause?.code ||
    cause?.name === "AbortError" ||
    cause instanceof TypeError
  ) {
    return cause;
  }

  const column = errorColumn(cause);
  return new OWLSyntaxError(
    `The ${syntaxName} document is not valid ${syntaxName}`,
    {
      ...(configuration.sourceLocations &&
      Number.isSafeInteger(cause?.context?.line)
        ? { line: cause.context.line }
        : {}),
      ...(configuration.sourceLocations && column !== undefined
        ? { column }
        : {}),
      cause,
      parserMessage: String(cause?.message || cause),
      syntax: syntaxName,
    },
  );
};

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

const validateTermLength = (term, configuration, syntaxName) => {
  if (!term || term.termType === "DefaultGraph") {
    return;
  }
  if (term.termType === "Quad") {
    validateTermLength(term.subject, configuration, syntaxName);
    validateTermLength(term.predicate, configuration, syntaxName);
    validateTermLength(term.object, configuration, syntaxName);
    validateTermLength(term.graph, configuration, syntaxName);
    return;
  }
  const observed = textEncoder.encode(term.value || "").byteLength;
  if (observed > configuration.maxTokenLength) {
    resourceLimit(
      `An RDF term produced from ${syntaxName} exceeded the token byte limit`,
      "maxTokenLength",
      configuration.maxTokenLength,
      observed,
      { termType: term.termType },
    );
  }
  if (term.termType === "Literal") {
    validateTermLength(term.datatype, configuration, syntaxName);
    for (const [termType, value] of [
      ["LanguageTag", term.language],
      ["BaseDirection", term.direction],
    ]) {
      const componentBytes = textEncoder.encode(value || "").byteLength;
      if (componentBytes > configuration.maxTokenLength) {
        resourceLimit(
          `A ${syntaxName} literal component exceeded the token byte limit`,
          "maxTokenLength",
          configuration.maxTokenLength,
          componentBytes,
          { termType },
        );
      }
    }
  }
};

const canonicalTerm = (term, syntaxName) => {
  switch (term?.termType) {
    case "NamedNode":
      return rdfDataFactory.namedNode(term.value);
    case "BlankNode":
      return rdfDataFactory.blankNode(term.value);
    case "Literal":
      return rdfDataFactory.literal(
        term.value,
        term.language
          ? {
              direction: term.direction?.toLowerCase() || undefined,
              language: term.language.toLowerCase(),
            }
          : rdfDataFactory.namedNode(term.datatype.value),
      );
    case "DefaultGraph":
      return rdfDataFactory.defaultGraph();
    case "Quad":
      return rdfDataFactory.quad(
        canonicalTerm(term.subject, syntaxName),
        canonicalTerm(term.predicate, syntaxName),
        canonicalTerm(term.object, syntaxName),
        canonicalTerm(term.graph, syntaxName),
      );
    default:
      throw new TypeError(
        `The ${syntaxName} parser emitted an unsupported RDF/JS term: ${term?.termType}`,
      );
  }
};

const canonicalQuad = (quad, syntaxName) => {
  if (quad?.termType !== "Quad") {
    throw new TypeError(`The ${syntaxName} parser emitted a non-quad value`);
  }
  return canonicalTerm(quad, syntaxName);
};

export class N3SyntaxAdapter {
  #chunkSize;
  #implementationFormat;
  #lexerOptions;
  #loadImplementation;
  #mediaType;
  #syntaxName;

  constructor({
    chunkSize = DEFAULT_CHUNK_SIZE,
    loadImplementation = defaultImplementationLoader,
    mediaType,
    syntaxName,
  } = {}) {
    const formatPolicy = EXACT_FORMAT_POLICIES.get(mediaType);
    if (!formatPolicy || formatPolicy.syntaxName !== syntaxName) {
      throw new RangeError(
        "The N3 adapter requires a supported exact-format policy",
      );
    }
    if (typeof loadImplementation !== "function") {
      throw new TypeError("loadImplementation must be a function");
    }
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
      throw new RangeError("chunkSize must be a positive safe integer");
    }
    this.#chunkSize = chunkSize;
    this.#implementationFormat = formatPolicy.implementationFormat;
    this.#lexerOptions = formatPolicy.lexerOptions;
    this.#loadImplementation = loadImplementation;
    this.#mediaType = mediaType;
    this.#syntaxName = syntaxName;
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
    const execution = new ExecutionController(
      normalizedConfiguration,
      this.#syntaxName,
    );
    execution.check();
    const sourceText = source.getText();
    if (typeof sourceText !== "string") {
      throw new TypeError(`${this.#syntaxName} source text must be a string`);
    }
    const inputBytes = textEncoder.encode(sourceText).byteLength;
    if (inputBytes > normalizedConfiguration.maxInputBytes) {
      resourceLimit(
        `The ${this.#syntaxName} input byte limit was exceeded`,
        "maxInputBytes",
        normalizedConfiguration.maxInputBytes,
        inputBytes,
      );
    }

    const implementation = await this.#loadImplementation();
    execution.check();
    if (
      typeof implementation?.Lexer !== "function" ||
      typeof implementation?.StreamParser !== "function"
    ) {
      throw new TypeError(
        "The N3 implementation must export Lexer and StreamParser",
      );
    }

    const parser = new implementation.StreamParser({
      baseIRI: source.getDocumentIRI()?.value || "",
      factory: rdfDataFactory,
      format: this.#implementationFormat,
      lexer: createBudgetedLexer(
        implementation.Lexer,
        normalizedConfiguration,
        this.#lexerOptions,
        this.#syntaxName,
      ),
    });
    if (
      !parser ||
      typeof parser.on !== "function" ||
      typeof parser.write !== "function" ||
      typeof parser.end !== "function" ||
      typeof parser.destroy !== "function"
    ) {
      throw new TypeError(
        "The N3 implementation must provide a writable RDF/JS quad stream",
      );
    }

    const dataset = rdfDatasetFactory.dataset();
    const prefixes = Object.create(null);
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
              `The ${this.#syntaxName} quad limit was exceeded`,
              "maxQuads",
              normalizedConfiguration.maxQuads,
              emittedQuads,
            );
          }
          let normalizedQuad = canonicalQuad(quad, this.#syntaxName);
          if (this.#mediaType === N_TRIPLES_MEDIA_TYPE) {
            // N-Triples is an RDF graph syntax: dependency-specific stream
            // behavior must not introduce dataset membership at this seam.
            normalizedQuad = rdfDataFactory.quad(
              normalizedQuad.subject,
              normalizedQuad.predicate,
              normalizedQuad.object,
            );
          }
          for (const term of [
            normalizedQuad.subject,
            normalizedQuad.predicate,
            normalizedQuad.object,
            normalizedQuad.graph,
          ]) {
            validateTermLength(term, normalizedConfiguration, this.#syntaxName);
            blankNodeKeys(term, blankNodes);
          }
          if (blankNodes.size > normalizedConfiguration.maxBlankNodes) {
            resourceLimit(
              `The ${this.#syntaxName} blank-node limit was exceeded`,
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
      parser.on("prefix", (prefix, iri) => {
        // Prefixes are document metadata only for formats that can declare
        // them. The line formats must remain prefix-free even if a replacement
        // implementation emits an unexpected stream event.
        if (
          this.#mediaType === TURTLE_MEDIA_TYPE ||
          this.#mediaType === TRIG_MEDIA_TYPE
        ) {
          prefixes[prefix] = iri.value;
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
        adapterFailure = abortError(signal, this.#syntaxName);
        parser.destroy(adapterFailure);
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      for (const chunk of chunksOf(sourceText, this.#chunkSize)) {
        execution.check();
        if (!parser.write(chunk)) {
          await waitForDrain(parser);
        }
        const yieldRequest = execution.cooperate();
        if (yieldRequest) {
          await yieldRequest;
        }
      }
      parser.end();
      await completion;
      execution.check();
      return Object.freeze({
        dataset,
        prefixes: Object.freeze({ ...prefixes }),
      });
    } catch (cause) {
      if (!parser.destroyed) {
        parser.destroy();
      }
      throw normalizeParserFailure(
        adapterFailure || cause,
        normalizedConfiguration,
        this.#syntaxName,
      );
    } finally {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

export const createTurtleSyntaxAdapter = (options = {}) =>
  new N3SyntaxAdapter({
    ...options,
    mediaType: TURTLE_MEDIA_TYPE,
    syntaxName: "Turtle",
  });

export const createNTriplesSyntaxAdapter = (options = {}) =>
  new N3SyntaxAdapter({
    ...options,
    mediaType: N_TRIPLES_MEDIA_TYPE,
    syntaxName: "N-Triples",
  });

export const createNQuadsSyntaxAdapter = (options = {}) =>
  new N3SyntaxAdapter({
    ...options,
    mediaType: N_QUADS_MEDIA_TYPE,
    syntaxName: "N-Quads",
  });

export const createTriGSyntaxAdapter = (options = {}) =>
  new N3SyntaxAdapter({
    ...options,
    mediaType: TRIG_MEDIA_TYPE,
    syntaxName: "TriG",
  });
