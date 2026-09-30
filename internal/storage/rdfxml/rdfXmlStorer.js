import RdfDataFactory from "@rdfjs/data-model/Factory.js";
import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import { StringDocumentSource } from "../../../io/stringDocumentSource.js";
import { readDocumentFormatParameters } from "../../../model/owlDocumentFormat.js";
import { OWLOntology } from "../../../model/owlOntology.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/owlOntologyLoaderConfiguration.js";
import { OwlToRdfTranslator } from "../../mapping/owlToRdfTranslator.js";
import { RdfToOwlTranslator } from "../../mapping/rdfToOwlTranslator.js";
import { hasNormalizedSingleton } from "../../model/setConstructs.js";
import {
  compareOntologies,
  OntologyStructuralComparisonLimitError,
} from "../../model/ontologyStructuralIsomorphism.js";
import { RdfXmlSyntaxAdapter } from "../../parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import { writeRdfXmlGraph } from "./rdfXmlGraphWriter.js";

const sortedStructuralValues = (values) =>
  [...values].sort((left, right) => {
    const a = left.structuralKey();
    const b = right.structuralKey();
    return a < b ? -1 : a > b ? 1 : 0;
  });
const mapOntologyToRdf = (ontology) =>
  new OwlToRdfTranslator({
    // Each serialization owns its native allocator: unrelated parsing or saving
    // must not change generated blank-node labels or deterministic output order.
    dataFactory: new RdfDataFactory(),
  }).translate(ontology);

/** Private composition seam for testing mapping defects, never a manager option. */
export const createRdfXmlStorer = ({
  mapOntologyToRdf: map = mapOntologyToRdf,
} = {}) =>
  Object.freeze({
    formatKey: OWLDocumentFormats.RDF_XML.key,
    async render(snapshot, format) {
      if (Object.keys(readDocumentFormatParameters(format)).length !== 0) {
        throw new OWLOntologyStorageError(
          "RDF/XML storage does not support output parameters",
        );
      }
      try {
        const original = new OWLOntology({
          ontologyID: snapshot.ontologyID,
          annotations: sortedStructuralValues(
            snapshot.directOntologyAnnotations,
          ),
          axioms: sortedStructuralValues(snapshot.directAxioms),
          imports: sortedStructuralValues(snapshot.authoredImportDeclarations),
        });
        const text = writeRdfXmlGraph(map(original));
        // Work only with the complete generated document. This context contains
        // neither a manager, IRI mapper, nor document loader, so imports remain
        // authored declarations rather than triggering external retrieval.
        const configuration = new OWLOntologyLoaderConfiguration({
          parsingMode: hasNormalizedSingleton(snapshot.directAxioms)
            ? "preserve"
            : "strict",
          loadAnnotationAxioms: true,
          rdfDatasetGraphPolicy: "requireSingleGraph",
          collectWarnings: true,
          remoteImports: false,
          remoteJsonLdContexts: false,
        });
        const dataset = await new RdfXmlSyntaxAdapter().parse(
          new StringDocumentSource(text),
          configuration,
        );
        const { ontology, context } = await new RdfToOwlTranslator().translate(
          dataset,
          { configuration },
        );
        if (
          context.diagnostics.length ||
          context.merged ||
          context.selectedGraph?.termType !== "DefaultGraph"
        ) {
          throw new OWLOntologyStorageError(
            "RDF/XML reconstruction must be a diagnostic-free default graph",
            {
              reason: "ONTOLOGY_NOT_REPRESENTABLE",
            },
          );
        }
        const comparison = compareOntologies(original, ontology);
        if (!comparison.equal) {
          throw new OWLOntologyStorageError(
            "RDF/XML does not preserve the ontology's direct OWL structure",
            {
              reason: "ONTOLOGY_NOT_REPRESENTABLE",
              mismatch: comparison.mismatch,
            },
          );
        }
        return text;
      } catch (cause) {
        if (cause instanceof OWLOntologyStorageError) throw cause;
        // A bounded verification exhaustion is a storage failure, not proof that
        // the ontology has no RDF/XML representation.
        throw new OWLOntologyStorageError(
          "RDF/XML lossless storage verification failed",
          {
            cause,
            ...(cause instanceof ResourceLimitError ||
            cause instanceof OntologyStructuralComparisonLimitError
              ? {}
              : { reason: "ONTOLOGY_NOT_REPRESENTABLE" }),
          },
        );
      }
    },
  });

export const rdfXmlStorer = createRdfXmlStorer();
