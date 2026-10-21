import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { NodeDocumentLoader } from "owlapi/io/node";
import { IRI, OWLOntologyLoaderConfiguration } from "owlapi/model";

// Project-authored "ok" payload encoded by the independently captured native
// ObserveCompressionContracts xz-crc64 probe, not the JavaScript decoder.
const xz = Buffer.from(
  "/Td6WFoAAATm1rRGAgAhARYAAAB0L+WjAQABb2sAAAADwESAPz9ngAABGgLcLqV+H7bzfQEAAAAABFla",
  "base64",
);
let requests = 0;
const zipVectors = JSON.parse(
  readFileSync(new URL("./compression-vectors.json", import.meta.url), "utf8"),
);
const server = createServer((request, response) => {
  requests++;
  const zip = zipVectors.find(
    ({ name, suffix }) => request.url === `/${name}${suffix}`,
  );
  if (zip) {
    response.end(Buffer.from(zip.base64, "base64"));
    return;
  }
  response.setHeader("Content-Encoding", request.url === "/xz" ? "xz" : "gzip");
  response.end(request.url === "/xz" ? xz : gzipSync("ok"));
});
const directory = await mkdtemp(join(tmpdir(), "owlapi-installed-transport-"));
const file = join(directory, "owned.txt");
await writeFile(file, "owned-file");
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
try {
  for (const behaviorProfileId of ["normative-v1", "java-owlapi-5.5.1"]) {
    const config = new OWLOntologyLoaderConfiguration({ behaviorProfileId });
    const denied = new NodeDocumentLoader({ authorize: () => false });
    const before = requests;
    await assert.rejects(denied.load(IRI.create(base + "/xz"), { config }), {
      code: "SECURITY_POLICY_VIOLATION",
    });
    assert.equal(requests, before, "denied access must not reach the server");
    const operations = new Set();
    const allowed = new NodeDocumentLoader({
      authorize(resourceIRI, context) {
        if (context.operation === "read-file")
          assert.equal(context.requiresStablePathAncestors, true);
        operations.add(context.operation);
        return (
          resourceIRI.toString().startsWith(base + "/") ||
          resourceIRI.toString() === pathToFileURL(file).href
        );
      },
    });
    for (const encoding of ["gzip", "xz"])
      assert.equal(
        (
          await allowed.load(IRI.create(base + "/" + encoding), { config })
        ).getText(),
        "ok",
      );
    assert.equal(
      (
        await allowed.load(IRI.create(pathToFileURL(file).href), { config })
      ).getText(),
      "owned-file",
    );
    assert.ok(operations.has("connect-http"));
    assert.ok(operations.has("read-file"));
    if (behaviorProfileId === "java-owlapi-5.5.1") {
      for (const fixture of zipVectors) {
        const loading = allowed.load(
          IRI.create(`${base}/${fixture.name}${fixture.suffix}`),
          { config },
        );
        if (fixture.outcome.startsWith("RETURN:"))
          assert.equal(
            (await loading).getText(),
            Buffer.from(fixture.outcome.slice(7), "base64").toString("utf8"),
          );
        else {
          assert.equal(fixture.outcome, "THROW:ZipException");
          await assert.rejects(loading, {
            code: "DOCUMENT_LOAD_FAILED",
            phase: "content-decoding",
          });
        }
      }
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await unlink(file);
  await rmdir(directory);
}
