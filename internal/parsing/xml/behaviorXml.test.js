import { OWLManager } from "../../../apibinding/index.js";
import { OWLDocumentFormats } from "../../../formats/index.js";
import { StringDocumentSource } from "../../../io/index.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/index.js";

test("XML policy retains the selected identity when a configuration overrides its public getter", async () => {
  class MisreportedConfiguration extends OWLOntologyLoaderConfiguration {
    getBehaviorProfileId() {
      return "java-owlapi-5.5.1";
    }
  }
  const manager = OWLManager.createOWLOntologyManager();
  await expect(
    manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        '<!DOCTYPE Ontology [<!ENTITY a SYSTEM "file:///never-read">]><Ontology xmlns="http://www.w3.org/2002/07/owl#"/>',
        { format: OWLDocumentFormats.OWL_XML },
      ),
      new MisreportedConfiguration(),
    ),
  ).rejects.toThrow(/External XML/);
});

const load = (
  subset,
  content,
  expansionLimit = "100000000",
  behaviorProfileId = "java-owlapi-5.5.1",
  literalAttributes = "",
) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const configuration = manager
    .getOntologyLoaderConfiguration()
    .setEntityExpansionLimit(expansionLimit);
  return manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(
      `<!DOCTYPE Ontology [${subset}]><Ontology xmlns="http://www.w3.org/2002/07/owl#"><Annotation><AnnotationProperty IRI="urn:xml:p"/><Literal ${literalAttributes}>${content}</Literal></Annotation></Ontology>`,
      { format: OWLDocumentFormats.OWL_XML },
    ),
    configuration,
  );
};

test.each([
  ["0", true],
  ["1", false],
  ["2", true],
  ["-1", true],
  ["bad", false],
])(
  "Java entity expansion limit %s is applied at the XML consumer",
  async (limit, succeeds) => {
    const result = load("<!ENTITY a 'x'>", "&a;&a;", limit);
    if (succeeds)
      expect([...(await result).getAnnotations()][0].value.lexicalForm).toBe(
        "xx",
      );
    else await expect(result).rejects.toThrow();
  },
);

test("Java ignores external declarations and does not retrieve referenced external entities", async () => {
  expect(
    [
      ...(
        await load("<!ENTITY a SYSTEM 'file:///never-read'>", "x")
      ).getAnnotations(),
    ][0].value.lexicalForm,
  ).toBe("x");
  expect(
    [
      ...(
        await load("<!ENTITY a SYSTEM 'http://127.0.0.1:9/never-read'>", "&a;")
      ).getAnnotations(),
    ][0].value.lexicalForm,
  ).toBe("");
  await expect(
    load(
      "<!ENTITY a SYSTEM 'file:///never-read'>",
      "x",
      "100000000",
      "normative-v1",
    ),
  ).rejects.toThrow(/External XML/);
});

test("Java resolves cycles only when referenced, and counts nested expansions", async () => {
  await expect(load("<!ENTITY a '&a;'>", "x")).resolves.toBeDefined();
  await expect(load("<!ENTITY a '&a;'>", "&a;")).rejects.toThrow();
  await expect(
    load("<!ENTITY a 'x'><!ENTITY b '&a;&a;'>", "&b;", "2"),
  ).rejects.toThrow();
  expect(
    [
      ...(
        await load("<!ENTITY a 'x'><!ENTITY b '&a;&a;'>", "&b;", "3")
      ).getAnnotations(),
    ][0].value.lexicalForm,
  ).toBe("xx");
});

test("Java provider general and total entity size limits use UTF-16 code units", async () => {
  await expect(
    load(`<!ENTITY a '${"x".repeat(100000)}'>`, "x", "0"),
  ).resolves.toBeDefined();
  await expect(
    load(`<!ENTITY a '${"x".repeat(100001)}'>`, "x", "0"),
  ).rejects.toThrow();
  await expect(
    load(
      `<!ENTITY a '${"x".repeat(60000)}'><!ENTITY b '${"x".repeat(60000)}'>`,
      "x",
      "0",
    ),
  ).rejects.toThrow();
  await expect(
    load(`<!ENTITY a '${"x".repeat(60000)}'>`, "&a;", "0"),
  ).resolves.toBeDefined();
  await expect(
    load(`<!ENTITY a '${"x".repeat(60000)}'>`, "&a;&a;", "0"),
  ).rejects.toThrow();
});

test("Java keeps the first entity declaration and expands internal parameter declarations", async () => {
  expect(
    [
      ...(
        await load("<!ENTITY a 'first'><!ENTITY a 'second'>", "&a;")
      ).getAnnotations(),
    ][0].value.lexicalForm,
  ).toBe("first");
  expect(
    [
      ...(
        await load(
          `<!ENTITY % definitions "<!ENTITY a 'value'>">%definitions;`,
          "&a;",
        )
      ).getAnnotations(),
    ][0].value.lexicalForm,
  ).toBe("value");
  await expect(
    load(`<!ENTITY % a '${"x".repeat(15000)}'>`, "x", "0"),
  ).resolves.toBeDefined();
  await expect(
    load(`<!ENTITY % a '${"x".repeat(15001)}'>`, "x", "0"),
  ).rejects.toThrow();
});

test.each([199, 200, 201])(
  "Java XML provider applies its %i-attribute boundary",
  async (count) => {
    const attributes = Array.from(
      { length: count },
      (_, index) => `a${index}="v"`,
    ).join(" ");
    const result = load("", "y", "0", "java-owlapi-5.5.1", attributes);
    if (count <= 200) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow();
  },
);

test.each([1000, 1001])(
  "Java XML provider applies its %i-code-unit name boundary",
  async (count) => {
    const result = load(
      "",
      "y",
      "0",
      "java-owlapi-5.5.1",
      `${"a".repeat(count)}="v"`,
    );
    if (count <= 1000) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toThrow();
  },
);

test("Java admits nonvalidating element declarations", async () => {
  await expect(load("<!ELEMENT Ontology ANY>", "x")).resolves.toBeDefined();
});

// Expected outcomes are independently captured by ObserveXmlContracts.java on
// the released provider. Nonvalidating parsing still checks declaration syntax.
test.each([
  ["notation-system", "<!NOTATION image SYSTEM 'urn:image'>", "x", true],
  ["notation-public", "<!NOTATION image PUBLIC 'Image Format'>", "x", true],
  ["notation-invalid", "<!NOTATION image bogus>", "x", false],
  [
    "unparsed-unused",
    "<!NOTATION image SYSTEM 'urn:image'><!ENTITY a SYSTEM 'file:///never-read' NDATA image>",
    "x",
    true,
  ],
  [
    "unparsed-used",
    "<!NOTATION image SYSTEM 'urn:image'><!ENTITY a SYSTEM 'file:///never-read' NDATA image>",
    "&a;",
    false,
  ],
  [
    "element-sequence",
    "<!ELEMENT Ontology ((Annotation|Class)+,Import?)>",
    "x",
    true,
  ],
  ["element-pcdata", "<!ELEMENT Ontology (#PCDATA)>", "x", true],
  ["element-mixed", "<!ELEMENT Ontology (#PCDATA|Annotation)*>", "x", true],
  ["element-empty-choice", "<!ELEMENT Ontology ()>", "x", false],
  ["element-trailing-choice", "<!ELEMENT Ontology (Annotation|)>", "x", false],
  [
    "element-mixed-separators",
    "<!ELEMENT Ontology (Annotation,Class|Import)>",
    "x",
    false,
  ],
  [
    "element-missing-star",
    "<!ELEMENT Ontology (#PCDATA|Annotation)>",
    "x",
    false,
  ],
  ["dtd-bad-comment", "<!-- bad -- comment -->", "x", false],
  [
    "dtd-notation-attribute",
    "<!ATTLIST Literal marker NOTATION (image|text) #IMPLIED>",
    "x",
    true,
  ],
  [
    "unparsed-without-notation",
    "<!ENTITY a SYSTEM 'file:///never-read' NDATA image>",
    "&a;",
    false,
  ],
])("Java DTD syntax: %s", async (_id, declaration, content, succeeds) => {
  const result = load(declaration, content);
  if (succeeds)
    expect([...(await result).getAnnotations()][0].value.lexicalForm).toBe("x");
  else await expect(result).rejects.toThrow();
});

test("Java applies DTD attribute defaults and token normalization without validating fixed values", async () => {
  for (const [declaration, attributes, language] of [
    ["xml:lang CDATA 'en'", "", "en"],
    ["xml:lang CDATA 'en'", "xml:lang='de'", "de"],
    ["xml:lang NMTOKENS '  en  '", "", "en"],
    ["xml:lang CDATA #FIXED 'en'", "xml:lang='de'", "de"],
  ]) {
    const ontology = await load(
      `<!ATTLIST Literal ${declaration}>`,
      "x",
      "0",
      "java-owlapi-5.5.1",
      attributes,
    );
    expect([...ontology.getAnnotations()][0].value.language).toBe(language);
  }
});

test("Java validates external declaration syntax and forbids external entities in attributes", async () => {
  await expect(load("<!ENTITY a SYSTEM bogus>", "x", "0")).rejects.toThrow();
  await expect(
    load(
      "<!ENTITY a SYSTEM 'file:///never-read'>",
      "x",
      "0",
      "java-owlapi-5.5.1",
      "xml:lang='&a;'",
    ),
  ).rejects.toThrow();
});

test("Java expands parameter character references and measures XML name parts separately", async () => {
  const ontology = await load(
    `<!ENTITY % definitions "&#60;!ENTITY a 'value'>">%definitions;`,
    "&a;",
    "0",
  );
  expect([...ontology.getAnnotations()][0].value.lexicalForm).toBe("value");
  await expect(
    load(
      "",
      "x",
      "0",
      "java-owlapi-5.5.1",
      `xmlns:p='urn:xml:p' p:${"a".repeat(1000)}='v'`,
    ),
  ).resolves.toBeDefined();
});
