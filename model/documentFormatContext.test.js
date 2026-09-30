import {
  IRI,
  OWLDocumentFormats,
  OWLManager,
  StringDocumentSource,
} from "../index.js";

const root = "Ontology(<urn:format:root> Import(<urn:format:middle>))";
const middle = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
  <urn:format:middle> a owl:Ontology; owl:imports <urn:format:leaf> .`;
const leaf = `Ontology(<urn:format:leaf> Declaration(Class(<urn:format:Leaf>)))`;

describe("explicit per-document formats and import context", () => {
  test.each(["turtle", OWLDocumentFormats.TURTLE])(
    "retains explicit format %s across source cloning",
    async (format) => {
      const calls = [];
      const manager = OWLManager.createOWLOntologyManager({
        iriMappers: [
          {
            getDocumentIRI: (iri) =>
              IRI.create(iri.value.replace("urn:format:", "urn:retrieval:")),
          },
        ],
        documentLoader: {
          async load(documentIRI, context) {
            calls.push({ documentIRI, context });
            const isMiddle = context.importIRI.value === "urn:format:middle";
            return new StringDocumentSource(isMiddle ? middle : leaf, {
              documentIRI: isMiddle ? "urn:actual:middle" : "urn:actual:leaf",
              // Incorrect hints must never override an explicit format.
              contentType: isMiddle ? "text/owl-functional" : "text/turtle",
              fileName: isMiddle ? "middle.ofn" : "leaf.ttl",
              format: isMiddle ? format : "functional",
            });
          },
        },
      });
      const result = await manager.loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource(root, {
          documentIRI: "urn:actual:root",
          format: "functional",
        }),
        { format: "functional" },
      );
      expect(result.importsClosure).toHaveLength(3);
      expect(result.documents.map(({ context }) => context.format.key)).toEqual(
        ["functional", "turtle", "functional"],
      );
      expect(
        calls.map(({ documentIRI, context }) => [
          documentIRI.value,
          context.importIRI.value,
          context.importingDocumentIRI.value,
        ]),
      ).toEqual([
        ["urn:retrieval:middle", "urn:format:middle", "urn:actual:root"],
        ["urn:retrieval:leaf", "urn:format:leaf", "urn:actual:middle"],
      ]);
      expect(calls.every(({ context }) => Object.isFrozen(context))).toBe(true);
    },
  );

  it("does not inherit a source-specific format into another document", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async () =>
          new StringDocumentSource(leaf, { format: "functional" }),
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(middle, { format: "turtle" }),
      { format: "functional" },
    );
    expect(result.documents.map(({ context }) => context.format.key)).toEqual([
      "turtle",
      "functional",
    ]);
  });

  it("rejects a mismatched explicit import format without fallback or partial publication", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async () =>
          new StringDocumentSource(middle, {
            format: "functional",
            contentType: "text/turtle",
          }),
      },
    });
    const priorID = manager
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:prior"));
    const prior = manager.createOntology(priorID);
    await expect(
      manager.loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource(root, { format: "functional" }),
      ),
    ).rejects.toMatchObject({ code: "PARSER_MISMATCH" });
    expect(manager.getOntology(priorID)).toBe(prior);
    expect(
      manager.getOntology(
        manager
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:format:root")),
      ),
    ).toBeUndefined();
    expect(
      manager.getOntology(
        manager
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:format:middle")),
      ),
    ).toBeUndefined();
  });

  it("rolls back the mixed-format closure when its resolver aborts", async () => {
    const controller = new AbortController();
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (_iri, context) => {
          expect(context.signal).toBe(controller.signal);
          controller.abort();
          return new StringDocumentSource(middle, { format: "turtle" });
        },
      },
    });
    await expect(
      manager.loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource(root, { format: "functional" }),
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(
      manager.getOntology(
        manager
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:format:root")),
      ),
    ).toBeUndefined();
    expect(
      manager.getOntology(
        manager
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:format:middle")),
      ),
    ).toBeUndefined();
  });

  test.each(["", null, 7, { key: "turtle" }])(
    "rejects invalid mutable format metadata %s",
    (format) => {
      expect(() => new StringDocumentSource("", { format })).toThrow(TypeError);
    },
  );
});
