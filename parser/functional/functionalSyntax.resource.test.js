import { OWLOntologyLoaderConfiguration } from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLDataFactory } from "../../model/index.js";

const configuration = (values) => new OWLOntologyLoaderConfiguration(values);

const nestedComplements = (depth) =>
  `${"ObjectComplementOf(".repeat(depth)}<urn:test:B>${")".repeat(depth)}`;

const nestedAnnotations = (depth) => {
  let value = 'Annotation(rdfs:label "leaf")';
  for (let index = 1; index < depth; index += 1) {
    value = `Annotation(${value} rdfs:label "level-${index}")`;
  }
  return value;
};

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

describe("OWL Functional-Style Syntax resource safety", () => {
  it("counts only real pull-lexer tokens and measures token bytes as UTF-8", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        "Ontology()",
        configuration({ maxTokenCount: 3 }),
      ),
    ).resolves.toBeDefined();

    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        'Ontology(Annotation(rdfs:label "éé"))',
        configuration({ maxTokenLength: 5 }),
      ),
      "maxTokenLength",
      5,
      6,
    );
  });

  it("enforces input, axiom, blank-node, expression, and annotation ceilings", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const utf8Document = 'Ontology(Annotation(rdfs:label "é"))';
    const inputBytes = new TextEncoder().encode(utf8Document).byteLength;

    await expect(
      manager.loadOntologyFromOntologyDocument(
        utf8Document,
        configuration({ maxInputBytes: inputBytes }),
      ),
    ).resolves.toBeDefined();
    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        utf8Document,
        configuration({ maxInputBytes: inputBytes - 1 }),
      ),
      "maxInputBytes",
      inputBytes - 1,
      inputBytes,
    );

    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        "Ontology(Declaration(Class(<urn:test:A>)) Declaration(Class(<urn:test:B>)))",
        configuration({ maxAxioms: 1 }),
      ),
      "maxAxioms",
      1,
      undefined,
    );
    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        "Ontology(SameIndividual(_:one _:two))",
        configuration({ maxBlankNodes: 1 }),
      ),
      "maxBlankNodes",
      1,
      2,
    );

    await expect(
      manager.loadOntologyFromOntologyDocument(
        `Ontology(SubClassOf(<urn:test:A> ${nestedComplements(2)}))`,
        configuration({ maxExpressionDepth: 2 }),
      ),
    ).resolves.toBeDefined();
    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        `Ontology(SubClassOf(<urn:test:A> ${nestedComplements(3)}))`,
        configuration({ maxExpressionDepth: 2 }),
      ),
      "maxExpressionDepth",
      2,
      3,
    );

    await expect(
      manager.loadOntologyFromOntologyDocument(
        `Ontology(${nestedAnnotations(2)})`,
        configuration({ maxAnnotationDepth: 2 }),
      ),
    ).resolves.toBeDefined();
    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        `Ontology(${nestedAnnotations(3)})`,
        configuration({ maxAnnotationDepth: 2 }),
      ),
      "maxAnnotationDepth",
      2,
      3,
    );
  });

  it("enforces the configured parse timeout", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expectResource(
      manager.loadOntologyFromOntologyDocument(
        "Ontology()",
        configuration({ timeoutMs: 0 }),
      ),
      "timeoutMs",
      0,
      expect.any(Number),
    );
  });

  it("cooperatively yields so an in-flight parse can be aborted", async () => {
    class CountingDataFactory extends OWLDataFactory {
      declarationsCreated = 0;

      getOWLDeclarationAxiom(...arguments_) {
        this.declarationsCreated += 1;
        return super.getOWLDeclarationAxiom(...arguments_);
      }
    }

    const dataFactory = new CountingDataFactory();
    const manager = OWLManager.createOWLOntologyManager({ dataFactory });
    const controller = new AbortController();
    const declarations = Array.from(
      { length: 50_000 },
      (_, index) => `Declaration(Class(<urn:test:C${index}>))`,
    ).join("\n");

    const loading = manager.loadOntologyFromOntologyDocument(
      `Ontology(${declarations})`,
      configuration({ signal: controller.signal, timeoutMs: 30_000 }),
    );
    queueMicrotask(() => controller.abort());

    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(dataFactory.declarationsCreated).toBeLessThan(50_000);
  });
});
