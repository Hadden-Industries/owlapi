import { StringDocumentSource } from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import { JsonLdSyntaxAdapter } from "./jsonLdSyntaxAdapter.js";

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

describe("JSON-LD browser contract", () => {
  it("uses the lazy processor without relying on Node globals", async () => {
    for (const name of descriptors.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: name === "window" ? {} : undefined,
      });
    }
    const { dataset } = await new JsonLdSyntaxAdapter().parse(
      new StringDocumentSource(
        JSON.stringify({
          "@id": "urn:test:BrowserClass",
          "@type": "http://www.w3.org/2002/07/owl#Class",
        }),
      ),
    );

    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:BrowserClass"),
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        ),
        rdfDataFactory.namedNode("http://www.w3.org/2002/07/owl#Class"),
      ).size,
    ).toBe(1);
  });
});
