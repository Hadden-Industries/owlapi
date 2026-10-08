import { readFileSync } from "node:fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as publicApi from "@hadden-industries/owlapi";
import { createPublicContract } from "./public-contract.js";
const {
  exerciseImportClosureStorage,
  exerciseParserPreservation,
  verifyCollapsedText,
} = createPublicContract(publicApi);

const documents = Object.fromEntries(
  ["root", "left", "right", "leaf"].map((name) => [
    name,
    readFileSync(
      new URL(`./fixtures/closure/${name}.ofn`, import.meta.url),
      "utf8",
    ),
  ]),
);

describe("public import-closure storage composition", () => {
  it("qualifies DL and KRSS1 source preservation through public APIs", async () => {
    expect(await exerciseParserPreservation()).toEqual({
      modes: ["strict", "compatible", "preserve"],
      literalCount: 5,
      formats: ["dl", "functional", "krss1"],
      storage: ["functional", "rdfxml"],
      fatalImport: true,
      source: "valid",
      literalBudget: "unverified",
    });
  });
  let result;
  beforeAll(async () => {
    result = await exerciseImportClosureStorage(documents);
  });

  it("preserves the complete closure union and root-only metadata in both formats", () => {
    expect(result.summary).toEqual({
      closureCount: 4,
      importLoadCount: 3,
      directAxiomCount: 26,
      rootAnnotationCount: 1,
      anonymousIndividualCount: 4,
      formats: ["functional", "rdfxml"],
      reloadLoaderCalls: 0,
      diagnosticCount: 0,
      retainedTargetAfterFailure: true,
      sourceReaderPreserved: true,
    });
  });

  it.each(["functional", "rdfxml"])(
    "rejects version, annotation, datatype, language, and lexical mutations in %s",
    async (format) => {
      const original = result.documents[format];
      for (const [before, after] of [
        ["urn:lifecycle:root:v1", "urn:lifecycle:root:v2"],
        ["root metadata", "changed root metadata"],
        ["axiom note", "changed axiom note"],
        ["#integer", "#decimal"],
        ["root value", "changed literal value"],
        [
          format === "functional" ? "@en" : 'xml:lang="en"',
          format === "functional" ? "@de" : 'xml:lang="de"',
        ],
      ]) {
        expect(original).toContain(before);
        const mutation = original.replace(before, after);
        await expect(
          verifyCollapsedText(mutation, result.structure),
        ).rejects.toThrow();
      }
    },
  );

  it("rejects axiom, import, version removal, and anonymous-sharing mutations in Functional Syntax", async () => {
    const original = result.documents.functional;
    const selfEdge =
      /ObjectPropertyAssertion\(<urn:lifecycle:next> (_:[^ ]+) \1\)/u;
    expect(original).toMatch(selfEdge);
    for (const mutation of [
      original.replace("Declaration(Class(<urn:lifecycle:Leaf>))", ""),
      original.replace(/\)\s*$/u, "Declaration(Class(<urn:lifecycle:Added>)))"),
      original.replace("<urn:lifecycle:root:v1>", ""),
      original.replace(
        'Annotation(<urn:lifecycle:note> "root metadata"^^<http://www.w3.org/2001/XMLSchema#string>)',
        "",
      ),
      original.replace(
        '"01"^^<http://www.w3.org/2001/XMLSchema#integer>',
        '"01"',
      ),
      original.replace('"root value"@en', '"root value"'),
      original.replace(
        selfEdge,
        "ObjectPropertyAssertion(<urn:lifecycle:next> $1 _:unanchored)",
      ),
    ]) {
      expect(mutation).not.toBe(original);
      await expect(
        verifyCollapsedText(mutation, result.structure),
      ).rejects.toThrow();
    }
    const withImport = original.replace(
      "<urn:lifecycle:root:v1>",
      "<urn:lifecycle:root:v1> Import(<urn:lifecycle:unexpected>)",
    );
    await expect(
      verifyCollapsedText(withImport, result.structure),
    ).rejects.toThrow();
  });

  it("rejects RDF/XML axiom, metadata, import, sharing, and ignored-triple mutations", async () => {
    const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    const owl = "http://www.w3.org/2002/07/owl#";
    const original = result.documents.rdfxml;
    const descriptions = (document) =>
      Array.from(document.getElementsByTagNameNS("*", "*")).filter(
        (element) =>
          element.hasAttributeNS(rdf, "about") ||
          element.hasAttributeNS(rdf, "nodeID"),
      );
    const description = (document, iri) =>
      descriptions(document).find(
        (element) => element.getAttributeNS(rdf, "about") === iri,
      );
    const property = (element, iri) =>
      Array.from(element.childNodes).find(
        (child) => child.namespaceURI + child.localName === iri,
      );
    const removeProperty = (element, iri) => {
      const child = property(element, iri);
      expect(child).toBeDefined();
      element.removeChild(child);
    };
    const mutations = [
      (document) =>
        removeProperty(
          description(document, "urn:lifecycle:Leaf"),
          "http://www.w3.org/2000/01/rdf-schema#subClassOf",
        ),
      (document) => {
        const added = document.createElementNS(owl, "owl:Class");
        added.setAttributeNS(rdf, "rdf:about", "urn:lifecycle:Added");
        document.documentElement.appendChild(added);
      },
      (document) =>
        removeProperty(
          description(document, "urn:lifecycle:root"),
          "urn:lifecycle:note",
        ),
      (document) =>
        removeProperty(
          description(document, "urn:lifecycle:root"),
          `${owl}versionIRI`,
        ),
      (document) => {
        const imported = document.createElementNS(owl, "owl:imports");
        imported.setAttributeNS(
          rdf,
          "rdf:resource",
          "urn:lifecycle:unexpected",
        );
        description(document, "urn:lifecycle:root").appendChild(imported);
      },
      (document) => {
        const subjects = descriptions(document).filter((element) =>
          property(element, "urn:lifecycle:origin"),
        );
        expect(subjects).toHaveLength(4);
        property(subjects[0], "urn:lifecycle:next").setAttributeNS(
          rdf,
          "rdf:nodeID",
          subjects[1].getAttributeNS(rdf, "nodeID"),
        );
      },
      (document) => {
        const rootIndividual = descriptions(document).find((element) =>
          property(element, "urn:lifecycle:count"),
        );
        property(rootIndividual, "urn:lifecycle:count").removeAttributeNS(
          rdf,
          "datatype",
        );
      },
      (document) => {
        const rootIndividual = descriptions(document).find((element) =>
          property(element, "urn:lifecycle:title"),
        );
        property(rootIndividual, "urn:lifecycle:title").removeAttributeNS(
          "http://www.w3.org/XML/1998/namespace",
          "lang",
        );
      },
      (document) => {
        const ignored = document.createElementNS(
          "urn:unknown:",
          "unknown:predicate",
        );
        ignored.appendChild(document.createTextNode("must not disappear"));
        description(document, "urn:lifecycle:root").appendChild(ignored);
      },
    ];
    for (const mutate of mutations) {
      const document = new DOMParser().parseFromString(
        original,
        "application/xml",
      );
      mutate(document);
      const text = new XMLSerializer().serializeToString(
        document.documentElement,
        {
          requireWellFormed: true,
        },
      );
      expect(text).not.toBe(original);
      await expect(
        verifyCollapsedText(text, result.structure),
      ).rejects.toThrow();
    }
  });
});
