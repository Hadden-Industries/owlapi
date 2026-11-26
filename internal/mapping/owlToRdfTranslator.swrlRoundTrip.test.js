import {
  IRI,
  OWLDocumentFormats,
  OWLManager,
  OWLOntology,
  StreamDocumentSource,
  StreamDocumentTarget,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../index.js";
import { RDF_VOCABULARY, SWRL_VOCABULARY } from "../rdfjs/vocabulary.js";

const createManager = (options = {}) =>
  OWLManager.createOWLOntologyManager({
    ...options,
    behaviorProfileId: "java-owlapi-5.5.1",
  });

const load = (manager, text, format = OWLDocumentFormats.FUNCTIONAL) =>
  manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, { format }),
    manager.getOntologyLoaderConfiguration().setStrict(false),
  );

const formats = [OWLDocumentFormats.RDF_XML, OWLDocumentFormats.TURTLE];
const libraryIri = "urn:example:library";
const libraryDocumentIri = "urn:example:mapped-library";
const tagIri = "urn:example:tag";
const parentIri = "urn:example:parent";

const createLibraryManager = (declaration, activity) =>
  createManager({
    iriMappers: [
      {
        getDocumentIRI(iri) {
          activity.push(["map", iri.value]);
          return iri.value === libraryIri
            ? IRI.create(libraryDocumentIri)
            : undefined;
        },
      },
    ],
    documentLoader: {
      authorize(iri) {
        activity.push(["authorize", iri.value]);
        return iri.value === libraryDocumentIri;
      },
      load(iri) {
        activity.push(["load", iri.value]);
        return new StringDocumentSource(
          `Ontology(<${libraryIri}> Declaration(${declaration}))`,
          { documentIRI: iri, format: OWLDocumentFormats.FUNCTIONAL },
        );
      },
    },
  });

const ruleWithLibrary = (localAxiom = "") =>
  `Ontology(<urn:example:root> Import(<${libraryIri}>) ${localAxiom}
    DLSafeRule(Annotation(<${tagIri}> "value") Body() Head()))`;

const xmlRule = (xml) => `Ontology(<urn:example:lexical>
  Declaration(AnnotationProperty(<urn:example:markup>))
  Declaration(AnnotationProperty(<urn:example:note>))
  DLSafeRule(
    Annotation(<urn:example:markup> ${JSON.stringify(xml)}^^<${RDF_VOCABULARY.xmlLiteral}>)
    Annotation(<urn:example:note> "A & B < C"@en)
    Body() Head()))`;

test.each(formats)(
  "preserves the lexical forms and datatypes of literal rule annotations in $key",
  async (format) => {
    const manager = createManager();
    const xml = '<p:em xmlns:p="urn:example:xml">note</p:em>';
    const source = await load(manager, xmlRule(xml));
    const [rule] = source.getAxiomsByType("SWRLRule");
    const target = new StringDocumentTarget();
    await manager.saveOntology(source, format, target);
    if (format === OWLDocumentFormats.RDF_XML)
      expect(target.toString()).toContain(`rdf:parseType="Literal">${xml}`);
    const loaded = await load(createManager(), target.toString(), format);
    expect(loaded.containsAxiom(rule)).toBe(true);
  },
);

test("keeps RDF/XML validation for malformed rule XML annotations", async () => {
  const manager = createManager();
  const source = await load(
    manager,
    `Ontology(DLSafeRule(Annotation(<urn:example:markup>
      "<em>"^^<${RDF_VOCABULARY.xmlLiteral}>) Body() Head()))`,
  );
  const target = new StringDocumentTarget();
  await expect(
    manager.saveOntology(source, OWLDocumentFormats.RDF_XML, target),
  ).rejects.toThrow("XML literal is not self contained");
});

test("keeps the RDF/XML reader's lexical identity for a Unicode XML namespace", async () => {
  const manager = createManager();
  const lexical = '<p:em xmlns:p="urn:example:é">note</p:em>';
  const source = await load(manager, xmlRule(lexical));
  const [rule] = source.getAxiomsByType("SWRLRule");
  const chunks = [];
  const target = new StreamDocumentTarget(async (stream) => {
    for await (const chunk of stream) chunks.push(chunk);
  });
  const format = OWLDocumentFormats.RDF_XML;
  await manager.saveOntology(source, format, target);
  const decoder = new TextDecoder();
  let text = "";
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();
  expect(text).toContain(`rdf:parseType="Literal">${lexical}`);
  const receiver = createManager();
  const loaded = await receiver.loadOntologyFromOntologyDocument(
    new StreamDocumentSource(() => chunks, { format }),
    receiver.getOntologyLoaderConfiguration().setStrict(false),
  );
  expect(loaded.containsAxiom(rule)).toBe(true);
});

test("refuses non-preservable SWRL XML for RDF/XML before publication and keeps its Turtle identity", async () => {
  const manager = createManager();
  const string = new StringDocumentTarget();
  const prior = await load(manager, "Ontology(<urn:example:prior>)");
  await manager.saveOntology(prior, OWLDocumentFormats.RDF_XML, string);
  const previous = string.toString();
  for (const lexical of [
    "<p:em xmlns:p='urn:example:xml'>note</p:em>",
    '<em xmlns="urn:example:xml">note</em>',
    "<em>note</em>",
  ]) {
    const owner = createManager();
    const source = await load(owner, xmlRule(lexical));
    let opened = false;
    const stream = new StreamDocumentTarget((chunks) => {
      opened = true;
      for (const chunk of chunks) void chunk;
    });
    for (const target of [string, stream])
      await expect(
        owner.saveOntology(source, OWLDocumentFormats.RDF_XML, target),
      ).rejects.toMatchObject({
        reason: "ONTOLOGY_NOT_REPRESENTABLE",
        message: expect.stringContaining("lexical form"),
      });
    expect(opened).toBe(false);
    expect(string.toString()).toBe(previous);

    const target = new StringDocumentTarget();
    await owner.saveOntology(source, OWLDocumentFormats.TURTLE, target);
    const loaded = await load(
      createManager(),
      target.toString(),
      OWLDocumentFormats.TURTLE,
    );
    expect(
      loaded.containsAxiom([...source.getAxiomsByType("SWRLRule")][0]),
    ).toBe(true);
  }
});

test.each(formats)(
  "ordinary RDF type annotations cannot introduce SWRL structure in $key",
  async (format) => {
    const manager = createManager();
    const target = new StringDocumentTarget();
    const ordinary = await load(manager, "Ontology(<urn:example:ordinary>)");
    await manager.saveOntology(ordinary, format, target);
    const before = target.toString();

    for (const [type, rule] of [
      [SWRL_VOCABULARY.Imp, ""],
      [SWRL_VOCABULARY.Variable, "DLSafeRule(Body() Head())"],
    ]) {
      const ontology = await load(
        manager,
        `Ontology(AnnotationAssertion(<${RDF_VOCABULARY.type}> <urn:example:subject> <${type}>) ${rule})`,
      );
      await expect(
        manager.saveOntology(ontology, format, target),
      ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
      expect(target.toString()).toBe(before);

      let opened = false;
      const stream = new StreamDocumentTarget((chunks) => {
        opened = true;
        for (const chunk of chunks) void chunk;
      });
      await expect(
        manager.saveOntology(ontology, format, stream),
      ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
      expect(opened).toBe(false);
    }
  },
);

test.each(formats)(
  "literal rule annotations cannot be published with conflicting RDF roles in $key",
  async (format) => {
    for (const definition of [
      "Declaration(DataProperty(<urn:example:tag>))",
      "Declaration(ObjectProperty(<urn:example:tag>))",
      "Declaration(DataProperty(<urn:example:super>)) SubDataPropertyOf(<urn:example:tag> <urn:example:super>)",
      "Declaration(DataProperty(<urn:example:sub>)) SubDataPropertyOf(<urn:example:sub> <urn:example:tag>)",
    ]) {
      const manager = createManager();
      const ontology = await load(
        manager,
        `Ontology(${definition} DLSafeRule(Annotation(<urn:example:tag> "value") Body() Head()))`,
      );
      const target = new StringDocumentTarget();
      await expect(
        manager.saveOntology(ontology, format, target),
      ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
      expect(target.toString()).toBe("");
    }
  },
);

test.each(formats)(
  "an ambiguous predicate retains a rule annotation when the RDF reader resolves it as annotation in $key",
  async (format) => {
    const manager = createManager();
    const source = await load(
      manager,
      `Ontology(
        Declaration(DataProperty(<urn:example:tag>))
        Declaration(AnnotationProperty(<urn:example:tag>))
        DLSafeRule(Annotation(<urn:example:tag> "value") Body() Head())
      )`,
    );
    const target = new StringDocumentTarget();
    await manager.saveOntology(source, format, target);
    const loaded = await load(createManager(), target.toString(), format);
    expect(loaded.getAxiomCount()).toBe(source.getAxiomCount());
    for (const axiom of source.getAxioms()) {
      expect(loaded.containsAxiom(axiom)).toBe(true);
    }
  },
);

test.each(formats)(
  "shared variable IRIs and distinct rule annotations preserve both rules in $key",
  async (format) => {
    const manager = createManager();
    const source = await load(
      manager,
      `Ontology(
        Declaration(Class(<urn:example:Class>))
        Declaration(Class(<${SWRL_VOCABULARY.Variable}>))
        Declaration(Class(<${SWRL_VOCABULARY.Imp}>))
        Declaration(ObjectProperty(<urn:example:property>))
        Declaration(NamedIndividual(<urn:variable:item>))
        AnnotationAssertion(<http://www.w3.org/2000/01/rdf-schema#label> <urn:variable:item> "individual")
        DLSafeRule(Annotation(<urn:example:tag> "first")
          Body(ClassAtom(<urn:example:Class> Variable(<urn:variable:item>)))
          Head(ObjectPropertyAtom(<urn:example:property> Variable(<urn:variable:item>) Variable(<urn:other:item>))))
        DLSafeRule(Annotation(<urn:example:tag> "second")
          Body(ClassAtom(<urn:example:Class> Variable(<urn:variable:item>)))
          Head(ObjectPropertyAtom(<urn:example:property> Variable(<urn:variable:item>) Variable(<urn:other:item>))))
      )`,
    );
    const target = new StringDocumentTarget();
    await manager.saveOntology(source, format, target);
    const loaded = await load(createManager(), target.toString(), format);

    expect(loaded.getAxiomCount()).toBe(source.getAxiomCount());
    expect(loaded.getAxiomsByType("SWRLRule").size).toBe(2);
    for (const axiom of source.getAxioms()) {
      expect(loaded.containsAxiom(axiom)).toBe(true);
    }
  },
);

test.each(formats)(
  "imported property roles cannot silently change rule annotations in $key",
  async (format) => {
    for (const [declaration, localAxiom] of [
      [`DataProperty(<${tagIri}>)`],
      [`ObjectProperty(<${tagIri}>)`],
      [
        `DataProperty(<${parentIri}>)`,
        `SubDataPropertyOf(<${tagIri}> <${parentIri}>)`,
      ],
    ]) {
      const activity = [];
      const manager = createLibraryManager(declaration, activity);
      const ontology = await load(manager, ruleWithLibrary(localAxiom));
      expect(activity).toContainEqual(["load", libraryDocumentIri]);
      expect(manager.importsClosure(ontology)).toHaveLength(2);
      const beforeSave = [...activity];
      const target = new StringDocumentTarget();
      await expect(
        manager.saveOntology(ontology, format, target),
      ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
      expect(target.toString()).toBe("");
      let opened = false;
      const stream = new StreamDocumentTarget((chunks) => {
        opened = true;
        for (const chunk of chunks) void chunk;
      });
      // A same-profile foreign manager still saves using the owner's closure.
      await expect(
        createManager().saveOntology(ontology, format, stream),
      ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
      expect(opened).toBe(false);
      expect(activity).toEqual(beforeSave);
    }
  },
);

test.each(formats)(
  "the local annotation role can disambiguate an imported data property in $key",
  async (format) => {
    const activity = [];
    const declaration = `DataProperty(<${tagIri}>)`;
    const manager = createLibraryManager(declaration, activity);
    const source = await load(
      manager,
      ruleWithLibrary(`Declaration(AnnotationProperty(<${tagIri}>))`),
    );
    expect(activity).toContainEqual(["load", libraryDocumentIri]);
    const beforeSave = [...activity];
    const target = new StringDocumentTarget();
    await manager.saveOntology(source, format, target);
    expect(activity).toEqual(beforeSave);

    const fresh = createLibraryManager(declaration, []);
    const loaded = await load(fresh, target.toString(), format);
    expect(fresh.importsClosure(loaded)).toHaveLength(2);
    expect(loaded.getAxiomCount()).toBe(source.getAxiomCount());
    for (const axiom of source.getAxioms())
      expect(loaded.containsAxiom(axiom)).toBe(true);
  },
);

test("SWRL storage reads the imported revision without the public declaration getter", async () => {
  const manager = createLibraryManager(`DataProperty(<${tagIri}>)`, []);
  const ontology = await load(manager, ruleWithLibrary());
  const [, library] = manager.importsClosure(ontology);
  const original = OWLOntology.prototype.getAxiomsByType;
  let publicReads = 0;
  OWLOntology.prototype.getAxiomsByType = function (...args) {
    if (this === library) publicReads++;
    return original.apply(this, args);
  };
  try {
    await expect(
      manager.saveOntology(
        ontology,
        OWLDocumentFormats.TURTLE,
        new StringDocumentTarget(),
      ),
    ).rejects.toMatchObject({ reason: "ONTOLOGY_NOT_REPRESENTABLE" });
    expect(publicReads).toBe(0);
  } finally {
    OWLOntology.prototype.getAxiomsByType = original;
  }
});
