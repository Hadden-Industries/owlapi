import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLParserRegistry } from "../../manager/parserRegistry.js";
import { OWLDataFactory } from "../../model/index.js";

import { krss2ParserDescriptor } from "./descriptor.js";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration({ format: "krss2", ...values });
const createManager = (options = {}) =>
  OWLManager.createOWLOntologyManager({
    ...options,
    registry: new OWLParserRegistry([krss2ParserDescriptor]),
  });
const load = (manager, text, values = {}) =>
  manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:krss2-resource",
    }),
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

describe("KRSS2 resource safety and diagnostics", () => {
  it("counts real tokens and measures token limits as UTF-8 bytes", async () => {
    const manager = createManager();

    await expect(
      load(manager, "(implies A B)", { maxTokenCount: 5 }),
    ).resolves.toBeDefined();
    await expectResource(
      load(manager, "(implies A B)", { maxTokenCount: 4 }),
      "maxTokenCount",
      4,
      5,
    );
    await expectResource(
      load(manager, "(implies éé B)", { maxTokenLength: 3 }),
      "maxTokenLength",
      3,
      4,
    );
  });

  it("enforces input, axiom, expression-depth, and timeout ceilings", async () => {
    const manager = createManager();
    const utf8Document = "(implies É B)";
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
      load(manager, "(implies A B)(implies C D)", { maxAxioms: 1 }),
      "maxAxioms",
      1,
    );
    await expect(
      load(manager, "(implies A (not B))", { maxExpressionDepth: 1 }),
    ).resolves.toBeDefined();
    await expectResource(
      load(manager, "(implies A (not (not B)))", {
        maxExpressionDepth: 1,
      }),
      "maxExpressionDepth",
      1,
      2,
    );
    await expectResource(
      load(manager, "(implies A B)", { timeoutMs: 0 }),
      "timeoutMs",
      0,
      expect.any(Number),
    );
  });

  it("reports precise locations and honors disabled source locations", async () => {
    const manager = createManager();
    const malformed = "(implies A\r\n)";

    await expect(load(manager, malformed)).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      column: 1,
      line: 2,
      offset: 12,
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

    await expect(
      load(manager, "(implies A B)(implies C)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    const ontology = await load(manager, "(implies D E)");

    expect(ontology.getAxioms()).toHaveProperty("size", 1);
    const [axiom] = ontology.getAxioms();
    expect(axiom.subClass.iri.value).toBe("urn:test:krss2-resource#D");
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
      (_, index) => `(implies C${index} D${index})`,
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
