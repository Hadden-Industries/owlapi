import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({
    format: OWLDocumentFormats.N_TRIPLES,
    ...values,
  });
const load = (text, values = {}) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:ntriples-resource",
    }),
    configuration(values),
  );

describe("N-Triples resource safety", () => {
  it("enforces syntax and shared RDF reconstruction ceilings", async () => {
    const twoQuads = '<urn:s> <urn:p> "one" .\n<urn:s> <urn:q> "two" .';

    await expect(load(twoQuads, { maxQuads: 1 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxQuads",
    });
    await expect(
      load("_:first <urn:p> _:second .", { maxBlankNodes: 1 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxBlankNodes",
    });
    await expect(
      load('<urn:s> <urn:p> "far too long" .', { maxTokenLength: 4 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
    });
  });

  it("honors timeout and abort contracts with N-Triples diagnostics", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      load("<urn:s> <urn:p> <urn:o> .", { timeoutMs: 0 }),
    ).rejects.toThrow("N-Triples parsing timed out");
    await expect(
      load("<urn:s> <urn:p> <urn:o> .", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cooperatively delivers an in-flight abort on sustained input", async () => {
    const controller = new AbortController();
    const triples = Array.from(
      { length: 20_000 },
      (_, index) => `<urn:s${index}> <urn:p> "${index}" .`,
    ).join("\n");
    const parsing = load(triples, {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });
});
