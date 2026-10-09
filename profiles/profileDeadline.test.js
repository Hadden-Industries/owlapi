import { jest } from "@jest/globals";
import {
  IRI,
  OWL2DLProfile,
  OWLManager,
  OWLOntology,
  OWLOntologyLoaderConfiguration,
} from "../index.js";

afterEach(() => jest.restoreAllMocks());

test.each([undefined, { timeoutMs: null }])(
  "has no implicit profile elapsed deadline with %j",
  async (options) => {
    const ontology = new OWLOntology();
    jest
      .spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(31000);
    const result = await new OWL2DLProfile().checkOntology(ontology, options);
    expect(result.status).toBe("valid");
    expect(result.unverifiedChecks).toEqual([]);
  },
);

test.each([0, 30000])(
  "retains explicit numeric profile deadline %s",
  async (timeoutMs) => {
    const ontology = new OWLOntology();
    jest
      .spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(31000);
    const result = await new OWL2DLProfile().checkOntology(ontology, {
      timeoutMs,
    });
    expect(result.status).toBe("unverified");
    expect(result.unverifiedChecks).toContainEqual(
      expect.objectContaining({
        code: "RESOURCE_LIMIT_EXCEEDED",
        resource: "profileTimeoutMs",
        limit: timeoutMs,
      }),
    );
  },
);

test("disabling elapsed deadline leaves work exhaustion and cancellation enforced", async () => {
  const factory = OWLManager.createOWLOntologyManager().getOWLDataFactory();
  const ontology = new OWLOntology({
    axioms: [
      factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create("urn:deadline:A")),
      ),
    ],
  });
  const result = await new OWL2DLProfile().checkOntology(ontology, {
    timeoutMs: null,
    maxWork: 0,
  });
  expect(result.status).toBe("unverified");
  expect(result.unverifiedChecks).toContainEqual(
    expect.objectContaining({ resource: "profileWork", limit: 0 }),
  );
  const controller = new AbortController();
  controller.abort();
  await expect(
    new OWL2DLProfile().checkOntology(ontology, {
      timeoutMs: null,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test.each([undefined, Infinity, NaN, -1, 0.5, "30000", true])(
  "rejects invalid explicit deadline %s",
  async (timeoutMs) => {
    await expect(
      new OWL2DLProfile().checkOntology(new OWLOntology(), { timeoutMs }),
    ).rejects.toThrow(TypeError);
  },
);

test("loader deadline remains a numeric JS policy", () => {
  expect(new OWLOntologyLoaderConfiguration().timeoutMs).toBe(30000);
  expect(() => new OWLOntologyLoaderConfiguration({ timeoutMs: null })).toThrow(
    RangeError,
  );
});
