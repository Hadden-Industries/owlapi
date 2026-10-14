import { OWLManager } from "../apibinding/index.js";
import { IRI } from "./index.js";
import { OWLDocumentFormats } from "../formats/owlDocumentFormats.js";
import { StringDocumentSource } from "../io/stringDocumentSource.js";

const source = (text) =>
  new StringDocumentSource(text, { format: OWLDocumentFormats.FUNCTIONAL });
const id = (manager, suffix) =>
  manager
    .getOWLDataFactory()
    .getOWLOntologyID(IRI.create(`urn:loading:${suffix}`));
const child =
  "Ontology(<urn:loading:child> Declaration(Class(<urn:loading:C>)))";
const root =
  "Ontology(<urn:loading:root> Import(<urn:loading:child>) Import(<urn:loading:missing>) Declaration(Class(<urn:loading:R>)))";

describe("profile-specific load publication", () => {
  test.each(["java-owlapi-5.5.1", "normative-v1"])(
    "%s enforces a revocable host authorization before importing",
    async (behaviorProfileId) => {
      let acquisitions = 0;
      let permitted = false;
      const loader = {
        authorize: () => permitted,
        load() {
          acquisitions++;
          return source(child);
        },
      };
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
        documentLoader: loader,
      });
      const document = source(
        "Ontology(<urn:loading:root> Import(<urn:loading:child>))",
      );
      await expect(
        manager.loadOntologyFromOntologyDocument(document),
      ).rejects.toThrow();
      expect(acquisitions).toBe(0);
      expect(manager.getOntology(id(manager, "root"))).toBeUndefined();
      // A separate manager isolates Java's retained failed-import marker from
      // the positive permission control; that lifecycle is tested below.
      permitted = true;
      const allowedManager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
        documentLoader: loader,
      });
      expect(
        (
          await allowedManager.loadOntologyFromOntologyDocument(document)
        ).getAxiomCount(),
      ).toBe(0);
      expect(acquisitions).toBe(1);
    },
  );
  test.each(["java-owlapi-5.5.1", "normative-v1"])(
    "%s retains the specified state after a failed nested import and retry",
    async (behaviorProfileId) => {
      const requests = [];
      const rootCountsDuringImport = [];
      let fixed = false;
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
        documentLoader: {
          async load(iri) {
            requests.push(iri.value);
            rootCountsDuringImport.push(
              manager.getOntology(id(manager, "root"))?.getAxiomCount(),
            );
            if (iri.value.endsWith(":child")) return source(child);
            if (fixed) return source("Ontology(<urn:loading:missing>)");
            return source("not functional");
          },
        },
      });
      const existing = manager.createOntology(id(manager, "existing"));
      const configuration = manager
        .getOntologyLoaderConfiguration()
        .setLoadAnnotationAxioms(false);
      await expect(
        manager.loadOntologyFromOntologyDocument(source(root), configuration),
      ).rejects.toThrow();
      expect(manager.getOntology(id(manager, "root"))).toBeUndefined();
      expect(manager.getOntology(id(manager, "existing"))).toBe(existing);
      const retained = manager.getOntology(id(manager, "child"));
      expect(Boolean(retained)).toBe(behaviorProfileId === "java-owlapi-5.5.1");
      expect(rootCountsDuringImport).toEqual(
        behaviorProfileId === "java-owlapi-5.5.1"
          ? [0, 0]
          : [undefined, undefined],
      );
      if (retained) {
        const factory = manager.getOWLDataFactory();
        const annotation = factory.getOWLAnnotationAssertionAxiom(
          factory.getRDFSLabel(),
          IRI.create("urn:loading:C"),
          factory.getOWLLiteral("label"),
        );
        expect(manager.addAxiom(retained, annotation)).toBe("UNSUCCESSFULLY");
      }
      fixed = true;
      const loaded = await manager.loadOntologyFromOntologyDocument(
        source(root),
        configuration,
      );
      expect(loaded.getAxiomCount()).toBe(1);
      expect(manager.getImportsClosure(loaded).size).toBe(
        behaviorProfileId === "java-owlapi-5.5.1" ? 2 : 3,
      );
      expect(requests).toHaveLength(
        behaviorProfileId === "java-owlapi-5.5.1" ? 2 : 4,
      );
    },
  );

  test.each(["java-owlapi-5.5.1", "normative-v1"])(
    "%s handles a syntax failure after an import at the parser boundary",
    async (behaviorProfileId) => {
      let requests = 0;
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
        documentLoader: {
          async load() {
            requests++;
            return source(child);
          },
        },
      });
      await expect(
        manager.loadOntologyFromOntologyDocument(
          source(
            "Ontology(<urn:loading:root> Import(<urn:loading:child>) NOT_SYNTAX)",
          ),
        ),
      ).rejects.toThrow();
      expect(requests).toBe(behaviorProfileId === "java-owlapi-5.5.1" ? 1 : 0);
      expect(Boolean(manager.getOntology(id(manager, "child")))).toBe(
        behaviorProfileId === "java-owlapi-5.5.1",
      );
      expect(manager.getOntology(id(manager, "root"))).toBeUndefined();
    },
  );
});
