import { expect, jest, test } from "@jest/globals";
import { Writer } from "n3";
import { resolveOntologyBehaviorDefinition } from "../behavior/ontologyBehaviorContext.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import { readOntologyWriterConfiguration } from "../../model/owlOntologyWriterConfiguration.js";
import { turtleStorer } from "./turtle/turtleStorer.js";
import {
  AddOntologyAnnotation,
  IRI,
  OWLDocumentFormats,
  OWLManager,
  StringDocumentSource,
  StringDocumentTarget,
  StreamDocumentTarget,
} from "../../index.js";

test("a rejected large Turtle quad retains the previous chunk boundary", async () => {
  const behavior = resolveOntologyBehaviorDefinition("java-owlapi-5.5.1");
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: behavior.behaviorProfileId,
  });
  const f = manager.getOWLDataFactory();
  const ontology = manager.createOntology(
    f.getOWLOntologyID(IRI.create("urn:limited")),
  );
  manager.applyChange(
    new AddOntologyAnnotation(
      ontology,
      f.getOWLAnnotation(
        f.getRDFSLabel(),
        f.getOWLLiteral("x".repeat(100_000)),
      ),
    ),
  );
  const sequence = await turtleStorer.renderBytes(
    readOntologySnapshot(ontology),
    OWLDocumentFormats.TURTLE,
    readOntologyWriterConfiguration(manager.getOntologyWriterConfiguration()),
    { ...behavior.documentStoragePolicy, maxOutputBytes: 80_000 },
    behavior,
  );
  const iterator = sequence[Symbol.iterator]();
  expect(() => iterator.next()).toThrow(
    expect.objectContaining({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "outputBytes",
    }),
  );
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s sends only bounded quoted literal fragments to N3 across grouping boundaries",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const f = manager.getOWLDataFactory();
    const ontology = manager.createOntology(
      f.getOWLOntologyID(IRI.create("urn:large:owner")),
    );
    const lexical = 'q"\\\n\t🦉'.repeat(18_000);
    const a = f.getOWLAnnotation(
      f.getRDFSLabel(),
      f.getOWLLiteral(lexical, "en"),
    );
    manager.applyChange(new AddOntologyAnnotation(ontology, a));
    const sizes = [];
    const nativeLine = Writer.prototype.quadToString,
      nativeAdd = Writer.prototype.addQuad;
    const line = jest
      .spyOn(Writer.prototype, "quadToString")
      .mockImplementation(function (...args) {
        if (args[2].termType === "Literal") sizes.push(args[2].value.length);
        return nativeLine.apply(this, args);
      });
    const add = jest
      .spyOn(Writer.prototype, "addQuad")
      .mockImplementation(function (...args) {
        const object = args[2] ?? args[0].object;
        if (object.termType === "Literal") sizes.push(object.value.length);
        return nativeAdd.apply(this, args);
      });
    try {
      const chunks = [];
      await manager.saveOntology(
        ontology,
        OWLDocumentFormats.TURTLE,
        new StreamDocumentTarget(async (parts) => {
          for await (const part of parts) chunks.push(part);
        }),
      );
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(8192);
      const reload = OWLManager.createOWLOntologyManager({ behaviorProfileId });
      const copied = await reload.loadOntologyFromOntologyDocument(
        new StringDocumentSource(Buffer.concat(chunks).toString("utf8"), {
          format: OWLDocumentFormats.TURTLE,
        }),
      );
      expect([...copied.getAnnotations()][0].value.lexicalForm).toBe(lexical);
    } finally {
      add.mockRestore();
      line.mockRestore();
    }
  },
);

test.each(["RDF_XML", "OWL_XML", "TURTLE", "FUNCTIONAL"])(
  "%s writes chunk boundaries inside a Unicode literal and reloads its exact value",
  async (formatKey) => {
    const manager = OWLManager.createOWLOntologyManager();
    const lexical = "a<&🦉".repeat(18_000);
    const source = new StringDocumentSource(
      'Ontology(<urn:writer:chunks> Annotation(rdfs:label "' +
        lexical +
        '"@en))',
      { format: OWLDocumentFormats.FUNCTIONAL },
    );
    const ontology = await manager.loadOntologyFromOntologyDocument(source);
    const format = OWLDocumentFormats[formatKey];
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, format, target);
    const chunks = [];
    await manager.saveOntology(
      ontology,
      format,
      new StreamDocumentTarget(async (parts) => {
        for await (const part of parts) chunks.push(part);
      }),
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const part of chunks)
      expect(part.byteLength).toBeLessThanOrEqual(65_536);
    const text = Buffer.concat(chunks).toString("utf8");
    expect(text).toBe(target.toString());
    const reloaded =
      await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource(text, { format }),
      );
    expect([...reloaded.getAnnotations()][0].value.lexicalForm).toBe(lexical);
  },
);

test("Java string targets retain the exact XML failure prefix", async () => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  for (const [syntax, source, expectedEnd] of [
    [
      OWLDocumentFormats.RDF_XML,
      'Ontology(<urn:prefix:o> Annotation(rdfs:comment "<invalid>"^^rdf:XMLLiteral) Declaration(Class(<urn:prefix:C>)))',
      '    <owl:Ontology rdf:about="urn:prefix:o">\n        <rdfs:comment rdf:parseType="Literal">',
    ],
    [
      OWLDocumentFormats.OWL_XML.withParameter(
        "force xsd:string on literals",
        "invalid",
      ),
      'Ontology(<urn:prefix:other> Annotation(rdfs:comment "left\rright") Declaration(Class(<urn:prefix:C>)) SubClassOf(<urn:prefix:C> <urn:prefix:D>))',
      '    <Declaration>\n        <Class IRI="urn:prefix:C"/>\n    </Declaration>\n',
    ],
  ]) {
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(source, {
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    );
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, target);
    const prefix = target.toString();
    await expect(
      manager.saveOntology(ontology, syntax, target),
    ).rejects.toMatchObject({ code: "ONTOLOGY_STORAGE_FAILED" });
    expect(target.toString().startsWith(prefix)).toBe(true);
    expect(target.toString().endsWith(expectedEnd)).toBe(true);
    if (syntax.key === OWLDocumentFormats.OWL_XML.key)
      expect(target.toString().slice(prefix.length)).toContain(
        ">left\rright</Literal>",
      );
  }
});
