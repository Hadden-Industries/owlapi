import { javaJsonLdContextIRIs } from "./jsonLdProviderPolicy.js";

/** One immutable contract definition per behavior profile. Operation counters,
 * ontology state and resource-access permissions never belong in this registry.
 * OWL language profiles (DL, EL, QL, RL) are a separate concept.
 * @typedef {Readonly<{behaviorProfileId: string, configurationPolicy: object, ontologyChangePolicy: object, ontologyIdentityPolicy: object, ontologyLoadingPolicy: object, computationResourcePolicy: object}>} BehaviorProfileDefinition
 */
const normativeDocumentStoragePolicy = Object.freeze({
  targetPublication: "replace-complete",
  xmlLiteralRepresentation: "escaped",
  rejectsUnknownFormatParameters: true,
  functionalStringDatatypeDefault: "explicit",
  turtlePresentation: "provider",
  owlXmlPresentation: "compact",
  inlinesEmptyAnonymousIndividuals: false,
  requiresLosslessRdfRoundTrip: true,
  requiresXml10Characters: true,
  validatesRdfLanguageTags: true,
  maxOutputBytes: 33554432,
  maxStructureDepth: 512,
  maxAnnotationDepth: 64,
  maxRdfXmlNodeDepth: 128,
});
const javaDocumentStoragePolicy = Object.freeze({
  targetPublication: "append",
  xmlLiteralRepresentation: "embedded",
  rejectsUnknownFormatParameters: false,
  functionalStringDatatypeDefault: "omit",
  turtlePresentation: "java-writer",
  owlXmlPresentation: "java-writer",
  inlinesEmptyAnonymousIndividuals: true,
  xmlDeclaration: '<?xml version="1.0"?>',
  requiresLosslessRdfRoundTrip: false,
  requiresXml10Characters: false,
  validatesRdfLanguageTags: false,
  maxOutputBytes: Infinity,
  maxStructureDepth: Infinity,
  maxAnnotationDepth: Infinity,
  maxRdfXmlNodeDepth: Infinity,
});
const definitions = new Map([
  [
    "normative-v1",
    Object.freeze({
      behaviorProfileId: "normative-v1",
      rdfReconstructionPolicy: Object.freeze({
        recoversNamedDatatypeRestrictions: true,
        recoversAnonymousUndeclaredAnnotations: false,
      }),
      individualEnumerationPolicy: Object.freeze({
        minimumIndividualCount: 1,
        includesAnonymousOwlXmlOperands: true,
      }),
      rdfParserMetadataPolicy: Object.freeze({
        headerStatus: "explicit-header-count",
        tripleCount: "selected-unique-triples",
      }),
      ontologyCopyPolicy: Object.freeze({
        mergePublication: "after-snapshot-validation",
      }),
      documentTransportPolicy: Object.freeze({
        automaticRedirectStatusCodes: Object.freeze([]),
        maxRequestsInAutomaticRedirectChain: Infinity,
        requiresAbsoluteManualRedirectLocation: false,
        dropsCredentialsOnManualRedirect: false,
        returnsNoSourceForNonpositiveAttempts: false,
        documentBaseIRI: "final-resource",
        allowsManualRedirects: true,
        automaticRedirectRequiresSameProtocol: true,
        usesDocumentEnvelopeDecoding: true,
      }),
      documentStoragePolicy: normativeDocumentStoragePolicy,
      literalConstructionPolicy: Object.freeze({
        normalizesTypedLiterals: false,
        trimsLanguageArgument: false,
      }),
      jsonLdProcessingPolicy: Object.freeze({
        maxContextUrls: 11,
        contextWhitelist: undefined,
        contextCacheLifetimeMilliseconds: 0,
        validatesContextURLHost: true,
      }),
      xmlProcessingPolicy: Object.freeze({
        admitsExternalDeclarations: false,
        admitsParameterEntities: false,
        admitsDtdMetadataDeclarations: false,
        keepsFirstEntityDeclaration: false,
        resolvesUnusedEntities: true,
        maxGeneralEntityCodeUnits: Infinity,
        maxParameterEntityCodeUnits: Infinity,
        maxTotalEntityCodeUnits: Infinity,
        maxXmlNameCodeUnits: Infinity,
        maxAttributesPerElement: Infinity,
      }),
      parserSelectionPolicy: Object.freeze({
        aggregatesParserFailures: false,
        factoryOrder: undefined,
      }),
      owlSyntaxPolicy: Object.freeze({
        rejectsUndeclaredOwlXmlAttributes: true,
        requiresUnaryFunctionalDataRestrictions: false,
      }),
      owlLanguageProfilePolicy: Object.freeze({
        literalValidation: "normative",
        allowsUnknownXsdDatatypes: false,
        requiresUniqueDatatypeDefinition: true,
        checksFacetValueSpace: true,
        inspectsAnnotationValues: true,
        checksAnonymousStructure: true,
        requiresUnaryDataRanges: true,
        topDataPropertyRestriction: "super-property-only",
        definedDatatypeRestrictionOutcome: "violation",
        rlAllowsTopAndBottomProperties: false,
        rlExcludedDatatypeNames: Object.freeze([]),
        rlDisjointOperandPosition: "sub",
        elLastChainPropertyInheritsRanges: true,
      }),
      configurationPolicy: Object.freeze({
        writerCopyResetFields: Object.freeze([]),
        preservesNoOpWriterIdentity: false,
        acceptsNegativeIndentSize: false,
      }),
      ontologyChangePolicy: Object.freeze({
        publication: "atomic",
        permitsSameProfileForeignTargets: false,
      }),
      ontologyIdentityPolicy: Object.freeze({
        registerDefaultDocumentIRI: false,
        allowNamedIDFallback: false,
      }),
      ontologyLoadingPolicy: Object.freeze({
        importResolution: "registered-object",
        publication: "graph",
      }),
      computationResourcePolicy: Object.freeze({
        usesJavaProviderDefaults: false,
        maxTransformDepth: 512,
        manchesterRenderingLimits: Object.freeze({
          maxOutputBytes: 33554432,
          maxDepth: 512,
          maxAnnotationDepth: 64,
        }),
        owlProfileLimits: Object.freeze({
          maxWork: 1000000,
          maxDepth: 256,
          maxNumericDigits: 4096,
          maxLiteralLength: 1048576,
        }),
      }),
    }),
  ],
  [
    "java-owlapi-5.5.1",
    Object.freeze({
      behaviorProfileId: "java-owlapi-5.5.1",
      rdfReconstructionPolicy: Object.freeze({
        recoversNamedDatatypeRestrictions: false,
        recoversAnonymousUndeclaredAnnotations: true,
      }),
      individualEnumerationPolicy: Object.freeze({
        minimumIndividualCount: 0,
        includesAnonymousOwlXmlOperands: false,
      }),
      rdfParserMetadataPolicy: Object.freeze({
        headerStatus: "java-consumer-one-header",
        tripleCount: "source-statement-occurrences",
      }),
      ontologyCopyPolicy: Object.freeze({
        mergePublication: "before-provider-read",
      }),
      documentTransportPolicy: Object.freeze({
        automaticRedirectStatusCodes: Object.freeze([301, 302, 303, 307]),
        maxRequestsInAutomaticRedirectChain: 20,
        requiresAbsoluteManualRedirectLocation: true,
        dropsCredentialsOnManualRedirect: true,
        returnsNoSourceForNonpositiveAttempts: true,
        documentBaseIRI: "requested-document",
        allowsManualRedirects: true,
        automaticRedirectRequiresSameProtocol: true,
        usesDocumentEnvelopeDecoding: true,
      }),
      // RDF4J's cached Hasmac context loader is a separate native consumer. It
      // does not read the ontology loader's connection/attempt/auth settings.
      jsonLdContextTransportPolicy: Object.freeze({
        readsJavaJsonDocument: true,
        automaticRedirectStatusCodes: Object.freeze([301, 302, 303, 307]),
        maxRequestsInAutomaticRedirectChain: 10,
        allowsManualRedirects: false,
        automaticRedirectRequiresSameProtocol: false,
        returnsNoSourceForNonpositiveAttempts: false,
        documentBaseIRI: "final-resource",
        usesDocumentEnvelopeDecoding: false,
        connectionTimeoutMilliseconds: 0,
        acceptedResponseStatusCodes: Object.freeze([200]),
        requestHeaders: Object.freeze({
          Accept: "application/ld+json,application/json;q=0.9,*/*;q=0.1",
        }),
      }),
      documentStoragePolicy: javaDocumentStoragePolicy,
      literalConstructionPolicy: Object.freeze({
        normalizesTypedLiterals: true,
        trimsLanguageArgument: true,
      }),
      jsonLdProcessingPolicy: Object.freeze({
        maxContextUrls: 257,
        readsFirstJsonStructure: true,
        contextWhitelist: javaJsonLdContextIRIs,
        contextCacheLifetimeMilliseconds: 3600000,
        validatesContextURLHost: false,
      }),
      xmlProcessingPolicy: Object.freeze({
        admitsExternalDeclarations: true,
        admitsParameterEntities: true,
        admitsDtdMetadataDeclarations: true,
        keepsFirstEntityDeclaration: true,
        resolvesUnusedEntities: false,
        maxGeneralEntityCodeUnits: 100000,
        maxParameterEntityCodeUnits: 15000,
        maxTotalEntityCodeUnits: 100000,
        maxXmlNameCodeUnits: 1000,
        maxAttributesPerElement: 200,
      }),
      parserSelectionPolicy: Object.freeze({
        aggregatesParserFailures: true,
        factoryOrder: Object.freeze([
          "rdf-xml",
          "owl-xml",
          "owl-functional",
          "turtle",
          "owl-manchester",
          "nquads",
          "trig",
          "ntriples",
          "jsonld",
          "owl-dl",
          "owl-krss2",
        ]),
      }),
      owlSyntaxPolicy: Object.freeze({
        rejectsUndeclaredOwlXmlAttributes: false,
        requiresUnaryFunctionalDataRestrictions: true,
      }),
      owlLanguageProfilePolicy: Object.freeze({
        literalValidation: "java-pattern",
        allowsUnknownXsdDatatypes: true,
        requiresUniqueDatatypeDefinition: false,
        checksFacetValueSpace: false,
        inspectsAnnotationValues: false,
        checksAnonymousStructure: false,
        requiresUnaryDataRanges: false,
        topDataPropertyRestriction: "not-sub-property",
        definedDatatypeRestrictionOutcome: "exception",
        rlAllowsTopAndBottomProperties: true,
        rlExcludedDatatypeNames: Object.freeze([
          "unsignedInt",
          "unsignedShort",
        ]),
        rlDisjointOperandPosition: "equiv",
        elLastChainPropertyInheritsRanges: false,
      }),
      configurationPolicy: Object.freeze({
        writerCopyResetFields: Object.freeze(["indentSize", "banners"]),
        preservesNoOpWriterIdentity: true,
        acceptsNegativeIndentSize: true,
      }),
      ontologyChangePolicy: Object.freeze({
        publication: "sequential",
        permitsSameProfileForeignTargets: true,
      }),
      ontologyIdentityPolicy: Object.freeze({
        registerDefaultDocumentIRI: true,
        allowNamedIDFallback: true,
      }),
      ontologyLoadingPolicy: Object.freeze({
        importResolution: "retained-id",
        publication: "document",
      }),
      computationResourcePolicy: Object.freeze({
        usesJavaProviderDefaults: true,
        maxTransformDepth: Infinity,
        manchesterRenderingLimits: Object.freeze({
          maxOutputBytes: Infinity,
          maxDepth: Infinity,
          maxAnnotationDepth: Infinity,
        }),
        owlProfileLimits: Object.freeze({
          maxWork: Infinity,
          maxDepth: Infinity,
          maxNumericDigits: Infinity,
          maxLiteralLength: Infinity,
        }),
      }),
    }),
  ],
]);

/** Default for private storers invoked directly by existing internal callers. */
export const defaultDocumentStoragePolicy = normativeDocumentStoragePolicy;
export const defaultBehaviorProfileDefinition = definitions.get("normative-v1");

/** Resolve the immutable native definition without allocating a context wrapper.
 * Contexts and value-only consumers share this one profile admission rule.
 */
export const resolveOntologyBehaviorDefinition = (
  behaviorProfileId = "normative-v1",
) => {
  const definition = definitions.get(behaviorProfileId);
  if (!definition)
    throw new RangeError(
      `Unknown behaviorProfileId: ${String(behaviorProfileId)}`,
    );
  return definition;
};

/** Manager/standalone-operation binding; definitions contain no mutable state. */
export class OntologyBehaviorContext {
  #behaviorProfileDefinition;

  constructor(behaviorProfileId = "normative-v1") {
    this.#behaviorProfileDefinition =
      resolveOntologyBehaviorDefinition(behaviorProfileId);
    Object.freeze(this);
  }

  get behaviorProfileDefinition() {
    return this.#behaviorProfileDefinition;
  }
}
