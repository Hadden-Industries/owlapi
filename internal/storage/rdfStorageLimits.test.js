import { expect, jest, test } from "@jest/globals";
import {
  OWLDocumentFormats,
  OWLManager,
  StreamDocumentTarget,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../index.js";
import { replaceStringDocumentTargetText } from "../../io/stringDocumentTarget.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import { readOntologyWriterConfiguration } from "../../model/owlOntologyWriterConfiguration.js";
import { defaultBehaviorProfileDefinition } from "../behavior/ontologyBehaviorContext.js";
import { createRdfXmlStorer } from "./rdfxml/rdfXmlStorer.js";
import { StorerRegistry } from "./storerRegistry.js";
import { turtleStorer } from "./turtle/turtleStorer.js";

test.each([OWLDocumentFormats.RDF_XML, OWLDocumentFormats.TURTLE])(
  "rejects an over-depth snapshot before publishing $key",
  async (format) => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        "Ontology(<urn:storage:limits> Declaration(Class(<urn:storage:Class>)))",
        { format: OWLDocumentFormats.FUNCTIONAL },
      ),
    );
    const snapshot = readOntologySnapshot(ontology);
    const writer = readOntologyWriterConfiguration(
      manager.getOntologyWriterConfiguration(),
    );
    const behavior = {
      ...defaultBehaviorProfileDefinition,
      documentStoragePolicy: {
        ...defaultBehaviorProfileDefinition.documentStoragePolicy,
        maxStructureDepth: 1,
      },
    };
    const mapOntologyToRdf = jest.fn();
    const registry = new StorerRegistry([
      createRdfXmlStorer({ mapOntologyToRdf }),
      turtleStorer,
    ]);
    const string = new StringDocumentTarget();
    replaceStringDocumentTargetText(string, "prior complete document");
    const sink = jest.fn();
    const stream = new StreamDocumentTarget(sink);
    for (const target of [string, stream]) {
      const operation = registry.store(
        snapshot,
        format,
        target,
        writer,
        behavior,
      );
      await expect(operation).rejects.toMatchObject({
        code: "ONTOLOGY_STORAGE_FAILED",
        cause: {
          code: "RESOURCE_LIMIT_EXCEEDED",
          resource: "expressionDepth",
          limit: 1,
        },
      });
      await expect(operation).rejects.not.toHaveProperty("reason");
    }
    expect(string.toString()).toBe("prior complete document");
    expect(sink).not.toHaveBeenCalled();
    expect(mapOntologyToRdf).not.toHaveBeenCalled();
  },
);
