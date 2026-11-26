import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import { StreamDocumentSource } from "../../../io/streamDocumentSource.js";
import { OWLObjectKind } from "../../../model/kinds.js";
import { utf8Chunks } from "../utf8ChunkWriter.js";
import { collectStorageText } from "../storageFailureOutput.js";
import { utf8Length } from "../xmlTokens.js";
import {
  canFragmentTurtleLiteral,
  prepareTurtleLiteral,
} from "./literalFragments.js";
import {
  readStorageFormatParameters,
  readForceStringDatatype,
} from "../storageFormatParameters.js";
import { XSD_NAMESPACE, RDF_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { rdfEntitySectionName } from "../rdfEntitySections.js";
import { readAnonymousIndividualRdfNodes } from "../../mapping/owlToRdfTranslator.js";
import {
  defaultDocumentStoragePolicy,
  defaultBehaviorProfileDefinition,
} from "../../behavior/ontologyBehaviorContext.js";
import { createTurtleSyntaxAdapter } from "../../parsing/rdf/n3SyntaxAdapter.js";
import {
  createRdfStorageOntology,
  mapStorageOntologyToRdf,
  prepareRdfStorageConfiguration,
  verifyRdfStorage,
  verifyScopedSwrlRdfStorage,
} from "../rdfStorage.js";

/** Exact Turtle through the locked native N3 writer and shared lossless gate. */
async function prepareTurtle(
  snapshot,
  format,
  writerContext,
  documentStoragePolicy = defaultDocumentStoragePolicy,
  behaviorProfileDefinition = defaultBehaviorProfileDefinition,
  swrlImportContext,
) {
  const parameters = readStorageFormatParameters(format, documentStoragePolicy);
  const forceXsdString = readForceStringDatatype(parameters);
  const configuration = prepareRdfStorageConfiguration(
    snapshot,
    behaviorProfileDefinition.behaviorProfileId,
    documentStoragePolicy,
  );
  const original = createRdfStorageOntology(snapshot);
  const dataset = mapStorageOntologyToRdf(original, {
    supportsScopedSwrl: documentStoragePolicy.supportsScopedSwrl,
    maxQuads: Number.isFinite(configuration.maxQuads)
      ? configuration.maxQuads
      : undefined,
  });
  if (documentStoragePolicy.supportsScopedSwrl)
    await verifyScopedSwrlRdfStorage(
      [...original.getAxiomsByType(OWLObjectKind.SWRL_RULE)],
      dataset,
      behaviorProfileDefinition.behaviorProfileId,
      swrlImportContext,
    );
  const { Writer } = await import("n3");
  const subjectSections = new Map();
  const anonymousIndividuals = readAnonymousIndividualRdfNodes(dataset);
  const blankOccurrences = new Map();
  const renderTerm = (writer, term) =>
    documentStoragePolicy.inlinesEmptyAnonymousIndividuals &&
    !writerContext.saveIds &&
    term.termType === "BlankNode" &&
    anonymousIndividuals.has(term.value) &&
    blankOccurrences.get(term.value) === 1
      ? writer.blank()
      : term;
  const java = documentStoragePolicy.turtlePresentation === "java-writer";
  if (java)
    for (const quad of dataset.statements()) {
      const section =
        quad.predicate.value === `${RDF_NAMESPACE}type` &&
        rdfEntitySectionName(quad.object.value);
      if (section) subjectSections.set(dataset.rowTermId(quad.row, 0), section);
    }
  const groups = new Map();
  if (java || documentStoragePolicy.inlinesEmptyAnonymousIndividuals)
    for (const quad of dataset.statements()) {
      // Keep section membership as row IDs. Native blank occurrences only
      // affect the writer's optional anonymous-individual abbreviations.
      for (const term of [quad.subject, quad.object]) {
        if (term.termType === "BlankNode")
          blankOccurrences.set(
            term.value,
            (blankOccurrences.get(term.value) ?? 0) + 1,
          );
      }
      if (java) {
        const section = subjectSections.get(dataset.rowTermId(quad.row, 0));
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section).push(quad.row);
      }
    }
  function* sections() {
    if (!java) yield [undefined, dataset.statements()];
    else
      for (const [section, rows] of groups)
        yield [section, rows.values().map((row) => dataset.statementAt(row))];
  }
  function* fragments() {
    let bytes = 0;
    const admitted = (chunk) => {
      if (documentStoragePolicy.maxOutputBytes !== Infinity)
        bytes += utf8Length(chunk);
      if (bytes > documentStoragePolicy.maxOutputBytes)
        throw new ResourceLimitError("Turtle output byte limit exceeded", {
          resource: "outputBytes",
          limit: documentStoragePolicy.maxOutputBytes,
        });
      return chunk;
    };
    // The provider writes synchronously to this sink. Drain its fragments
    // after every quad so backpressure never retains another document copy.
    const chunks = [];
    const writer = new Writer(
      {
        write(chunk, _encoding, done) {
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
    for (const [section, quads] of sections()) {
      if (section && writerContext.banners)
        yield admitted(
          `${"#".repeat(65)}\n#    ${section}\n${"#".repeat(65)}\n\n`,
        );
      for (const quad of quads) {
        if (quad.graph.termType !== "DefaultGraph")
          throw new OWLOntologyStorageError("Turtle requires a default graph", {
            reason: "ONTOLOGY_NOT_REPRESENTABLE",
          });
        const line = forceXsdString || java;
        if (canFragmentTurtleLiteral(quad.object)) {
          const parts = prepareTurtleLiteral(
            writer,
            chunks,
            quad,
            line ? renderTerm(writer, quad.subject) : quad.subject,
            line,
            forceXsdString,
          );
          for (const chunk of chunks) yield admitted(chunk);
          chunks.length = 0;
          // A finite limit used to reject the entire quad before it reached
          // the sink. Preflight the same bytes using bounded pieces.
          if (documentStoragePolicy.maxOutputBytes !== Infinity)
            for (const chunk of parts()) admitted(chunk);
          yield* parts();
        } else if (line) {
          // The public provider method owns RDF term escaping. A default-graph
          // quad ends with its object and the fixed " .\n" delimiter, so adding
          // the explicit string datatype cannot rewrite a literal's contents.
          const line = writer.quadToString(
            renderTerm(writer, quad.subject),
            quad.predicate,
            renderTerm(writer, quad.object),
            quad.graph,
          );
          yield admitted(
            forceXsdString &&
              quad.object.termType === "Literal" &&
              quad.object.datatype.value === `${XSD_NAMESPACE}string`
              ? `${line.slice(0, -3)}^^<${XSD_NAMESPACE}string> .\n`
              : line,
          );
        } else {
          writer.addQuad(quad);
          for (const chunk of chunks) yield admitted(chunk);
          chunks.length = 0;
        }
      }
    }
    writer.end((error) => {
      if (error) throw error;
    });
    for (const chunk of chunks) yield admitted(chunk);
  }
  if (!documentStoragePolicy.requiresLosslessRdfRoundTrip) return fragments;
  const parsed = await createTurtleSyntaxAdapter().parse(
    new StreamDocumentSource(() => utf8Chunks(fragments())),
    configuration,
  );
  await verifyRdfStorage(original, parsed.dataset, configuration, "Turtle");
  return fragments;
}

export const turtleStorer = Object.freeze({
  formatKey: OWLDocumentFormats.TURTLE.key,
  render: async (...args) =>
    collectStorageText((await prepareTurtle(...args))()),
  renderBytes: async (...args) => utf8Chunks((await prepareTurtle(...args))()),
});
