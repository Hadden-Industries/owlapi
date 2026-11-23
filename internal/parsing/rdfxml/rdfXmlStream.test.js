import { test, expect } from "@jest/globals";
import { runInNewContext } from "node:vm";
import { IRI, OWLDocumentFormats, OWLManager } from "../../../index.js";
import {
  FunctionalSyntaxStreamDocumentTarget,
  RDFXMLStreamDocumentSource,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../../io/index.js";

const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const owl = "http://www.w3.org/2002/07/owl#";
const documentIRI = "https://retrieval.example.org/pinned.owl";

function streamSource(text, chunkBytes = 1) {
  const bytes = new TextEncoder().encode(text);
  return new RDFXMLStreamDocumentSource(
    async function* () {
      for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
        yield bytes.subarray(offset, offset + chunkBytes);
      }
    },
    { documentIRI },
  );
}

test("streams RDF/XML across UTF-8 and markup boundaries with the authored base and XML literal", async () => {
  const text = `<?xml version="1.0"?>
<!DOCTYPE rdf:RDF [<!ENTITY title "café 🐈">]>
<rdf:RDF xmlns:rdf="${rdf}" xmlns:owl="${owl}" xmlns:ex="urn:example:" xml:base="https://example.org/base/">
  <owl:Ontology rdf:about=""/>
  <owl:AnnotationProperty rdf:about="urn:example:display"/>
  <owl:Class rdf:about="Place">
    <ex:display rdf:parseType="other"><ex:label>&title;</ex:label></ex:display>
  </owl:Class>
</rdf:RDF>`;
  const expected =
    await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, {
        documentIRI,
        format: "rdfxml",
      }),
    );
  const source = streamSource(text);
  const result =
    await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
    );
  expect(result.getOntologyID().ontologyIRI.value).toBe(
    "https://example.org/base/",
  );
  expect([...result.getAxioms()]).toEqual([...expected.getAxioms()]);
});

test("refuses a malformed streamed document before publishing its ontology", async () => {
  const source = streamSource(
    `<rdf:RDF xmlns:rdf="${rdf}" xmlns:owl="${owl}"><owl:Ontology rdf:about="urn:incomplete"/>`,
    7,
  );
  const manager = OWLManager.createOWLOntologyManager();
  await expect(
    manager.loadOntologyFromOntologyDocument(source),
  ).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
  const id = manager
    .getOWLDataFactory()
    .getOWLOntologyID(IRI.create("urn:incomplete"));
  expect(manager.getOntology(id)).toBeUndefined();
});

test("applies byte and entity policies across chunks from a replayable source", async () => {
  const text = `<rdf:RDF xmlns:rdf="${rdf}"/>`;
  const byteLength = new TextEncoder().encode(text).length;
  const source = streamSource(text, 5);
  const manager = OWLManager.createOWLOntologyManager();
  await expect(
    manager.loadOntologyFromOntologyDocument(source, {
      maxInputBytes: byteLength - 1,
    }),
  ).rejects.toMatchObject({
    code: "RESOURCE_LIMIT_EXCEEDED",
    resource: "maxInputBytes",
    observed: byteLength,
  });
  await expect(
    manager.loadOntologyFromOntologyDocument(source),
  ).resolves.toBeDefined();
  const external = streamSource(
    `<!DOCTYPE rdf:RDF SYSTEM "urn:example:external"><rdf:RDF xmlns:rdf="${rdf}"/>`,
    3,
  );
  await expect(
    manager.loadOntologyFromOntologyDocument(external),
  ).rejects.toMatchObject({ code: "SECURITY_POLICY_VIOLATION" });
});

test("rejects an over-limit comment while its delimiter is still pending", async () => {
  const bytes = new TextEncoder().encode(
    "<!--" + "x".repeat(600) + "--><RDF/>",
  );
  let read = 0;
  const source = new RDFXMLStreamDocumentSource(function* () {
    for (let offset = 0; offset < bytes.length; offset += 14) {
      const chunk = bytes.subarray(offset, offset + 14);
      read += chunk.length;
      yield chunk;
    }
  });
  await expect(
    OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
      { maxExpandedXmlBytes: 90 },
    ),
  ).rejects.toMatchObject({
    code: "RESOURCE_LIMIT_EXCEEDED",
    resource: "maxExpandedXmlBytes",
  });
  expect(read).toBeLessThan(bytes.length);
});

test("cancels the iterator when a source opens after abort", async () => {
  let finishOpen;
  let opened;
  const opening = new Promise((resolve) => {
    opened = resolve;
  });
  let closed;
  const released = new Promise((resolve) => {
    closed = resolve;
  });
  const source = new RDFXMLStreamDocumentSource(() => {
    opened();
    return new Promise((resolve) => {
      finishOpen = resolve;
    });
  });
  const controller = new AbortController();
  const reason = new Error("stop the delayed input");
  const loaded =
    OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
      { signal: controller.signal },
    );
  await opening;
  controller.abort(reason);
  await expect(loaded).rejects.toBe(reason);
  finishOpen({
    [Symbol.asyncIterator]() {
      return { return: closed };
    },
  });
  await released;
});

test("accepts UTF-8 bytes created in another realm", async () => {
  const input = new TextEncoder().encode('<rdf:RDF xmlns:rdf="' + rdf + '"/>');
  const bytes = runInNewContext("new Uint8Array(input)", { input });
  expect(bytes instanceof Uint8Array).toBe(false);
  const source = new RDFXMLStreamDocumentSource(() => [bytes]);
  await expect(
    OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
    ),
  ).resolves.toBeDefined();
});

test("uses the same decoded root base to select the ontology in both input forms", async () => {
  const text = `<rdf:RDF xmlns:rdf="${rdf}" xmlns:owl="${owl}" xml:base="https://example.test/?a=1&amp;b=2">
  <owl:Ontology rdf:about=""/>
  <owl:Ontology rdf:about="urn:another"/>
</rdf:RDF>`;
  for (const source of [
    streamSource(text),
    new StringDocumentSource(text, { documentIRI, format: "rdfxml" }),
  ]) {
    const ontology = await OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    }).loadOntologyFromOntologyDocument(source);
    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "https://example.test/?a=1&b=2",
    );
  }
});

test("writes the same Functional Syntax in chunks for structural comparison", async () => {
  const manager = OWLManager.createOWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(
    streamSource(
      `<rdf:RDF xmlns:rdf="${rdf}" xmlns:owl="${owl}">
  <owl:Ontology rdf:about="urn:test"/>
  <owl:Class rdf:about="urn:test:Place"/>
</rdf:RDF>`,
    ),
  );
  const complete = new StringDocumentTarget();
  await manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, complete);
  const observed = [];
  await manager.saveOntology(
    ontology,
    OWLDocumentFormats.FUNCTIONAL,
    new FunctionalSyntaxStreamDocumentTarget((chunks) => {
      observed.push(...chunks);
    }),
  );
  expect(observed.length).toBeGreaterThan(2);
  expect(observed.join("")).toBe(complete.toString());
  for (const invalid of [
    Object.create(FunctionalSyntaxStreamDocumentTarget.prototype),
    new Proxy(new FunctionalSyntaxStreamDocumentTarget(() => {}), {}),
  ]) {
    await expect(
      manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, invalid),
    ).rejects.toBeInstanceOf(TypeError);
  }
  await expect(
    manager.saveOntology(
      ontology,
      OWLDocumentFormats.FUNCTIONAL,
      new FunctionalSyntaxStreamDocumentTarget(() => {}),
    ),
  ).rejects.toMatchObject({ code: "ONTOLOGY_STORAGE_FAILED" });
});
