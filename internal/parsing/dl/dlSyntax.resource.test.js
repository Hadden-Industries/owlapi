import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLParserRegistry } from "../parserRegistry.js";
import { OWLDataFactory } from "../../../model/index.js";

import { dlSyntaxParserDescriptor } from "./descriptor.js";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({ format: "dl", ...values });
const createManager = (options = {}) =>
  OWLManager.createOWLOntologyManager({
    ...options,
    registry: new OWLParserRegistry([dlSyntaxParserDescriptor]),
  });
let resourceDocumentSequence = 0;
const nextResourceDocumentIRI = () =>
  `urn:test:dl-resource:load:${++resourceDocumentSequence}`;
const load = (
  manager,
  text,
  values = {},
  documentIRI = nextResourceDocumentIRI(),
) =>
  manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, { documentIRI }),
    configuration(values),
  );
const expectResource = async (promise, resource, limit, observed) => {
  const expected = {
    code: "RESOURCE_LIMIT_EXCEEDED",
    limit,
    resource,
  };
  if (observed !== undefined) {
    expected.observed = observed;
  }
  await expect(promise).rejects.toMatchObject(expected);
};

describe("OWL DL Syntax resource safety and diagnostics", () => {
  it("counts real tokens and measures token limits as UTF-8 bytes", async () => {
    const manager = createManager();

    await expect(
      load(manager, "A ⊑ B", { maxTokenCount: 3 }),
    ).resolves.toBeDefined();
    await expectResource(
      load(manager, "A ⊑ B", { maxTokenCount: 2 }),
      "maxTokenCount",
      2,
      3,
    );
    await expectResource(
      load(manager, "éé ⊑ B", { maxTokenLength: 3 }),
      "maxTokenLength",
      3,
      4,
    );
  });

  it("enforces input, axiom, expression-depth, and timeout ceilings", async () => {
    const manager = createManager();
    const utf8Document = "É ⊑ B";
    const inputBytes = new TextEncoder().encode(utf8Document).byteLength;

    await expect(
      load(manager, utf8Document, { maxInputBytes: inputBytes }),
    ).resolves.toBeDefined();
    await expectResource(
      load(manager, utf8Document, { maxInputBytes: inputBytes - 1 }),
      "maxInputBytes",
      inputBytes - 1,
      inputBytes,
    );
    await expectResource(
      load(manager, "A ⊑ B\nC ⊑ D", { maxAxioms: 1 }),
      "maxAxioms",
      1,
    );
    await expect(
      load(manager, "A ⊑ (B)", { maxExpressionDepth: 1 }),
    ).resolves.toBeDefined();
    await expectResource(
      load(manager, "A ⊑ ((B))", { maxExpressionDepth: 1 }),
      "maxExpressionDepth",
      1,
      2,
    );
    await expectResource(
      load(manager, "A ⊑ B", { timeoutMs: 0 }),
      "timeoutMs",
      0,
      expect.any(Number),
    );
  });

  it("reports precise locations and omits them when source locations are disabled", async () => {
    const manager = createManager();
    const malformed = "A ⊑\n)";

    await expect(load(manager, malformed)).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      column: 1,
      line: 2,
      offset: 4,
    });
    let error;
    try {
      await load(manager, malformed, { sourceLocations: false });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    expect(error).not.toHaveProperty("column");
    expect(error).not.toHaveProperty("line");
    expect(error).not.toHaveProperty("offset");
  });

  it("discards all partial state after a syntax error", async () => {
    const manager = createManager();

    await expect(load(manager, "A ⊑ B\nC")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
    const recoveredDocumentIRI = "urn:test:dl-resource:recovered";
    const ontology = await load(manager, "D ⊑ E", {}, recoveredDocumentIRI);

    expect(ontology.getAxioms().size).toBe(1);
    const [axiom] = ontology.getAxioms();
    expect(axiom.subClass.iri.value).toBe(`${recoveredDocumentIRI}#D`);
  });

  it("cooperatively yields so an in-flight parse can be aborted", async () => {
    class CountingDataFactory extends OWLDataFactory {
      subclassAxiomsCreated = 0;

      getOWLSubClassOfAxiom(...arguments_) {
        this.subclassAxiomsCreated += 1;
        return super.getOWLSubClassOfAxiom(...arguments_);
      }
    }

    const dataFactory = new CountingDataFactory();
    const manager = createManager({ dataFactory });
    const controller = new AbortController();
    const axioms = Array.from(
      { length: 50_000 },
      (_, index) => `C${index} ⊑ D${index}`,
    ).join("\n");
    const loading = load(manager, axioms, {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    queueMicrotask(() => controller.abort());

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(dataFactory.subclassAxiomsCreated).toBeLessThan(50_000);
  });
});
