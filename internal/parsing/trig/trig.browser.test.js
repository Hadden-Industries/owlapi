import { StringDocumentSource } from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";
import * as n3Implementation from "n3";
import { createTriGSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

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

describe("TriG browser contract", () => {
  it("preserves prefixes and named graphs through the lazy dependency without Node globals", async () => {
    for (const name of descriptors.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: name === "window" ? {} : undefined,
      });
    }

    // Browser resolution is covered by the installed Playwright fixture; this
    // focused test removes globals only after obtaining the implementation.
    const { dataset, prefixes } = await createTriGSyntaxAdapter({
      loadImplementation: async () => n3Implementation,
    }).parse(
      new StringDocumentSource(
        '@prefix ex: <urn:test:> . ex:graph { ex:subject ex:label "browser"@EN . }',
      ),
    );

    expect(prefixes).toEqual({ ex: "urn:test:" });
    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:label"),
        rdfDataFactory.literal("browser", "en"),
        rdfDataFactory.namedNode("urn:test:graph"),
      ).size,
    ).toBe(1);
  });
});
