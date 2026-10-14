import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { StringDocumentSource, StringDocumentTarget } from "../io/index.js";
import { OWL2DLProfile } from "../profiles/index.js";
import { ManchesterOWLSyntaxOWLObjectRendererImpl } from "../manchestersyntax/renderer/index.js";
import {
  AddImport,
  IRI,
  OWLOntologyLoaderConfiguration,
  SetOntologyID,
} from "./index.js";

const behaviorProfileId = "java-owlapi-5.5.1";
const createManager = (options) =>
  OWLManager.createOWLOntologyManager({ behaviorProfileId, ...options });
const source = (text, documentIRI) =>
  new StringDocumentSource(text, {
    format: OWLDocumentFormats.FUNCTIONAL,
    documentIRI,
  });

test("Java-produced structural values survive mutation, storage, rendering and profile checking", async () => {
  const manager = createManager();
  const factory = manager.getOWLDataFactory();
  const ontology = manager.createOntology();
  const owlClass = factory.getOWLClass(IRI.create("urn:integration:C"));
  const enumeration = factory.getOWLObjectOneOf([]);
  const literal = factory.getOWLLiteral(
    "hello@EN",
    factory.getOWLDatatype(
      IRI.create("http://www.w3.org/1999/02/22-rdf-syntax-ns#PlainLiteral"),
    ),
  );
  manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(owlClass));
  expect(
    manager.addAxiom(
      ontology,
      factory.getOWLSubClassOfAxiom(owlClass, enumeration),
    ),
  ).toBe("SUCCESSFULLY");
  expect(
    manager.addAxiom(
      ontology,
      factory.getOWLAnnotationAssertionAxiom(
        factory.getRDFSLabel(),
        IRI.create("urn:integration:s"),
        literal,
      ),
    ),
  ).toBe("SUCCESSFULLY");
  expect(literal.language).toBe("EN");
  for (const format of [
    OWLDocumentFormats.FUNCTIONAL,
    OWLDocumentFormats.OWL_XML,
    OWLDocumentFormats.TURTLE,
    OWLDocumentFormats.RDF_XML,
  ]) {
    const target = new StringDocumentTarget();
    await expect(
      manager.saveOntology(ontology, format, target),
    ).resolves.toBeUndefined();
  }
  expect(
    new ManchesterOWLSyntaxOWLObjectRendererImpl({ behaviorProfileId }).render(
      enumeration,
    ),
  ).toBe("{}");
  const report = await new OWL2DLProfile({ behaviorProfileId }).checkOntology(
    ontology,
  );
  expect(report.isInProfile()).toBe(false);
  expect(
    report
      .getViolations()
      .some(({ code }) => code === "STRUCTURAL_OBJECT_INVALID"),
  ).toBe(false);
});

test.each(["load", "change", "late-registration"])(
  "Java %s resolves multiple versions without a normative ambiguity error",
  async (route) => {
    const manager = createManager();
    const factory = manager.getOWLDataFactory();
    const common = IRI.create("urn:integration:common");
    const declaration = factory.getOWLImportsDeclaration(common);
    let root;
    if (route === "late-registration") {
      root = manager.createOntology();
      manager.applyChange(new AddImport(root, declaration));
    }
    const first = manager.createOntology(
      factory.getOWLOntologyID(common, IRI.create("urn:integration:v1")),
    );
    const second = manager.createOntology(
      factory.getOWLOntologyID(common, IRI.create("urn:integration:v2")),
    );
    if (route === "load")
      root = await manager.loadOntologyFromOntologyDocument(
        source("Ontology(Import(<urn:integration:common>))"),
      );
    else if (route === "change") {
      root = manager.createOntology();
      expect(manager.applyChange(new AddImport(root, declaration))).toBe(
        "SUCCESSFULLY",
      );
    }
    const closure = manager.getImportsClosure(root);
    expect(closure.size).toBe(2);
    expect(closure.has(first) || closure.has(second)).toBe(true);
  },
);

test("Java import lookup prefers an exact unversioned ontology before other versions", async () => {
  const manager = createManager();
  const factory = manager.getOWLDataFactory();
  const common = IRI.create("urn:integration:preferred");
  manager.createOntology(
    factory.getOWLOntologyID(common, IRI.create("urn:integration:version")),
  );
  const unversioned = manager.createOntology(factory.getOWLOntologyID(common));
  const root = await manager.loadOntologyFromOntologyDocument(
    source("Ontology(Import(<urn:integration:preferred>))"),
  );
  expect(manager.getImportsClosure(root)).toEqual(new Set([root, unversioned]));
});

test("Java occupied rename withdraws the displaced document alias", async () => {
  const manager = createManager();
  const factory = manager.getOWLDataFactory();
  const replacement = manager.createOntology(
    factory.getOWLOntologyID(IRI.create("urn:integration:replacement")),
  );
  const displacedDocumentIRI = IRI.create("urn:integration:displaced-document");
  const displaced = await manager.loadOntologyFromOntologyDocument(
    source("Ontology(<urn:integration:displaced>)", displacedDocumentIRI),
  );
  const root = manager.createOntology();
  expect(
    manager.applyChange(
      new SetOntologyID(replacement, displaced.getOntologyID()),
    ),
  ).toBe("SUCCESSFULLY");
  expect(
    manager.applyChange(
      new AddImport(
        root,
        factory.getOWLImportsDeclaration(displacedDocumentIRI),
      ),
    ),
  ).toBe("SUCCESSFULLY");
  expect(manager.getImportsClosure(root)).toEqual(new Set([root]));
});

test("an overridden public configuration getter cannot select a different parser policy", async () => {
  class MislabelledConfiguration extends OWLOntologyLoaderConfiguration {
    getBehaviorProfileId() {
      return "normative-v1";
    }
  }
  const manager = createManager();
  const configuration = new MislabelledConfiguration({ behaviorProfileId });
  await expect(
    manager.loadOntologyFromOntologyDocument(
      "Ontology(SubClassOf(<urn:C> DataSomeValuesFrom(<urn:p> <urn:q> <http://www.w3.org/2001/XMLSchema#string>)))",
      configuration,
    ),
  ).rejects.toThrow();
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s reauthorizes externally acquired imports without authorizing in-memory ontologies",
  async (profile) => {
    let permitted = true;
    let acquisitions = 0;
    let authorizations = 0;
    const manager = createManager({
      behaviorProfileId: profile,
      documentLoader: {
        authorize() {
          authorizations++;
          return permitted;
        },
        load() {
          acquisitions++;
          return source(
            "Ontology(<urn:integration:protected> Declaration(Class(<urn:integration:Secret>)))",
          );
        },
      },
    });
    await manager.loadOntologyFromOntologyDocument(
      source(
        "Ontology(<urn:integration:first> Import(<urn:integration:protected>))",
      ),
    );
    permitted = false;
    await expect(
      manager.loadOntologyFromOntologyDocument(
        source(
          "Ontology(<urn:integration:second> Import(<urn:integration:protected>))",
        ),
      ),
    ).rejects.toThrow(/denied/);
    expect(acquisitions).toBe(1);
    expect(authorizations).toBe(2);
    const local = manager.createOntology(
      manager
        .getOWLDataFactory()
        .getOWLOntologyID(IRI.create("urn:integration:local")),
    );
    const localRoot = await manager.loadOntologyFromOntologyDocument(
      source(
        "Ontology(<urn:integration:local-root> Import(<urn:integration:local>))",
      ),
    );
    expect(manager.getImportsClosure(localRoot)).toEqual(
      new Set([localRoot, local]),
    );
    expect(authorizations).toBe(2);
  },
);

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s reauthorizes nested external content when reusing its imported parent",
  async (profile) => {
    let permitsNestedImport = true;
    const manager = createManager({
      behaviorProfileId: profile,
      documentLoader: {
        authorize: (iri) =>
          permitsNestedImport || iri.value !== "urn:integration:nested",
        load: (iri) =>
          source(
            iri.value === "urn:integration:parent"
              ? "Ontology(<urn:integration:parent> Import(<urn:integration:nested>))"
              : "Ontology(<urn:integration:nested> Declaration(Class(<urn:integration:Secret>)))",
          ),
      },
    });
    await manager.loadOntologyFromOntologyDocument(
      source(
        "Ontology(<urn:integration:outer1> Import(<urn:integration:parent>))",
      ),
    );
    permitsNestedImport = false;
    await expect(
      manager.loadOntologyFromOntologyDocument(
        source(
          "Ontology(<urn:integration:outer2> Import(<urn:integration:parent>))",
        ),
      ),
    ).rejects.toThrow(/denied/);
  },
);
