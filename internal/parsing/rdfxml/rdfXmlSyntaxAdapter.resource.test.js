import { Transform } from "node:stream";

import { jest } from "@jest/globals";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";

import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const configuration = (values) => new OWLOntologyLoaderConfiguration(values);
const source = (text) => new StringDocumentSource(text);
const document = (body = "") => `
  <rdf:RDF xmlns:rdf="${RDF_NAMESPACE}" xmlns:ex="urn:test:">
    ${body}
  </rdf:RDF>
`;

describe("RdfXmlSyntaxAdapter security and finite resources", () => {
  it("expands bounded internal entities under the shared XML policy", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const dataset = await adapter.parse(
      source(`
        <!DOCTYPE rdf:RDF [
          <!ENTITY inner "bounded &amp; safe">
          <!ENTITY outer "value: &inner;">
        ]>
        <rdf:RDF xmlns:rdf="${RDF_NAMESPACE}" xmlns:ex="urn:test:">
          <rdf:Description rdf:about="urn:test:subject">
            <ex:label>&outer;</ex:label>
          </rdf:Description>
        </rdf:RDF>
      `),
      configuration({}),
    );

    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:subject"),
        rdfDataFactory.namedNode("urn:test:label"),
        rdfDataFactory.literal("value: bounded & safe"),
      ).size,
    ).toBe(1);
  });

  it.each([
    {
      policy: "externalXmlSubset",
      xml: `<!DOCTYPE rdf:RDF SYSTEM "https://example.com/remote.dtd">${document()}`,
    },
    {
      policy: "externalXmlEntity",
      xml: `<!DOCTYPE rdf:RDF [<!ENTITY remote SYSTEM "https://example.com/value">]>${document(
        '<rdf:Description rdf:about="urn:test:s"><ex:p>&remote;</ex:p></rdf:Description>',
      )}`,
    },
    {
      policy: "xmlParameterEntity",
      xml: `<!DOCTYPE rdf:RDF [<!ENTITY payload "%parameter;">]>${document(
        '<rdf:Description rdf:about="urn:test:s"><ex:p>&payload;</ex:p></rdf:Description>',
      )}`,
    },
  ])("rejects $policy without retrieval", async ({ policy, xml }) => {
    const adapter = new RdfXmlSyntaxAdapter();

    await expect(
      adapter.parse(source(xml), configuration({})),
    ).rejects.toMatchObject({
      code: "SECURITY_POLICY_VIOLATION",
      policy,
    });
  });

  it.each([
    document("<rdf:Description>"),
    document("<rdf:Description></rdf:Seq>"),
    `${document()}<rdf:RDF xmlns:rdf="${RDF_NAMESPACE}"/>`,
  ])("rejects structurally malformed XML deterministically", async (xml) => {
    const adapter = new RdfXmlSyntaxAdapter();

    await expect(
      adapter.parse(source(xml), configuration({})),
    ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
  });

  it("distinguishes malformed XML from well-formed invalid RDF/XML", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const duplicateNamespace = `<rdf:RDF xmlns:rdf="${RDF_NAMESPACE}" xmlns:rdf="${RDF_NAMESPACE}"/>`;
    const conflictingSubjectIdentity = document(`
      <rdf:Description rdf:about="urn:test:subject" rdf:nodeID="subject"/>
    `);

    await expect(
      adapter.parse(source(duplicateNamespace), configuration({})),
    ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
    await expect(
      adapter.parse(source(conflictingSubjectIdentity), configuration({})),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("enforces input, nesting, quad, blank-node, and term limits", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const twoQuads = document(`
      <rdf:Description rdf:about="urn:test:subject">
        <ex:first>one</ex:first>
        <ex:second>two</ex:second>
      </rdf:Description>
    `);
    const twoBlankNodes = document(`
      <rdf:Description>
        <ex:child rdf:parseType="Resource"/>
      </rdf:Description>
    `);

    await expect(
      adapter.parse(source(twoQuads), configuration({ maxInputBytes: 1 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxInputBytes",
    });
    await expect(
      adapter.parse(source(twoQuads), configuration({ maxXmlNestingDepth: 2 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 3,
      resource: "maxXmlNestingDepth",
    });
    await expect(
      adapter.parse(source(twoQuads), configuration({ maxQuads: 1 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxQuads",
    });
    await expect(
      adapter.parse(source(twoBlankNodes), configuration({ maxBlankNodes: 1 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxBlankNodes",
    });
    await expect(
      adapter.parse(source(twoQuads), configuration({ maxTokenLength: 4 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
    });
  });

  it("applies the token limit to a literal datatype IRI", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const typedLiteral = document(`
      <rdf:Description rdf:about="urn:s">
        <ex:p rdf:datatype="urn:datatype:far-too-long">x</ex:p>
      </rdf:Description>
    `);

    await expect(
      adapter.parse(
        source(typedLiteral),
        configuration({ maxTokenLength: 16 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
      termType: "NamedNode",
    });
  });

  it("enforces timeout and pre-aborted signals", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.parse(source(document()), configuration({ timeoutMs: 0 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "timeoutMs",
    });
    await expect(
      adapter.parse(
        source(document()),
        configuration({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("terminates a dependency stream that stalls after input ends", async () => {
    let parser;
    let guardTimer;

    class StalledParser extends Transform {
      constructor() {
        super({ readableObjectMode: true });
        parser = this;
      }

      _transform(chunk, encoding, callback) {
        callback();
      }

      _flush() {}
    }

    const adapter = new RdfXmlSyntaxAdapter({
      loadImplementation: async () => ({ RdfXmlParser: StalledParser }),
    });
    const guard = new Promise((resolve, reject) => {
      guardTimer = globalThis.setTimeout(() => {
        parser?.destroy();
        reject(new Error("The test guard observed a stalled parser"));
      }, 200);
    });

    try {
      await expect(
        Promise.race([
          adapter.parse(source(document()), configuration({ timeoutMs: 20 })),
          guard,
        ]),
      ).rejects.toMatchObject({
        code: "RESOURCE_LIMIT_EXCEEDED",
        resource: "timeoutMs",
      });
      expect(parser.destroyed).toBe(true);
    } finally {
      globalThis.clearTimeout(guardTimer);
      parser?.destroy();
    }
  });

  it("caps long watchdog delays at the host timer maximum", async () => {
    const adapter = new RdfXmlSyntaxAdapter();
    const originalSetTimeout = globalThis.setTimeout;
    const observedDelays = [];
    const setTimeoutSpy = jest
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback, delay, ...arguments_) => {
        observedDelays.push(delay);
        return originalSetTimeout(
          callback,
          Math.min(delay, 200),
          ...arguments_,
        );
      });

    try {
      await expect(
        adapter.parse(
          source(document()),
          configuration({ timeoutMs: Number.MAX_SAFE_INTEGER }),
        ),
      ).resolves.toBeDefined();
      expect(Math.max(...observedDelays)).toBeLessThanOrEqual(2_147_483_647);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("cooperatively delivers an in-flight abort while streaming chunks", async () => {
    const adapter = new RdfXmlSyntaxAdapter({ chunkSize: 32 });
    const controller = new AbortController();
    const descriptions = Array.from(
      { length: 10_000 },
      (_, index) =>
        `<rdf:Description rdf:about="urn:test:s${index}"><ex:p>${index}</ex:p></rdf:Description>`,
    ).join("");
    const parsing = adapter.parse(
      source(document(descriptions)),
      configuration({ signal: controller.signal, timeoutMs: 30_000 }),
    );
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });
});
