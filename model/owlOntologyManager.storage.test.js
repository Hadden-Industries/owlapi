import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import {
  OWLOntologyStateError,
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
  StringDocumentSource,
  StringDocumentTarget,
} from "../io/index.js";
import { IRI, OWLOntology, OWLOntologyManager } from "./index.js";
import { replaceStringDocumentTargetText } from "../io/stringDocumentTarget.js";
import { compareOntologies } from "../internal/model/ontologyStructuralIsomorphism.js";

describe("manager-owned ontology storage", () => {
  it.each([OWLDocumentFormats.FUNCTIONAL, OWLDocumentFormats.RDF_XML])(
    "preserves IPvFuture full IRIs without dereferencing or normalizing them in %s",
    async (format) => {
      let loaderCalls = 0;
      const newManager = () =>
        OWLManager.createOWLOntologyManager({
          documentLoader: {
            load() {
              loaderCalls += 1;
              throw new Error("Storage must not dereference an IRI");
            },
          },
        });
      const manager = newManager();
      const ontology = await manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(`Ontology(
          <http://[v1.a]/ontology> <http://[VF.opaque:address]:0080/version>
          Declaration(Class(<http://[v1.a]/C>))
          Declaration(Class(<http://[VF.opaque:address]:0080/\u00E9/%7e#\u{1F642}>))
          Declaration(Class(<http://[2001:db8::1]/C>))
          Declaration(Class(<http://\u00E9.example/\u{10000}/C>))
          Declaration(Class(<urn:empty-query?#>))
          Declaration(Class(<urn:private-query?\uE000>))
        )`),
        { parsingMode: "strict" },
      );
      const target = new StringDocumentTarget();
      await manager.saveOntology(ontology, format, target);
      const freshManager = newManager();
      const reloaded = await freshManager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(target.toString()),
        { parsingMode: "strict" },
      );
      expect(compareOntologies(ontology, reloaded)).toEqual({
        equal: true,
        mismatch: null,
      });
      expect(freshManager.importsClosure(reloaded)).toEqual([reloaded]);
      expect(loaderCalls).toBe(0);
    },
  );

  it.each([OWLDocumentFormats.FUNCTIONAL, OWLDocumentFormats.RDF_XML])(
    "rejects malformed full IRIs without replacing a successful %s document",
    async (format) => {
      const manager = OWLManager.createOWLOntologyManager();
      const factory = manager.getOWLDataFactory();
      const target = new StringDocumentTarget();
      await manager.saveOntology(manager.createOntology(), format, target);
      const priorText = target.toString();
      for (const iri of [
        "relative/path",
        "http://[v1.]/C",
        "http://[vG.a]/C",
        "http://[v1.\u00E9]/C",
        "http://[v1.a%20b]/C",
        "http://[2001:db8:::1]/C",
        "urn:bad%2G",
        "urn:space here",
        "urn:line\n",
        "urn:line\r",
        "urn:surrogate\uD800",
        "urn:private-path\uE000",
        "urn:private-fragment#\uE000",
        "urn:noncharacter\u{1FFFE}",
      ]) {
        const ontology = manager.createOntology();
        const axiom = factory.getOWLDeclarationAxiom(
          factory.getOWLClass(IRI.create(iri)),
        );
        manager.addAxiom(ontology, axiom);
        const save = manager.saveOntology(ontology, format, target);
        await expect(save).rejects.toBeInstanceOf(OWLOntologyStorageError);
        await expect(save).rejects.toMatchObject({
          code: "ONTOLOGY_STORAGE_FAILED",
          reason: "ONTOLOGY_NOT_REPRESENTABLE",
        });
        expect(target.toString()).toBe(priorText);
      }
    },
  );

  it.each([
    [OWLDocumentFormats.FUNCTIONAL, /^Ontology\(/],
    [OWLDocumentFormats.RDF_XML, /<rdf:RDF/],
  ])("selects the exact registered %s writer", async (format, syntax) => {
    const manager = OWLManager.createOWLOntologyManager();
    const target = new StringDocumentTarget();
    await expect(
      manager.saveOntology(manager.createOntology(), format, target),
    ).resolves.toBeUndefined();
    expect(target.toString()).toMatch(syntax);
  });

  it("exposes the explicit async save operation without syntax fallback", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = manager.createOntology();
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "prior successful document");
    expect(typeof manager.saveOntology).toBe("function");
    const operation = manager.saveOntology(
      ontology,
      OWLDocumentFormats.TURTLE,
      target,
    );
    expect(operation).toBeInstanceOf(Promise);
    await expect(operation).rejects.toBeInstanceOf(OWLStorerNotFoundError);
    expect(target.toString()).toBe("prior successful document");
  });

  it("validates ownership, format, and target before selecting a storer", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = manager.createOntology();
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "retained text");
    expect(typeof manager.saveOntology).toBe("function");
    for (const foreign of [
      new OWLOntology(),
      OWLManager.createOWLOntologyManager().createOntology(),
      {},
    ]) {
      await expect(
        manager.saveOntology(foreign, OWLDocumentFormats.TURTLE, target),
      ).rejects.toBeInstanceOf(OWLOntologyStateError);
    }
    await expect(
      manager.saveOntology(ontology, { key: "turtle" }, target),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      manager.saveOntology(ontology, OWLDocumentFormats.TURTLE, {}),
    ).rejects.toBeInstanceOf(TypeError);
    expect(target.toString()).toBe("retained text");
  });

  it("does not accept a public storer or registry injection option", async () => {
    const render = () => {
      throw new Error("public injection reached");
    };
    const manager = new OWLOntologyManager({
      storerRegistry: { store: render },
      storers: [{ formatKey: "turtle", render }],
    });
    expect(typeof manager.saveOntology).toBe("function");
    await expect(
      manager.saveOntology(
        manager.createOntology(),
        OWLDocumentFormats.TURTLE,
        new StringDocumentTarget(),
      ),
    ).rejects.toBeInstanceOf(OWLStorerNotFoundError);
    expect(manager.registerStorer).toBeUndefined();
  });
});
