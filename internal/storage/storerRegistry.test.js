import { OWLDocumentFormats } from "../../formats/index.js";
import { OWLDocumentFormat } from "../../model/index.js";
import {
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
  StringDocumentTarget,
} from "../../io/index.js";
import { replaceStringDocumentTargetText } from "../../io/stringDocumentTarget.js";
import { OntologyState } from "../model/ontologyState.js";
import { StorerRegistry } from "./storerRegistry.js";

describe("package-private storer selection", () => {
  it("selects only the exact format key and snapshots the descriptor", () => {
    const render = async () => "complete document";
    const descriptor = { formatKey: "functional", render };
    const registry = new StorerRegistry([descriptor]);
    descriptor.formatKey = "rdfxml";
    descriptor.render = async () => "changed";
    const selected = registry.select(
      new OWLDocumentFormat({ key: "functional", mediaTypes: ["text/other"] }),
    );
    expect(selected).toEqual({ formatKey: "functional", render });
    expect(Object.isFrozen(selected)).toBe(true);
    for (const format of [
      OWLDocumentFormats.RDF_XML,
      new OWLDocumentFormat({ key: "FUNCTIONAL", extensions: ["ofn"] }),
      new OWLDocumentFormat({ key: "other", isRdf: true }),
    ]) {
      expect(() => registry.select(format)).toThrow(OWLStorerNotFoundError);
    }
  });

  it("rejects duplicate keys and invalid descriptors before use", () => {
    const descriptor = { formatKey: "functional", render: async () => "" };
    expect(() => new StorerRegistry([descriptor, descriptor])).toThrow(
      TypeError,
    );
    for (const invalid of [
      null,
      {},
      { formatKey: "" },
      { formatKey: "functional" },
    ]) {
      expect(() => new StorerRegistry([invalid])).toThrow(TypeError);
    }
  });

  it("rejects unbranded or mutable format lookalikes before selection", () => {
    const registry = new StorerRegistry([]);
    for (const invalid of [
      undefined,
      null,
      { key: "functional" },
      Object.create(OWLDocumentFormat.prototype),
      Object.freeze(Object.create(OWLDocumentFormat.prototype)),
      new Proxy(OWLDocumentFormats.FUNCTIONAL, {}),
    ]) {
      expect(() => registry.select(invalid)).toThrow(TypeError);
    }
  });
});

describe("package-private atomic storage", () => {
  const snapshot = new OntologyState().createSnapshot();

  it("publishes complete awaited text once and replaces instead of appending", async () => {
    let finishRendering;
    const renderedText = new Promise((resolve) => {
      finishRendering = resolve;
    });
    const registry = new StorerRegistry([
      {
        formatKey: "functional",
        async render(actualSnapshot, format) {
          expect(actualSnapshot).toBe(snapshot);
          expect(format).toBe(OWLDocumentFormats.FUNCTIONAL);
          return renderedText;
        },
      },
    ]);
    const target = new StringDocumentTarget();
    replaceStringDocumentTargetText(target, "prior text");
    expect(typeof registry.store).toBe("function");
    const operation = registry.store(
      snapshot,
      OWLDocumentFormats.FUNCTIONAL,
      target,
    );
    expect(target.toString()).toBe("prior text");
    finishRendering("complete Δ document");
    await expect(operation).resolves.toBeUndefined();
    expect(target.toString()).toBe("complete Δ document");
    await registry.store(snapshot, OWLDocumentFormats.FUNCTIONAL, target);
    expect(target.toString()).toBe("complete Δ document");
  });

  it.each(["synchronous", "asynchronous", "typed", "non-string"])(
    "preserves prior text for a %s renderer failure",
    async (failureKind) => {
      const cause =
        failureKind === "typed"
          ? new OWLOntologyStorageError("Cannot preserve content", {
              reason: "ONTOLOGY_NOT_REPRESENTABLE",
            })
          : new Error("renderer failed");
      const registry = new StorerRegistry([
        {
          formatKey: "functional",
          render() {
            if (failureKind === "asynchronous") return Promise.reject(cause);
            if (failureKind === "non-string") return undefined;
            throw cause;
          },
        },
      ]);
      const target = new StringDocumentTarget();
      replaceStringDocumentTargetText(target, "retained text");
      expect(typeof registry.store).toBe("function");
      const failure = await registry
        .store(snapshot, OWLDocumentFormats.FUNCTIONAL, target)
        .catch((error) => error);
      expect(failure).toBeInstanceOf(OWLOntologyStorageError);
      if (failureKind === "typed") expect(failure).toBe(cause);
      else if (failureKind === "non-string")
        expect(failure.cause).toBeInstanceOf(TypeError);
      else expect(failure.cause).toBe(cause);
      expect(target.toString()).toBe("retained text");
    },
  );

  it("validates genuine targets before any rendering or selection", async () => {
    let renderCalls = 0;
    const registry = new StorerRegistry([
      {
        formatKey: "functional",
        render() {
          renderCalls += 1;
          return "complete";
        },
      },
    ]);
    const genuine = new StringDocumentTarget();
    replaceStringDocumentTargetText(genuine, "unchanged");
    expect(typeof registry.store).toBe("function");
    for (const target of [
      null,
      {},
      Object.create(StringDocumentTarget.prototype),
      new Proxy(genuine, {}),
    ]) {
      await expect(
        registry.store(snapshot, OWLDocumentFormats.FUNCTIONAL, target),
      ).rejects.toBeInstanceOf(TypeError);
      await expect(
        registry.store(snapshot, OWLDocumentFormats.TURTLE, target),
      ).rejects.toBeInstanceOf(TypeError);
    }
    expect(renderCalls).toBe(0);
    expect(genuine.toString()).toBe("unchanged");
  });
});
