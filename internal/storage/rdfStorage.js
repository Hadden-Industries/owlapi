import RdfDataFactory from "@rdfjs/data-model/Factory.js";
import { OWLOntologyStorageError } from "../../io/errors.js";
import { OWLOntology } from "../../model/owlOntology.js";
import { OWLOntologyLoaderConfiguration } from "../../model/owlOntologyLoaderConfiguration.js";
import { OwlToRdfTranslator } from "../mapping/owlToRdfTranslator.js";
import { RdfToOwlTranslator } from "../mapping/rdfToOwlTranslator.js";
import { hasNormalizedSingleton } from "../model/setConstructs.js";
import { compareOntologies } from "../model/ontologyStructuralIsomorphism.js";

const sorted = (values) =>
  [...values].sort((a, b) =>
    a.structuralKey() < b.structuralKey()
      ? -1
      : a.structuralKey() > b.structuralKey()
        ? 1
        : 0,
  );

/** Isolate a committed direct revision, with stable mapping order and no loader. */
export const createRdfStorageOntology = (snapshot) =>
  new OWLOntology({
    ontologyID: snapshot.ontologyID,
    annotations: sorted(snapshot.directOntologyAnnotations),
    axioms: sorted(snapshot.directAxioms),
    imports: sorted(snapshot.authoredImportDeclarations),
  });

/** Each save owns its blank-node allocator independently of earlier parsing. */
export const mapStorageOntologyToRdf = (ontology, options) =>
  new OwlToRdfTranslator({ dataFactory: new RdfDataFactory() }).translate(
    ontology,
    options,
  );

export const rdfStorageConfiguration = (snapshot) =>
  new OWLOntologyLoaderConfiguration({
    parsingMode: hasNormalizedSingleton(snapshot.directAxioms)
      ? "preserve"
      : "strict",
    loadAnnotationAxioms: true,
    rdfDatasetGraphPolicy: "requireSingleGraph",
    collectWarnings: true,
    remoteImports: false,
    remoteJsonLdContexts: false,
  });

/** Reject a lossy RDF reverse mapping before the registry can publish text. */
export const verifyRdfStorage = async (
  original,
  dataset,
  configuration,
  syntaxName,
) => {
  const { ontology, context } = await new RdfToOwlTranslator().translate(
    dataset,
    { configuration },
  );
  if (
    context.diagnostics.length ||
    context.merged ||
    context.selectedGraph?.termType !== "DefaultGraph"
  )
    throw new OWLOntologyStorageError(
      `${syntaxName} reconstruction must be a diagnostic-free default graph`,
      { reason: "ONTOLOGY_NOT_REPRESENTABLE" },
    );
  const comparison = compareOntologies(original, ontology);
  if (!comparison.equal)
    throw new OWLOntologyStorageError(
      `${syntaxName} does not preserve the ontology's direct OWL structure`,
      { reason: "ONTOLOGY_NOT_REPRESENTABLE", mismatch: comparison.mismatch },
    );
};
