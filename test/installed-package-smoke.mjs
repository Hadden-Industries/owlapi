import assert from "node:assert/strict";
import { createPublicContract } from "./import-closure/public-contract.js";

import * as root from "owlapi";
const { exerciseParserPreservation } = createPublicContract(root);
import { OWLManager } from "owlapi/apibinding";
import { OWLDocumentFormats } from "owlapi/formats";
import {
  StringDocumentSource,
  StringDocumentTarget,
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
  RDFParserMetaData,
  RDFOntologyHeaderStatus,
} from "owlapi/io";
import { OWLOntologyManager } from "owlapi/model";
import {
  OWLOntologyImportsClosureSetProvider,
  OWLOntologyMerger,
} from "owlapi/util";

// This script deliberately uses only package specifiers. Running the same file
// from an isolated consumer proves the packed dependency closure and public
// manager workflow without giving the test a source-tree escape hatch.
assert.strictEqual(root.OWLManager, OWLManager);
assert.strictEqual(root.OWLDocumentFormats, OWLDocumentFormats);
assert.strictEqual(root.StringDocumentSource, StringDocumentSource);
assert.strictEqual(root.StringDocumentTarget, StringDocumentTarget);
assert.strictEqual(root.OWLOntologyStorageError, OWLOntologyStorageError);
assert.strictEqual(root.OWLStorerNotFoundError, OWLStorerNotFoundError);
assert.strictEqual(root.RDFParserMetaData, RDFParserMetaData);
assert.strictEqual(root.RDFOntologyHeaderStatus, RDFOntologyHeaderStatus);
const target = new StringDocumentTarget();
assert.equal(target.toString(), "");
assert.equal(target.getText, undefined);
const storageFailure = new OWLOntologyStorageError("Cannot preserve ontology", {
  reason: "ONTOLOGY_NOT_REPRESENTABLE",
});
assert.equal(storageFailure.reason, "ONTOLOGY_NOT_REPRESENTABLE");
assert.equal(storageFailure.code, "ONTOLOGY_STORAGE_FAILED");
assert.ok(
  new OWLStorerNotFoundError(OWLDocumentFormats.FUNCTIONAL) instanceof
    OWLOntologyStorageError,
);
assert.strictEqual(root.OWLOntologyManager, OWLOntologyManager);
assert.strictEqual(
  root.OWLOntologyImportsClosureSetProvider,
  OWLOntologyImportsClosureSetProvider,
);
assert.strictEqual(root.OWLOntologyMerger, OWLOntologyMerger);

const manager = OWLManager.createOWLOntologyManager();
assert.ok(manager instanceof OWLOntologyManager);

const ontology = await manager.loadOntologyFromOntologyDocument(
  new StringDocumentSource(
    `<?xml version="1.0"?>
     <rdf:RDF
       xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
       xmlns:owl="http://www.w3.org/2002/07/owl#">
       <owl:Ontology rdf:about="https://example.com/installed-smoke" />
     </rdf:RDF>`,
    {
      contentType: "application/rdf+xml",
      documentIRI: "https://example.com/installed-smoke.owl",
    },
  ),
);

assert.equal(ontology.getAxioms().size, 0);
assert.equal(ontology.getImportsDeclarations().size, 0);
const profile = new root.OWL2DLProfile();
assert.equal((await profile.checkOntology(ontology)).status, "valid");
assert.equal(
  (await profile.checkOntology(ontology, { timeoutMs: null })).status,
  "valid",
);
await assert.rejects(
  profile.checkOntology(ontology, { timeoutMs: undefined }),
  TypeError,
);
const parserMetadata = manager
  .getOntologyFormat(ontology)
  .getOntologyLoaderMetaData();
assert.ok(parserMetadata instanceof RDFParserMetaData);
assert.equal(parserMetadata.getTripleCount(), 1);
assert.equal(
  parserMetadata.getHeaderState(),
  RDFOntologyHeaderStatus.PARSED_ONE_HEADER,
);
assert.deepEqual(parserMetadata.getUnparsedTriples(), []);
const outputManager = OWLManager.createOWLOntologyManager();
const provider = new OWLOntologyImportsClosureSetProvider(manager, ontology);
const merged = new OWLOntologyMerger(provider).createMergedOntology(
  outputManager,
);
assert.equal(provider.ontologies().size, 1);
assert.equal(merged.getAxioms().size, ontology.getAxioms().size);
assert.equal(merged.getImportsDeclarations().size, 0);
assert.equal(merged.getOntologyID().ontologyIRI, undefined);
assert.deepEqual(await exerciseParserPreservation(), {
  modes: ["strict", "compatible", "preserve"],
  literalCount: 5,
  formats: ["dl", "functional", "krss1"],
  storage: ["functional", "rdfxml"],
  fatalImport: true,
  source: "valid",
  literalBudget: "unverified",
});
process.stdout.write("Installed owlapi public-boundary smoke test passed\n");
