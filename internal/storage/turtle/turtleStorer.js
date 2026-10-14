import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import { StringDocumentSource } from "../../../io/stringDocumentSource.js";
import {
  readStorageFormatParameters,
  readForceStringDatatype,
} from "../storageFormatParameters.js";
import { XSD_NAMESPACE, RDF_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { rdfEntitySectionName } from "../rdfEntitySections.js";
import { readAnonymousIndividualRdfNodes } from "../../mapping/owlToRdfTranslator.js";
import { OWL_OBJECT_KINDS } from "../../../model/kinds.js";
import { validateStructuralGraph } from "../../model/structuralValidation.js";
import {
  defaultDocumentStoragePolicy,
  defaultBehaviorProfileDefinition,
} from "../../behavior/ontologyBehaviorContext.js";
import { createTurtleSyntaxAdapter } from "../../parsing/rdf/n3SyntaxAdapter.js";
import {
  createRdfStorageOntology,
  mapStorageOntologyToRdf,
  rdfStorageConfiguration,
  verifyRdfStorage,
} from "../rdfStorage.js";

// Same admission as the existing lossless RDF writer and parser recheck.

/** Exact Turtle through the locked native N3 writer and shared lossless gate. */
export const turtleStorer = Object.freeze({
  formatKey: OWLDocumentFormats.TURTLE.key,
  async render(
    snapshot,
    format,
    writerContext,
    documentStoragePolicy = defaultDocumentStoragePolicy,
    behaviorProfileDefinition = defaultBehaviorProfileDefinition,
  ) {
    const parameters = readStorageFormatParameters(
      format,
      documentStoragePolicy,
    );
    const forceXsdString = readForceStringDatatype(parameters);
    const configuration = rdfStorageConfiguration(
      snapshot,
      behaviorProfileDefinition.behaviorProfileId,
    );
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
      maxQuads: Number.isFinite(configuration.maxQuads)
        ? configuration.maxQuads
        : undefined,
    });
    const chunks = [];
    const encoder = new TextEncoder();
    let bytes = 0;
    const append = (chunk) => {
      bytes += encoder.encode(chunk).byteLength;
      if (bytes > documentStoragePolicy.maxOutputBytes)
        throw new ResourceLimitError("Turtle output byte limit exceeded", {
          resource: "outputBytes",
          limit: documentStoragePolicy.maxOutputBytes,
        });
      chunks.push(chunk);
    };
    const { Writer } = await import("n3");
    const writer = new Writer(
      {
        write(chunk, _encoding, done) {
          append(chunk);
          done?.();
          return true;
        },
        end(done) {
          done?.();
        },
      },
      { format: "text/turtle" },
    );
    const subjectSections = new Map();
    const anonymousIndividuals = readAnonymousIndividualRdfNodes(dataset);
    const blankOccurrences = new Map();
    for (const quad of dataset)
      for (const term of [quad.subject, quad.object]) {
        if (term.termType === "BlankNode")
          blankOccurrences.set(
            term.value,
            (blankOccurrences.get(term.value) ?? 0) + 1,
          );
      }
    const renderTerm = (term) =>
      documentStoragePolicy.inlinesEmptyAnonymousIndividuals &&
      !writerContext.saveIds &&
      term.termType === "BlankNode" &&
      anonymousIndividuals.has(term.value) &&
      blankOccurrences.get(term.value) === 1
        ? writer.blank()
        : term;
    if (documentStoragePolicy.turtlePresentation === "java-writer")
      for (const quad of dataset) {
        const section =
          quad.predicate.value === `${RDF_NAMESPACE}type` &&
          rdfEntitySectionName(quad.object.value);
        if (section)
          subjectSections.set(
            `${quad.subject.termType}:${quad.subject.value}`,
            section,
          );
      }
    const groups = new Map();
    for (const quad of dataset) {
      const section = subjectSections.get(
        `${quad.subject.termType}:${quad.subject.value}`,
      );
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(quad);
    }
    for (const [section, quads] of groups) {
      if (section && writerContext.banners)
        append(`${"#".repeat(65)}\n#    ${section}\n${"#".repeat(65)}\n\n`);
      for (const quad of quads) {
        if (quad.graph.termType !== "DefaultGraph")
          throw new OWLOntologyStorageError("Turtle requires a default graph", {
            reason: "ONTOLOGY_NOT_REPRESENTABLE",
          });
        if (
          forceXsdString ||
          documentStoragePolicy.turtlePresentation === "java-writer"
        ) {
          // The public provider method owns RDF term escaping. A default-graph
          // quad ends with its object and the fixed " .\n" delimiter, so adding
          // the explicit string datatype cannot rewrite a literal's contents.
          const line = writer.quadToString(
            renderTerm(quad.subject),
            quad.predicate,
            renderTerm(quad.object),
            quad.graph,
          );
          append(
            forceXsdString &&
              quad.object.termType === "Literal" &&
              quad.object.datatype.value === `${XSD_NAMESPACE}string`
              ? `${line.slice(0, -3)}^^<${XSD_NAMESPACE}string> .\n`
              : line,
          );
        } else writer.addQuad(quad);
      }
    }
    await new Promise((resolve, reject) =>
      writer.end((error) => (error ? reject(error) : resolve())),
    );
    const text = chunks.join("");
    if (!documentStoragePolicy.requiresLosslessRdfRoundTrip) return text;
    const parsed = await createTurtleSyntaxAdapter().parse(
      new StringDocumentSource(text),
      configuration,
    );
    await verifyRdfStorage(original, parsed.dataset, configuration, "Turtle");
    return text;
  },
});
