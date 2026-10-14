import { OWLManager } from "../apibinding/index.js";
import { StringDocumentSource } from "../io/index.js";
import {
  OWLOntologyLoaderConfiguration,
  OWLOntologyWriterConfiguration,
} from "./index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { OWL2DLProfile } from "../profiles/index.js";
import { OWLDataFactory } from "./owlDataFactory.js";

describe("manager behavior profile contract", () => {
  test("configuration copies retain the private profile instead of an overridden public identity", () => {
    class LoaderConfiguration extends OWLOntologyLoaderConfiguration {
      getBehaviorProfileId() {
        return "normative-v1";
      }
    }
    class WriterConfiguration extends OWLOntologyWriterConfiguration {
      getBehaviorProfileId() {
        return "normative-v1";
      }
    }
    const options = { behaviorProfileId: "java-owlapi-5.5.1" };
    expect(
      new LoaderConfiguration(options)
        .setConnectionTimeout(7)
        .getBehaviorProfileId(),
    ).toBe(options.behaviorProfileId);
    expect(
      new WriterConfiguration(options).withIndentSize(2).getBehaviorProfileId(),
    ).toBe(options.behaviorProfileId);
  });
  test("configuration admission and loading use private bindings even when public identity queries are overridden", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    class MislabelledLoaderConfiguration extends OWLOntologyLoaderConfiguration {
      getBehaviorProfileId() {
        return "java-owlapi-5.5.1";
      }
    }
    expect(() =>
      manager.setOntologyLoaderConfiguration(
        new MislabelledLoaderConfiguration(),
      ),
    ).toThrow(/profiles must match/);
    manager.getBehaviorProfileId = () => "normative-v1";
    expect(() =>
      manager.setOntologyLoaderConfiguration(
        new OWLOntologyLoaderConfiguration(),
      ),
    ).toThrow(/profiles must match/);
    expect(() =>
      manager.setOntologyWriterConfiguration(
        new OWLOntologyWriterConfiguration(),
      ),
    ).toThrow(/profiles must match/);
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Ontology()", {
        format: OWLDocumentFormats.FUNCTIONAL,
      }),
    );
    expect(ontology.getAxiomCount()).toBe(0);
  });
  test("public identity overrides cannot change the private profile binding", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = manager.createOntology();
    manager.getBehaviorProfileId = () => "normative-v1";
    await expect(
      new OWL2DLProfile({ behaviorProfileId: "normative-v1" }).checkOntology(
        ontology,
      ),
    ).rejects.toThrow(/profiles must match/);
    expect(
      (
        await new OWL2DLProfile({
          behaviorProfileId: "java-owlapi-5.5.1",
        }).checkOntology(ontology)
      ).isInProfile(),
    ).toBe(true);
  });

  test("manager factories and source preservation retain the selected construction contract", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    expect(manager.getOWLDataFactory().getBehaviorProfileId()).toBe(
      "java-owlapi-5.5.1",
    );
    const mismatched = new OWLDataFactory();
    mismatched.getBehaviorProfileId = () => "java-owlapi-5.5.1";
    expect(() =>
      OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-owlapi-5.5.1",
        dataFactory: mismatched,
      }),
    ).toThrow(/profiles must match/);
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        'Ontology(Annotation(<http://www.w3.org/2000/01/rdf-schema#label> "bad"^^<http://www.w3.org/2001/XMLSchema#boolean>))',
        { format: OWLDocumentFormats.FUNCTIONAL },
      ),
      { parsingMode: "preserve" },
    );
    expect([...ontology.getAnnotations()][0].value.lexicalForm).toBe("false");
  });
  test("configuration bindings reject a different profile before reading the source", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    let reads = 0;
    const source = {
      getText() {
        reads++;
        return "Ontology()";
      },
      getDocumentIRI() {},
      getFileName() {},
      getContentType() {},
    };
    await expect(
      manager.loadOntologyFromOntologyDocument(
        source,
        new OWLOntologyLoaderConfiguration(),
      ),
    ).rejects.toThrow(/profiles must match/);
    expect(reads).toBe(0);
    expect(() =>
      manager.setOntologyWriterConfiguration(
        new OWLOntologyWriterConfiguration(),
      ),
    ).toThrow(/profiles must match/);
    const loaded = await manager.loadOntologyFromOntologyDocument(
      "Ontology()",
      { loadAnnotationAxioms: false },
    );
    expect(loaded.getAxiomCount()).toBe(0);
  });
  test("unknown profile selection fails before invoking caller-owned inputs", () => {
    let calls = 0;
    const iriMappers = {
      *[Symbol.iterator]() {
        calls++;
        yield { getDocumentIRI: () => undefined };
      },
    };
    expect(() =>
      OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-latest",
        iriMappers,
      }),
    ).toThrow(RangeError);
    expect(calls).toBe(0);
  });

  test("omission is normative and simultaneous managers retain their explicit identity", async () => {
    const normative = OWLManager.createOWLOntologyManager();
    const java = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    expect(normative.getBehaviorProfileId()).toBe("normative-v1");
    expect(java.getBehaviorProfileId()).toBe("java-owlapi-5.5.1");
    expect(java.setBehaviorProfileId).toBeUndefined();
    const [left, right] = await Promise.all(
      [normative, java].map((manager) =>
        manager.loadOntologyFromOntologyDocument(
          new StringDocumentSource(
            "Ontology(<urn:behavior:profile> Declaration(Class(<urn:behavior:C>)))",
          ),
        ),
      ),
    );
    expect(left.getAxiomCount()).toBe(1);
    expect(right.getAxiomCount()).toBe(1);
    expect(normative.getBehaviorProfileId()).toBe("normative-v1");
    expect(java.getBehaviorProfileId()).toBe("java-owlapi-5.5.1");
  });
});

describe("native configuration within an explicitly selected behavior profile", () => {
  // Independent expectations: ObserveBehaviorContracts.java against Central 5.5.1.
  const javaOptions = { behaviorProfileId: "java-owlapi-5.5.1" };
  test("native HTTP configuration retains defaults, no-op identity and nullable authorization behavior", () => {
    const defaults = new OWLOntologyLoaderConfiguration(javaOptions);
    expect(defaults.getAuthorizationValue).toBeInstanceOf(Function);
    expect(defaults.getAuthorizationValue()).toBe("");
    expect(defaults.isAcceptingHTTPCompression()).toBe(true);
    expect(defaults.setAuthorizationValue("")).toBe(defaults);
    expect(defaults.setAcceptingHTTPCompression(true)).toBe(defaults);
    const changed = defaults
      .setAuthorizationValue("Bearer owned-test-token")
      .setAcceptingHTTPCompression(false)
      .setConnectionTimeout(3);
    expect(changed.getAuthorizationValue()).toBe("Bearer owned-test-token");
    expect(changed.isAcceptingHTTPCompression()).toBe(false);
    expect(defaults.getAuthorizationValue()).toBe("");
    const cleared = changed.setAuthorizationValue(null);
    expect(cleared.getAuthorizationValue()).toBe("");
    expect(cleared.setAuthorizationValue(null)).not.toBe(cleared);
    expect(cleared.setAuthorizationValue("x").getAuthorizationValue()).toBe(
      "x",
    );
  });
  test("loader getters, copy preservation, no-op identity and deferred value validation", () => {
    const original = new OWLOntologyLoaderConfiguration(javaOptions);
    expect([
      original.getConnectionTimeout(),
      original.getRetriesToAttempt(),
      original.isFollowRedirects(),
      original.getEntityExpansionLimit(),
      original.isStrict(),
      original.isLoadAnnotationAxioms(),
    ]).toEqual([20000, 5, true, "100000000", false, true]);
    expect(original.setConnectionTimeout(20000)).toBe(original);
    const changed = original
      .setConnectionTimeout(-1)
      .setRetriesToAttempt(0)
      .setStrict(true)
      .setLoadAnnotationAxioms(false)
      .setEntityExpansionLimit("bad");
    expect([
      changed.getConnectionTimeout(),
      changed.getRetriesToAttempt(),
      changed.isStrict(),
      changed.isLoadAnnotationAxioms(),
      changed.getEntityExpansionLimit(),
    ]).toEqual([-1, 0, true, false, "bad"]);
    expect(original.getConnectionTimeout()).toBe(20000);
    expect(changed.getBehaviorProfileId()).toBe("java-owlapi-5.5.1");
  });

  test("writer Java copy quirks and normative value preservation are intentionally different", () => {
    const java = new OWLOntologyWriterConfiguration(javaOptions);
    expect(java.withIndentSize(4)).toBe(java);
    const javaChain = java
      .withIndentSize(2)
      .withBannersEnabled(false)
      .withIndenting(false);
    const normativeChain = new OWLOntologyWriterConfiguration()
      .withIndentSize(2)
      .withBannersEnabled(false)
      .withIndenting(false);
    expect([
      javaChain.isIndenting(),
      javaChain.getIndentSize(),
      javaChain.shouldUseBanners(),
    ]).toEqual([false, 4, true]);
    expect([
      normativeChain.isIndenting(),
      normativeChain.getIndentSize(),
      normativeChain.shouldUseBanners(),
    ]).toEqual([false, 2, false]);
    expect(java.withIndentSize(-1).getIndentSize()).toBe(-1);
    expect(() =>
      new OWLOntologyWriterConfiguration().withIndentSize(-1),
    ).toThrow(RangeError);
  });

  test("the manager's native loader configuration reaches a real asynchronous parse", async () => {
    const manager = OWLManager.createOWLOntologyManager(javaOptions);
    const defaults = manager.getOntologyLoaderConfiguration();
    expect(defaults.getBehaviorProfileId()).toBe("java-owlapi-5.5.1");
    manager.setOntologyLoaderConfiguration(
      defaults.setLoadAnnotationAxioms(false),
    );
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        'Ontology(<urn:config> Declaration(Class(<urn:C>)) AnnotationAssertion(<urn:p> <urn:C> "value"))',
        { format: OWLDocumentFormats.FUNCTIONAL },
      ),
    );
    expect(ontology.getAxiomCount()).toBe(1);
    expect(
      manager.getOntologyWriterConfiguration().getBehaviorProfileId(),
    ).toBe("java-owlapi-5.5.1");
  });
});
