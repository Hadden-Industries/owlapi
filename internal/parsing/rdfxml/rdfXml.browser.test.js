import { DOMParser as NodeDomParser } from "@xmldom/xmldom";

import { StringDocumentSource } from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

const originalDomParser = Object.getOwnPropertyDescriptor(
  globalThis,
  "DOMParser",
);

afterEach(() => {
  if (originalDomParser) {
    Object.defineProperty(globalThis, "DOMParser", originalDomParser);
  } else {
    delete globalThis.DOMParser;
  }
});

describe("RdfXmlSyntaxAdapter browser contract", () => {
  it("uses the browser DOM contract while preserving the RDF/JS boundary", async () => {
    let constructions = 0;
    Object.defineProperty(globalThis, "DOMParser", {
      configurable: true,
      value: class BrowserDomParser {
        constructor() {
          constructions += 1;
          this.parser = new NodeDomParser();
        }

        parseFromString(...arguments_) {
          return this.parser.parseFromString(...arguments_);
        }
      },
    });

    const dataset = await new RdfXmlSyntaxAdapter().parse(
      new StringDocumentSource(`
        <rdf:RDF
          xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
          xmlns:ex="urn:test:"
        >
          <rdf:Description rdf:about="urn:test:subject">
            <ex:markup rdf:parseType="Literal"><b>browser</b></ex:markup>
          </rdf:Description>
        </rdf:RDF>
      `),
    );

    expect(constructions).toBe(1);
    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:markup"),
        rdfDataFactory.literal(
          "<b>browser</b>",
          rdfDataFactory.namedNode(
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral",
          ),
        ),
      ).size,
    ).toBe(1);
  });
});
