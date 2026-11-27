<!-- registry-sha256: 3ee2deb5d95722586a1677e3077b5b1cbfd9d5845943c9251dece76cae97f747 -->

# Java OWLAPI compatibility surface

This generated view compares `@hadden-industries/owlapi` 0.1.0 with Java OWLAPI 5.5.1 at `f760b3a4c107c6d5f90f856e5680c39b18af646f`. The JSON registry beside this file is authoritative.

This independently maintained JavaScript implementation is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project. Compatibility rows describe a bounded technical relationship and do not claim complete API parity.

A mapped name does not promise every Java overload or method. The relationship, compatibility, supported-member, and omitted-member fields in the registry define the actual contract.

## Inventory summary

- Public package namespaces: 12
- Public JavaScript bindings: 83
- Public Java types inspected: 1013
- Unclassified Java types: 0

| Java disposition                           | Count |
| ------------------------------------------ | ----: |
| PUBLIC_MAPPED                              |    47 |
| STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT    |    80 |
| FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT |     7 |
| INTERNAL_IMPLEMENTATION_ONLY               |     2 |
| DEFERRED_NOT_EXPOSED                       |   833 |
| UNSUPPORTED_BY_DESIGN                      |    44 |
| UNCLASSIFIED                               |     0 |

## Public bindings

Package specifiers below use the [documented npm alias](../../README.md#install).

| JavaScript export                                                                                   | Package specifier                | Java authority                                                                            | Relationship  | Compatibility  |
| --------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- | ------------- | -------------- |
| [`OWLManager`](../../API.md#owlmanager)                                                             | owlapi/apibinding                | org.semanticweb.owlapi.apibinding.OWLManager                                              | JAVA_ANALOGUE | ADAPTED        |
| [`ANNOTATION_VALUE_KINDS`](../../API.md#annotation_value_kinds)                                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`AXIOM_KINDS`](../../API.md#axiom_kinds)                                                           | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`AXIOM_KINDS_WITH_SWRL`](../../API.md#axiom_kinds_with_swrl)                                       | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`AddAxiom`](../../API.md#addaxiom)                                                                 | owlapi/model                     | org.semanticweb.owlapi.model.AddAxiom                                                     | JS_ADAPTATION | ADAPTED        |
| [`AddImport`](../../API.md#addimport)                                                               | owlapi/model                     | org.semanticweb.owlapi.model.AddImport                                                    | JS_ADAPTATION | ADAPTED        |
| [`AddOntologyAnnotation`](../../API.md#addontologyannotation)                                       | owlapi/model                     | org.semanticweb.owlapi.model.AddOntologyAnnotation                                        | JAVA_ANALOGUE | ADAPTED        |
| [`CLASS_EXPRESSION_KINDS`](../../API.md#class_expression_kinds)                                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`DATA_PROPERTY_EXPRESSION_KINDS`](../../API.md#data_property_expression_kinds)                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`DATA_RANGE_KINDS`](../../API.md#data_range_kinds)                                                 | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`ENTITY_KINDS`](../../API.md#entity_kinds)                                                         | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`INDIVIDUAL_KINDS`](../../API.md#individual_kinds)                                                 | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`IRI`](../../API.md#iri)                                                                           | owlapi/model                     | org.semanticweb.owlapi.model.IRI                                                          | JAVA_ANALOGUE | ADAPTED        |
| [`OBJECT_PROPERTY_EXPRESSION_KINDS`](../../API.md#object_property_expression_kinds)                 | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`OWLDataFactory`](../../API.md#owldatafactory)                                                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLDataFactory                                               | JAVA_ANALOGUE | ADAPTED        |
| [`OWLDocumentFormat`](../../API.md#owldocumentformat)                                               | owlapi/model                     | org.semanticweb.owlapi.model.OWLDocumentFormat                                            | JAVA_ANALOGUE | ADAPTED        |
| [`OWLObjectKind`](../../API.md#owlobjectkind)                                                       | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`OWLOntology`](../../API.md#owlontology)                                                           | owlapi/model                     | org.semanticweb.owlapi.model.OWLOntology                                                  | JAVA_ANALOGUE | ADAPTED        |
| [`OWLOntologyLoaderConfiguration`](../../API.md#owlontologyloaderconfiguration)                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration                               | JAVA_ANALOGUE | ADAPTED        |
| [`OWLOntologyManager`](../../API.md#owlontologymanager)                                             | owlapi/model                     | org.semanticweb.owlapi.model.OWLOntologyManager                                           | JAVA_ANALOGUE | ADAPTED        |
| [`OWLOntologyWriterConfiguration`](../../API.md#owlontologywriterconfiguration)                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLOntologyWriterConfiguration                               | JS_ADAPTATION | ADAPTED        |
| [`OWLStructuralObject`](../../API.md#owlstructuralobject)                                           | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JAVA_ANALOGUE | ADAPTED        |
| [`OWL_OBJECT_KINDS`](../../API.md#owl_object_kinds)                                                 | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`OWL_OBJECT_KINDS_WITH_SWRL`](../../API.md#owl_object_kinds_with_swrl)                             | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`RemoveAxiom`](../../API.md#removeaxiom)                                                           | owlapi/model                     | org.semanticweb.owlapi.model.RemoveAxiom                                                  | JS_ADAPTATION | ADAPTED        |
| [`RemoveImport`](../../API.md#removeimport)                                                         | owlapi/model                     | org.semanticweb.owlapi.model.RemoveImport                                                 | JS_ADAPTATION | ADAPTED        |
| [`RemoveOntologyAnnotation`](../../API.md#removeontologyannotation)                                 | owlapi/model                     | org.semanticweb.owlapi.model.RemoveOntologyAnnotation                                     | JS_ADAPTATION | ADAPTED        |
| [`SetOntologyID`](../../API.md#setontologyid)                                                       | owlapi/model                     | org.semanticweb.owlapi.model.SetOntologyID                                                | JAVA_ANALOGUE | ADAPTED        |
| [`StructuralSet`](../../API.md#structuralset)                                                       | owlapi/model                     | org.semanticweb.owlapi.model.OWLObject                                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchAnnotationValue`](../../API.md#dispatchannotationvalue)                                   | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchAxiom`](../../API.md#dispatchaxiom)                                                       | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchClassExpression`](../../API.md#dispatchclassexpression)                                   | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchDataPropertyExpression`](../../API.md#dispatchdatapropertyexpression)                     | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchDataRange`](../../API.md#dispatchdatarange)                                               | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchIndividual`](../../API.md#dispatchindividual)                                             | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchObjectPropertyExpression`](../../API.md#dispatchobjectpropertyexpression)                 | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`dispatchOwlObject`](../../API.md#dispatchowlobject)                                               | owlapi/model                     | org.semanticweb.owlapi.model.OWLObjectVisitorEx                                           | JS_EXTENSION  | NOT_APPLICABLE |
| [`AmbiguousRdfDatasetError`](../../API.md#ambiguousrdfdataseterror)                                 | owlapi/io                        | org.semanticweb.owlapi.model.OWLOntologyCreationException                                 | JS_EXTENSION  | NOT_APPLICABLE |
| [`DocumentLoadError`](../../API.md#documentloaderror)                                               | owlapi/io                        | org.semanticweb.owlapi.model.OWLOntologyCreationException                                 | JS_EXTENSION  | NOT_APPLICABLE |
| [`GraphSelectionError`](../../API.md#graphselectionerror)                                           | owlapi/io                        | org.semanticweb.owlapi.model.OWLOntologyCreationException                                 | JS_EXTENSION  | NOT_APPLICABLE |
| [`MissingImportError`](../../API.md#missingimporterror)                                             | owlapi/io                        | org.semanticweb.owlapi.model.UnloadableImportException                                    | JS_EXTENSION  | NOT_APPLICABLE |
| [`OWLAPIError`](../../API.md#owlapierror)                                                           | owlapi/io                        | org.semanticweb.owlapi.model.OWLRuntimeException                                          | JAVA_ANALOGUE | ADAPTED        |
| [`OWLOntologyCreationError`](../../API.md#owlontologycreationerror)                                 | owlapi/io                        | org.semanticweb.owlapi.model.OWLOntologyCreationException                                 | JAVA_ANALOGUE | ADAPTED        |
| [`OWLOntologyStateError`](../../API.md#owlontologystateerror)                                       | owlapi/io                        | org.semanticweb.owlapi.model.OWLRuntimeException                                          | JS_EXTENSION  | NOT_APPLICABLE |
| [`OWLOntologyStorageError`](../../API.md#owlontologystorageerror)                                   | owlapi/io                        | org.semanticweb.owlapi.model.OWLOntologyStorageException                                  | JS_ADAPTATION | ADAPTED        |
| [`OWLParserError`](../../API.md#owlparsererror)                                                     | owlapi/io                        | org.semanticweb.owlapi.io.OWLParserException                                              | JAVA_ANALOGUE | ADAPTED        |
| [`OWLStorerNotFoundError`](../../API.md#owlstorernotfounderror)                                     | owlapi/io                        | org.semanticweb.owlapi.model.OWLStorerNotFoundException                                   | JS_ADAPTATION | ADAPTED        |
| [`OWLSyntaxError`](../../API.md#owlsyntaxerror)                                                     | owlapi/io                        | org.semanticweb.owlapi.io.OWLParserException                                              | JS_EXTENSION  | NOT_APPLICABLE |
| [`ParserMismatchError`](../../API.md#parsermismatcherror)                                           | owlapi/io                        | org.semanticweb.owlapi.io.OWLParserException                                              | JS_EXTENSION  | NOT_APPLICABLE |
| [`RDFOntologyHeaderStatus`](../../API.md#rdfontologyheaderstatus)                                   | owlapi/io                        | org.semanticweb.owlapi.io.RDFOntologyHeaderStatus                                         | JS_ADAPTATION | ADAPTED        |
| [`RDFParserMetaData`](../../API.md#rdfparsermetadata)                                               | owlapi/io                        | org.semanticweb.owlapi.io.RDFParserMetaData                                               | JS_ADAPTATION | ADAPTED        |
| [`ResourceLimitError`](../../API.md#resourcelimiterror)                                             | owlapi/io                        | org.semanticweb.owlapi.model.OWLRuntimeException                                          | JS_EXTENSION  | NOT_APPLICABLE |
| [`SecurityPolicyError`](../../API.md#securitypolicyerror)                                           | owlapi/io                        | org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration                               | JS_EXTENSION  | NOT_APPLICABLE |
| [`StreamDocumentSource`](../../API.md#streamdocumentsource)                                         | owlapi/io                        | org.semanticweb.owlapi.io.StreamDocumentSource                                            | JS_EXTENSION  | NOT_APPLICABLE |
| [`StreamDocumentTarget`](../../API.md#streamdocumenttarget)                                         | owlapi/io                        | org.semanticweb.owlapi.io.StreamDocumentTarget                                            | JS_EXTENSION  | NOT_APPLICABLE |
| [`StringDocumentSource`](../../API.md#stringdocumentsource)                                         | owlapi/io                        | org.semanticweb.owlapi.io.StringDocumentSource                                            | JS_ADAPTATION | ADAPTED        |
| [`StringDocumentTarget`](../../API.md#stringdocumenttarget)                                         | owlapi/io                        | org.semanticweb.owlapi.io.StringDocumentTarget                                            | JS_ADAPTATION | ADAPTED        |
| [`UnloadableImportError`](../../API.md#unloadableimporterror)                                       | owlapi/io                        | org.semanticweb.owlapi.model.UnloadableImportException                                    | JS_ADAPTATION | ADAPTED        |
| [`UnparsableOntologyException`](../../API.md#unparsableontologyexception)                           | owlapi/io                        | org.semanticweb.owlapi.io.UnparsableOntologyException                                     | JS_ADAPTATION | ADAPTED        |
| [`UnsupportedConstructError`](../../API.md#unsupportedconstructerror)                               | owlapi/io                        | org.semanticweb.owlapi.io.OWLParserException                                              | JS_EXTENSION  | NOT_APPLICABLE |
| [`XmlParseError`](../../API.md#xmlparseerror)                                                       | owlapi/io                        | org.semanticweb.owlapi.io.OWLParserException                                              | JS_EXTENSION  | NOT_APPLICABLE |
| [`OWLDocumentFormats`](../../API.md#owldocumentformats)                                             | owlapi/formats                   | org.semanticweb.owlapi.formats                                                            | JS_EXTENSION  | NOT_APPLICABLE |
| [`RDFXMLDocumentFormat`](../../API.md#rdfxmldocumentformat)                                         | owlapi/formats                   | org.semanticweb.owlapi.formats.RDFXMLDocumentFormat                                       | JAVA_ANALOGUE | ADAPTED        |
| [`NodeDocumentLoader`](../../API.md#nodedocumentloader)                                             | owlapi/io/node                   | org.semanticweb.owlapi.io                                                                 | JS_EXTENSION  | NOT_APPLICABLE |
| [`AnnotationValueShortFormProvider`](../../API.md#annotationvalueshortformprovider)                 | owlapi/util                      | org.semanticweb.owlapi.util.AnnotationValueShortFormProvider                              | JS_ADAPTATION | ADAPTED        |
| [`OWLEntityRemover`](../../API.md#owlentityremover)                                                 | owlapi/util                      | org.semanticweb.owlapi.util.OWLEntityRemover                                              | JS_ADAPTATION | ADAPTED        |
| [`OWLEntityRenamer`](../../API.md#owlentityrenamer)                                                 | owlapi/util                      | org.semanticweb.owlapi.util.OWLEntityRenamer                                              | JS_ADAPTATION | ADAPTED        |
| [`OWLObjectDuplicator`](../../API.md#owlobjectduplicator)                                           | owlapi/util                      | org.semanticweb.owlapi.util.OWLObjectDuplicator                                           | JS_ADAPTATION | ADAPTED        |
| [`OWLOntologyImportsClosureSetProvider`](../../API.md#owlontologyimportsclosuresetprovider)         | owlapi/util                      | org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider                          | JS_ADAPTATION | ADAPTED        |
| [`OWLOntologyMerger`](../../API.md#owlontologymerger)                                               | owlapi/util                      | org.semanticweb.owlapi.util.OWLOntologyMerger                                             | JAVA_ANALOGUE | ADAPTED        |
| [`SimpleShortFormProvider`](../../API.md#simpleshortformprovider)                                   | owlapi/util                      | org.semanticweb.owlapi.util.SimpleShortFormProvider                                       | JS_ADAPTATION | ADAPTED        |
| [`OWL2DLProfile`](../../API.md#owl2dlprofile)                                                       | owlapi/profiles                  | org.semanticweb.owlapi.profiles.OWL2DLProfile                                             | JS_ADAPTATION | ADAPTED        |
| [`OWL2ELProfile`](../../API.md#owl2elprofile)                                                       | owlapi/profiles                  | org.semanticweb.owlapi.profiles.OWL2ELProfile                                             | JS_ADAPTATION | ADAPTED        |
| [`OWL2QLProfile`](../../API.md#owl2qlprofile)                                                       | owlapi/profiles                  | org.semanticweb.owlapi.profiles.OWL2QLProfile                                             | JS_ADAPTATION | ADAPTED        |
| [`OWL2RLProfile`](../../API.md#owl2rlprofile)                                                       | owlapi/profiles                  | org.semanticweb.owlapi.profiles.OWL2RLProfile                                             | JS_ADAPTATION | ADAPTED        |
| [`OWLProfileReport`](../../API.md#owlprofilereport)                                                 | owlapi/profiles                  | org.semanticweb.owlapi.profiles.OWLProfileReport                                          | JS_ADAPTATION | ADAPTED        |
| [`AxiomAnnotations`](../../API.md#axiomannotations)                                                 | owlapi/model/parameters          | org.semanticweb.owlapi.model.parameters.AxiomAnnotations                                  | JS_ADAPTATION | ADAPTED        |
| [`ChangeApplied`](../../API.md#changeapplied)                                                       | owlapi/model/parameters          | org.semanticweb.owlapi.model.parameters.ChangeApplied                                     | JS_ADAPTATION | ADAPTED        |
| [`Imports`](../../API.md#imports)                                                                   | owlapi/model/parameters          | org.semanticweb.owlapi.model.parameters.Imports                                           | JS_ADAPTATION | ADAPTED        |
| [`EntitySearcher`](../../API.md#entitysearcher)                                                     | owlapi/search                    | org.semanticweb.owlapi.search.EntitySearcher                                              | JS_ADAPTATION | ADAPTED        |
| [`ManchesterOWLSyntaxOWLObjectRendererImpl`](../../API.md#manchesterowlsyntaxowlobjectrendererimpl) | owlapi/manchestersyntax/renderer | org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl | JS_ADAPTATION | ADAPTED        |
| [`LocalityClass`](../../API.md#localityclass)                                                       | owlapi/modularity/locality       | org.semanticweb.owlapi.modularity.locality.LocalityClass                                  | JS_ADAPTATION | ADAPTED        |
| [`SyntacticLocalityModuleExtractor`](../../API.md#syntacticlocalitymoduleextractor)                 | owlapi/modularity/locality       | org.semanticweb.owlapi.modularity.locality.SyntacticLocalityModuleExtractor               | JS_ADAPTATION | ADAPTED        |

## Java package gap summary

Every public Java type is classified in the machine-readable registry. This compact view groups those classifications by Java package.

| Java package                                         | Disposition counts                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| org.semanticweb.owlapi.annotations                   | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.apibinding                    | DEFERRED_NOT_EXPOSED: 1; PUBLIC_MAPPED: 1                                                                                             |
| org.semanticweb.owlapi.atomicdecomposition           | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.benchmarks                    | DEFERRED_NOT_EXPOSED: 5                                                                                                               |
| org.semanticweb.owlapi.change                        | DEFERRED_NOT_EXPOSED: 27                                                                                                              |
| org.semanticweb.owlapi.debugging                     | DEFERRED_NOT_EXPOSED: 5                                                                                                               |
| org.semanticweb.owlapi.dlsyntax.parser               | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.dlsyntax.renderer             | DEFERRED_NOT_EXPOSED: 7                                                                                                               |
| org.semanticweb.owlapi.expression                    | DEFERRED_NOT_EXPOSED: 6                                                                                                               |
| org.semanticweb.owlapi.formats                       | DEFERRED_NOT_EXPOSED: 52; FORMAT_IDENTITY_SUPPORTED_NOT_NAMED_EXPORT: 7; PUBLIC_MAPPED: 1; STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT: 1 |
| org.semanticweb.owlapi.functional.parser             | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.functional.renderer           | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.io                            | DEFERRED_NOT_EXPOSED: 46; INTERNAL_IMPLEMENTATION_ONLY: 2; PUBLIC_MAPPED: 6                                                           |
| org.semanticweb.owlapi.krss1.parser                  | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.krss2.parser                  | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.krss2.renderer                | DEFERRED_NOT_EXPOSED: 13                                                                                                              |
| org.semanticweb.owlapi.latex.renderer                | DEFERRED_NOT_EXPOSED: 9                                                                                                               |
| org.semanticweb.owlapi.manchestersyntax.parser       | DEFERRED_NOT_EXPOSED: 11                                                                                                              |
| org.semanticweb.owlapi.manchestersyntax.renderer     | DEFERRED_NOT_EXPOSED: 12; PUBLIC_MAPPED: 1                                                                                            |
| org.semanticweb.owlapi.metrics                       | DEFERRED_NOT_EXPOSED: 23                                                                                                              |
| org.semanticweb.owlapi.model                         | DEFERRED_NOT_EXPOSED: 246; PUBLIC_MAPPED: 20; STRUCTURALLY_SUPPORTED_NOT_NAMED_EXPORT: 79                                             |
| org.semanticweb.owlapi.model.axiomproviders          | DEFERRED_NOT_EXPOSED: 11                                                                                                              |
| org.semanticweb.owlapi.model.parameters              | DEFERRED_NOT_EXPOSED: 3; PUBLIC_MAPPED: 3                                                                                             |
| org.semanticweb.owlapi.model.providers               | DEFERRED_NOT_EXPOSED: 30                                                                                                              |
| org.semanticweb.owlapi.modularity                    | DEFERRED_NOT_EXPOSED: 4                                                                                                               |
| org.semanticweb.owlapi.modularity.locality           | DEFERRED_NOT_EXPOSED: 5; PUBLIC_MAPPED: 2                                                                                             |
| org.semanticweb.owlapi.normalform                    | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.oboformat                     | DEFERRED_NOT_EXPOSED: 5                                                                                                               |
| org.semanticweb.owlapi.owlxml.parser                 | DEFERRED_NOT_EXPOSED: 2                                                                                                               |
| org.semanticweb.owlapi.owlxml.renderer               | DEFERRED_NOT_EXPOSED: 6                                                                                                               |
| org.semanticweb.owlapi.profiles                      | DEFERRED_NOT_EXPOSED: 10; PUBLIC_MAPPED: 5                                                                                            |
| org.semanticweb.owlapi.profiles.violations           | DEFERRED_NOT_EXPOSED: 50                                                                                                              |
| org.semanticweb.owlapi.rdf                           | DEFERRED_NOT_EXPOSED: 2                                                                                                               |
| org.semanticweb.owlapi.rdf.model                     | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.rdf.rdfxml.parser             | DEFERRED_NOT_EXPOSED: 18                                                                                                              |
| org.semanticweb.owlapi.rdf.rdfxml.renderer           | DEFERRED_NOT_EXPOSED: 10                                                                                                              |
| org.semanticweb.owlapi.rdf.turtle.parser             | DEFERRED_NOT_EXPOSED: 7                                                                                                               |
| org.semanticweb.owlapi.rdf.turtle.renderer           | DEFERRED_NOT_EXPOSED: 3                                                                                                               |
| org.semanticweb.owlapi.reasoner                      | UNSUPPORTED_BY_DESIGN: 26                                                                                                             |
| org.semanticweb.owlapi.reasoner.impl                 | UNSUPPORTED_BY_DESIGN: 15                                                                                                             |
| org.semanticweb.owlapi.reasoner.knowledgeexploration | UNSUPPORTED_BY_DESIGN: 1                                                                                                              |
| org.semanticweb.owlapi.reasoner.structural           | UNSUPPORTED_BY_DESIGN: 2                                                                                                              |
| org.semanticweb.owlapi.rio                           | DEFERRED_NOT_EXPOSED: 37                                                                                                              |
| org.semanticweb.owlapi.rio.utils                     | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.search                        | DEFERRED_NOT_EXPOSED: 2; PUBLIC_MAPPED: 1                                                                                             |
| org.semanticweb.owlapi.test                          | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.util                          | DEFERRED_NOT_EXPOSED: 120; PUBLIC_MAPPED: 7                                                                                           |
| org.semanticweb.owlapi.util.mansyntax                | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.utilities                     | DEFERRED_NOT_EXPOSED: 1                                                                                                               |
| org.semanticweb.owlapi.vocab                         | DEFERRED_NOT_EXPOSED: 15                                                                                                              |
