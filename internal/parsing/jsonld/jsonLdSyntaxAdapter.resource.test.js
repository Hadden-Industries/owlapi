import { jest } from "@jest/globals";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";

import { JsonLdSyntaxAdapter } from "./jsonLdSyntaxAdapter.js";

const contextDocument = JSON.stringify({
  "@context": { ex: "urn:test:" },
});
const source = () =>
  new StringDocumentSource(
    JSON.stringify({
      "@context": "https://example.test/context.jsonld",
      "@id": "ex:subject",
    }),
  );
const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({
    remoteJsonLdContexts: true,
    ...values,
  });

describe("JSON-LD remote-context resource safety", () => {
  it("enforces the remote document byte limit", async () => {
    const adapter = new JsonLdSyntaxAdapter({
      documentLoader: { load: async () => contextDocument },
    });

    await expect(
      adapter.parse(source(), configuration({ maxRemoteDocumentBytes: 8 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxRemoteDocumentBytes",
    });
  });

  it("counts and revalidates a loader-reported redirect", async () => {
    const adapter = new JsonLdSyntaxAdapter({
      documentLoader: {
        load: async () =>
          new StringDocumentSource(contextDocument, {
            documentIRI: "https://cdn.example.test/context.jsonld",
          }),
      },
    });

    await expect(
      adapter.parse(source(), configuration({ maxRedirects: 0 })),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      observed: 1,
      resource: "maxRedirects",
    });
  });

  it("blocks an unsafe loader-reported redirect target", async () => {
    const adapter = new JsonLdSyntaxAdapter({
      documentLoader: {
        load: async () =>
          new StringDocumentSource(contextDocument, {
            documentIRI: "http://169.254.169.254/latest/meta-data",
          }),
      },
    });

    await expect(
      adapter.parse(source(), configuration({ maxRedirects: 1 })),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      resource: "jsonLdContextIRI",
    });
  });

  it("times out even when the injected loader does not settle", async () => {
    const adapter = new JsonLdSyntaxAdapter({
      documentLoader: { load: jest.fn(() => new Promise(() => {})) },
    });

    await expect(
      adapter.parse(source(), configuration({ timeoutMs: 5 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "timeoutMs",
    });
  });

  it("honors AbortSignal even when the injected loader does not settle", async () => {
    const controller = new AbortController();
    const adapter = new JsonLdSyntaxAdapter({
      documentLoader: { load: jest.fn(() => new Promise(() => {})) },
    });
    const parsing = adapter.parse(
      source(),
      configuration({ signal: controller.signal, timeoutMs: 30_000 }),
    );
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });
});
