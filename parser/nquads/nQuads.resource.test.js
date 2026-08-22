import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({
    format: OWLDocumentFormats.N_QUADS,
    ...values,
  });
const load = (text, values = {}) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:nquads-resource",
    }),
    configuration(values),
  );

describe("N-Quads resource safety", () => {
  it("enforces quad, blank-node, and token ceilings before graph selection", async () => {
    const twoQuads =
      '<urn:s> <urn:p> "one" <urn:g> .\n<urn:s> <urn:q> "two" <urn:g> .';

    await expect(load(twoQuads, { maxQuads: 1 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxQuads",
    });
    await expect(
      load("_:first <urn:p> _:second _:graph .", { maxBlankNodes: 2 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 3,
      resource: "maxBlankNodes",
    });
    await expect(
      load('<urn:s> <urn:p> "far too long" <urn:g> .', {
        maxTokenLength: 4,
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
    });
  });

  it("honors timeout and abort contracts with N-Quads diagnostics", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      load("<urn:s> <urn:p> <urn:o> <urn:g> .", { timeoutMs: 0 }),
    ).rejects.toThrow("N-Quads parsing timed out");
    await expect(
      load("<urn:s> <urn:p> <urn:o> <urn:g> .", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cooperatively delivers an in-flight abort on sustained input", async () => {
    const controller = new AbortController();
    const quads = Array.from(
      { length: 20_000 },
      (_, index) => `<urn:s${index}> <urn:p> "${index}" <urn:g> .`,
    ).join("\n");
    const parsing = load(quads, {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });
});
