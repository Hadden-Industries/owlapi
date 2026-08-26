import { jest } from "@jest/globals";

import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import { JsonLdSyntaxAdapter } from "./jsonLdSyntaxAdapter.js";

const configurationWithJsonLdParameters = (parameters, values = {}) => {
  let format = OWLDocumentFormats.JSON_LD;
  for (const [key, value] of Object.entries(parameters)) {
    format = format.withParameter(key, value);
  }
  return new OWLOntologyLoaderConfiguration({ ...values, format });
};

describe("JsonLdSyntaxAdapter", () => {
  it("converts JSON-LD directly to RDF/JS and preserves context metadata", async () => {
    const context = Object.freeze({
      ex: "urn:test:",
      owl: "http://www.w3.org/2002/07/owl#",
    });
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": context,
        "@id": "ex:Person",
        "@type": "owl:Class",
      }),
      { documentIRI: "urn:test:document" },
    );

    const result = await new JsonLdSyntaxAdapter().parse(source);

    expect(
      result.dataset.match(
        rdfDataFactory.namedNode("urn:test:Person"),
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        ),
        rdfDataFactory.namedNode("http://www.w3.org/2002/07/owl#Class"),
      ).size,
    ).toBe(1);
    expect(result.prefixes).toEqual({});
    expect(result.jsonLdContexts).toEqual([context]);
    expect(Object.isFrozen(result.jsonLdContexts)).toBe(true);
    expect(Object.isFrozen(result.jsonLdContexts[0])).toBe(true);
  });

  it("applies the selected JSON-LD processing mode", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": {
          "@version": 1.1,
          "@vocab": "urn:test:",
        },
        "@id": "urn:test:subject",
        value: "accepted only in the default 1.1 mode",
      }),
    );

    await expect(
      new JsonLdSyntaxAdapter().parse(source),
    ).resolves.toHaveProperty("dataset.size", 1);
    await expect(
      new JsonLdSyntaxAdapter().parse(
        source,
        configurationWithJsonLdParameters({
          processingMode: "json-ld-1.0",
        }),
      ),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      syntax: "JSON-LD",
    });
  });

  it("applies an inline expansion context supplied by the document format", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@id": "ex:Person",
        "@type": "owl:Class",
      }),
      { documentIRI: "urn:test:document" },
    );
    const configuration = configurationWithJsonLdParameters({
      expandContext: {
        ex: "urn:test:",
        owl: "http://www.w3.org/2002/07/owl#",
      },
    });

    const result = await new JsonLdSyntaxAdapter().parse(source, configuration);

    expect(
      result.dataset.match(
        rdfDataFactory.namedNode("urn:test:Person"),
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        ),
        rdfDataFactory.namedNode("http://www.w3.org/2002/07/owl#Class"),
      ).size,
    ).toBe(1);
  });

  it("loads an external expansion context only through the restricted loader", async () => {
    const contextIRI = "https://example.test/expansion-context.jsonld";
    const source = new StringDocumentSource(
      JSON.stringify({ "@id": "ex:Person", "@type": "owl:Class" }),
    );
    const documentLoader = {
      load: jest.fn(async () =>
        JSON.stringify({
          "@context": {
            ex: "urn:test:",
            owl: "http://www.w3.org/2002/07/owl#",
          },
        }),
      ),
    };
    const denied = configurationWithJsonLdParameters({
      expandContext: contextIRI,
    });

    await expect(
      new JsonLdSyntaxAdapter({ documentLoader }).parse(source, denied),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      resource: "remoteJsonLdContexts",
    });
    expect(documentLoader.load).not.toHaveBeenCalled();

    const enabled = denied.with({ remoteJsonLdContexts: true });
    const result = await new JsonLdSyntaxAdapter({ documentLoader }).parse(
      source,
      enabled,
    );

    expect(result.dataset.size).toBe(1);
    expect(documentLoader.load).toHaveBeenCalledWith(
      expect.objectContaining({ value: contextIRI }),
      {
        config: enabled,
        purpose: "jsonld-context",
        signal: undefined,
      },
    );
  });

  it("applies JSON-LD 1.0 compatibility inside externally loaded contexts", async () => {
    const contextIRI = "https://example.test/jsonld10-context.jsonld";
    const source = new StringDocumentSource(
      JSON.stringify({ "@id": "ex:subject", "ex:value": "legacy" }),
    );
    const configuration = configurationWithJsonLdParameters(
      {
        expandContext: contextIRI,
        processingMode: "json-ld-1.0",
      },
      { remoteJsonLdContexts: true },
    );
    const documentLoader = {
      load: async () =>
        JSON.stringify({
          "@context": {
            ex: { "@id": "https://example.test/vocab/" },
          },
        }),
    };

    const { dataset } = await new JsonLdSyntaxAdapter({
      documentLoader,
    }).parse(source, configuration);

    expect(
      dataset.match(
        rdfDataFactory.namedNode("https://example.test/vocab/subject"),
        rdfDataFactory.namedNode("https://example.test/vocab/value"),
        rdfDataFactory.literal("legacy"),
      ).size,
    ).toBe(1);
  });

  it("encodes directional strings with an i18n datatype when selected", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@id": "urn:test:subject",
        "urn:test:label": {
          "@direction": "ltr",
          "@language": "en",
          "@value": "hello",
        },
      }),
    );
    const configuration = configurationWithJsonLdParameters({
      rdfDirection: "i18n-datatype",
    });

    const { dataset } = await new JsonLdSyntaxAdapter().parse(
      source,
      configuration,
    );
    const objects = [
      ...dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:label"),
      ),
    ].map(({ object }) => object);

    expect(objects).toHaveLength(1);
    expect(objects[0]).toMatchObject({
      datatype: {
        termType: "NamedNode",
        value: "https://www.w3.org/ns/i18n#en_ltr",
      },
      language: "",
      termType: "Literal",
      value: "hello",
    });
  });

  it("encodes directional strings as compound literals when selected", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@id": "urn:test:subject",
        "urn:test:label": {
          "@direction": "rtl",
          "@language": "ar",
          "@value": "مرحبا",
        },
      }),
    );
    const configuration = configurationWithJsonLdParameters({
      rdfDirection: "compound-literal",
    });

    const { dataset } = await new JsonLdSyntaxAdapter().parse(
      source,
      configuration,
    );
    const link = [
      ...dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:label"),
      ),
    ][0];

    expect(link.object.termType).toBe("BlankNode");
    expect(
      dataset.match(
        link.object,
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#value",
        ),
        rdfDataFactory.literal("مرحبا"),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        link.object,
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#language",
        ),
        rdfDataFactory.literal("ar"),
      ).size,
    ).toBe(1);
    expect(
      dataset.match(
        link.object,
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#direction",
        ),
        rdfDataFactory.literal("rtl"),
      ).size,
    ).toBe(1);
  });

  it("preserves JSON values as JCS-canonical rdf:JSON literals", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": {
          payload: { "@id": "urn:test:payload", "@type": "@json" },
        },
        "@id": "urn:test:subject",
        payload: {
          z: 1,
          a: [true, null, { "@id": "not-json-ld", nested: "value" }],
        },
      }),
    );

    const { dataset } = await new JsonLdSyntaxAdapter().parse(source);
    const literal = [
      ...dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:payload"),
      ),
    ][0].object;

    expect(literal).toMatchObject({
      datatype: {
        value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#JSON",
      },
      termType: "Literal",
      value: '{"a":[true,null,{"@id":"not-json-ld","nested":"value"}],"z":1}',
    });
    expect(JSON.parse(literal.value)).toEqual({
      a: [true, null, { "@id": "not-json-ld", nested: "value" }],
      z: 1,
    });
  });

  it.each([
    ["processingMode", "json-ld-2.0"],
    ["rdfDirection", "implementation-specific"],
  ])("rejects an unknown %s format parameter value", async (key, value) => {
    const source = new StringDocumentSource(
      JSON.stringify({ "@id": "urn:test:subject" }),
    );

    await expect(
      new JsonLdSyntaxAdapter().parse(
        source,
        configurationWithJsonLdParameters({ [key]: value }),
      ),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("denies remote contexts before consulting the injected loader", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": "https://example.test/context.jsonld",
        "@id": "urn:test:Person",
      }),
    );
    const documentLoader = {
      load: jest.fn(() => {
        throw new Error("The disabled loader must not be called");
      }),
    };

    await expect(
      new JsonLdSyntaxAdapter({ documentLoader }).parse(source),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      resource: "remoteJsonLdContexts",
    });
    expect(documentLoader.load).not.toHaveBeenCalled();
  });

  it("requires an injected loader when remote contexts are enabled", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": "https://example.test/context.jsonld",
        "@id": "urn:test:Person",
      }),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      remoteJsonLdContexts: true,
    });

    await expect(
      new JsonLdSyntaxAdapter().parse(source, configuration),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      resource: "documentLoader",
    });
  });

  it("normalizes injected context-loader failures", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": "https://example.test/context.jsonld",
        "@id": "urn:test:Person",
      }),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      remoteJsonLdContexts: true,
    });
    const adapter = new JsonLdSyntaxAdapter({
      documentLoader: {
        load: async () => {
          throw new Error("controlled loader failed");
        },
      },
    });

    await expect(adapter.parse(source, configuration)).rejects.toMatchObject({
      code: "DOCUMENT_LOAD_FAILED",
      resource: "jsonLdContext",
    });
  });

  it("loads enabled remote contexts through the injected project loader", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": "https://example.test/context.jsonld",
        "@id": "ex:Person",
        "@type": "owl:Class",
      }),
      { documentIRI: "urn:test:document" },
    );
    const abortController = new AbortController();
    const configuration = new OWLOntologyLoaderConfiguration({
      remoteJsonLdContexts: true,
      signal: abortController.signal,
    });
    const documentLoader = {
      load: jest.fn(async () =>
        JSON.stringify({
          "@context": {
            ex: "urn:test:",
            owl: "http://www.w3.org/2002/07/owl#",
          },
        }),
      ),
    };

    const result = await new JsonLdSyntaxAdapter({ documentLoader }).parse(
      source,
      configuration,
    );

    expect(
      result.dataset.match(
        rdfDataFactory.namedNode("urn:test:Person"),
        rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        ),
        rdfDataFactory.namedNode("http://www.w3.org/2002/07/owl#Class"),
      ).size,
    ).toBe(1);
    expect(documentLoader.load).toHaveBeenCalledWith(
      expect.objectContaining({ value: "https://example.test/context.jsonld" }),
      {
        config: configuration,
        purpose: "jsonld-context",
        signal: abortController.signal,
      },
    );
  });

  it("blocks loopback context IRIs before consulting the loader", async () => {
    const source = new StringDocumentSource(
      JSON.stringify({
        "@context": "http://127.0.0.1/context.jsonld",
        "@id": "urn:test:Person",
      }),
    );
    const configuration = new OWLOntologyLoaderConfiguration({
      remoteJsonLdContexts: true,
    });
    const documentLoader = { load: jest.fn() };

    await expect(
      new JsonLdSyntaxAdapter({ documentLoader }).parse(source, configuration),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      resource: "jsonLdContextIRI",
    });
    expect(documentLoader.load).not.toHaveBeenCalled();
  });

  it.each([
    "http://[::ffff:127.0.0.1]/context.jsonld",
    "http://100.64.0.1/context.jsonld",
  ])(
    "blocks non-public address %s before consulting the loader",
    async (iri) => {
      const configuration = new OWLOntologyLoaderConfiguration({
        remoteJsonLdContexts: true,
      });
      const documentLoader = { load: jest.fn() };
      const source = new StringDocumentSource(
        JSON.stringify({ "@context": iri, "@id": "urn:test:Person" }),
      );

      await expect(
        new JsonLdSyntaxAdapter({ documentLoader }).parse(
          source,
          configuration,
        ),
      ).rejects.toMatchObject({
        code: "SECURITY_POLICY_VIOLATION",
        resource: "jsonLdContextIRI",
      });
      expect(documentLoader.load).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["malformed JSON", "{"],
    ["invalid JSON-LD", '{"@context":42,"@id":"urn:test:Person"}'],
  ])("normalizes %s failures at the adapter boundary", async (_, text) => {
    await expect(
      new JsonLdSyntaxAdapter().parse(new StringDocumentSource(text)),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      syntax: "JSON-LD",
    });
  });
});
