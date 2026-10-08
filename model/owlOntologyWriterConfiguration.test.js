import { jest } from "@jest/globals";
import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import {
  StringDocumentSource,
  StringDocumentTarget,
  OWLOntologyStorageError,
} from "../io/index.js";
import { OWLOntologyWriterConfiguration } from "./index.js";
import { RdfXmlSyntaxAdapter } from "../internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import { compareOntologies } from "../internal/model/ontologyStructuralIsomorphism.js";

const values = (configuration) => [
  configuration.isIndenting(),
  configuration.getIndentSize(),
  configuration.shouldUseBanners(),
  configuration.isLabelsAsBanner(),
];
const makeOntology = (manager) =>
  manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(`Ontology(<urn:formatting:ontology>
  Declaration(Class(<urn:formatting:C>))
  AnnotationAssertion(<http://www.w3.org/2000/01/rdf-schema#label> <urn:formatting:C> "Zulu"@en)
  AnnotationAssertion(<http://www.w3.org/2000/01/rdf-schema#label> <urn:formatting:C> "Alpha -- -")
)`),
  );
const save = async (manager, ontology, format = OWLDocumentFormats.RDF_XML) => {
  const target = new StringDocumentTarget();
  await manager.saveOntology(ontology, format, target);
  return target.toString();
};

describe("immutable manager-owned ontology writer configuration", () => {
  it("has native immutable defaults and preserves every unrelated field in both chaining orders", () => {
    const defaults = new OWLOntologyWriterConfiguration();
    expect(Object.isFrozen(defaults)).toBe(true);
    expect(values(defaults)).toEqual([true, 4, true, false]);
    const configured = defaults
      .withIndentSize(2)
      .withBannersEnabled(false)
      .withLabelsAsBanner(true)
      .withIndenting(false);
    const reverse = defaults
      .withIndenting(false)
      .withLabelsAsBanner(true)
      .withBannersEnabled(false)
      .withIndentSize(2);
    expect(values(configured)).toEqual([false, 2, false, true]);
    expect(values(reverse)).toEqual(values(configured));
    expect(values(defaults)).toEqual([true, 4, true, false]);
    expect(values(configured.withIndenting(false))).toEqual(values(configured));
    for (const name of [
      "withIndenting",
      "withBannersEnabled",
      "withLabelsAsBanner",
    ]) {
      for (const bad of [null, undefined, 0, 1, "true", {}, new Boolean(true)])
        expect(() => defaults[name](bad)).toThrow(TypeError);
    }
    for (const bad of [null, undefined, "2", true, {}])
      expect(() => defaults.withIndentSize(bad)).toThrow(TypeError);
    for (const bad of [-1, 0.5, NaN, Infinity, 2147483648])
      expect(() => defaults.withIndentSize(bad)).toThrow(RangeError);
    expect(defaults.withIndentSize(2147483647).getIndentSize()).toBe(
      2147483647,
    );
    expect(Object.is(defaults.withIndentSize(-0).getIndentSize(), 0)).toBe(
      true,
    );
    expect(() => new OWLOntologyWriterConfiguration({})).toThrow(TypeError);
  });

  it.each([true, false])(
    "publicly saves a long literal enumeration with indentation %s",
    async (indenting) => {
      const manager = OWLManager.createOWLOntologyManager();
      manager.setOntologyWriterConfiguration(
        new OWLOntologyWriterConfiguration().withIndenting(indenting),
      );
      const ontology = await manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(`Ontology(<urn:long:ontology>
        Declaration(DataProperty(<urn:long:property>))
        DataPropertyRange(<urn:long:property> DataOneOf(${Array.from({ length: 200 }, (_, index) => `"${index}"`).join(" ")}))
      )`),
      );
      const text = await save(manager, ontology);
      const reloaded =
        await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          new StringDocumentSource(text),
        );
      expect(compareOntologies(ontology, reloaded).equal).toBe(true);
    },
  );

  it("rejects forged and proxied configurations without replacing previous manager state", () => {
    const manager = OWLManager.createOWLOntologyManager();
    const previous = manager.getOntologyWriterConfiguration();
    for (const bad of [
      null,
      undefined,
      {},
      Object.freeze(Object.create(OWLOntologyWriterConfiguration.prototype)),
      new Proxy(previous, {}),
    ]) {
      expect(() => manager.setOntologyWriterConfiguration(bad)).toThrow(
        TypeError,
      );
      expect(manager.getOntologyWriterConfiguration()).toBe(previous);
    }
    const next = previous.withIndentSize(2);
    expect(manager.setOntologyWriterConfiguration(next)).toBeUndefined();
    expect(manager.getOntologyWriterConfiguration()).toBe(next);
    expect(
      OWLManager.createOWLOntologyManager()
        .getOntologyWriterConfiguration()
        .getIndentSize(),
    ).toBe(4);
  });

  it("preserves defaults, exposes real settings, preserves structure, and scopes settings to RDF/XML", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await makeOntology(manager);
    const baseline = await save(manager, ontology);
    const functional = await save(
      manager,
      ontology,
      OWLDocumentFormats.FUNCTIONAL,
    );
    manager.setOntologyWriterConfiguration(
      new OWLOntologyWriterConfiguration(),
    );
    expect(await save(manager, ontology)).toBe(baseline);
    expect(baseline).toContain("\n    <owl:Ontology ");
    expect(baseline).toContain("<!-- urn:formatting:C -->");
    const defaults = new OWLOntologyWriterConfiguration();
    for (const indenting of [false, true])
      for (const indentSize of [0, 2, 4])
        for (const banners of [false, true])
          for (const labels of [false, true]) {
            manager.setOntologyWriterConfiguration(
              defaults
                .withIndenting(indenting)
                .withIndentSize(indentSize)
                .withBannersEnabled(banners)
                .withLabelsAsBanner(labels),
            );
            const text = await save(manager, ontology);
            expect(text.includes("<!--")).toBe(banners);
            if (banners)
              expect(text).toContain(
                labels ? "<!-- Alpha - - - -->" : "<!-- urn:formatting:C -->",
              );
            expect(text).toContain(
              `\n${" ".repeat(indenting ? indentSize : 0)}<owl:Ontology `,
            );
            const loaded =
              await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
                new StringDocumentSource(text),
              );
            expect(compareOntologies(ontology, loaded).equal).toBe(true);
          }
    expect(await save(manager, ontology, OWLDocumentFormats.FUNCTIONAL)).toBe(
      functional,
    );
  });

  it("captures each save before suspension and finishes them in reverse order", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await makeOntology(manager);
    const originalParse = RdfXmlSyntaxAdapter.prototype.parse;
    const releases = [];
    const observation = jest
      .spyOn(RdfXmlSyntaxAdapter.prototype, "parse")
      .mockImplementation(async function (...args) {
        await new Promise((resolve) => releases.push(resolve));
        return originalParse.apply(this, args);
      });
    try {
      const first = new StringDocumentTarget();
      const second = new StringDocumentTarget();
      manager.setOntologyWriterConfiguration(
        new OWLOntologyWriterConfiguration().withIndentSize(2),
      );
      const firstSave = manager.saveOntology(
        ontology,
        OWLDocumentFormats.RDF_XML,
        first,
      );
      manager.setOntologyWriterConfiguration(
        new OWLOntologyWriterConfiguration().withBannersEnabled(false),
      );
      const secondSave = manager.saveOntology(
        ontology,
        OWLDocumentFormats.RDF_XML,
        second,
      );
      expect(releases).toHaveLength(2);
      releases[1]();
      await secondSave;
      expect(first.toString()).toBe("");
      releases[0]();
      await firstSave;
      expect(first.toString()).toContain("\n  <owl:Ontology ");
      expect(first.toString()).toContain("<!--");
      expect(second.toString()).toContain("\n    <owl:Ontology ");
      expect(second.toString()).not.toContain("<!--");
    } finally {
      observation.mockRestore();
    }
  });

  it("rejects excessive legal indentation before allocation and keeps the target atomic", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await makeOntology(manager);
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target);
    const previous = target.toString();
    manager.setOntologyWriterConfiguration(
      new OWLOntologyWriterConfiguration().withIndentSize(2147483647),
    );
    await expect(
      manager.saveOntology(ontology, OWLDocumentFormats.RDF_XML, target),
    ).rejects.toBeInstanceOf(OWLOntologyStorageError);
    expect(target.toString()).toBe(previous);
    manager.setOntologyWriterConfiguration(
      manager.getOntologyWriterConfiguration().withIndenting(false),
    );
    expect(await save(manager, ontology)).toContain("<owl:Class ");
    await expect(
      manager.saveOntology(
        ontology,
        OWLDocumentFormats.RDF_XML.withParameter("pretty", true),
        target,
      ),
    ).rejects.toBeInstanceOf(OWLOntologyStorageError);
  });
});
