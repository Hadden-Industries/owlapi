import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { open, realpath } from "node:fs/promises";
import { constants as fileConstants } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  readDocumentBytes,
  readDecodedDocumentBytes,
} from "./documentBytes.js";
import { DocumentLoadError, ResourceLimitError } from "../errors.js";
import { StringDocumentSource } from "../stringDocumentSource.js";
import { IRI } from "../../model/structural.js";
import { OWLOntologyLoaderConfiguration } from "../../model/owlOntologyLoaderConfiguration.js";
import { assertDocumentLoaderAuthorization } from "../../internal/loading/documentLoaderAuthorization.js";
import { awaitAbortableOperation } from "../../internal/loading/awaitAbortableOperation.js";
import { OntologyBehaviorContext } from "../../internal/behavior/ontologyBehaviorContext.js";
import {
  jsonLdAlternateDocument,
  readJavaJsonDocument,
} from "./jsonLdDocumentResponse.js";

const defaultAcceptHeader =
  "application/rdf+xml, application/xml; q=0.7, text/xml; q=0.6, text/plain; q=0.1, */*; q=0.09";

/** Node timers overflow above a signed 32-bit delay. Keep the caller's actual
 * deadline and schedule bounded waits; never turn a long limit into 1 ms.
 */
const scheduleOperationDeadline = (timeoutMilliseconds, callback) => {
  if (!Number.isFinite(timeoutMilliseconds)) return () => {};
  const expiresAt = performance.now() + timeoutMilliseconds;
  let timer;
  const schedule = () => {
    const remainingMilliseconds = expiresAt - performance.now();
    if (remainingMilliseconds <= 0) callback();
    else
      timer = setTimeout(schedule, Math.min(remainingMilliseconds, 2147483647));
  };
  schedule();
  return () => clearTimeout(timer);
};

/** Request one already authorized, pinned address. Node owns HTTP/TLS parsing;
 * disabling pooling ensures a later request cannot reuse an earlier access grant.
 * The Java connection timeout stops at TCP connection, not at response/body IO.
 */
const requestHttpResponse = (
  url,
  destination,
  headers,
  connectionTimeoutMilliseconds,
  signal,
) =>
  new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/gu, ""),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
        agent: false,
        signal,
        family: destination.family,
        lookup(_hostname, options, callback) {
          if (options.all) callback(null, [destination]);
          else callback(null, destination.address, destination.family);
        },
      },
      resolve,
    );
    let timer;
    const clearConnectionTimer = () => clearTimeout(timer);
    request.once("socket", (socket) => {
      const timeoutMilliseconds = connectionTimeoutMilliseconds;
      if (socket.connecting && timeoutMilliseconds > 0) {
        timer = setTimeout(() => {
          request.destroy(
            new DocumentLoadError("The connection timeout expired", {
              phase: "connection",
              timeoutMilliseconds,
            }),
          );
        }, timeoutMilliseconds);
        socket.once("connect", clearConnectionTimer);
        socket.once("error", clearConnectionTimer);
      }
    });
    request.once("error", (error) => {
      clearConnectionTimer();
      reject(error);
    });
    request.once("close", clearConnectionTimer);
    request.end();
  });

/** Explicit Node resource capability; the caller owns access authorization. */
export class NodeDocumentLoader {
  #authorize;

  constructor({ authorize } = {}) {
    if (typeof authorize !== "function")
      throw new TypeError("NodeDocumentLoader requires an authorize callback");
    this.#authorize = authorize;
    Object.freeze(this);
  }

  /** Also used by manager/context-cache admission; a cached value requires a
   * current grant even when no concrete network operation is needed.
   */
  authorize(documentIRI, context) {
    return this.#authorize(
      documentIRI,
      Object.freeze({
        ...context,
        operation: context.operation ?? "use-document",
      }),
    );
  }

  async load(
    documentIRI,
    {
      config = new OWLOntologyLoaderConfiguration(),
      purpose = "ontology-document",
      signal = config.signal,
    } = {},
  ) {
    config = OWLOntologyLoaderConfiguration.prototype.with.call(config, {});
    const definition = new OntologyBehaviorContext(
      config.getBehaviorProfileId(),
    ).behaviorProfileDefinition;
    const policy =
      purpose === "jsonld-context" && definition.jsonLdContextTransportPolicy
        ? definition.jsonLdContextTransportPolicy
        : definition.documentTransportPolicy;
    const connectionTimeoutMilliseconds =
      policy.connectionTimeoutMilliseconds ?? config.getConnectionTimeout();
    if (connectionTimeoutMilliseconds < 0)
      throw new RangeError(
        "connection timeout must not be negative at resource acquisition",
      );
    const deadline = new AbortController();
    const effectiveSignal = deadline.signal;
    const deadlineError = () =>
      new ResourceLimitError("The document acquisition deadline was exceeded", {
        resource: "deadline",
        limit: config.timeoutMs,
      });
    if (config.timeoutMs === 0) throw deadlineError();
    // Configuration accepts the AbortSignal interface across realms and host
    // adapters. Core Node receives our native controller, not that foreign object.
    const onAbort = () =>
      deadline.abort(
        signal.reason ??
          new DOMException(
            "The document acquisition was aborted",
            "AbortError",
          ),
      );
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    const cancelDeadline = scheduleOperationDeadline(config.timeoutMs, () =>
      deadline.abort(deadlineError()),
    );
    try {
      effectiveSignal.throwIfAborted();
      return await awaitAbortableOperation(
        this.#loadDocument(documentIRI, {
          config,
          purpose,
          signal: effectiveSignal,
          policy,
          connectionTimeoutMilliseconds,
        }),
        effectiveSignal,
      );
    } catch (error) {
      if (effectiveSignal.aborted) throw effectiveSignal.reason;
      throw error;
    } finally {
      cancelDeadline();
      signal?.removeEventListener?.("abort", onAbort);
    }
  }

  async #loadDocument(
    documentIRI,
    { config, purpose, signal, policy, connectionTimeoutMilliseconds },
  ) {
    let url = new URL(documentIRI.value);
    const sourceIRI = (resolvedIRI) =>
      policy.documentBaseIRI === "requested-document"
        ? documentIRI
        : resolvedIRI;
    let headers =
      policy.requestHeaders ??
      Object.freeze({
        Accept: defaultAcceptHeader,
        ...(config.getAuthorizationValue()
          ? { Authorization: config.getAuthorizationValue() }
          : {}),
        ...(config.isAcceptingHTTPCompression()
          ? { "Accept-Encoding": "xz,gzip,deflate" }
          : {}),
      });
    let automaticRequestCount = 1;
    let redirectCount = 0;
    const manualRedirectLocations = new Set();
    let redirectFrom;
    for (;;) {
      if (url.protocol === "file:") {
        if (
          policy.returnsNoSourceForNonpositiveAttempts &&
          config.getRetriesToAttempt() <= 0
        )
          return undefined;
        return this.#readFile(url, {
          config,
          purpose,
          signal,
          redirectFrom,
          policy,
          headers: Object.freeze({}),
          sourceIRI: sourceIRI(IRI.create(url.href)),
        });
      }
      if (!["http:", "https:"].includes(url.protocol))
        throw new DocumentLoadError("The transport protocol is not supported", {
          phase: "protocol",
        });
      const iri = IRI.create(url.href);
      const response = await this.#request(url, {
        config,
        purpose,
        signal,
        headers,
        redirectFrom,
        connectionTimeoutMilliseconds,
      });
      try {
        const status = response.statusCode;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status)) {
          const relativeTarget =
            location === undefined ? undefined : new URL(location, url);
          const automatic =
            policy.automaticRedirectStatusCodes.includes(status) &&
            (!policy.automaticRedirectRequiresSameProtocol ||
              relativeTarget?.protocol === url.protocol);
          const manual =
            !automatic &&
            policy.allowsManualRedirects &&
            config.isFollowRedirects();
          if (automatic || manual) {
            if (redirectCount >= config.maxRedirects)
              throw new ResourceLimitError(
                "The configured redirect limit was exceeded",
                {
                  resource: "redirects",
                  limit: config.maxRedirects,
                  observed: redirectCount + 1,
                },
              );
            if (
              automatic &&
              automaticRequestCount >=
                policy.maxRequestsInAutomaticRedirectChain
            )
              throw new DocumentLoadError(
                "The Java automatic redirect chain limit was exceeded",
                {
                  phase: "redirect",
                  resource: "automaticRedirectRequests",
                  limit: policy.maxRequestsInAutomaticRedirectChain,
                },
              );
            if (manual && manualRedirectLocations.has(location))
              throw new DocumentLoadError(
                "The Java manual redirect cycle was detected",
                { phase: "redirect" },
              );
            if (manual) manualRedirectLocations.add(location);
            if (location === undefined)
              throw new DocumentLoadError(
                "The redirect has no Location header",
                { phase: "redirect" },
              );
            const target =
              manual && policy.requiresAbsoluteManualRedirectLocation
                ? new URL(location)
                : relativeTarget;
            if (
              (manual && policy.dropsCredentialsOnManualRedirect) ||
              target.origin !== url.origin
            ) {
              const withoutCredentials = { ...headers };
              delete withoutCredentials.Authorization;
              headers = Object.freeze(withoutCredentials);
            }
            automaticRequestCount = automatic ? automaticRequestCount + 1 : 1;
            redirectCount++;
            redirectFrom = iri;
            url = target;
            continue;
          }
        }
        // Java acquires HTTP response headers even when its configured stream
        // attempt count means getInputStream is never consumed.
        if (
          policy.returnsNoSourceForNonpositiveAttempts &&
          config.getRetriesToAttempt() <= 0
        )
          return undefined;
        if (
          policy.acceptedResponseStatusCodes
            ? !policy.acceptedResponseStatusCodes.includes(status)
            : status >= 400
        )
          throw new DocumentLoadError(
            "The server rejected document acquisition",
            { phase: "response", statusCode: status },
          );
        if (policy.readsJavaJsonDocument) {
          const alternate = jsonLdAlternateDocument(response, url);
          if (alternate) {
            if (
              automaticRequestCount >=
              policy.maxRequestsInAutomaticRedirectChain
            )
              throw new DocumentLoadError(
                "The Java context request chain limit was exceeded",
                {
                  phase: "redirect",
                  limit: policy.maxRequestsInAutomaticRedirectChain,
                },
              );
            if (redirectCount >= config.maxRedirects)
              throw new ResourceLimitError(
                "The configured redirect limit was exceeded",
                {
                  resource: "redirects",
                  limit: config.maxRedirects,
                  observed: redirectCount + 1,
                },
              );
            automaticRequestCount++;
            redirectCount++;
            redirectFrom = iri;
            url = alternate;
            continue;
          }
          return new StringDocumentSource(
            await readJavaJsonDocument(response, config.maxRemoteDocumentBytes),
            {
              documentIRI: sourceIRI(iri),
              contentType: response.headers["content-type"],
            },
          );
        }
        const bytes = policy.usesDocumentEnvelopeDecoding
          ? await readDecodedDocumentBytes(response, {
              encoding: response.headers["content-encoding"],
              disposition: response.headers["content-disposition"],
              documentIRI,
              config,
              signal,
              rawByteResource: "remoteDocumentBytes",
              maximumRawBytes: config.maxRemoteDocumentBytes,
            })
          : await readDocumentBytes(
              response,
              "remoteDocumentBytes",
              config.maxRemoteDocumentBytes,
            );
        return new StringDocumentSource(bytes.toString("utf8"), {
          documentIRI: sourceIRI(iri),
          contentType: response.headers["content-type"],
        });
      } finally {
        response.destroy();
      }
    }
  }

  async #readFile(url, context) {
    if (url.hostname)
      throw new DocumentLoadError(
        "The Node file capability supports local files only",
        { phase: "protocol" },
      );
    const { config, signal } = context;
    const iri = IRI.create(url.href);
    const requestedFilePath = fileURLToPath(url);
    await assertDocumentLoaderAuthorization(this, iri, {
      ...context,
      operation: "resolve-file",
      requestedFilePath,
    });
    signal.throwIfAborted();
    const resolvedFilePath = await realpath(requestedFilePath);
    await assertDocumentLoaderAuthorization(this, iri, {
      ...context,
      operation: "read-file",
      requestedFilePath,
      resolvedFilePath,
      requiresStablePathAncestors: true,
    });
    signal.throwIfAborted();
    // The read-file grant includes the host's guarantee that every ancestor is
    // trusted and stable during acquisition. Portable Node cannot establish
    // that guarantee. O_NOFOLLOW additionally protects the final component on
    // hosts that provide it; it does not constrain ancestor traversal.
    // eslint-disable-next-line no-bitwise -- Node open flags are a native bitmask.
    const openFlags = fileConstants.O_RDONLY | (fileConstants.O_NOFOLLOW ?? 0);
    const file = await open(resolvedFilePath, openFlags);
    try {
      signal.throwIfAborted();
      const stream = file.createReadStream({ autoClose: false, signal });
      if (context.policy.readsJavaJsonDocument)
        return new StringDocumentSource(
          await readJavaJsonDocument(
            stream,
            config.maxInputBytes,
            "inputBytes",
          ),
          { documentIRI: context.sourceIRI },
        );
      const bytes = context.policy.usesDocumentEnvelopeDecoding
        ? await readDecodedDocumentBytes(stream, {
            documentIRI: context.sourceIRI,
            config,
            signal,
          })
        : await readDocumentBytes(stream, "inputBytes", config.maxInputBytes);
      return new StringDocumentSource(bytes.toString("utf8"), {
        documentIRI: context.sourceIRI,
      });
    } finally {
      await file.close();
    }
  }

  async #request(url, context) {
    const { signal, headers, connectionTimeoutMilliseconds } = context;
    const iri = IRI.create(url.href);
    await assertDocumentLoaderAuthorization(this, iri, {
      ...context,
      operation: "request-document",
    });
    signal?.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    let destination;
    const family = isIP(hostname);
    if (family) destination = { address: hostname, family };
    else {
      await assertDocumentLoaderAuthorization(this, iri, {
        ...context,
        operation: "resolve-hostname",
        hostname,
      });
      signal?.throwIfAborted();
      // The qualified JDK uses IPv4-first InetAddress selection. Pin that one
      // approved result so core HTTP cannot perform a second unchecked lookup.
      destination = await lookup(hostname, { order: "ipv4first" });
    }
    signal?.throwIfAborted();
    await assertDocumentLoaderAuthorization(this, iri, {
      ...context,
      operation: "connect-http",
      resolvedAddress: destination.address,
      addressFamily: destination.family,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    });
    signal?.throwIfAborted();
    return requestHttpResponse(
      url,
      destination,
      headers,
      connectionTimeoutMilliseconds,
      signal,
    );
  }
}
