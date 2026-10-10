import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import { StringDocumentSource } from "../../../io/stringDocumentSource.js";
import { readDocumentFormatParameters } from "../../../model/owlDocumentFormat.js";
import { OWL_OBJECT_KINDS } from "../../../model/kinds.js";
import { validateStructuralGraph } from "../../model/structuralValidation.js";
import { createTurtleSyntaxAdapter } from "../../parsing/rdf/n3SyntaxAdapter.js";
import {
  createRdfStorageOntology,
  mapStorageOntologyToRdf,
  rdfStorageConfiguration,
  verifyRdfStorage,
} from "../rdfStorage.js";

// Same admission as the existing lossless RDF writer and parser recheck.
const MAX_OUTPUT_BYTES = 33554432;

/** Exact Turtle through the locked native N3 writer and shared lossless gate. */
export const turtleStorer = Object.freeze({
  formatKey: OWLDocumentFormats.TURTLE.key,
  async render(snapshot, format) {
    if (Object.keys(readDocumentFormatParameters(format)).length)
      throw new OWLOntologyStorageError(
        "Turtle storage does not support output parameters",
      );
    const configuration = rdfStorageConfiguration(snapshot);
    if (snapshot.directAxioms.length > configuration.maxAxioms)
      throw new ResourceLimitError("Turtle axiom limit exceeded", {
        resource: "maxAxioms",
        limit: configuration.maxAxioms,
      });
    // Bound the recursive normative RDF mapper before it allocates a graph;
    // a later parser recheck cannot protect the earlier mapping phase.
    const supportedKinds = new Set(OWL_OBJECT_KINDS);
    for (const values of [
      [snapshot.ontologyID],
      snapshot.authoredImportDeclarations,
      snapshot.directOntologyAnnotations,
      snapshot.directAxioms,
    ])
      for (const value of values)
        validateStructuralGraph(
          value,
          supportedKinds,
          configuration.maxExpressionDepth,
          configuration.maxAnnotationDepth,
        );
    const original = createRdfStorageOntology(snapshot);
    const dataset = mapStorageOntologyToRdf(original, {
      maxQuads: configuration.maxQuads,
    });
    const chunks = [];
    const encoder = new TextEncoder();
    let bytes = 0;
    const { Writer } = await import("n3");
    const writer = new Writer(
      {
        write(chunk, _encoding, done) {
          bytes += encoder.encode(chunk).byteLength;
          if (bytes > MAX_OUTPUT_BYTES)
            throw new ResourceLimitError("Turtle output byte limit exceeded", {
              resource: "outputBytes",
              limit: MAX_OUTPUT_BYTES,
            });
          chunks.push(chunk);
          done?.();
          return true;
        },
        end(done) {
          done?.();
        },
      },
      { format: "text/turtle" },
    );
    for (const quad of dataset) {
      if (quad.graph.termType !== "DefaultGraph")
        throw new OWLOntologyStorageError("Turtle requires a default graph", {
          reason: "ONTOLOGY_NOT_REPRESENTABLE",
        });
      writer.addQuad(quad);
    }
    await new Promise((resolve, reject) =>
      writer.end((error) => (error ? reject(error) : resolve())),
    );
    const text = chunks.join("");
    const parsed = await createTurtleSyntaxAdapter().parse(
      new StringDocumentSource(text),
      configuration,
    );
    await verifyRdfStorage(original, parsed.dataset, configuration, "Turtle");
    return text;
  },
});
