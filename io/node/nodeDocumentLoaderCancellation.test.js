import { jest } from "@jest/globals";
import { IRI, OWLOntologyLoaderConfiguration } from "../../model/index.js";

let releaseLookup;
let notifyLookup;
jest.unstable_mockModule("node:dns/promises", () => ({
  lookup: () =>
    new Promise((resolve) => {
      releaseLookup = resolve;
      notifyLookup();
    }),
}));
const { NodeDocumentLoader } = await import("./nodeDocumentLoader.js");

test.each(["deadline", "caller"])(
  "%s settles a load while DNS is pending and prevents a late connection",
  async (cancellation) => {
    const operations = [];
    const lookupStarted = new Promise((resolve) => {
      notifyLookup = resolve;
    });
    const controller = new AbortController();
    const loader = new NodeDocumentLoader({
      authorize(_iri, context) {
        operations.push(context.operation);
        return true;
      },
    });
    const configuration = new OWLOntologyLoaderConfiguration({
      behaviorProfileId: "java-owlapi-5.5.1",
      timeoutMs: cancellation === "deadline" ? 20 : Infinity,
    });
    let outcome;
    const loading = loader
      .load(IRI.create("http://owned-fixture.invalid/ontology"), {
        config: configuration,
        signal: controller.signal,
      })
      .then(
        () => {
          outcome = "resolved";
        },
        (error) => {
          outcome = error;
        },
      );
    const callerReason = new Error("owned caller cancellation");
    await lookupStarted;
    if (cancellation === "caller") controller.abort(callerReason);
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (cancellation === "caller") expect(outcome).toBe(callerReason);
      else expect(outcome).toMatchObject({ resource: "deadline" });
    } finally {
      releaseLookup([{ address: "127.0.0.1", family: 4 }]);
      await loading;
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(operations).not.toContain("connect-http");
  },
);
