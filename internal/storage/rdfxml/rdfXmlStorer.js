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
import { StreamDocumentSource } from "../../../io/streamDocumentSource.js";
import { utf8Chunks } from "../utf8ChunkWriter.js";
import { collectStorageText } from "../storageFailureOutput.js";
import { OWLObjectKind } from "../../../model/kinds.js";
import { rdfDataFactory } from "../../rdfjs/environment.js";
import { OWL_NAMESPACE, RDF_VOCABULARY } from "../../rdfjs/vocabulary.js";

import { readAnonymousIndividualRdfNodes } from "../../mapping/owlToRdfTranslator.js";

import { OntologyStructuralComparisonLimitError } from "../../model/ontologyStructuralIsomorphism.js";
import { RdfXmlSyntaxAdapter } from "../../parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import { rdfXmlGraphChunks } from "./rdfXmlGraphWriter.js";
import { defaultDocumentStoragePolicy } from "../../behavior/ontologyBehaviorContext.js";
import { readStorageFormatParameters } from "../storageFormatParameters.js";

function ontologyNamespace(ontologyIRI) {
  if (!ontologyIRI) return OWL_NAMESPACE;
  const fragment = ontologyIRI.indexOf("#");
  if (fragment !== -1) return ontologyIRI.slice(0, fragment + 1);
  return ontologyIRI.endsWith("/") ? ontologyIRI : `${ontologyIRI}#`;
}

const namedPropertyKinds = new Set([
  OWLObjectKind.ANNOTATION_PROPERTY,
  OWLObjectKind.DATA_PROPERTY,
  OWLObjectKind.OBJECT_PROPERTY,
]);
const rangeKinds = [
  OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
  OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
  OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
];

function retainGenericPropertyRoles(ontology, dataset) {
  const declaredProperties = new Set();
  const declaredClasses = new Set();
  for (const { entity } of ontology.getAxiomsByType(
    OWLObjectKind.DECLARATION_AXIOM,
  )) {
    if (namedPropertyKinds.has(entity.kind))
      declaredProperties.add(entity.iri.value);
    if (entity.kind === OWLObjectKind.CLASS)
      declaredClasses.add(entity.iri.value);
  }
  const ranges = new Map();
  for (const kind of rangeKinds) {
    for (const { property, range } of ontology.getAxiomsByType(kind)) {
      const iri = property.iri?.value;
      if (!iri || declaredProperties.has(iri)) continue;
      ranges.set(
        iri,
        ranges.get(iri) !== false &&
          kind === OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM &&
          range.kind === OWLObjectKind.CLASS &&
          declaredClasses.has(range.iri.value),
      );
    }
  }
  const recoverable = new Set(
    [...ranges]
      .filter(([, objectClassRange]) => objectClassRange)
      .map(([iri]) => iri),
  );
  for (const { property } of ontology.getAxiomsByType(
    OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
  )) {
    const iri = property.iri.value;
    if (!declaredProperties.has(iri) && !ranges.has(iri)) recoverable.add(iri);
  }
  // RDF Schema typing supplies the existing loader's recovery cue without
  // creating an explicit OWL property declaration in the reloaded model.
  const type = rdfDataFactory.namedNode(RDF_VOCABULARY.type);
  const genericProperty = rdfDataFactory.namedNode(RDF_VOCABULARY.Property);
  for (const iri of recoverable) {
    dataset.add(
      rdfDataFactory.quad(rdfDataFactory.namedNode(iri), type, genericProperty),
    );
  }
}

/** Private composition seam for testing mapping defects, never a manager option. */
export const createRdfXmlStorer = ({
  mapOntologyToRdf: map = mapStorageOntologyToRdf,
} = {}) => {
  async function prepare(
    snapshot,
    format,
    writerContext,
    documentStoragePolicy = defaultDocumentStoragePolicy,
  ) {
    const parameters = readStorageFormatParameters(
      format,
      documentStoragePolicy,
      ["force xsd:string on literals"],
    );
    if (
      (documentStoragePolicy.rejectsUnknownFormatParameters &&
        Object.keys(parameters).some(
          (key) => key !== "force xsd:string on literals",
        )) ||
      (Object.hasOwn(parameters, "force xsd:string on literals") &&
        (documentStoragePolicy.rejectsUnknownFormatParameters ||
          parameters["force xsd:string on literals"] !== null) &&
        typeof parameters["force xsd:string on literals"] !== "boolean")
    ) {
      throw new OWLOntologyStorageError(
        "RDF/XML storage does not support output parameters",
      );
    }
    try {
      const original = createRdfStorageOntology(snapshot);
      const complete = documentStoragePolicy.preservesGenericRdfPropertyRoles
        ? (dataset) => retainGenericPropertyRoles(original, dataset)
        : undefined;
      const mappedDataset =
        map === mapStorageOntologyToRdf
          ? map(original, { complete })
          : map(original);
      if (map !== mapStorageOntologyToRdf) complete?.(mappedDataset);
      const ontologyIRI = snapshot.ontologyID.ontologyIRI?.value;
      const context = {
        prefixes:
          format instanceof RDFXMLDocumentFormat
            ? readRdfXmlPrefixes(format)
            : undefined,
        defaultNamespace: ontologyNamespace(ontologyIRI),
        forceXsdString: parameters["force xsd:string on literals"] ?? false,
        anonymousIndividuals: readAnonymousIndividualRdfNodes(mappedDataset),
        documentStoragePolicy,
      };
      const fragments = () =>
        rdfXmlGraphChunks(mappedDataset, writerContext, context);
      if (!documentStoragePolicy.requiresLosslessRdfRoundTrip) return fragments;
      // Work only with the complete generated document. This context contains
      // neither a manager, IRI mapper, nor document loader, so imports remain
      // authored declarations rather than triggering external retrieval.
      const configuration = rdfStorageConfiguration(snapshot);
      const dataset = await new RdfXmlSyntaxAdapter().parse(
        new StreamDocumentSource(() => utf8Chunks(fragments())),
        configuration,
      );
      await verifyRdfStorage(original, dataset, configuration, "RDF/XML");
      return fragments;
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
  }
  return Object.freeze({
    formatKey: OWLDocumentFormats.RDF_XML.key,
    render: async (...args) => collectStorageText((await prepare(...args))()),
    renderBytes: async (...args) => utf8Chunks((await prepare(...args))()),
  });
};

export const rdfXmlStorer = createRdfXmlStorer();
