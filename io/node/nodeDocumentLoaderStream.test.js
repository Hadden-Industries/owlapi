import { mkdtemp, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  IRI,
  OWLManager,
  OWLOntologyLoaderConfiguration,
  StreamDocumentSource,
} from "../../index.js";
import { NodeDocumentLoader } from "./index.js";

const text = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#">
<owl:Ontology rdf:about="urn:streamed-file"/>${" ".repeat(150_000)}</rdf:RDF>`;
const config = new OWLOntologyLoaderConfiguration({ format: "rdfxml" });

test("file sources authorize each open, enforce limits, and release the handle after early return or abort", async () => {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), "owlapi-stream-source-")),
  );
  const path = join(dir, "stream.rdf");
  const iri = IRI.create(pathToFileURL(path).href);
  const operations = [];
  let grant = true;
  const loader = new NodeDocumentLoader({
    authorize(_iri, { operation }) {
      operations.push(operation);
      return grant;
    },
  });
  try {
    await expect(loader.load(iri, { config })).rejects.toMatchObject({
      code: "ENOENT",
    });
    await writeFile(path, text);
    await expect(
      loader.load(IRI.create(pathToFileURL(dir).href), { config }),
    ).rejects.toThrow();
    await expect(
      loader.load(iri, { config: config.with({ maxInputBytes: 55 }) }),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
    const source = await loader.load(iri, { config });
    expect(source).toBeInstanceOf(StreamDocumentSource);
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: loader,
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(
      iri,
      config,
    );
    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:streamed-file",
    );
    operations.length = 0;
    const abort = new AbortController();
    const bytes = source.openBytes(abort.signal)[Symbol.asyncIterator]();
    expect((await bytes.next()).value.byteLength).toBeLessThan(
      Buffer.byteLength(text),
    );
    const reason = new Error("stop file");
    abort.abort(reason);
    await expect(bytes.next()).rejects.toBe(reason);
    expect(operations).toEqual(["resolve-file", "read-file"]);
    grant = false;
    await expect(
      source.openBytes()[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({ code: "SECURITY_POLICY_VIOLATION" });
  } finally {
    await unlink(path);
    await rmdir(dir);
  }
});

test("a streamed HTTP response reopens through authorized pinned requests and stops when the reader closes", async () => {
  let etag = '"stream-v1"';
  const preconditions = [];
  const server = createServer((request, response) => {
    preconditions.push(request.headers["if-match"]);
    response.writeHead(200, {
      "content-type": "application/rdf+xml",
      etag,
    });
    response.write(text.slice(0, 80_000));
    response.end(text.slice(80_000));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let connections = 0;
  const loader = new NodeDocumentLoader({
    authorize(_iri, { operation }) {
      if (operation === "connect-http") connections++;
      return true;
    },
  });
  try {
    const source = await loader.load(
      IRI.create(`http://127.0.0.1:${server.address().port}/ontology`),
      { config },
    );
    expect(source).toBeInstanceOf(StreamDocumentSource);
    for (let attempt = 0; attempt < 2; attempt++) {
      const chunks = [];
      for await (const chunk of source.openBytes()) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe(text);
    }
    expect(connections).toBe(3);
    expect(preconditions).toEqual([undefined, etag, etag]);
    etag = '"stream-v2"';
    await expect(
      source.openBytes()[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({
      code: "DOCUMENT_LOAD_FAILED",
      phase: "response",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test.each([undefined, 'W/"weak"'])(
  "HTTP with validator %s preserves one authorized representation",
  async (etag) => {
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(200, {
        "content-type": "application/rdf+xml",
        "last-modified": "Fri, 20 Nov 2026 12:00:00 GMT",
        ...(etag ? { etag } : {}),
      });
      response.write(text.slice(0, 80_000));
      response.end(text.slice(80_000));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const loader = new NodeDocumentLoader({ authorize: () => true });
      const source = await loader.load(
        IRI.create(`http://127.0.0.1:${server.address().port}/ontology`),
        { config },
      );
      expect(source.getText()).toBe(text);
      expect(requests).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
