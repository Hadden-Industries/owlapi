import { once } from "node:events";
import { readFileSync } from "node:fs";
import { realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";

const captureFile = new URL(
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
  import.meta.url,
);
const probeByKind = {
  loopback: "ObserveNetworkContracts",
  compression: "ObserveCompressionContracts",
  "context-transport": "ObserveJsonLdTransport",
};
const owlClass = "http://www.w3.org/2002/07/owl#Class";
const context = { "@context": { Class: owlClass } };
const token = "Bearer owned-test-token";
const redirectedDocument =
  "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#' xmlns:owl='http://www.w3.org/2002/07/owl#'><owl:Class rdf:about='C'/></rdf:RDF>";
const matchedNetwork =
  /^(?:attempts-|connect-timeout-|redirect-|status-503$|encoding-deflate$)/u;
const contextBase = "application/ld+json";

const returned = (text) => ({ status: "return", text });
const refused = { status: "refused" };
const policyRefusal = {
  ...refused,
  code: "SECURITY_POLICY_VIOLATION",
  resource: "externalDocumentAccess",
};
const response = (outcome, decode = (text) => text) => {
  if (outcome.startsWith("RETURN:")) return returned(decode(outcome.slice(7)));
  if (outcome.startsWith("THROW:")) return refused;
  if (outcome === "EMPTY") return { status: "empty" };
  throw new Error(`Unknown released transport outcome: ${outcome}`);
};
const utf8 = (bytes) => Buffer.from(bytes, "base64").toString("utf8");

function readTransportProbe(kind) {
  const { observations } = JSON.parse(readFileSync(captureFile, "utf8"));
  const observation = observations.find(
    ({ probeId }) => probeId === probeByKind[kind],
  );
  if (!observation || observation.exitCode !== 0)
    throw new Error(
      `Missing successful released transport observation: ${kind}`,
    );
  const source = readFileSync(
    new URL(`./${observation.probeId}.java`, import.meta.url),
  );
  if (sha256(source) !== observation.sourceSha256)
    throw new Error(
      `The source of the released transport probe changed: ${kind}`,
    );
  return observation;
}

function socketRows(stdout) {
  return stdout
    .trimEnd()
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([id]) => matchedNetwork.test(id))
    .map(([id, outcome, events]) => ({
      id,
      outcome:
        id === "redirect-rdf-base" ? returned(outcome) : response(outcome),
      ...(id === "redirect-rdf-base"
        ? {}
        : { events: events ? events.split(/ (?=\/)/u) : [] }),
    }));
}

export function recordedCompressionVectors(
  stdout = readTransportProbe("compression").stdout,
) {
  return stdout
    .trimEnd()
    .split("\n")
    .map((line) => {
      const [name, suffix, encoding, disposition, base64, outcome] =
        line.split("\t");
      return {
        name,
        suffix,
        encoding,
        disposition,
        bytes: Buffer.from(base64, "base64"),
        outcome,
      };
    });
}

export function recordedContextVectors(
  stdout = readTransportProbe("context-transport").stdout,
) {
  return stdout
    .trimEnd()
    .split("\n")
    .filter((line) => line.startsWith("document-"))
    .map((line) => {
      const [
        name,
        outcome,
        requestCount,
        events,
        bytes,
        contentType,
        link,
        encoding,
      ] = line.split("\t");
      return {
        name: name.slice(9),
        outcome,
        requests: Number(requestCount),
        events,
        bytes: Buffer.from(bytes, "base64"),
        contentType,
        link,
        encoding,
      };
    });
}

function contextOutcome(outcome) {
  if (outcome.startsWith("THROW:")) return refused;
  const [json, base] = outcome.slice(7).split(";base=");
  return {
    status: "return",
    document: JSON.parse(utf8(json)),
    path: base.split(";context=")[0],
  };
}

function contextRequests(names) {
  return names
    .split(/ (?=\/)/u)
    .map((entry) => entry.slice(0, entry.indexOf("[")));
}

export function normalizeTransportCapture(kind, stdout) {
  if (typeof stdout !== "string") return null;
  if (kind === "loopback") return socketRows(stdout);
  if (kind === "compression") {
    return recordedCompressionVectors(stdout).map(({ name, outcome }) => ({
      id: name,
      outcome: response(outcome, utf8),
    }));
  }
  const documents = recordedContextVectors(stdout).map(
    ({ name, outcome, requests, events }) => ({
      id: `document-${name}`,
      outcome: contextOutcome(outcome),
      requests,
      paths: contextRequests(events),
    }),
  );
  const acquisitions = stdout
    .trimEnd()
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([id]) => id.startsWith("context-"))
    .map(([id, outcome, requests, events]) => ({
      id,
      outcome: response(outcome),
      requests: Number(requests),
      paths: contextRequests(events),
    }));
  return [...acquisitions, ...documents];
}

const normativeLoopback = {
  denied: policyRefusal,
  blockedPaths: [],
  redirected: returned("${HTTP_BASE}/base/C"),
  redirectPaths: ["/relative/rdf", "/base/final.rdf"],
  byteLimit: {
    ...refused,
    code: "RESOURCE_LIMIT_EXCEEDED",
    resource: "remoteDocumentBytes",
  },
  file: returned("owned-file"),
  concreteFileAuthorized: true,
};
const normativeContext = {
  denied: policyRefusal,
  paths: ["/document/alternate"],
};

export function transportComparisonCases() {
  return [
    [
      "loopback",
      "node-transport/loopback",
      "BEHAVIOR-NODE-TRANSPORT",
      normativeLoopback,
    ],
    ["compression", "node-transport/compression", "BEHAVIOR-NODE-TRANSPORT"],
    [
      "context-transport",
      "jsonld/context-transport",
      "BEHAVIOR-JSONLD-CONTEXT-PROVIDER",
      normativeContext,
    ],
  ].map(([kind, id, decisionId, normative]) => {
    const capture = readTransportProbe(kind);
    const input = { id };
    const definition = {
      schemaVersion: 1,
      scenario: "public-api-behavior",
      scenarioVersion: 1,
      observationPoint: kind,
      behaviorProfileId: "java-owlapi-5.5.1",
      measurements: ["behavior"],
      input,
      transport: {
        decisionId,
        kind,
        probeId: capture.probeId,
        probeSourceSha256: capture.sourceSha256,
        nativeCaptureSha256: sha256(capture.stdout),
        javaRows: normalizeTransportCapture(kind, capture.stdout),
        ...(normative ? { normative } : {}),
      },
    };
    return {
      input,
      definition,
      caseId: comparisonIdentity(definition),
      imports: [],
    };
  });
}

async function withOwnedServer(handler, run) {
  const server = createServer(handler);
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }
}

function redirect(response, status, location, body = "") {
  response.writeHead(Number(status), { Location: location });
  response.end(body);
}

function attemptFailure(error) {
  return {
    status: "refused",
    code: error.code ?? error.name,
    ...(error.resource ? { resource: error.resource } : {}),
  };
}

async function loadSource(api, loader, iri, config, purpose) {
  try {
    return {
      source: await loader.load(api.IRI.create(iri), { config, purpose }),
    };
  } catch (error) {
    return { error: attemptFailure(error) };
  }
}

function comparableFailure(error) {
  return [
    "DOCUMENT_LOAD_FAILED",
    "ERR_INVALID_URL",
    "IllegalArgumentException",
    "RangeError",
    "SyntaxError",
    "TypeError",
    "OWL_SYNTAX_ERROR",
  ].includes(error.code)
    ? refused
    : error;
}

function observedText({ source, error }) {
  if (error) return comparableFailure(error);
  return source === undefined
    ? { status: "empty" }
    : returned(source.getText());
}

function compressionObservations(api, config) {
  const vectors = recordedCompressionVectors();
  return withOwnedServer(
    (request, response) => {
      const vector = vectors.find(
        ({ name, suffix }) => request.url === `/${name}${suffix}`,
      );
      if (!vector) {
        response.writeHead(404).end();
        return;
      }
      if (vector.encoding)
        response.setHeader("Content-Encoding", vector.encoding);
      if (vector.disposition)
        response.setHeader("Content-Disposition", vector.disposition);
      if (vector.name === "zip-open-tail") {
        response.write(vector.bytes);
        response.flushHeaders();
      } else response.end(vector.bytes);
    },
    async (base) => {
      const loader = new api.NodeDocumentLoader({
        authorize: (iri) => iri.value.startsWith(base + "/"),
      });
      const rows = [];
      for (const { name, suffix } of vectors) {
        const observed = await loadSource(
          api,
          loader,
          `${base}/${name}${suffix}`,
          config.with({ timeoutMs: 2000 }),
        );
        rows.push({
          id: name,
          outcome: ["Z_DATA_ERROR", "Z_BUF_ERROR", 9, 10].includes(
            observed.error?.code,
          )
            ? refused
            : observedText(observed),
        });
      }
      return { rows };
    },
  );
}

function networkQuery(id, config) {
  if (id.startsWith("attempts-"))
    return [
      "/ok",
      config.setRetriesToAttempt(Number(id.slice("attempts-".length))),
    ];
  if (id.startsWith("connect-timeout-"))
    return [
      "/slow-body",
      config.setConnectionTimeout(Number(id.slice("connect-timeout-".length))),
    ];
  if (id.startsWith("redirect-chain-")) {
    const [, , status, count] = id.split("-");
    return [`/redirect/${status}/${count}`, config];
  }
  const settings = /^redirect-(\d+)-(true|false)$/u.exec(id);
  if (settings) {
    const [, status, follows] = settings;
    return [
      `/redirect/${status}/1`,
      config
        .setFollowRedirects(follows === "true")
        .setAuthorizationValue(token),
    ];
  }
  const paths = {
    "redirect-relative": "/relative",
    "redirect-loop": "/loop",
    "redirect-file": "/file",
    "status-503": "/error",
    "encoding-deflate": "/deflate",
    "redirect-rdf-base": "/relative/rdf",
  };
  if (!Object.hasOwn(paths, id))
    throw new Error(`Unknown transport case: ${id}`);
  return [paths[id], config];
}

async function parsedBase(api, loader, base, profile, config) {
  const source = await loader.load(api.IRI.create(base + "/relative/rdf"), {
    config,
  });
  const manager = api.OWLManager.createOWLOntologyManager({
    behaviorProfileId: profile,
  });
  const ontology = await manager.loadOntologyFromOntologyDocument(source);
  const classes = [...ontology.getClassesInSignature()];
  if (classes.length !== 1)
    throw new Error("Redirected document has the wrong class signature");
  return returned(classes[0].iri.value.replace(base, "${HTTP_BASE}"));
}

async function networkObservations(api, request, config, normative, directory) {
  const file = join(await realpath(directory), "js-owned-document.txt");
  await writeFile(file, "owned-file", { flag: "wx" });
  const fileIRI = pathToFileURL(file).href;
  const events = [];
  let origin;
  return withOwnedServer(
    (incoming, outgoing) => {
      const path = incoming.url;
      events.push(`${path}[auth=${incoming.headers.authorization ?? "none"}]`);
      outgoing.setHeader("Content-Type", "text/plain");
      const hop = /^\/redirect\/(30[12378])\/(\d+)$/u.exec(path);
      if (hop) {
        const [, status, remaining] = hop;
        redirect(
          outgoing,
          status,
          Number(remaining) === 1
            ? origin + "/ok"
            : `${origin}/redirect/${status}/${Number(remaining) - 1}`,
          "redirect-body",
        );
      } else if (path === "/relative")
        redirect(outgoing, 308, "/ok", "redirect-body");
      else if (path === "/loop")
        redirect(outgoing, 308, origin + "/loop", "redirect-body");
      else if (path === "/file")
        redirect(outgoing, 308, fileIRI, "redirect-body");
      else if (path === "/relative/rdf")
        redirect(outgoing, 302, origin + "/base/final.rdf", "redirect-body");
      else if (path === "/base/final.rdf") {
        outgoing
          .setHeader("Content-Type", "application/rdf+xml")
          .end(redirectedDocument);
      } else if (path === "/slow-body") {
        outgoing.flushHeaders();
        setTimeout(() => outgoing.end("ok"), 80);
      } else if (path === "/deflate")
        outgoing
          .setHeader("Content-Encoding", "deflate")
          .end(deflateRawSync("ok"));
      else if (path === "/error") outgoing.writeHead(503).end("error");
      else if (path === "/ok") outgoing.end("ok");
      else outgoing.writeHead(404).end();
    },
    async (base) => {
      origin = base;
      const isOwned = (iri) =>
        iri.value.startsWith(base + "/") || iri.value === fileIRI;
      const loader = new api.NodeDocumentLoader({ authorize: isOwned });
      const rows = [];
      for (const { id } of request.transport.javaRows) {
        events.length = 0;
        const [path, settings] = networkQuery(id, config);
        if (id === "redirect-rdf-base") {
          rows.push({
            id,
            outcome: await parsedBase(
              api,
              loader,
              base,
              config.getBehaviorProfileId(),
              settings,
            ),
          });
        } else {
          const outcome = observedText(
            await loadSource(api, loader, base + path, settings),
          );
          rows.push({ id, outcome, events: events.slice() });
        }
      }
      events.length = 0;
      const deniedLoader = new api.NodeDocumentLoader({
        authorize: () => false,
      });
      const { error: denied } = await loadSource(
        api,
        deniedLoader,
        base + "/ok",
        normative,
      );
      const paths = () =>
        events.splice(0).map((event) => event.slice(0, event.indexOf("[")));
      const blockedPaths = paths();
      const redirected = await parsedBase(
        api,
        loader,
        base,
        normative.getBehaviorProfileId(),
        normative.with({ maxRedirects: 1 }),
      );
      const redirectPaths = paths();
      const { error: byteLimit } = await loadSource(
        api,
        loader,
        base + "/ok",
        normative.with({ maxRemoteDocumentBytes: 1 }),
      );
      let concreteFileAuthorized = false;
      const fileLoader = new api.NodeDocumentLoader({
        authorize(iri, context) {
          if (context.operation === "read-file") {
            concreteFileAuthorized =
              context.resolvedFilePath === file &&
              context.requiresStablePathAncestors;
          }
          return isOwned(iri);
        },
      });
      const fileOutcome = observedText(
        await loadSource(api, fileLoader, fileIRI, normative),
      );
      return {
        rows,
        controls: {
          denied,
          blockedPaths,
          redirected,
          redirectPaths,
          byteLimit,
          file: fileOutcome,
          concreteFileAuthorized,
        },
      };
    },
  );
}

function contextQuery(id) {
  if (id.startsWith("document-")) return `/document/${id.slice(9)}`;
  if (id.startsWith("context-redirect-count-"))
    return `/redirect/302/${id.slice(23)}`;
  if (id.startsWith("context-redirect-")) return `/redirect/${id.slice(17)}/1`;
  if (id.startsWith("context-status-")) return `/status/${id.slice(15)}`;
  if (id === "context-native-settings") return "/settings";
  if (id === "context-linked-remote") return "/document/context-link";
  return `/${id.slice(8)}`;
}

function contextObservations(api, config, recipe) {
  const fixtures = recordedContextVectors();
  const events = [];
  return withOwnedServer(
    (incoming, outgoing) => {
      const path = incoming.url;
      events.push({
        path,
        authorization: incoming.headers.authorization,
        encoding: incoming.headers["accept-encoding"],
      });
      if (path.startsWith("/document/")) {
        const fixture = fixtures.find(
          ({ name }) => path === `/document/${name}`,
        );
        if (!fixture) {
          outgoing.writeHead(404).end();
          return;
        }
        if (fixture.contentType)
          outgoing.setHeader("Content-Type", fixture.contentType);
        if (fixture.link) outgoing.setHeader("Link", fixture.link);
        if (fixture.encoding)
          outgoing.setHeader("Content-Encoding", fixture.encoding);
        outgoing.end(fixture.bytes);
        return;
      }
      const hop = /^\/redirect\/(30[12378])\/(\d+)$/u.exec(path);
      if (hop) {
        const [, status, count] = hop;
        redirect(
          outgoing,
          status,
          Number(count) === 1
            ? "/final"
            : `/redirect/${status}/${Number(count) - 1}`,
        );
      } else if (path === "/loop") redirect(outgoing, 302, "/loop");
      else {
        const status = path.startsWith("/status/")
          ? Number(path.slice(8))
          : 200;
        outgoing
          .writeHead(status, { "Content-Type": contextBase })
          .end(JSON.stringify(context));
      }
    },
    async (base) => {
      const allowed = (iri) => iri.value.startsWith(base + "/");
      const loader = new api.NodeDocumentLoader({ authorize: allowed });
      const independent = config
        .setConnectionTimeout(-1)
        .setRetriesToAttempt(0)
        .setFollowRedirects(false)
        .setAuthorizationValue(token)
        .setAcceptingHTTPCompression(false);
      const rows = [];
      for (const { id } of recipe.javaRows) {
        events.length = 0;
        const path = contextQuery(id);
        const { source, error } = await loadSource(
          api,
          loader,
          base + path,
          id === "context-native-settings" ? independent : config,
          "jsonld-context",
        );
        if (
          events.some(
            ({ authorization, encoding }) => authorization || encoding,
          )
        )
          throw new Error(
            "Context retrieval inherited ontology transport headers",
          );
        let outcome;
        if (error) outcome = comparableFailure(error);
        else {
          const document = JSON.parse(source.getText());
          const finalPath = new URL(source.getDocumentIRI().value).pathname;
          outcome = id.startsWith("document-")
            ? { status: "return", document, path: finalPath }
            : returned(
                document["@context"]?.Class === owlClass &&
                  finalPath === events.at(-1)?.path
                  ? "1"
                  : "unexpected",
              );
        }
        rows.push({
          id,
          outcome,
          requests: events.length,
          paths: events.map(({ path }) => path),
        });
      }
      events.length = 0;
      const deniedLoader = new api.NodeDocumentLoader({
        authorize: (iri) => allowed(iri) && !iri.value.endsWith("/json-type"),
      });
      const { error: denied } = await loadSource(
        api,
        deniedLoader,
        base + "/document/alternate",
        config,
        "jsonld-context",
      );
      return {
        rows,
        controls: { denied, paths: events.map(({ path }) => path) },
      };
    },
  );
}

export async function observeTransport(api, request, directory) {
  const config = new api.OWLOntologyLoaderConfiguration({
    behaviorProfileId: request.behaviorProfileId,
  });
  const normative = new api.OWLOntologyLoaderConfiguration();
  const { kind } = request.transport;
  let observation;
  if (kind === "compression")
    observation = await compressionObservations(api, config);
  else if (kind === "loopback")
    observation = await networkObservations(
      api,
      request,
      config,
      normative,
      directory,
    );
  else observation = await contextObservations(api, config, request.transport);
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: config.getBehaviorProfileId(),
      defaultBehaviorProfileId: normative.getBehaviorProfileId(),
    },
    load: { status: "completed" },
    networkBoundary: "owned-loopback",
    transport: observation.rows,
    ...(observation.controls
      ? { normativeTransport: observation.controls }
      : {}),
  };
}
