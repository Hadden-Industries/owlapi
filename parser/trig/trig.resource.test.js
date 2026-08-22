import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({
    format: OWLDocumentFormats.TRIG,
    ...values,
  });
const load = (text, values = {}) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, { documentIRI: "urn:test:trig-resource" }),
    configuration(values),
  );

describe("TriG resource safety", () => {
  it("enforces quad, blank-node, and token ceilings before graph selection", async () => {
    const twoQuads = '<urn:g> { <urn:s> <urn:p> "one" ; <urn:q> "two" . }';

    await expect(load(twoQuads, { maxQuads: 1 })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxQuads",
    });
    await expect(
      load("_:graph { _:first <urn:p> _:second . }", { maxBlankNodes: 2 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 3,
      resource: "maxBlankNodes",
    });
    await expect(
      load('<urn:g> { <urn:s> <urn:p> "far too long" . }', {
        maxTokenLength: 4,
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
    });
  });

  it("honors timeout and abort contracts with TriG diagnostics", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      load("<urn:g> { <urn:s> <urn:p> <urn:o> . }", { timeoutMs: 0 }),
    ).rejects.toThrow("TriG parsing timed out");
    await expect(
      load("<urn:g> { <urn:s> <urn:p> <urn:o> . }", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cooperatively delivers an in-flight abort on sustained input", async () => {
    const controller = new AbortController();
    const triples = Array.from(
      { length: 20_000 },
      (_, index) => `<urn:s${index}> <urn:p> "${index}" .`,
    ).join("\n");
    const parsing = load(`<urn:g> { ${triples} }`, {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });
});
