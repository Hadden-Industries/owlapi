import { StringDocumentSource } from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";
import * as n3Implementation from "n3";

import { createTurtleSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

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

describe("Turtle browser contract", () => {
  it("parses through the lazy dependency without Node-only globals", async () => {
    for (const name of descriptors.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: name === "window" ? {} : undefined,
      });
    }

    // Resolve the dependency before removing Node globals. This unit test owns
    // execution portability; installed Playwright consumers own browser
    // resolution of N3's documented dual-entry package root.
    const { dataset, prefixes } = await createTurtleSyntaxAdapter({
      loadImplementation: async () => n3Implementation,
    }).parse(
      new StringDocumentSource(`
        @prefix ex: <urn:test:> .
        ex:subject ex:label "browser"@EN .
      `),
    );

    expect(prefixes).toEqual({ ex: "urn:test:" });
    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:label"),
        rdfDataFactory.literal("browser", "en"),
      ).size,
    ).toBe(1);
  });
});
