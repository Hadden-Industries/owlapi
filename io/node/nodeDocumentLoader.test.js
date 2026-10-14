import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, deflateRawSync } from "node:zlib";
import { OWLManager } from "../../apibinding/index.js";
import { NodeDocumentLoader } from "./index.js";
import { IRI, OWLOntologyLoaderConfiguration } from "../../model/index.js";

let server;
let redirectDestination;
let redirectDestinationBase;
let base;
let events;
let fileDirectory;
let ownedFile;
let ownedFileURL;
let signalOpenResponse;
const javaObservations = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
      import.meta.url,
    ),
    "utf8",
  ),
).observations;
const contextDocumentVectors = javaObservations
  .find(({ probeId }) => probeId === "ObserveJsonLdTransport")
  .stdout.trimEnd()
  .split("\n")
  .filter((line) => line.startsWith("document-"))
  .map((line) => {
    const [name, outcome, requestCount, , bytes, contentType, link, encoding] =
      line.split("\t");
    return {
      name: name.substring(9),
      outcome,
      requestCount: Number(requestCount),
      bytes: Buffer.from(bytes, "base64"),
      contentType,
      link,
      encoding,
    };
  });
const compressionVectors = javaObservations
  .find(({ probeId }) => probeId === "ObserveCompressionContracts")
  .stdout.trimEnd()
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
beforeAll(async () => {
  fileDirectory = await mkdtemp(join(tmpdir(), "owlapi-node-document-"));
  ownedFile = join(fileDirectory, "owned.txt");
  await writeFile(ownedFile, "owned-file");
  ownedFileURL = pathToFileURL(ownedFile).href;
  redirectDestination = createServer((request, response) => {
    events.push({
      path: "/crossport-final",
      authorization: request.headers.authorization,
    });
    response.end("ok");
  });
  await new Promise((resolve) =>
    redirectDestination.listen(0, "127.0.0.1", resolve),
  );
  redirectDestinationBase = `http://127.0.0.1:${redirectDestination.address().port}`;
  server = createServer((request, response) => {
    events.push({
      path: request.url,
      authorization: request.headers.authorization,
      compression: request.headers["accept-encoding"],
    });
    response.setHeader("Content-Type", "text/plain");
    const path = request.url;
    if (path === "/open-response") {
      response.setHeader("Content-Type", "application/ld+json");
      response.write('{"@context":');
      signalOpenResponse();
    } else if (path.startsWith("/document/")) {
      const fixture = contextDocumentVectors.find(
        ({ name }) => path === `/document/${name}`,
      );
      response.removeHeader("Content-Type");
      if (fixture.contentType)
        response.setHeader("Content-Type", fixture.contentType);
      if (fixture.link) response.setHeader("Link", fixture.link);
      if (fixture.encoding)
        response.setHeader("Content-Encoding", fixture.encoding);
      response.end(fixture.bytes);
    } else if (path.startsWith("/context/")) {
      response.setHeader("Content-Type", "application/ld+json");
      if (path.startsWith("/context/redirect/")) {
        const [, , , status, remaining] = path.split("/");
        response.statusCode = Number(status);
        response.setHeader(
          "Location",
          Number(remaining) === 1
            ? "/context/final"
            : `/context/redirect/${status}/${Number(remaining) - 1}`,
        );
      } else if (path.startsWith("/context/status/"))
        response.statusCode = Number(path.split("/").at(-1));
      response.end(
        '{"@context":{"Class":"http://www.w3.org/2002/07/owl#Class"}}',
      );
    } else if (path.startsWith("/compression/")) {
      const fixture = compressionVectors.find(
        ({ name, suffix }) => path === `/compression/${name}${suffix}`,
      );
      if (fixture.encoding)
        response.setHeader("Content-Encoding", fixture.encoding);
      if (fixture.disposition)
        response.setHeader("Content-Disposition", fixture.disposition);
      if (fixture.name === "zip-open-tail") {
        response.write(fixture.bytes);
        response.flushHeaders();
      } else response.end(fixture.bytes);
    } else if (path.startsWith("/redirect/")) {
      const [, , status, remaining] = path.split("/");
      response.statusCode = Number(status);
      response.setHeader(
        "Location",
        Number(remaining) === 1
          ? `${base}/ok`
          : `${base}/redirect/${status}/${Number(remaining) - 1}`,
      );
      response.end("redirect-body");
    } else if (path === "/relative/rdf") {
      response.statusCode = 302;
      response.setHeader("Location", `${base}/base/final.rdf`);
      response.end("redirect-body");
    } else if (path === "/base/final.rdf") {
      response.setHeader("Content-Type", "application/rdf+xml");
      response.end(
        "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#' xmlns:owl='http://www.w3.org/2002/07/owl#'><owl:Class rdf:about='C'/></rdf:RDF>",
      );
    } else if (path === "/gzip" || path === "/deflate") {
      response.setHeader("Content-Encoding", path.substring(1));
      response.end(
        (path === "/gzip" ? gzipSync : deflateRawSync)(Buffer.from("ok")),
      );
    } else if (path.startsWith("/crossport/")) {
      response.statusCode = Number(path.substring("/crossport/".length));
      response.setHeader("Location", `${redirectDestinationBase}/final`);
      response.end("redirect-body");
    } else if (path === "/file") {
      response.statusCode = 308;
      response.setHeader("Location", ownedFileURL);
      response.end("redirect-body");
    } else if (path === "/relative" || path === "/loop") {
      response.statusCode = 308;
      response.setHeader(
        "Location",
        path === "/relative" ? "/ok" : `${base}/loop`,
      );
      response.end("redirect-body");
    } else if (path === "/slow-body") {
      response.writeHead(200);
      response.flushHeaders();
      setTimeout(() => response.end("ok"), 80);
    } else if (path === "/error") {
      response.statusCode = 503;
      response.end("error");
    } else response.end(path === "/document" ? "owned-response" : "ok");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.each([-1, 0, 1, 2, 5, 6])(
  "Java configured attempts %s preserves the actual HTTP acquisition boundary",
  async (attempts) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const result = await loader.load(IRI.create(`${base}/ok`), {
      config: javaConfiguration().setRetriesToAttempt(attempts),
    });
    if (attempts <= 0) expect(result).toBeUndefined();
    else expect(result.getText()).toBe("ok");
    expect(events).toHaveLength(1);
  },
);

test.each([0, 5])(
  "Java connection timeout %s does not become a response body deadline",
  async (timeout) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const source = await loader.load(IRI.create(`${base}/slow-body`), {
      config: javaConfiguration().setConnectionTimeout(timeout),
    });
    expect(source.getText()).toBe("ok");
  },
);

test.each(
  [301, 302, 303, 307, 308].flatMap((status) =>
    [false, true].map((follow) => [status, follow]),
  ),
)(
  "Java redirect %s with followRedirects=%s preserves requests and credentials",
  async (status, follow) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const config = javaConfiguration()
      .setFollowRedirects(follow)
      .setAuthorizationValue("Bearer owned-test-token");
    const source = await loader.load(
      IRI.create(`${base}/redirect/${status}/1`),
      { config },
    );
    const followed = status !== 308 || follow;
    expect(source.getText()).toBe(followed ? "ok" : "redirect-body");
    expect(events.map(({ path }) => path)).toEqual(
      followed ? [`/redirect/${status}/1`, "/ok"] : ["/redirect/308/1"],
    );
    if (followed)
      expect(events[1].authorization).toBe(
        status === 308 ? undefined : "Bearer owned-test-token",
      );
  },
);

test.each([
  [302, 19, true, 20],
  [302, 20, false, 20],
  [308, 21, true, 22],
])(
  "Java redirect chain %s/%s has its provider-owned boundary",
  async (status, length, succeeds, requestCount) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const load = loader.load(
      IRI.create(`${base}/redirect/${status}/${length}`),
      { config: javaConfiguration() },
    );
    if (succeeds) expect((await load).getText()).toBe("ok");
    else await expect(load).rejects.toThrow();
    expect(events).toHaveLength(requestCount);
  },
);

test.each([
  ["relative", 1],
  ["loop", 2],
  ["error", 1],
])(
  "Java %s failure retains the observed number of requests",
  async (path, count) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    await expect(
      loader.load(IRI.create(`${base}/${path}`), {
        config: javaConfiguration(),
      }),
    ).rejects.toThrow();
    expect(events).toHaveLength(count);
  },
);
afterAll(async () => {
  redirectDestination.closeAllConnections();
  await new Promise((resolve) => redirectDestination.close(resolve));
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await unlink(ownedFile);
  await rmdir(fileDirectory);
});

test.each([302, 308])(
  "Java redirect %s drops credentials at a different port",
  async (status) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const source = await loader.load(
      IRI.create(`${base}/crossport/${status}`),
      {
        config: javaConfiguration().setAuthorizationValue(
          "Bearer owned-test-token",
        ),
      },
    );
    expect(source.getText()).toBe("ok");
    expect(events).toHaveLength(2);
    expect(events[0].authorization).toBe("Bearer owned-test-token");
    expect(events[1].authorization).toBeUndefined();
  },
);

test("a long explicit deadline does not overflow the native timer into an immediate rejection", async () => {
  const loader = new NodeDocumentLoader({ authorize: () => true });
  const source = await loader.load(IRI.create(`${base}/slow-body`), {
    config: javaConfiguration().with({ timeoutMs: 2 ** 31 }),
  });
  expect(source.getText()).toBe("ok");
});

test("Java file contexts decode the first Unicode JSON structure like the native FileLoader", async () => {
  const loader = new NodeDocumentLoader({ authorize: () => true });
  try {
    await writeFile(
      ownedFile,
      Buffer.from(
        '{"@context":{"Class":"http://www.w3.org/2002/07/owl#Class"}} trailing',
        "utf16le",
      ),
    );
    const source = await loader.load(IRI.create(ownedFileURL), {
      config: javaConfiguration(),
      purpose: "jsonld-context",
    });
    expect(source.getText()).toBe(
      '{"@context":{"Class":"http://www.w3.org/2002/07/owl#Class"}}',
    );
  } finally {
    await writeFile(ownedFile, "owned-file");
  }
});
beforeEach(() => {
  events = [];
});
function javaConfiguration() {
  return new OWLOntologyLoaderConfiguration({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
}

test.each(contextDocumentVectors)(
  "Java context document $name preserves native acceptance, base and requests",
  async ({ name, outcome, requestCount }) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const loading = loader.load(IRI.create(`${base}/document/${name}`), {
      config: javaConfiguration(),
      purpose: "jsonld-context",
    });
    if (outcome.startsWith("THROW:")) await expect(loading).rejects.toThrow();
    else {
      const [json, documentPath] = outcome.substring(7).split(";");
      const source = await loading;
      expect(JSON.parse(source.getText())).toEqual(
        JSON.parse(Buffer.from(json, "base64").toString("utf8")),
      );
      expect(new URL(source.getDocumentIRI().value).pathname).toBe(
        documentPath.substring(5),
      );
    }
    expect(events).toHaveLength(requestCount);
  },
);

test("a JSON-LD alternate link cannot bypass destination authorization", async () => {
  const loader = new NodeDocumentLoader({
    authorize: (iri) => !iri.value.endsWith("/json-type"),
  });
  await expect(
    loader.load(IRI.create(`${base}/document/alternate`), {
      config: javaConfiguration(),
      purpose: "jsonld-context",
    }),
  ).rejects.toMatchObject({ code: "SECURITY_POLICY_VIOLATION" });
  expect(events.map(({ path }) => path)).toEqual(["/document/alternate"]);
});

test.each(compressionVectors)(
  "Java compression vector $name preserves acceptance and document bytes",
  async ({ name, suffix, outcome }) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const loading = loader.load(
      IRI.create(`${base}/compression/${name}${suffix}`),
      { config: javaConfiguration().with({ timeoutMs: 1000 }) },
    );
    if (outcome.startsWith("THROW:")) await expect(loading).rejects.toThrow();
    else
      expect((await loading).getText()).toBe(
        Buffer.from(outcome.substring("RETURN:".length), "base64").toString(
          "utf8",
        ),
      );
  },
);

test("Java JSON-LD context transport does not inherit ontology-document native settings", async () => {
  const loader = new NodeDocumentLoader({ authorize: () => true });
  const config = javaConfiguration()
    .setConnectionTimeout(-1)
    .setRetriesToAttempt(0)
    .setFollowRedirects(false)
    .setAuthorizationValue("Bearer owned-test-token")
    .setAcceptingHTTPCompression(false);
  const source = await loader.load(
    IRI.create(`${base}/context/redirect/302/1`),
    { config, purpose: "jsonld-context" },
  );
  expect(JSON.parse(source.getText())["@context"].Class).toBe(
    "http://www.w3.org/2002/07/owl#Class",
  );
  expect(source.getDocumentIRI().value).toBe(`${base}/context/final`);
  expect(events).toHaveLength(2);
  expect(
    events.every(
      ({ authorization, compression }) =>
        authorization === undefined && compression === undefined,
    ),
  ).toBe(true);
});

test.each([
  [301, 1, true, 2],
  [302, 9, true, 10],
  [302, 10, false, 10],
  [303, 1, true, 2],
  [307, 1, true, 2],
  [308, 1, false, 1],
])(
  "Java context redirect %s/%s uses the separate provider request boundary",
  async (status, count, succeeds, requests) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const loading = loader.load(
      IRI.create(`${base}/context/redirect/${status}/${count}`),
      { config: javaConfiguration(), purpose: "jsonld-context" },
    );
    if (succeeds)
      expect((await loading).getDocumentIRI().value).toBe(
        `${base}/context/final`,
      );
    else await expect(loading).rejects.toThrow();
    expect(events).toHaveLength(requests);
  },
);

test.each([201, 203, 404, 503])(
  "Java context status %s is rejected without a retry",
  async (status) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    await expect(
      loader.load(IRI.create(`${base}/context/status/${status}`), {
        config: javaConfiguration(),
        purpose: "jsonld-context",
      }),
    ).rejects.toThrow();
    expect(events).toHaveLength(1);
  },
);

test("hostname resolution pins an authorized IPv4 loopback destination", async () => {
  const operations = [];
  const loader = new NodeDocumentLoader({
    authorize(_iri, context) {
      operations.push(context);
      return true;
    },
  });
  expect(
    (
      await loader.load(
        IRI.create(`${base.replace("127.0.0.1", "localhost")}/ok`),
        { config: javaConfiguration() },
      )
    ).getText(),
  ).toBe("ok");
  expect(operations.map(({ operation }) => operation)).toEqual([
    "request-document",
    "resolve-hostname",
    "connect-http",
  ]);
  expect(operations.at(-1)).toMatchObject({
    resolvedAddress: "127.0.0.1",
    addressFamily: 4,
  });
});

test("a denied hostname is rejected before DNS resolution", async () => {
  const operations = [];
  const loader = new NodeDocumentLoader({
    authorize(_iri, context) {
      operations.push(context.operation);
      return context.operation !== "resolve-hostname";
    },
  });
  await expect(
    loader.load(IRI.create("http://nonexistent-owned-fixture.invalid/input"), {
      config: javaConfiguration(),
    }),
  ).rejects.toMatchObject({ name: "SecurityPolicyError" });
  expect(operations).toEqual(["request-document", "resolve-hostname"]);
  expect(events).toHaveLength(0);
});

test("the accepted AbortSignal interface forwards cancellation", async () => {
  const controller = new AbortController();
  const signal = {
    get aborted() {
      return controller.signal.aborted;
    },
    get reason() {
      return controller.signal.reason;
    },
    addEventListener: controller.signal.addEventListener.bind(
      controller.signal,
    ),
    removeEventListener: controller.signal.removeEventListener.bind(
      controller.signal,
    ),
  };
  const loader = new NodeDocumentLoader({ authorize: () => true });
  const loading = loader.load(IRI.create(`${base}/slow-body`), {
    config: javaConfiguration().with({ signal }),
  });
  controller.abort(new Error("owned cancellation"));
  await expect(loading).rejects.toThrow("owned cancellation");
});

test("the Node loader authorizes the concrete destination before sending native configured credentials", async () => {
  const decisions = [];
  const loader = new NodeDocumentLoader({
    authorize(iri, context) {
      decisions.push(context);
      expect(events).toEqual([]);
      expect(iri.value).toBe(`${base}/document`);
      return true;
    },
  });
  const config = javaConfiguration()
    .setAuthorizationValue("Bearer owned-test-token")
    .setAcceptingHTTPCompression(false);
  const source = await loader.load(IRI.create(`${base}/document`), {
    config,
    purpose: "ontology-import",
  });
  expect(source.getText()).toBe("owned-response");
  expect(source.getDocumentIRI().value).toBe(`${base}/document`);
  expect(events).toEqual([
    {
      path: "/document",
      authorization: "Bearer owned-test-token",
      compression: undefined,
    },
  ]);
  expect(
    decisions.find(({ operation }) => operation === "connect-http"),
  ).toMatchObject({
    resolvedAddress: "127.0.0.1",
    addressFamily: 4,
    config,
    headers: { Authorization: "Bearer owned-test-token" },
  });
});

test("Java follows the observed HTTP-to-file transition only after authorizing the resolved file", async () => {
  const operations = [];
  const loader = new NodeDocumentLoader({
    authorize(_iri, context) {
      operations.push(context);
      return true;
    },
  });
  const source = await loader.load(IRI.create(`${base}/file`), {
    config: javaConfiguration(),
  });
  expect(source.getText()).toBe("owned-file");
  expect(events.map(({ path }) => path)).toEqual(["/file"]);
  expect(
    operations.find(({ operation }) => operation === "read-file"),
  ).toMatchObject({
    resolvedFilePath: ownedFile,
    requiresStablePathAncestors: true,
  });
});

test.each(["connect-http", "read-file"])(
  "denied %s access fails before the concrete operation",
  async (operation) => {
    let denied = false;
    const loader = new NodeDocumentLoader({
      authorize(_iri, context) {
        if (context.operation === operation) {
          denied = true;
          return false;
        }
        return true;
      },
    });
    await expect(
      loader.load(
        IRI.create(operation === "read-file" ? ownedFileURL : `${base}/ok`),
        { config: javaConfiguration() },
      ),
    ).rejects.toMatchObject({ code: "SECURITY_POLICY_VIOLATION" });
    expect(denied).toBe(true);
    expect(events).toEqual([]);
  },
);

test("a denied redirect destination is never requested", async () => {
  const loader = new NodeDocumentLoader({
    authorize(iri) {
      return !iri.value.endsWith("/ok");
    },
  });
  await expect(
    loader.load(IRI.create(`${base}/redirect/302/1`), {
      config: javaConfiguration(),
    }),
  ).rejects.toMatchObject({ code: "SECURITY_POLICY_VIOLATION" });
  expect(events.map(({ path }) => path)).toEqual(["/redirect/302/1"]);
});

test("an explicit operation deadline is distinct from the connection-only timeout", async () => {
  const loader = new NodeDocumentLoader({ authorize: () => true });
  await expect(
    loader.load(IRI.create(`${base}/slow-body`), {
      config: javaConfiguration().with({ timeoutMs: 10 }),
    }),
  ).rejects.toMatchObject({
    code: "RESOURCE_LIMIT_EXCEEDED",
    resource: "deadline",
  });
});

test("an already cancelled operation makes no external request", async () => {
  const controller = new AbortController();
  controller.abort();
  const loader = new NodeDocumentLoader({ authorize: () => true });
  await expect(
    loader.load(IRI.create(`${base}/ok`), {
      config: javaConfiguration(),
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(events).toEqual([]);
});

test.each(["ontology-document", "jsonld-context"])(
  "cancellation stops an active %s response and preserves the caller's reason",
  async (purpose) => {
    const responseStarted = new Promise((resolve) => {
      signalOpenResponse = resolve;
    });
    const controller = new AbortController();
    const reason = new Error("caller ended owned response");
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const loading = loader.load(IRI.create(`${base}/open-response`), {
      config: javaConfiguration(),
      purpose,
      signal: controller.signal,
    });
    const rejected = expect(loading).rejects.toBe(reason);
    await responseStarted;
    controller.abort(reason);
    await rejected;
    expect(events.map(({ path }) => path)).toEqual(["/open-response"]);
  },
);

test.each(["gzip", "xz-crc64", "zip-stored", "zip-first"])(
  "an explicit decompressed-byte limit stops %s",
  async (name) => {
    const fixture = compressionVectors.find((item) => item.name === name);
    expect(fixture).toBeDefined();
    const loader = new NodeDocumentLoader({ authorize: () => true });
    await expect(
      loader.load(IRI.create(`${base}/compression/${name}${fixture.suffix}`), {
        config: javaConfiguration().with({ maxInputBytes: 1, timeoutMs: 1000 }),
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "inputBytes",
    });
  },
);

test.each(["gzip", "deflate"])(
  "the native %s content encoding returns decoded document text",
  async (encoding) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const source = await loader.load(IRI.create(`${base}/${encoding}`), {
      config: javaConfiguration(),
    });
    expect(source.getText()).toBe("ok");
  },
);

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s uses its declared document base after a real redirect and parse",
  async (behaviorProfileId) => {
    const loader = new NodeDocumentLoader({ authorize: () => true });
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const config = manager
      .getOntologyLoaderConfiguration()
      .with({ maxRedirects: 1 });
    const source = await loader.load(IRI.create(`${base}/relative/rdf`), {
      config,
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(source);
    const expectedBase =
      behaviorProfileId === "java-owlapi-5.5.1" ? "relative" : "base";
    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value),
    ).toEqual([`${base}/${expectedBase}/C`]);
  },
);
