import { jest } from "@jest/globals";
import { OWLManager } from "../apibinding/index.js";
import { IRI } from "../model/index.js";
import { OWL2DLProfile, OWL2ELProfile, OWL2RLProfile } from "./index.js";

afterEach(() => jest.restoreAllMocks());

const fixture = (behaviorProfileId) => {
  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
  const df = manager.getOWLDataFactory();
  const ontology = manager.createOntology();
  const a = df.getOWLClass(IRI.create("urn:profile-cache:A"));
  const b = df.getOWLClass(IRI.create("urn:profile-cache:B"));
  manager.addAxioms(ontology, [
    df.getOWLDeclarationAxiom(a),
    df.getOWLDeclarationAxiom(b),
    df.getOWLSubClassOfAxiom(a, b),
    df.getOWLAnnotationAssertionAxiom(
      df.getRDFSLabel(),
      a.iri,
      df.getOWLLiteral("label"),
    ),
  ]);
  return { manager, df, ontology, a, b };
};

// Characterized before traversal reuse: exact existing public exhaustion
// boundaries, not values calculated by the optimization under test.
test.each([
  ["java-owlapi-5.5.1", OWL2DLProfile, 91, 3],
  ["java-owlapi-5.5.1", OWL2ELProfile, 119, 3],
  ["java-owlapi-5.5.1", OWL2RLProfile, 113, 3],
  ["normative-v1", OWL2DLProfile, 107, 4],
  ["normative-v1", OWL2ELProfile, 138, 4],
  ["normative-v1", OWL2RLProfile, 132, 4],
])(
  "%s %p repeated checks retain work/depth limits",
  async (behaviorProfileId, Profile, work, depth) => {
    const { manager, df, ontology } = fixture(behaviorProfileId);
    const checker = new Profile({ behaviorProfileId });
    const initial = await checker.checkOntology(ontology);
    expect(initial.status).toBe("valid");
    expect(
      (await checker.checkOntology(ontology, { maxWork: work - 1 }))
        .unverifiedChecks,
    ).toContainEqual({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "profileWork",
      limit: work - 1,
    });
    expect(
      (await checker.checkOntology(ontology, { maxWork: work })).status,
    ).toBe("valid");
    expect(
      (await checker.checkOntology(ontology, { maxDepth: depth - 1 }))
        .unverifiedChecks,
    ).toContainEqual({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "profileDepth",
      limit: depth - 1,
    });
    expect(
      (await checker.checkOntology(ontology, { maxDepth: depth })).status,
    ).toBe("valid");
    const literalLimited = await checker.checkOntology(ontology, {
      maxLiteralLength: 4,
    });
    expect(
      literalLimited.unverifiedChecks.some(
        (entry) => entry.resource === "profileLiteralLength",
      ),
    ).toBe(behaviorProfileId === "normative-v1");
    manager.addAxiom(
      ontology,
      df.getOWLDeclarationAxiom(
        df.getOWLClass(IRI.create("urn:profile-cache:C")),
      ),
    );
    const changed = await checker.checkOntology(ontology);
    expect(changed.status).toBe("valid");
    expect(changed.closure[0].revision).toBeGreaterThan(
      initial.closure[0].revision,
    );
    expect(
      (await checker.checkOntology(ontology, { maxWork: work }))
        .unverifiedChecks,
    ).toContainEqual({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "profileWork",
      limit: work,
    });
  },
);

test.each(
  ["java-owlapi-5.5.1", "normative-v1"].flatMap((behaviorProfileId) =>
    ["complete", "abort", "mutate"].map((operation) => [
      behaviorProfileId,
      operation,
    ]),
  ),
)(
  "%s prepared traversal yields and then %s",
  async (behaviorProfileId, operation) => {
    const { manager, df, ontology } = fixture(behaviorProfileId);
    manager.addAxioms(
      ontology,
      Array.from({ length: 64 }, (_, index) =>
        df.getOWLDeclarationAxiom(
          df.getOWLClass(IRI.create(`urn:yield:C${index}`)),
        ),
      ),
    );
    const checker = new OWL2RLProfile({ behaviorProfileId });
    expect((await checker.checkOntology(ontology)).status).toBe("valid");
    const controller = new AbortController();
    // The initial checkpoint stays synchronous. The first sampled traversal
    // boundary admits a timer; subsequent samples observe no elapsed work.
    jest
      .spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(60);
    const timer = jest
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback) => {
        if (operation === "abort") controller.abort();
        if (operation === "mutate")
          manager.addAxiom(
            ontology,
            df.getOWLDeclarationAxiom(
              df.getOWLClass(IRI.create("urn:yield:changed")),
            ),
          );
        queueMicrotask(callback);
        return 1;
      });
    const pending = checker.checkOntology(ontology, {
      signal: controller.signal,
    });
    if (operation === "abort")
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    else {
      const report = await pending;
      expect(report.status).toBe(
        operation === "mutate" ? "unverified" : "valid",
      );
      expect(report.unverifiedChecks).toEqual(
        operation === "mutate"
          ? [{ code: "ONTOLOGY_CHANGED_DURING_CHECK" }]
          : [],
      );
    }
    expect(timer).toHaveBeenCalledTimes(1);
  },
);

test("traversal reuse cannot reuse another profile's domain result", async () => {
  const { manager, df, ontology, a, b } = fixture("normative-v1");
  const property = df.getOWLObjectProperty(IRI.create("urn:profile-cache:p"));
  manager.addAxioms(ontology, [
    df.getOWLDeclarationAxiom(property),
    df.getOWLSubClassOfAxiom(a, df.getOWLObjectAllValuesFrom(property, b)),
  ]);
  expect((await new OWL2DLProfile().checkOntology(ontology)).status).toBe(
    "valid",
  );
  expect((await new OWL2ELProfile().checkOntology(ontology)).status).toBe(
    "invalid",
  );
  expect((await new OWL2DLProfile().checkOntology(ontology)).status).toBe(
    "valid",
  );
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s preserves work exhaustion before an abort queued behind replay completion",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const df = manager.getOWLDataFactory(),
      ontology = manager.createOntology();
    manager.addAxioms(
      ontology,
      Array.from({ length: 64 }, (_, index) =>
        df.getOWLDeclarationAxiom(
          df.getOWLClass(IRI.create(`urn:race:${index}`)),
        ),
      ),
    );
    const checker = new OWL2RLProfile({ behaviorProfileId });
    await checker.checkOntology(ontology);
    const controller = new AbortController();
    let reads = 0;
    jest
      .spyOn(performance, "now")
      .mockImplementation(() => (++reads <= 2 ? 0 : 60));
    const timer = jest
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback) => {
        queueMicrotask(() => {
          callback();
          queueMicrotask(() => queueMicrotask(() => controller.abort()));
        });
        return 1;
      });
    // The legacy loop exhausts work at the first check after replay. An extra
    // promise continuation would let the later abort incorrectly win instead.
    const report = await checker.checkOntology(ontology, {
      maxWork: 388,
      signal: controller.signal,
    });
    expect(report.status).toBe("unverified");
    expect(report.unverifiedChecks).toEqual([
      { code: "RESOURCE_LIMIT_EXCEEDED", resource: "profileWork", limit: 388 },
    ]);
    expect(timer).toHaveBeenCalledTimes(1);
  },
);

test("RL distinguishes reserved properties from the other property family", async () => {
  const { manager, df, ontology } = fixture("normative-v1");
  manager.addAxiom(
    ontology,
    df.getOWLDeclarationAxiom(
      df.getOWLObjectProperty(
        IRI.create("http://www.w3.org/2002/07/owl#topDataProperty"),
      ),
    ),
  );
  const report = await new OWL2RLProfile().checkOntology(ontology);
  expect(
    report.violations.some((entry) => entry.code === "RESERVED_ENTITY_IRI"),
  ).toBe(true);
  expect(
    report.violations.some(
      (entry) => entry.code === "PROFILE_PROPERTY_NOT_ALLOWED",
    ),
  ).toBe(false);
});

test.each([
  ['<a xmlns="urn:a"></a>', "valid"],
  ["<a>", "invalid"],
])(
  "XML validation still completes with a replaced global Promise: %s",
  async (lexical, expected) => {
    const { manager, df, ontology, a } = fixture("normative-v1");
    manager.addAxiom(
      ontology,
      df.getOWLAnnotationAssertionAxiom(
        df.getRDFSLabel(),
        a.iri,
        df.getOWLLiteral(
          lexical,
          IRI.create("http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral"),
        ),
      ),
    );
    const NativePromise = globalThis.Promise;
    class InstrumentedPromise extends NativePromise {}
    let report;
    try {
      globalThis.Promise = InstrumentedPromise;
      report = await new OWL2DLProfile().checkOntology(ontology);
    } finally {
      globalThis.Promise = NativePromise;
    }
    expect(report.status).toBe(expected);
    if (expected === "invalid")
      expect(report.violations).toContainEqual(
        expect.objectContaining({ code: "XML_LITERAL_NOT_WELL_FORMED" }),
      );
  },
);
