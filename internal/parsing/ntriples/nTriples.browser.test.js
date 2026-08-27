import { StringDocumentSource } from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";
import * as n3Implementation from "n3";
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

    // Browser resolution is covered by the installed Playwright fixture; this
    // focused test removes globals only after obtaining the implementation.
    const { dataset, prefixes } = await createNTriplesSyntaxAdapter({
      loadImplementation: async () => n3Implementation,
    }).parse(
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
