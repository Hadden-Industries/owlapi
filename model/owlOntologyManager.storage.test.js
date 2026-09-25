import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import {
  OWLOntologyStateError,
  OWLStorerNotFoundError,
  StringDocumentTarget,
} from "../io/index.js";
import { OWLOntology, OWLOntologyManager } from "./index.js";
import { replaceStringDocumentTargetText } from "../io/stringDocumentTarget.js";

describe("manager-owned ontology storage", () => {
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
