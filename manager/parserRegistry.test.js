import { OWLDocumentFormats, StringDocumentSource } from "../index.js";
import { OWLParserRegistry, ParserDescriptor } from "./parserRegistry.js";

const detection = (result, reasonCode) => ({
  reason: reasonCode,
  reasonCode,
  result,
});

describe("OWLParserRegistry", () => {
  it("resolves candidates deterministically from bounded evidence", () => {
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({}),
        detect: () => detection("INDETERMINATE", "NO_MARKER"),
        format: OWLDocumentFormats.MANCHESTER,
        id: "manchester",
        priority: 4,
        supportsCompatibleRecovery: true,
      }),
      new ParserDescriptor({
        createParser: () => ({}),
        detect: () => detection("MATCH", "ONTOLOGY_WRAPPER"),
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);
    const source = new StringDocumentSource("Ontology()", {
      contentType: "text/owl-functional",
      fileName: "ontology.owl",
    });

    const candidates = registry.resolveCandidates(source, {
      parsingMode: "compatible",
    });

    expect(candidates.map(({ descriptor }) => descriptor.id)).toEqual([
      "functional",
      "manchester",
    ]);
    expect(candidates[0].eligible).toBe(true);
    expect(candidates[1].eligible).toBe(false);
    expect(Object.isFrozen(candidates[0].descriptor)).toBe(true);
  });

  it("limits detection input by encoded bytes rather than characters", () => {
    let sniffedText;
    const registry = new OWLParserRegistry([
      new ParserDescriptor({
        createParser: () => ({}),
        detect: (source) => {
          sniffedText = source.getText();
          return detection("MATCH", "TEST_MATCH");
        },
        format: OWLDocumentFormats.FUNCTIONAL,
        id: "functional",
        priority: 2,
      }),
    ]);

    registry.resolveCandidates(new StringDocumentSource("é".repeat(10)), {
      maxSniffBytes: 5,
    });

    expect(
      new TextEncoder().encode(sniffedText).byteLength,
    ).toBeLessThanOrEqual(5);
  });

  it("rejects duplicate parser and format identities", () => {
    const descriptor = (id) =>
      new ParserDescriptor({
        createParser: () => ({}),
        detect: () => detection("MATCH", "TEST_MATCH"),
        format: OWLDocumentFormats.FUNCTIONAL,
        id,
        priority: 2,
      });

    expect(
      () => new OWLParserRegistry([descriptor("first"), descriptor("second")]),
    ).toThrow(/Duplicate parser format key: functional/);
  });

  it("rejects descriptors whose format metadata can change after registration", () => {
    const mutableCollections = Object.freeze({
      extensions: [],
      key: "mutable",
      mediaTypes: [],
    });

    expect(
      () =>
        new ParserDescriptor({
          createParser: () => ({}),
          detect: () => detection("MATCH", "TEST_MATCH"),
          format: mutableCollections,
          id: "mutable",
          priority: 1,
        }),
    ).toThrow(/format metadata must be immutable/);
  });

  it("rejects non-boolean compatible-recovery declarations", () => {
    expect(
      () =>
        new ParserDescriptor({
          createParser: () => ({}),
          detect: () => detection("MATCH", "TEST_MATCH"),
          format: OWLDocumentFormats.FUNCTIONAL,
          id: "functional",
          priority: 2,
          supportsCompatibleRecovery: "yes",
        }),
    ).toThrow(/supportsCompatibleRecovery must be a boolean/);
  });

  it("breaks equal-evidence ties by stable parser-id code units", () => {
    const descriptor = (id, format) =>
      new ParserDescriptor({
        createParser: () => ({}),
        detect: () => detection("MATCH", "TEST_MATCH"),
        format,
        id,
        priority: 2,
      });
    const registry = new OWLParserRegistry([
      descriptor("a_2", OWLDocumentFormats.MANCHESTER),
      descriptor("a-1", OWLDocumentFormats.FUNCTIONAL),
    ]);

    const candidates = registry.resolveCandidates(
      new StringDocumentSource("ambiguous"),
    );

    expect(candidates.map(({ descriptor: { id } }) => id)).toEqual([
      "a-1",
      "a_2",
    ]);
  });
});
