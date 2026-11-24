import { OWLManager, OWLDocumentFormats } from "../index.js";
import { OWLDocumentFormat } from "../model/owlDocumentFormat.js";
import { OWLParserRegistry } from "../internal/parsing/parserRegistry.js";
import { functionalSyntaxParserDescriptor } from "../internal/parsing/functional/descriptor.js";
import { streamTextSource } from "../internal/parsing/streamByteReader.js";
import {
  StreamDocumentSource,
  ParserMismatchError,
  StreamDocumentTarget,
  StringDocumentSource,
  StringDocumentTarget,
} from "./index.js";

const input =
  'Ontology(<urn:streams> Declaration(Class(<urn:café>)) Declaration(AnnotationProperty(<urn:label>)) AnnotationAssertion(<urn:label> <urn:café> "🐈"))';

function byteSource(text, format, chunkBytes) {
  const bytes = new TextEncoder().encode(text);
  return new StreamDocumentSource(
    function* () {
      for (let i = 0; i < bytes.length; i += chunkBytes)
        yield bytes.subarray(i, i + chunkBytes);
    },
    { format, documentIRI: "https://example.test/document" },
  );
}

test.each([1, 2])(
  "the detection prefix excludes a chunk-split UTF-8 BOM at %i bytes",
  async (limit) => {
    const bytes = Uint8Array.of(0xef, 0xbb, 0xbf, 0x41, 0x42);
    for (const chunks of [
      [bytes],
      Array.from(bytes, (byte) => Uint8Array.of(byte)),
    ]) {
      const part = await streamTextSource(
        new StreamDocumentSource(() => chunks),
        { maxInputBytes: bytes.length, maxSniffBytes: limit, timeoutMs: 1000 },
        true,
      );
      expect(part.getText()).toBe("AB".slice(0, limit));
    }
  },
);

test.each([
  [Uint8Array.of(0xc3, 0xa9), 2, "é"],
  [Uint8Array.of(0x61, 0xf0, 0x9f), 3, "a"],
])(
  "stream format detection stops at the raw UTF-8 boundary",
  async (first, limit, expected) => {
    const source = new StreamDocumentSource(function* () {
      yield first;
      throw new Error("The sniff requested a byte outside its window");
    });
    const sample = await streamTextSource(
      source,
      { maxInputBytes: 32, maxSniffBytes: limit, timeoutMs: 1000 },
      true,
    );
    expect(sample.getText()).toBe(expected);
  },
);

test.each([
  ["Ontology(<urn:read> UnknownAxiom(", {}, { code: "OWL_SYNTAX_ERROR" }],
  [
    "Ontology(<urn:read> SubClassOf(<urn:A> ObjectComplementOf(ObjectComplementOf(<urn:B> ",
    { maxExpressionDepth: 0 },
    { resource: "maxExpressionDepth" },
  ],
])(
  "the Functional grammar reports a decided error before pulling more bytes",
  async (text, config, error) => {
    const source = new StreamDocumentSource(
      function* () {
        yield new TextEncoder().encode(text);
        throw new Error("The parser requested a later byte");
      },
      { format: "functional" },
    );
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
        config,
      ),
    ).rejects.toMatchObject(error);
  },
);

test("auto-detection rejects a factory that returns the same exhausted Web stream", async () => {
  const onlyStream = new Blob([
    "<urn:A> a <http://www.w3.org/2002/07/owl#Class> .",
  ]).stream();
  const source = new StreamDocumentSource(() => onlyStream, {
    contentType: "text/turtle",
  });
  await expect(
    OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
    ),
  ).rejects.toThrow("fresh byte stream");
});

test("a mismatching foreign parser receives full text, then the native parser reopens independent bytes", async () => {
  let opens = 0;
  const contents = [];
  const registry = new OWLParserRegistry([
    functionalSyntaxParserDescriptor,
    {
      id: "first",
      format: new OWLDocumentFormat({ key: "first" }),
      priority: -1,
      detect: () => ({
        result: "MATCH",
        reasonCode: "TEST",
        reason: "Try the foreign parser first",
      }),
      createParser: () => ({
        parse(source) {
          contents.push(source.getText());
          throw new ParserMismatchError();
        },
      }),
    },
  ]);
  const source = new StreamDocumentSource(() => {
    opens++;
    return new Blob([input]).stream();
  });
  const ontology = await OWLManager.createOWLOntologyManager({
    registry,
  }).loadOntologyFromOntologyDocument(source);
  expect(contents).toEqual([input]);
  expect(opens).toBe(3);
  expect(ontology.getOntologyID().ontologyIRI.value).toBe("urn:streams");
});

test.each([1, 7, 31])(
  "OWL/XML preserves namespaces, XML base, entities, prefixes and annotations at %i-byte boundaries",
  async (size) => {
    const text = `<?xml version="1.0"?>
<!DOCTYPE o:Ontology [<!ENTITY space " "> <!ENTITY name "café 🐈">]>
<o:Ontology xmlns:o="http://www.w3.org/2002/07/owl#" xml:base="https://example.test/" ontologyIRI="base" versionIRI="v1">
  <o:Prefix name="p" IRI="urn:ex:"/>&space;&#32;
  <o:Annotation><o:AnnotationProperty abbreviatedIRI="p:label"/><o:Literal xml:lang="fr">&name;</o:Literal></o:Annotation>
  <o:Declaration xml:base="sub/"><o:Class IRI="C"/></o:Declaration>
</o:Ontology>`;
    const original = new StringDocumentSource(text, {
      documentIRI: "https://example.test/document",
      format: "owlxml",
    });
    const expected =
      await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        original,
      );
    const actual =
      await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        byteSource(text, "owlxml", size),
      );
    expect(actual.getOntologyID()).toEqual(expected.getOntologyID());
    expect(actual.getAnnotations()).toEqual(expected.getAnnotations());
    expect(actual.getAxioms()).toEqual(expected.getAxioms());
  },
);

test.each([
  [
    "functional",
    "# long lead\r\nPrefix(:=<urn:test:>) Ontology(<urn:test>\r\n Declaration(Class(:A))\r\n Wrong(:B))",
  ],
  [
    "owlxml",
    '<Ontology xmlns="http://www.w3.org/2002/07/owl#">\r\n<Declaration><Class IRI="urn:A"/></Declaration>\r\n  <Bogus/></Ontology>',
  ],
])(
  "%s diagnostics retain document line and column across fragments",
  async (format, text) => {
    const failure = async (source) => {
      try {
        await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          source,
        );
      } catch (error) {
        return {
          code: error.code,
          line: error.line,
          column: error.column,
          offset: error.offset,
        };
      }
      throw new Error("Invalid input was accepted");
    };
    const expected = await failure(new StringDocumentSource(text, { format }));
    expect(await failure(byteSource(text, format, 1))).toEqual(expected);
  },
);

test.each([
  [
    "FUNCTIONAL",
    "Prefix(:=<urn:test:>) Ontology(<urn:stream> Declaration(Class(:A)) ",
  ],
  [
    "OWL_XML",
    '<Ontology xmlns="http://www.w3.org/2002/07/owl#" ontologyIRI="urn:stream"><Declaration><Class IRI="urn:test:A"/></Declaration>',
  ],
])(
  "%s enforces the transaction's axiom limit before requesting the rest of the stream",
  async (key, first) => {
    const source = new StreamDocumentSource(
      function* () {
        yield new TextEncoder().encode(first);
        throw new Error("read past a rejected axiom");
      },
      { format: OWLDocumentFormats[key] },
    );
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
        { maxAxioms: 0 },
      ),
    ).rejects.toMatchObject({ resource: "maxAxioms" });
  },
);

test("stream factories share string source metadata validation and expose no target writers", () => {
  const metadata = {
    contentType: "text/plain",
    documentIRI: "urn:stream",
    fileName: "stream.ofn",
    format: OWLDocumentFormats.FUNCTIONAL,
  };
  const expected = new StringDocumentSource("", metadata);
  const stream = new StreamDocumentSource(() => [], metadata);
  for (const getter of [
    "getDocumentIRI",
    "getContentType",
    "getFileName",
    "getFormat",
  ])
    expect(stream[getter]()).toEqual(expected[getter]());
  expect(Object.isFrozen(stream)).toBe(true);
  expect(Object.isFrozen(new StreamDocumentTarget(() => {}))).toBe(true);
  expect(Reflect.ownKeys(StreamDocumentTarget.prototype)).toEqual([
    "constructor",
  ]);
  expect(() => new StreamDocumentTarget({})).toThrow(TypeError);
  expect(() => new StreamDocumentSource([])).toThrow(TypeError);
  for (const metadata of [
    { contentType: 0 },
    { fileName: false },
    { format: {} },
    { documentIRI: {} },
  ])
    expect(() => new StreamDocumentSource(() => [], metadata)).toThrow(
      TypeError,
    );
});

test.each(["RDF_XML", "TURTLE", "OWL_XML", "FUNCTIONAL"])(
  "%s stores UTF-8 bytes identical to a string target and detects a replayed byte source",
  async (key) => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(input);
    const expected = new StringDocumentTarget();
    const format = OWLDocumentFormats[key];
    await manager.saveOntology(ontology, format, expected);
    const chunks = [];
    await manager.saveOntology(
      ontology,
      format,
      new StreamDocumentTarget(async (bytes) => {
        for await (const chunk of bytes) {
          expect(chunk).toBeInstanceOf(Uint8Array);
          expect(chunk.byteLength).toBeLessThanOrEqual(65_536);
          chunks.push(chunk);
        }
      }),
    );
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(expected.toString()));
    let opens = 0;
    let closes = 0;
    const source = new StreamDocumentSource(function* () {
      opens++;
      try {
        for (const chunk of chunks)
          for (const byte of chunk) yield Uint8Array.of(byte);
      } finally {
        closes++;
      }
    });
    const reloaded =
      await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
      );
    expect(reloaded.getOntologyID()).toEqual(ontology.getOntologyID());
    for (const axiom of ontology.getAxioms())
      expect(reloaded.containsAxiom(axiom)).toBe(true);
    expect(opens).toBeGreaterThan(1);
    expect(closes).toBe(opens);
  },
);

test.each(["RDF_XML", "TURTLE", "OWL_XML", "FUNCTIONAL", "JSON_LD"])(
  "%s rejects over-limit invalid bytes before decoding and returns the iterator",
  async (key) => {
    let closed = false;
    const source = new StreamDocumentSource(
      function* () {
        try {
          yield Uint8Array.of(255, 255);
          throw new Error("read beyond the limit");
        } finally {
          closed = true;
        }
      },
      { format: OWLDocumentFormats[key] },
    );
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
        { maxInputBytes: 1 },
      ),
    ).rejects.toMatchObject({
      resource: "maxInputBytes",
      limit: 1,
      observed: 2,
    });
    expect(closed).toBe(true);
  },
);

test("a sink must consume the document once and a rejected sink retains its cause", async () => {
  const manager = OWLManager.createOWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(input);
  const failed = new Error("sink stopped");
  const partial = new StreamDocumentTarget((chunks) => {
    chunks[Symbol.iterator]().next();
  });
  await expect(
    manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, partial),
  ).rejects.toMatchObject({
    code: "ONTOLOGY_STORAGE_FAILED",
    cause: { message: "The sink must consume the complete ontology document" },
  });
  const rejected = new StreamDocumentTarget(() => {
    throw failed;
  });
  await expect(
    manager.saveOntology(ontology, OWLDocumentFormats.OWL_XML, rejected),
  ).rejects.toMatchObject({ code: "ONTOLOGY_STORAGE_FAILED", cause: failed });
});

test.each(["FUNCTIONAL", "OWL_XML", "TURTLE", "RDF_XML", "JSON_LD"])(
  "%s cancels a stalled source and releases its Web Stream lock on a deadline",
  async (key) => {
    let cancelled = false;
    const input = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const source = new StreamDocumentSource(() => input, {
      format: OWLDocumentFormats[key],
    });
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        source,
        { timeoutMs: 70 },
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "timeoutMs",
    });
    await Promise.resolve();
    expect(cancelled).toBe(true);
    expect(input.locked).toBe(false);
  },
);
