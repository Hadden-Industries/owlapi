import {
  createRdfStorageOntology,
  mapStorageOntologyToRdf,
  rdfStorageConfiguration,
  verifyRdfStorage,
} from "../rdfStorage.js";
import { OWLDocumentFormats } from "../../../formats/index.js";
import {
  RDFXMLDocumentFormat,
  readRdfXmlPrefixes,
} from "../../../formats/rdfXMLDocumentFormat.js";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import { StringDocumentSource } from "../../../io/stringDocumentSource.js";
import { OWL_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { readDocumentFormatParameters } from "../../../model/owlDocumentFormat.js";

import { readAnonymousIndividualRdfNodes } from "../../mapping/owlToRdfTranslator.js";

import { OntologyStructuralComparisonLimitError } from "../../model/ontologyStructuralIsomorphism.js";
import { RdfXmlSyntaxAdapter } from "../../parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import { writeRdfXmlGraph } from "./rdfXmlGraphWriter.js";

/** Private composition seam for testing mapping defects, never a manager option. */
export const createRdfXmlStorer = ({
  mapOntologyToRdf: map = mapStorageOntologyToRdf,
} = {}) =>
  Object.freeze({
    formatKey: OWLDocumentFormats.RDF_XML.key,
    async render(snapshot, format, writerContext) {
      const parameters = readDocumentFormatParameters(format);
      if (
        Object.keys(parameters).some(
          (key) => key !== "force xsd:string on literals",
        ) ||
        (Object.hasOwn(parameters, "force xsd:string on literals") &&
          typeof parameters["force xsd:string on literals"] !== "boolean")
      ) {
        throw new OWLOntologyStorageError(
          "RDF/XML storage does not support output parameters",
        );
      }
      try {
        const original = createRdfStorageOntology(snapshot);
        const mappedDataset = map(original);
        const ontologyIRI = snapshot.ontologyID.ontologyIRI?.value;
        const text = writeRdfXmlGraph(mappedDataset, writerContext, {
          prefixes:
            format instanceof RDFXMLDocumentFormat
              ? readRdfXmlPrefixes(format)
              : undefined,
          defaultNamespace: ontologyIRI
            ? /[#/]$/u.test(ontologyIRI)
              ? ontologyIRI
              : `${ontologyIRI}#`
            : OWL_NAMESPACE,
          forceXsdString: parameters["force xsd:string on literals"] ?? false,
          anonymousIndividuals: readAnonymousIndividualRdfNodes(mappedDataset),
        });
        // Work only with the complete generated document. This context contains
        // neither a manager, IRI mapper, nor document loader, so imports remain
        // authored declarations rather than triggering external retrieval.
        const configuration = rdfStorageConfiguration(snapshot);
        const dataset = await new RdfXmlSyntaxAdapter().parse(
          new StringDocumentSource(text),
          configuration,
        );
        await verifyRdfStorage(original, dataset, configuration, "RDF/XML");
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
