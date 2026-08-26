import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLParserRegistry } from "../parserRegistry.js";
import { OWLDataFactory } from "../../../model/index.js";

import { krss1ParserDescriptor } from "./descriptor.js";

const createManager = (options = {}) =>
  OWLManager.createOWLOntologyManager({
    ...options,
    registry: new OWLParserRegistry([krss1ParserDescriptor]),
  });
const load = (manager, text, values = {}) =>
  manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:krss1-resource",
      fileName: "resource.krss",
    }),
    new OWLOntologyLoaderConfiguration({ format: "krss1", ...values }),
  );

describe("KRSS1 resource safety and transactions", () => {
  it("enforces token, input, axiom, nesting, and timeout limits", async () => {
    const manager = createManager();
    const document = "(define-concept A B)";
    const inputBytes = new TextEncoder().encode(document).byteLength;

    await expect(
      load(manager, document, { maxTokenCount: 4 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenCount",
    });
    await expect(
      load(manager, document, { maxInputBytes: inputBytes - 1 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxInputBytes",
    });
    await expect(
      load(manager, `${document}(define-concept C D)`, { maxAxioms: 1 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxAxioms",
    });
    await expect(
      load(manager, "(define-concept A (not (not B)))", {
        maxExpressionDepth: 1,
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxExpressionDepth",
    });
    await expect(
      load(manager, document, { timeoutMs: 0 }),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "timeoutMs",
    });
  });

  it("reports locations and discards partial state after failure", async () => {
    const manager = createManager();

    await expect(
      load(manager, "(define-concept A B)\r\n(define-concept C)"),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      line: 2,
    });
    const ontology = await load(manager, "(define-concept D E)");
    expect(ontology.getAxioms()).toHaveProperty("size", 1);
  });

  it("cooperatively yields so an in-flight parse can be aborted", async () => {
    class CountingDataFactory extends OWLDataFactory {
      equivalentAxiomsCreated = 0;

      getOWLEquivalentClassesAxiom(...arguments_) {
        this.equivalentAxiomsCreated += 1;
        return super.getOWLEquivalentClassesAxiom(...arguments_);
      }
    }

    const dataFactory = new CountingDataFactory();
    const manager = createManager({ dataFactory });
    const controller = new AbortController();
    const axioms = Array.from(
      { length: 50_000 },
      (_, index) => `(define-concept C${index} D${index})`,
    ).join("\n");
    const loading = load(manager, axioms, {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    queueMicrotask(() => controller.abort());

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(dataFactory.equivalentAxiomsCreated).toBeLessThan(50_000);
  });
});
