<!-- registry-sha256: cf367d97cea09eb9fe99b6f0e68f8ddb8ded8555259a4cc956b16bb19218ba6a -->

# owlapi API reference

This reference is generated from the authoritative compatibility registry for `@hadden-industries/owlapi` 0.1.0-rc.1. Edit the generator or registry inputs, not this file.

This is an independently maintained JavaScript implementation. It is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project; Java names identify compatibility authorities, not organizational continuity or complete parity.

The package exposes one convenience aggregate and 6 Java-recognizable namespace entry points. Import from declared package specifiers only; paths below `internal/` are intentionally outside the public contract.

## `OWLManager`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/apibinding`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.apibinding.OWLManager
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: OWLManager.createOWLOntologyManager(options?)
- Supported members: static createOWLOntologyManager
- Omitted Java members: Java service-loader and injector overloads; Ontology-data factory creation overloads
- Public errors: OWLOntologyCreationError; UnparsableOntologyException
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: apibinding/owlManager.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `ANNOTATION_VALUE_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { ANNOTATION_VALUE_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: IRI; OWLAnonymousIndividual; OWLLiteral
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `AXIOM_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { AXIOM_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLDeclarationAxiom; OWLSubClassOfAxiom; OWLEquivalentClassesAxiom; OWLDisjointClassesAxiom; OWLDisjointUnionAxiom; OWLSubObjectPropertyOfAxiom; OWLSubPropertyChainOfAxiom; OWLEquivalentObjectPropertiesAxiom; OWLDisjointObjectPropertiesAxiom; OWLObjectPropertyDomainAxiom; OWLObjectPropertyRangeAxiom; OWLInverseObjectPropertiesAxiom; OWLFunctionalObjectPropertyAxiom; OWLInverseFunctionalObjectPropertyAxiom; OWLReflexiveObjectPropertyAxiom; OWLIrreflexiveObjectPropertyAxiom; OWLSymmetricObjectPropertyAxiom; OWLAsymmetricObjectPropertyAxiom; OWLTransitiveObjectPropertyAxiom; OWLSubDataPropertyOfAxiom; OWLEquivalentDataPropertiesAxiom; OWLDisjointDataPropertiesAxiom; OWLDataPropertyDomainAxiom; OWLDataPropertyRangeAxiom; OWLFunctionalDataPropertyAxiom; OWLDatatypeDefinitionAxiom; OWLHasKeyAxiom; OWLSameIndividualAxiom; OWLDifferentIndividualsAxiom; OWLClassAssertionAxiom; OWLObjectPropertyAssertionAxiom; OWLNegativeObjectPropertyAssertionAxiom; OWLDataPropertyAssertionAxiom; OWLNegativeDataPropertyAssertionAxiom; OWLAnnotationAssertionAxiom; OWLSubAnnotationPropertyOfAxiom; OWLAnnotationPropertyDomainAxiom; OWLAnnotationPropertyRangeAxiom
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `AddOntologyAnnotation`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.AddOntologyAnnotation
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new AddOntologyAnnotation(ontology, annotation)
- Supported members: prototype.getAnnotation; prototype.getOntology
- Omitted Java members: Change-data, reverse-change, and visitor APIs
- Public errors: TypeError
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. AddOntologyAnnotation is a frozen immutable record; Java change-data, reverse-change, and visitor APIs remain deliberately unavailable.
- Evidence: model/ontologyChanges.test.js, model/owlOntologyManager.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `CLASS_EXPRESSION_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { CLASS_EXPRESSION_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLClass; OWLObjectIntersectionOf; OWLObjectUnionOf; OWLObjectComplementOf; OWLObjectOneOf; OWLObjectSomeValuesFrom; OWLObjectAllValuesFrom; OWLObjectHasValue; OWLObjectHasSelf; OWLObjectMinCardinality; OWLObjectMaxCardinality; OWLObjectExactCardinality; OWLDataSomeValuesFrom; OWLDataAllValuesFrom; OWLDataHasValue; OWLDataMinCardinality; OWLDataMaxCardinality; OWLDataExactCardinality
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `DATA_PROPERTY_EXPRESSION_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { DATA_PROPERTY_EXPRESSION_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLDataProperty
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `DATA_RANGE_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { DATA_RANGE_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLDatatype; OWLDataIntersectionOf; OWLDataUnionOf; OWLDataComplementOf; OWLDataOneOf; OWLDatatypeRestriction
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `ENTITY_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { ENTITY_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLClass; OWLDatatype; OWLObjectProperty; OWLDataProperty; OWLAnnotationProperty; OWLNamedIndividual
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `INDIVIDUAL_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { INDIVIDUAL_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLNamedIndividual; OWLAnonymousIndividual
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `IRI`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.IRI
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new IRI(...arguments)
- Supported members: prototype.toString; static create
- Omitted Java members: Java URI/File overloads and scheme helpers; Java Comparable ordering contract
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OBJECT_PROPERTY_EXPRESSION_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { OBJECT_PROPERTY_EXPRESSION_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: OWLObjectProperty; OWLObjectInverseOf
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `OWLDataFactory`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLDataFactory
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLDataFactory(...arguments)
- Supported members: prototype.getOWLAnnotation; prototype.getOWLAnnotationAssertionAxiom; prototype.getOWLAnnotationProperty; prototype.getOWLAnnotationPropertyDomainAxiom; prototype.getOWLAnnotationPropertyRangeAxiom; prototype.getOWLAnonymousIndividual; prototype.getOWLAsymmetricObjectPropertyAxiom; prototype.getOWLClass; prototype.getOWLClassAssertionAxiom; prototype.getOWLDataAllValuesFrom; prototype.getOWLDataComplementOf; prototype.getOWLDataExactCardinality; prototype.getOWLDataHasValue; prototype.getOWLDataIntersectionOf; prototype.getOWLDataMaxCardinality; prototype.getOWLDataMinCardinality; prototype.getOWLDataOneOf; prototype.getOWLDataProperty; prototype.getOWLDataPropertyAssertionAxiom; prototype.getOWLDataPropertyDomainAxiom; prototype.getOWLDataPropertyRangeAxiom; prototype.getOWLDataSomeValuesFrom; prototype.getOWLDataUnionOf; prototype.getOWLDatatype; prototype.getOWLDatatypeDefinitionAxiom; prototype.getOWLDatatypeRestriction; prototype.getOWLDeclarationAxiom; prototype.getOWLDifferentIndividualsAxiom; prototype.getOWLDisjointClassesAxiom; prototype.getOWLDisjointDataPropertiesAxiom; prototype.getOWLDisjointObjectPropertiesAxiom; prototype.getOWLDisjointUnionAxiom; prototype.getOWLEquivalentClassesAxiom; prototype.getOWLEquivalentDataPropertiesAxiom; prototype.getOWLEquivalentObjectPropertiesAxiom; prototype.getOWLFacetRestriction; prototype.getOWLFunctionalDataPropertyAxiom; prototype.getOWLFunctionalObjectPropertyAxiom; prototype.getOWLHasKeyAxiom; prototype.getOWLImportsDeclaration; prototype.getOWLInverseFunctionalObjectPropertyAxiom; prototype.getOWLInverseObjectPropertiesAxiom; prototype.getOWLIrreflexiveObjectPropertyAxiom; prototype.getOWLLiteral; prototype.getOWLNamedIndividual; prototype.getOWLNegativeDataPropertyAssertionAxiom; prototype.getOWLNegativeObjectPropertyAssertionAxiom; prototype.getOWLObjectAllValuesFrom; prototype.getOWLObjectComplementOf; prototype.getOWLObjectExactCardinality; prototype.getOWLObjectHasSelf; prototype.getOWLObjectHasValue; prototype.getOWLObjectIntersectionOf; prototype.getOWLObjectInverseOf; prototype.getOWLObjectMaxCardinality; prototype.getOWLObjectMinCardinality; prototype.getOWLObjectOneOf; prototype.getOWLObjectProperty; prototype.getOWLObjectPropertyAssertionAxiom; prototype.getOWLObjectPropertyDomainAxiom; prototype.getOWLObjectPropertyRangeAxiom; prototype.getOWLObjectSomeValuesFrom; prototype.getOWLObjectUnionOf; prototype.getOWLOntologyID; prototype.getOWLReflexiveObjectPropertyAxiom; prototype.getOWLSameIndividualAxiom; prototype.getOWLSubAnnotationPropertyOfAxiom; prototype.getOWLSubClassOfAxiom; prototype.getOWLSubDataPropertyOfAxiom; prototype.getOWLSubObjectPropertyOfAxiom; prototype.getOWLSubPropertyChainOfAxiom; prototype.getOWLSymmetricObjectPropertyAxiom; prototype.getOWLTransitiveObjectPropertyAxiom; prototype.getRDFSLabel
- Omitted Java members: SWRL object construction
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLDocumentFormat`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLDocumentFormat
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLDocumentFormat(...arguments)
- Supported members: prototype.getOntologyLoaderMetaData; prototype.getParameter; prototype.withOntologyLoaderMetaData; prototype.withParameter
- Omitted Java members: setOntologyLoaderMetaData (use immutable withOntologyLoaderMetaData); Java parameter-map and prefix-format mutation APIs; Java document-format factory identity
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. getOntologyLoaderMetaData returns RDFParserMetaData or undefined. withOntologyLoaderMetaData returns an immutable format copy instead of Java's mutating setter; withParameter retains historical parse metadata. Shared OWLDocumentFormats constants are never modified.
- Evidence: model/owlDocumentFormat.test.js, io/rdfParserMetaData.test.js

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLObjectKind`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { OWLObjectKind } from "@hadden-industries/owlapi/model"
- Supported members: ANNOTATION; ANNOTATION_ASSERTION_AXIOM; ANNOTATION_PROPERTY; ANNOTATION_PROPERTY_DOMAIN_AXIOM; ANNOTATION_PROPERTY_RANGE_AXIOM; ANONYMOUS_INDIVIDUAL; ASYMMETRIC_OBJECT_PROPERTY_AXIOM; CLASS; CLASS_ASSERTION_AXIOM; DATATYPE; DATATYPE_DEFINITION_AXIOM; DATATYPE_RESTRICTION; DATA_ALL_VALUES_FROM; DATA_COMPLEMENT_OF; DATA_EXACT_CARDINALITY; DATA_HAS_VALUE; DATA_INTERSECTION_OF; DATA_MAX_CARDINALITY; DATA_MIN_CARDINALITY; DATA_ONE_OF; DATA_PROPERTY; DATA_PROPERTY_ASSERTION_AXIOM; DATA_PROPERTY_DOMAIN_AXIOM; DATA_PROPERTY_RANGE_AXIOM; DATA_SOME_VALUES_FROM; DATA_UNION_OF; DECLARATION_AXIOM; DIFFERENT_INDIVIDUALS_AXIOM; DISJOINT_CLASSES_AXIOM; DISJOINT_DATA_PROPERTIES_AXIOM; DISJOINT_OBJECT_PROPERTIES_AXIOM; DISJOINT_UNION_AXIOM; EQUIVALENT_CLASSES_AXIOM; EQUIVALENT_DATA_PROPERTIES_AXIOM; EQUIVALENT_OBJECT_PROPERTIES_AXIOM; FACET_RESTRICTION; FUNCTIONAL_DATA_PROPERTY_AXIOM; FUNCTIONAL_OBJECT_PROPERTY_AXIOM; HAS_KEY_AXIOM; IMPORTS_DECLARATION; INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM; INVERSE_OBJECT_PROPERTIES_AXIOM; IRI; IRREFLEXIVE_OBJECT_PROPERTY_AXIOM; LITERAL; NAMED_INDIVIDUAL; NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM; NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM; OBJECT_ALL_VALUES_FROM; OBJECT_COMPLEMENT_OF; OBJECT_EXACT_CARDINALITY; OBJECT_HAS_SELF; OBJECT_HAS_VALUE; OBJECT_INTERSECTION_OF; OBJECT_INVERSE_OF; OBJECT_MAX_CARDINALITY; OBJECT_MIN_CARDINALITY; OBJECT_ONE_OF; OBJECT_PROPERTY; OBJECT_PROPERTY_ASSERTION_AXIOM; OBJECT_PROPERTY_DOMAIN_AXIOM; OBJECT_PROPERTY_RANGE_AXIOM; OBJECT_SOME_VALUES_FROM; OBJECT_UNION_OF; ONTOLOGY_ID; REFLEXIVE_OBJECT_PROPERTY_AXIOM; SAME_INDIVIDUAL_AXIOM; SUBCLASS_OF_AXIOM; SUB_ANNOTATION_PROPERTY_AXIOM; SUB_DATA_PROPERTY_AXIOM; SUB_OBJECT_PROPERTY_AXIOM; SUB_PROPERTY_CHAIN_AXIOM; SYMMETRIC_OBJECT_PROPERTY_AXIOM; TRANSITIVE_OBJECT_PROPERTY_AXIOM
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `OWLOntology`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntology
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLOntology(...arguments)
- Supported members: prototype.getAnnotationPropertiesInSignature; prototype.getAnnotations; prototype.getAxioms; prototype.getAxiomsByType; prototype.getClassesInSignature; prototype.getDataPropertiesInSignature; prototype.getDatatypesInSignature; prototype.getImportsDeclarations; prototype.getIndividualsInSignature; prototype.getObjectPropertiesInSignature; prototype.getOntologyID; prototype.getReferencingAxioms
- Omitted Java members: Java stream-returning query overloads; Java visitor overloads
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLOntologyLoaderConfiguration`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLOntologyLoaderConfiguration(...arguments)
- Supported members: prototype.with; prototype.withFormat; prototype.withMissingImportHandling; prototype.withParsingMode; prototype.withRdfDatasetGraphPolicy; prototype.withRemoteImports; prototype.withRemoteJsonLdContexts; static defaults
- Omitted Java members: Java parser-factory and priority-collection settings; Java fluent setter for every Java-only loading option
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLOntologyManager`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyManager
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLOntologyManager(...arguments)
- Supported members: prototype.addAxiom; prototype.addAxioms; prototype.applyChange; prototype.applyChanges; prototype.createOntology; prototype.getImportsClosure; prototype.getOWLDataFactory; prototype.getOntology; prototype.getOntologyFormat; prototype.importsClosure; prototype.loadOntologyFromOntologyDocument; prototype.loadOntologyGraphFromOntologyDocument; prototype.saveOntology
- Omitted Java members: Change and progress listeners; AddAxiom/RemoveAxiom change records and axiom removal operations; AddImport/RemoveImport changes; RemoveOntologyAnnotation changes; Storer and ontology-factory registration; IRI, stream, implicit-format, and default-document saveOntology overloads
- Public errors: DocumentLoadError; MissingImportError; OWLOntologyCreationError; OWLOntologyStateError; OWLOntologyStorageError; OWLStorerNotFoundError; UnparsableOntologyException
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. getOntologyFormat returns this manager's loaded OWLDocumentFormat or undefined for a programmatically created ontology, and rejects foreign or removed ontologies. RDF metadata belongs to the original completed parse and remains historical after edits. importsClosure returns a frozen deterministic root-first array snapshot instead of Java's Stream<OWLOntology>; getImportsClosure returns a fresh defensive Set with the same order and membership. Both closure methods reject an ontology not owned by this manager with OWLOntologyStateError instead of returning Java's empty closure. addAxiom/addAxioms accept one JavaScript iterable form and return boolean instead of Java's ChangeApplied; each complete call is validated and committed atomically. applyChange/applyChanges accept only SetOntologyID and AddOntologyAnnotation records, materialize one JavaScript iterable form, atomically publish the complete list, and return boolean instead of Java's ChangeApplied or ChangeDetails. LIFECYCLE-ASYNC-SAVE-OVERLOAD: saveOntology(ontology, format, target) returns Promise<void>, validates ownership and genuine format/target identities, and selects only the exact format key. LIFECYCLE-LOSSLESS-STORAGE: saveOntology renders one committed snapshot and atomically replaces target text only after success; unexpected renderer failures are wrapped with cause and typed storage errors retain identity.
- Evidence: internal/loading/managedOntologyIndex.test.js, internal/model/axiomSemantics.test.js, internal/model/ontologyState.test.js, model/model.test.js, model/ontologyChanges.test.js, model/owlOntologyManager.integration.test.js, model/owlOntologyManager.test.js, test/package-boundary.test.mjs, internal/storage/storerRegistry.test.js, model/owlOntologyManager.storage.test.js

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLStructuralObject`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLStructuralObject(...arguments)
- Supported members: prototype.equals; prototype.equalsIgnoreAnnotations; prototype.structuralKey; prototype.structuralKeyWithoutAnnotations; prototype.toStructuralTuple
- Omitted Java members: Java concrete OWLObject subtype hierarchy; Java visitor and Comparable contracts
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWL_OBJECT_KINDS`

An immutable vocabulary used to classify supported OWL structural values.

- Import: `@hadden-industries/owlapi/model`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { OWL_OBJECT_KINDS } from "@hadden-industries/owlapi/model"
- Supported members: IRI; OWLLiteral; OWLAnonymousIndividual; OWLAnnotation; OWLImportsDeclaration; OWLOntologyID; OWLClass; OWLDatatype; OWLObjectProperty; OWLDataProperty; OWLAnnotationProperty; OWLNamedIndividual; OWLObjectInverseOf; OWLObjectIntersectionOf; OWLObjectUnionOf; OWLObjectComplementOf; OWLObjectOneOf; OWLObjectSomeValuesFrom; OWLObjectAllValuesFrom; OWLObjectHasValue; OWLObjectHasSelf; OWLObjectMinCardinality; OWLObjectMaxCardinality; OWLObjectExactCardinality; OWLDataSomeValuesFrom; OWLDataAllValuesFrom; OWLDataHasValue; OWLDataMinCardinality; OWLDataMaxCardinality; OWLDataExactCardinality; OWLDataIntersectionOf; OWLDataUnionOf; OWLDataComplementOf; OWLDataOneOf; OWLDatatypeRestriction; OWLFacetRestriction; OWLDeclarationAxiom; OWLSubClassOfAxiom; OWLEquivalentClassesAxiom; OWLDisjointClassesAxiom; OWLDisjointUnionAxiom; OWLSubObjectPropertyOfAxiom; OWLSubPropertyChainOfAxiom; OWLEquivalentObjectPropertiesAxiom; OWLDisjointObjectPropertiesAxiom; OWLObjectPropertyDomainAxiom; OWLObjectPropertyRangeAxiom; OWLInverseObjectPropertiesAxiom; OWLFunctionalObjectPropertyAxiom; OWLInverseFunctionalObjectPropertyAxiom; OWLReflexiveObjectPropertyAxiom; OWLIrreflexiveObjectPropertyAxiom; OWLSymmetricObjectPropertyAxiom; OWLAsymmetricObjectPropertyAxiom; OWLTransitiveObjectPropertyAxiom; OWLSubDataPropertyOfAxiom; OWLEquivalentDataPropertiesAxiom; OWLDisjointDataPropertiesAxiom; OWLDataPropertyDomainAxiom; OWLDataPropertyRangeAxiom; OWLFunctionalDataPropertyAxiom; OWLDatatypeDefinitionAxiom; OWLHasKeyAxiom; OWLSameIndividualAxiom; OWLDifferentIndividualsAxiom; OWLClassAssertionAxiom; OWLObjectPropertyAssertionAxiom; OWLNegativeObjectPropertyAssertionAxiom; OWLDataPropertyAssertionAxiom; OWLNegativeDataPropertyAssertionAxiom; OWLAnnotationAssertionAxiom; OWLSubAnnotationPropertyOfAxiom; OWLAnnotationPropertyDomainAxiom; OWLAnnotationPropertyRangeAxiom
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `SetOntologyID`

A JavaScript implementation of the corresponding Java OWLAPI concept, scoped to the documented initial surface.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.SetOntologyID
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new SetOntologyID(ontology, ontologyID)
- Supported members: prototype.getNewOntologyID; prototype.getOntology; prototype.getOriginalOntologyID
- Omitted Java members: Java IRI constructor overload; Change-data, reverse-change, and visitor APIs
- Public errors: TypeError
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. SetOntologyID is a frozen immutable record and accepts only OWLOntologyID; Java's IRI constructor overload and change-operation helpers remain deliberately unavailable.
- Evidence: internal/loading/managedOntologyIndex.test.js, model/ontologyChanges.test.js, model/owlOntologyManager.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `StructuralSet`

A JavaScript adaptation supporting the initial public OWLAPI workflow.

- Import: `@hadden-industries/owlapi/model`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLObject
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new StructuralSet(...arguments)
- Supported members: prototype.add; prototype.has; prototype.size; prototype.toSet; prototype.values
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchAnnotationValue`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchAnnotationValue(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchAxiom`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchAxiom(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchClassExpression`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchClassExpression(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchDataPropertyExpression`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchDataPropertyExpression(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchDataRange`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchDataRange(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchIndividual`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchIndividual(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchObjectPropertyExpression`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchObjectPropertyExpression(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `dispatchOwlObject`

Exhaustive kind-checked dispatch for one Java OWLAPI structural model family.

- Import: `@hadden-industries/owlapi/model`
- Kind: FUNCTION
- Java authority: org.semanticweb.owlapi.model.OWLObjectVisitorEx
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: dispatchOwlObject(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `AmbiguousRdfDatasetError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyCreationException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new AmbiguousRdfDatasetError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `DocumentLoadError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyCreationException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new DocumentLoadError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `GraphSelectionError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyCreationException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new GraphSelectionError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `MissingImportError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.UnloadableImportException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new MissingImportError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `OWLAPIError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLRuntimeException
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLAPIError(...arguments)
- Supported members: constructor
- Omitted Java members: Java exception serialization and constructor overloads
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLOntologyCreationError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyCreationException
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLOntologyCreationError(...arguments)
- Supported members: constructor
- Omitted Java members: Java exception constructor and serialization overloads
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLOntologyStateError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLRuntimeException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLOntologyStateError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `OWLOntologyStorageError`

The canonical storage error, including lossless-representation failures identified by a safe reason field.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyStorageException
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new OWLOntologyStorageError(message?, details?)
- Supported members: constructor
- Omitted Java members: Java Throwable-only and serialization constructor forms
- Public errors: none specific
- Qualification: PARITY-ERROR-SUFFIX: Java OWLOntologyStorageException uses the established JavaScript Error suffix. PARITY-ERROR-HIERARCHY: extends the existing OWLAPIError root rather than introducing Java's checked OWLException hierarchy. PARITY-ERROR-NAMESPACE: the canonical binding is owned by owlapi/io and re-exported only through the existing bare aggregate, not owlapi/model. PARITY-STORAGE-REASON: code ONTOLOGY_STORAGE_FAILED and safe own reason ONTOLOGY_NOT_REPRESENTABLE classify lossless-storage failures without a new public subclass; native cause and protected identity follow OWLAPIError.
- Evidence: io/io.test.js, test/package-boundary.test.mjs, test/installed-package-boundary.mjs, test/installed-package-smoke.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLParserError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.OWLParserException
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLParserError(...arguments)
- Supported members: constructor
- Omitted Java members: Java exception constructor and line/column overloads
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLStorerNotFoundError`

A storage-error subtype for an OWLDocumentFormat with no matching storer.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLStorerNotFoundException
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new OWLStorerNotFoundError(format)
- Supported members: constructor
- Omitted Java members: Java exception serialization
- Public errors: none specific
- Qualification: PARITY-ERROR-SUFFIX: Java OWLStorerNotFoundException uses the established JavaScript Error suffix and stable STORER_NOT_FOUND code. PARITY-ERROR-HIERARCHY: extends OWLOntologyStorageError, retaining Java's storage-exception subtype relation; the constructor takes the requested OWLDocumentFormat and exposes no getFormat() member. PARITY-ERROR-NAMESPACE: the canonical binding is owned by owlapi/io and re-exported only through the existing bare aggregate, not owlapi/model.
- Evidence: io/io.test.js, test/package-boundary.test.mjs, test/installed-package-boundary.mjs, test/installed-package-smoke.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLSyntaxError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.OWLParserException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new OWLSyntaxError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `ParserMismatchError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.OWLParserException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new ParserMismatchError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `RDFOntologyHeaderStatus`

A JavaScript-specific helper at an approved Java OWLAPI namespace boundary.

- Import: `@hadden-industries/owlapi/io`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.io.RDFOntologyHeaderStatus
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: import { RDFOntologyHeaderStatus } from "@hadden-industries/owlapi/io"
- Supported members: PARSED_MULTIPLE_HEADERS; PARSED_ONE_HEADER; PARSED_ZERO_HEADERS
- Omitted Java members: Java enum methods
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. A frozen string-valued vocabulary with PARSED_ZERO_HEADERS, PARSED_ONE_HEADER and PARSED_MULTIPLE_HEADERS, replacing Java enum instances.
- Evidence: io/rdfParserMetaData.test.js, model/rdfConsumerCompatibility.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `RDFParserMetaData`

A JavaScript adaptation supporting the initial public OWLAPI workflow.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.RDFParserMetaData
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new RDFParserMetaData(...arguments)
- Supported members: prototype.getGuessedDeclarations; prototype.getHeaderState; prototype.getTripleCount; prototype.getUnparsedTriples
- Omitted Java members: Java RDFTriple/RDFNode wrapper hierarchy, Java Stream and Class-valued Multimap APIs, serialization and positional constructor overload
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. Construct with {tripleCount, headerState, unparsedTriples = [], guessedDeclarations = []}; all inputs are defensively copied into immutable parse metadata. getUnparsedTriples returns a frozen array of {subject, predicate, object} RDF/JS-shaped term records, not Java RDFTriple instances. Each record has termType and value; literals also have language and datatype {termType: NamedNode, value}, and optionally direction. Blank-node labels are local to the containing document metadata. getGuessedDeclarations returns a frozen array of {iri: IRI, entityType: OWLObjectKind} for entity roles in this document's reconstructed structure without explicit local/imported declarations or built-in status. This replaces Java's IRI-to-Class multimap and does not itself add Declaration axioms; unused imported roles are excluded. getTripleCount counts unique triples in the selected or merged reconstruction graph, not duplicate source occurrences or excluded named graphs. getHeaderState reflects explicit owl:Ontology subjects in that graph; unlike the pinned Java parser's constant ONE result it reports ZERO and MULTIPLE truthfully. Metadata remains available when collectWarnings is false. It records the original parse; it neither tracks subsequent ontology edits nor certifies complete source preservation, inferred-axiom provenance or current source assessment.
- Evidence: io/rdfParserMetaData.test.js, model/rdfConsumerCompatibility.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `ResourceLimitError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLRuntimeException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new ResourceLimitError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `SecurityPolicyError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new SecurityPolicyError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `StringDocumentSource`

A JavaScript adaptation supporting the initial public OWLAPI workflow.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.StringDocumentSource
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new StringDocumentSource(...arguments)
- Supported members: prototype.getContentType; prototype.getDocumentIRI; prototype.getFileName; prototype.getFormat; prototype.getText
- Omitted Java members: Java Reader/InputStream accessors; Java constructor overloads using OWLDocumentFormat and MIME metadata
- Public errors: TypeError
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `StringDocumentTarget`

An in-memory ontology document target with Java's toString() text reader and private atomic replacement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.StringDocumentTarget
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new StringDocumentTarget()
- Supported members: prototype.toString
- Omitted Java members: getWriter() and the Java Writer protocol (PARITY-TARGET-WRITER-OMISSION)
- Public errors: none specific
- Qualification: PARITY-TARGET-WRITER-OMISSION: toString() is the only public text reader; no getText(), getWriter(), write(), append(), or constructor-text overload is exposed. PARITY-TARGET-ATOMIC-COMMIT: package-private complete-text replacement validates before changing private state; failed storage retains prior text.
- Evidence: io/stringDocumentTarget.test.js, test/package-boundary.test.mjs, test/installed-package-boundary.mjs, test/installed-package-smoke.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `UnloadableImportError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.model.UnloadableImportException
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new UnloadableImportError(...arguments)
- Supported members: constructor
- Omitted Java members: Java import-declaration and creation-exception accessors
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `UnparsableOntologyException`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.UnparsableOntologyException
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new UnparsableOntologyException(...arguments)
- Supported members: constructor
- Omitted Java members: Java parser-to-exception map and document-IRI constructor overloads
- Public errors: none specific
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `UnsupportedConstructError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.OWLParserException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new UnsupportedConstructError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `XmlParseError`

A stable public error category used by ontology loading, parsing, or policy enforcement.

- Import: `@hadden-industries/owlapi/io`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.io.OWLParserException
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: new XmlParseError(...arguments)
- Supported members: constructor
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: io/io.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `OWLDocumentFormats`

Immutable identities for every ontology document format supported by the initial parser set.

- Import: `@hadden-industries/owlapi/formats`
- Kind: CONSTANT
- Java authority: org.semanticweb.owlapi.formats
- Relationship: JS_EXTENSION; compatibility: NOT_APPLICABLE
- Release status: PRERELEASE from 0.1.0-alpha.0
- Call shape: import { OWLDocumentFormats } from "@hadden-industries/owlapi/formats"
- Supported members: DL; FUNCTIONAL; JSON_LD; KRSS1; KRSS2; MANCHESTER; N_QUADS; N_TRIPLES; OWL_XML; RDF_XML; TRIG; TURTLE
- Omitted Java members: none recorded
- Public errors: none specific
- Qualification: This helper is public because it makes the supported structural API practical in JavaScript; it is not claimed as a Java type translation.
- Evidence: model/model.test.js, test/package-boundary.test.mjs

Use this export only through its documented package specifier; do not infer additional Java API compatibility from its namespace.

## `OWLOntologyImportsClosureSetProvider`

A constructor-time imports-closure snapshot provider with defensive JavaScript Set results.

- Import: `@hadden-industries/owlapi/util`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new OWLOntologyImportsClosureSetProvider(manager, rootOntology)
- Supported members: prototype.ontologies
- Omitted Java members: none recorded
- Public errors: OWLOntologyStateError; TypeError
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. ontologies returns a fresh defensive JavaScript Set instead of Java's Stream<OWLOntology>. The imports-closure membership is captured at construction instead of remaining a live Java view.
- Evidence: util/owlOntologyImportsClosureSetProvider.test.js, test/package-boundary.test.mjs, test/installed-package-smoke.mjs, test/consumers/browser/browser-consumers.playwright.js

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLOntologyMerger`

A Java-shaped ontology merger that materializes the structural union of supplied direct axioms.

- Import: `@hadden-industries/owlapi/util`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.util.OWLOntologyMerger
- Relationship: JAVA_ANALOGUE; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new OWLOntologyMerger(provider); new OWLOntologyMerger(provider, mergeOnlyLogicalAxioms)
- Supported members: prototype.createMergedOntology
- Omitted Java members: OWLAxiomFilter constructor overload and passes(axiom) surface
- Public errors: OWLOntologyStateError; TypeError
- Qualification: Names and concepts follow Java OWLAPI where JavaScript runtime semantics permit; only the listed members are promised. createMergedOntology builds a structural set union from each supplied ontology's direct axioms before creating the target, then mutates the target only through public manager methods. The optional boolean constructor form selects Java-compatible logical-axiom filtering; the OWLAxiomFilter constructor remains unavailable. An omitted ontologyIRI creates an anonymous target; a supplied value must be an IRI.
- Evidence: util/owlOntologyMerger.test.js, test/package-boundary.test.mjs, test/installed-package-smoke.mjs, test/consumers/browser/browser-consumers.playwright.js

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWL2DLProfile`

An asynchronous, bounded OWL 2 DL structural checker over the complete managed import closure, with a separate source-qualified assessment.

- Import: `@hadden-industries/owlapi/profiles`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.profiles.OWL2DLProfile
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: new OWL2DLProfile(); await profile.checkOntology(ontology, options?)
- Supported members: prototype.checkOntology; prototype.getIRI; prototype.getName
- Omitted Java members: Java visitor implementation classes; getDatatypeIRIs(); Stream and Collection overloads
- Public errors: none specific
- Qualification: Returns a Promise and supports cooperative cancellation and resource limits; incomplete validation is unverified, never valid. The formal verdict applies to the structural OWL closure. Optional sourceAssessment also validates retained RDF/RDFS structures and parsed expressions before consumer filtering. Only trusted original source arity and unambiguous typed use qualify the two documented normalization/declaration differences; mutation invalidates that evidence. Datatype checks follow the mandatory OWL 2 datatype map and raw lexical/value spaces, including nested annotations. See docs/compatibility/canonical-vowl-prerequisites.md for normative choices and Java deviations.
- Evidence: profiles/owl2DLProfile.test.js, model/rdfsSourcePreservation.test.js, model/sourcePropertyRoles.test.js, internal/profiles/datatypes.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.

## `OWLProfileReport`

An immutable checker result separating valid, invalid and unverified outcomes, with stable violation records and optional source assessment.

- Import: `@hadden-industries/owlapi/profiles`
- Kind: CLASS
- Java authority: org.semanticweb.owlapi.profiles.OWLProfileReport
- Relationship: JS_ADAPTATION; compatibility: ADAPTED
- Release status: PRERELEASE from 0.1.0-rc.1
- Call shape: await new OWL2DLProfile().checkOntology(ontology, options?)
- Supported members: prototype.getOntology; prototype.getProfile; prototype.getSourceAssessment; prototype.getViolations; prototype.isInProfile
- Omitted Java members: Java violation class hierarchy; Java stream/visitor overloads; Java constructor overloads
- Public errors: none specific
- Qualification: isInProfile() returns true only for a completed valid formal check. getSourceAssessment() returns the independently stated source-qualified verdict when requested. Violations are immutable data records rather than Java visitor objects. getOntology() and getProfile() retain their input identities. Additional status, closure revisions, unverifiedChecks and sourceAssessment fields expose bounded JavaScript validation evidence; direct construction does not execute validation.
- Evidence: profiles/owl2DLProfile.test.js, test/package-boundary.test.mjs

Use the documented JavaScript call shapes and treat unlisted Java overloads or members as unavailable.
