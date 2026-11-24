import { expect, test } from "@jest/globals";
import {
  OWLDocumentFormats,
  OWLManager,
  StringDocumentSource,
  StringDocumentTarget,
  StreamDocumentTarget,
} from "../../index.js";

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
