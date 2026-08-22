import { StringDocumentSource } from "../../io/index.js";
import { rdfDataFactory } from "../../rdf/index.js";
import { createNTriplesSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const descriptors = new Map(
  ["Buffer", "process", "window"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
);

afterEach(() => {
  for (const [name, descriptor] of descriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  }
});

describe("N-Triples browser contract", () => {
  it("parses through the lazy dependency without Node-only globals", async () => {
    for (const name of descriptors.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: name === "window" ? {} : undefined,
      });
    }

    const { dataset, prefixes } = await createNTriplesSyntaxAdapter().parse(
      new StringDocumentSource(
        '<urn:test:subject> <urn:test:label> "browser"@EN .',
      ),
    );

    expect(prefixes).toEqual({});
    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:label"),
        rdfDataFactory.literal("browser", "en"),
      ).size,
    ).toBe(1);
  });
});
