import { OWLManager } from "../apibinding/index.js";
import { IRI } from "./index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { StringDocumentSource, StringDocumentTarget } from "../io/index.js";
import { readFileSync } from "node:fs";

const formats = [
  OWLDocumentFormats.FUNCTIONAL,
  OWLDocumentFormats.TURTLE,
  OWLDocumentFormats.RDF_XML,
  OWLDocumentFormats.OWL_XML,
];
const storageFixture = (manager) => {
  const factory = manager.getOWLDataFactory();
  const ontology = manager.createOntology(
    factory.getOWLOntologyID(
      IRI.create("https://storage.example.test/ontology"),
    ),
  );
  manager.addAxiom(
    ontology,
    factory.getOWLAnnotationAssertionAxiom(
      factory.getRDFSLabel(),
      IRI.create("https://storage.example.test/s"),
      factory.getOWLLiteral("label"),
    ),
  );
  manager.addAxiom(
    ontology,
    factory.getOWLDeclarationAxiom(
      factory.getOWLClass(IRI.create("https://storage.example.test/C")),
    ),
  );
  return ontology;
};

test.each(formats)(
  "Java $key ignores unknown output parameters and consumes the string datatype parameter",
  async (format) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = storageFixture(manager);
    const save = async (selectedFormat) => {
      const target = new StringDocumentTarget();
      await manager.saveOntology(ontology, selectedFormat, target);
      return target.toString();
    };
    const original = await save(format);
    expect(
      await save(format.withParameter("ignored parameter", "not a boolean")),
    ).toBe(original);
    expect(
      await save(format.withParameter("force xsd:string on literals", true)),
    ).not.toBe(original);
    const failed = new StringDocumentTarget();
    await expect(
      manager.saveOntology(
        ontology,
        format.withParameter("force xsd:string on literals", "not a boolean"),
        failed,
      ),
    ).rejects.toThrow();
    if (format === OWLDocumentFormats.OWL_XML) {
      expect(failed.toString()).toMatch(/^<\?xml version="1.0"\?>\n<Ontology/u);
      expect(failed.toString()).toContain("<Declaration>");
      expect(failed.toString()).not.toContain("<AnnotationAssertion>");
      expect(failed.toString()).not.toContain("</Ontology>");
      const native = JSON.parse(
        readFileSync(
          new URL(
            "../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const line = native.observations
        .find((row) => row.probeId === "ObserveStorageContracts")
        .stdout.split("\n")
        .find((row) =>
          row.startsWith(
            "OWL/XML Syntax:parameter:force xsd:string on literals:not a boolean\t",
          ),
        );
      const prefix = line
        .slice(line.indexOf(", ", line.indexOf(", ") + 2) + 2, -1)
        .replaceAll("\\n", "\n");
      expect(failed.toString()).toBe(prefix);
    } else expect(failed.toString()).toBe("");
  },
);

test.each([OWLDocumentFormats.RDF_XML, OWLDocumentFormats.OWL_XML])(
  "Java $key uses the ontology owner's writer configuration for a foreign save",
  async (format) => {
    const owner = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const foreign = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = storageFixture(owner);
    const baseline = new StringDocumentTarget();
    await owner.saveOntology(ontology, format, baseline);
    owner.setOntologyWriterConfiguration(
      owner.getOntologyWriterConfiguration().withIndentSize(2),
    );
    const configured = new StringDocumentTarget();
    await owner.saveOntology(ontology, format, configured);
    expect(configured.toString()).not.toBe(baseline.toString());
    const foreignTarget = new StringDocumentTarget();
    await foreign.saveOntology(ontology, format, foreignTarget);
    expect(foreignTarget.toString()).toBe(configured.toString());
  },
);

test.each(formats)(
  "Java $key writer configuration has the observed renderer effects",
  async (format) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = storageFixture(manager);
    const defaults = manager.getOntologyWriterConfiguration();
    const save = async (configuration) => {
      manager.setOntologyWriterConfiguration(configuration);
      const target = new StringDocumentTarget();
      await manager.saveOntology(ontology, format, target);
      const text = target.toString();
      const roundTrip = await OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-owlapi-5.5.1",
      }).loadOntologyFromOntologyDocument(
        new StringDocumentSource(text, { format }),
      );
      expect(roundTrip.getAxiomCount()).toBe(ontology.getAxiomCount());
      return text;
    };
    const baseline = await save(defaults);
    const effects = {
      functional: [false, false, false, false, false],
      turtle: [false, false, true, false, false],
      rdfxml: [true, true, true, true, false],
      owlxml: [true, true, false, false, false],
    };
    for (const [index, configuration] of [
      defaults.withIndentSize(2),
      defaults.withIndenting(false),
      defaults.withBannersEnabled(false),
      defaults.withLabelsAsBanner(true),
      defaults.withSaveIdsForAllAnonymousIndividuals(true),
    ].entries())
      expect((await save(configuration)) !== baseline).toBe(
        effects[format.key][index],
      );
  },
);

test.each(formats)(
  "Java $key consumes a malformed datatype parameter at the native ontology phase",
  async (format) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = manager.createOntology();
    for (const state of ["empty", "declaration-only"]) {
      if (state === "declaration-only") {
        const factory = manager.getOWLDataFactory();
        manager.addAxiom(
          ontology,
          factory.getOWLDeclarationAxiom(
            factory.getOWLClass(IRI.create("urn:storage:Declared")),
          ),
        );
      }
      await expect(
        manager.saveOntology(
          ontology,
          format.withParameter("force xsd:string on literals", null),
          new StringDocumentTarget(),
        ),
      ).resolves.toBeUndefined();
      const operation = manager.saveOntology(
        ontology,
        format.withParameter("force xsd:string on literals", "not a boolean"),
        new StringDocumentTarget(),
      );
      if (format === OWLDocumentFormats.OWL_XML)
        await expect(operation).resolves.toBeUndefined();
      else await expect(operation).rejects.toThrow();
    }
  },
);

test.each(formats)(
  "Java $key uses the save-IDs preference for a singly referenced anonymous individual",
  async (format) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const factory = manager.getOWLDataFactory();
    const ontology = manager.createOntology();
    manager.addAxiom(
      ontology,
      factory.getOWLObjectPropertyAssertionAxiom(
        factory.getOWLObjectProperty(IRI.create("urn:storage:p")),
        factory.getOWLNamedIndividual(IRI.create("urn:storage:s")),
        factory.getOWLAnonymousIndividual("single-anonymous"),
      ),
    );
    const output = [];
    for (const saveIds of [false, true]) {
      manager.setOntologyWriterConfiguration(
        manager
          .getOntologyWriterConfiguration()
          .withSaveIdsForAllAnonymousIndividuals(saveIds),
      );
      const target = new StringDocumentTarget();
      await manager.saveOntology(ontology, format, target);
      output.push(target.toString());
    }
    expect(output[0] === output[1]).toBe(
      format === OWLDocumentFormats.FUNCTIONAL ||
        format === OWLDocumentFormats.OWL_XML,
    );
  },
);
describe.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s storage contract",
  (behaviorProfileId) => {
    test.each(formats)(
      "$key target reuse, foreign save and negative indentation",
      async (format) => {
        const manager = OWLManager.createOWLOntologyManager({
          behaviorProfileId,
        });
        const ontology = await manager.loadOntologyFromOntologyDocument(
          new StringDocumentSource(
            "Ontology(<https://storage.example.test/ontology> Declaration(Class(<https://storage.example.test/C>)))",
            { format: OWLDocumentFormats.FUNCTIONAL },
          ),
        );
        const target = new StringDocumentTarget();
        await manager.saveOntology(ontology, format, target);
        const first = target.toString();
        await manager.saveOntology(ontology, format, target);
        expect(target.toString()).toBe(
          behaviorProfileId === "java-owlapi-5.5.1" ? first + first : first,
        );
        const foreign = OWLManager.createOWLOntologyManager({
          behaviorProfileId,
        });
        if (behaviorProfileId === "java-owlapi-5.5.1") {
          expect(foreign.getOntologyFormat(ontology)).toBeUndefined();
          const foreignTarget = new StringDocumentTarget();
          await foreign.saveOntology(ontology, format, foreignTarget);
          expect(foreignTarget.toString()).toBe(first);
          manager.setOntologyWriterConfiguration(
            manager.getOntologyWriterConfiguration().withIndentSize(-1),
          );
          await expect(
            manager.saveOntology(ontology, format, target),
          ).resolves.toBeUndefined();
        } else {
          await expect(
            foreign.saveOntology(ontology, format, target),
          ).rejects.toThrow(/not managed/);
          expect(target.toString()).toBe(first);
        }
      },
    );
    test.each([OWLDocumentFormats.RDF_XML, OWLDocumentFormats.OWL_XML])(
      "$key XML character admission follows the selected writer contract",
      async (format) => {
        const manager = OWLManager.createOWLOntologyManager({
          behaviorProfileId,
        });
        const ontology = manager.createOntology();
        const target = new StringDocumentTarget();
        await manager.saveOntology(ontology, format, target);
        const initial = target.toString();
        const factory = manager.getOWLDataFactory();
        manager.addAxiom(
          ontology,
          factory.getOWLAnnotationAssertionAxiom(
            factory.getRDFSLabel(),
            IRI.create("urn:storage:s"),
            factory.getOWLLiteral("invalid\u0000xml"),
          ),
        );
        if (behaviorProfileId === "java-owlapi-5.5.1")
          await expect(
            manager.saveOntology(ontology, format, target),
          ).resolves.toBeUndefined();
        else {
          await expect(
            manager.saveOntology(ontology, format, target),
          ).rejects.toThrow();
          expect(target.toString()).toBe(initial);
        }
      },
    );
    test("RDF/XML's Java XML-literal failure retains the emitted prefix", async () => {
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      });
      const factory = manager.getOWLDataFactory();
      const ontology = manager.createOntology(
        factory.getOWLOntologyID(
          IRI.create("https://storage.example.test/malformed"),
        ),
      );
      const target = new StringDocumentTarget();
      await manager.saveOntology(
        ontology,
        OWLDocumentFormats.FUNCTIONAL,
        target,
      );
      const initial = target.toString();
      manager.addAxiom(
        ontology,
        factory.getOWLAnnotationAssertionAxiom(
          factory.getRDFSLabel(),
          IRI.create("https://storage.example.test/s"),
          factory.getOWLLiteral(
            "<unclosed>",
            factory.getOWLDatatype(
              IRI.create(
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral",
              ),
            ),
          ),
        ),
      );
      const saving = manager.saveOntology(
        ontology,
        OWLDocumentFormats.RDF_XML,
        target,
      );
      if (behaviorProfileId === "java-owlapi-5.5.1") {
        await expect(saving).rejects.toThrow();
        expect(
          target.toString().startsWith(initial + '<?xml version="1.0"?>'),
        ).toBe(true);
        expect(target.toString()).toMatch(
          /<rdfs:label rdf:parseType="Literal">$/u,
        );
        expect(target.toString()).not.toContain("<unclosed>");
      } else {
        await expect(saving).resolves.toBeUndefined();
        expect(target.toString()).toContain("&lt;unclosed&gt;");
      }
    });
  },
);
