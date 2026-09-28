import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.jsonldjava.core.DocumentLoader;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import org.eclipse.rdf4j.rio.helpers.JSONLDSettings;
import org.eclipse.rdf4j.rio.Rio;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.semanticweb.owlapi.rio.utils.RioUtils;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.AddOntologyAnnotation;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.MissingImportHandlingStrategy;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyIRIMapper;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.model.SetOntologyID;
import org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider;
import org.semanticweb.owlapi.util.OWLOntologyMerger;
import org.semanticweb.owlapi.util.VersionInfo;

/** Development-only acceptance oracle backed by one pinned Java OWLAPI revision. */
final class OntologyReferenceContract {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int RESULT_SCHEMA_VERSION = 1;
    private static final AtomicInteger NETWORK_ACCESS_ATTEMPT_COUNT = new AtomicInteger();
    private static final Set<String> NETWORK_PROTOCOLS;

    static {
        Set<String> protocols = new HashSet<>();
        protocols.add("ftp");
        protocols.add("http");
        protocols.add("https");
        NETWORK_PROTOCOLS = Collections.unmodifiableSet(protocols);
    }

    enum ComparisonKind { ONTOLOGY_PARSING, IMPORT_CLOSURE }

    private OntologyReferenceContract() {}

    static void run(String[] arguments, ComparisonKind comparisonKind) throws Exception {
        Invocation invocation = null;
        Map<String, Object> result;
        try {
            invocation = Invocation.parse(arguments);
            configureOfflineDocumentLoading();
            result = evaluateContract(invocation, comparisonKind);
        } catch (Exception failure) {
            String pinnedRevision = invocation == null ? null : invocation.pinnedRevision;
            String owlapiVersion = invocation == null ? null : invocation.expectedOwlapiVersion;
            System.err.println(failure.getClass().getSimpleName() + ": " + failure.getMessage());
            result = createResult(pinnedRevision, owlapiVersion, Collections.emptyList(), null,
                null, 0, "ERROR", "ORACLE_EXECUTION", "oracle", 0, 0, 0, Collections.emptyList());
        }

        result.put("comparisonKind", comparisonKind.name());
        JSON.writeValue(System.out, result);
        System.out.println();
        System.exit("MATCH".equals(result.get("comparisonOutcome")) ? 0 : 1);
    }

    private static void configureOfflineDocumentLoading() {
        // JSON-LD loaders use HTTP clients that do not consult URL stream handlers.
        // Configure their supported policies before constructing any parser.
        System.setProperty(JSONLDSettings.SECURE_MODE.getKey(), "true");
        System.setProperty(JSONLDSettings.WHITELIST.getKey(), "[]");
        System.setProperty(DocumentLoader.DISALLOW_REMOTE_CONTEXT_LOADING, "true");
        URL.setURLStreamHandlerFactory(protocol -> NETWORK_PROTOCOLS.contains(protocol)
            ? new DeniedNetworkURLStreamHandler(protocol) : null);
    }

    private static Map<String, Object> evaluateContract(Invocation invocation, ComparisonKind comparisonKind) {
        CatalogManifest catalogManifest = null;
        ExactCatalogIRIMapper sourceIRIMapper = null;
        NonResolvingOutputImportIRIMapper outputImportIRIMapper = null;
        List<Map<String, Object>> closureMemberIds = Collections.emptyList();
        List<Map<String, Object>> sourceDiagnostics = new ArrayList<>();
        Map<String, Object> structuralDifferences = null;
        Map<String, Object> propagationEvidence = null;
        Map<String, Object> expectedCounts = null;
        Map<String, Object> actualCounts = null;
        OntologyStructuralComparison.ComparisonOutcome comparison = null;
        List<String> outputUnparsedTriples = Collections.emptyList();
        String loadedOwlapiVersion = invocation.expectedOwlapiVersion;
        try {
            loadedOwlapiVersion = VersionInfo.getVersionInfo().getVersion();
            if (!invocation.expectedOwlapiVersion.equals(loadedOwlapiVersion)) {
                throw new OracleContractException("OWLAPI_VERSION_MISMATCH", "owlapiVersion",
                    "Loaded OWLAPI version " + loadedOwlapiVersion + " does not match "
                        + invocation.expectedOwlapiVersion);
            }

            catalogManifest = readCatalogManifest(invocation.catalogMappingsPath);
            sourceIRIMapper = new ExactCatalogIRIMapper(catalogManifest.mappings);
            OWLOntologyManager sourceManager = OWLManager.createOWLOntologyManager();
            sourceManager.getIRIMappers().clear();
            sourceManager.getIRIMappers().add(sourceIRIMapper);
            sourceManager.setOntologyLoaderConfiguration(new OWLOntologyLoaderConfiguration()
                .setStrict(false).setLoadAnnotationAxioms(true)
                .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.THROW_EXCEPTION));
            OWLOntology rootOntology = sourceManager.loadOntologyFromOntologyDocument(
                IRI.create(invocation.rootPath.toUri()));

            List<OWLOntology> closure = sourceManager.importsClosure(rootOntology)
                .collect(Collectors.toList());
            closureMemberIds = closure.stream().map(ontology -> OntologyStructuralComparison.ontologyIdentity(
                ontology.getOntologyID())).sorted(OntologyStructuralComparison::compareOntologyIdentity)
                .collect(Collectors.toList());

            for (OWLOntology member : closure) {
                List<String> unparsedTriples = sourceManager.getOntologyFormat(member)
                    .getOntologyLoaderMetaData()
                    .map(metadata -> metadata.getUnparsedTriples().map(Object::toString)
                        .sorted().collect(Collectors.toList()))
                    .orElse(Collections.emptyList());
                Map<String, Object> diagnostic = new LinkedHashMap<>();
                diagnostic.put("ontologyID", OntologyStructuralComparison.ontologyIdentity(member.getOntologyID()));
                diagnostic.put("unparsedTriples", unparsedTriples);
                diagnostic.put("unparsedNQuads", unparsedNQuads(sourceManager, member));
                sourceDiagnostics.add(diagnostic);
            }
            OWLOntologyManager expectedManager = OWLManager.createOWLOntologyManager();
            OWLOntology expectedOntology;
            if (comparisonKind == ComparisonKind.IMPORT_CLOSURE) {
                OWLOntologyMerger merger = new OWLOntologyMerger(
                    new OWLOntologyImportsClosureSetProvider(sourceManager, rootOntology), false);
                expectedOntology = merger.createMergedOntology(expectedManager, null);
                expectedManager.applyChange(
                    new SetOntologyID(expectedOntology, rootOntology.getOntologyID()));
                OWLOntology mergedOntology = expectedOntology;
                rootOntology.annotations().forEach(annotation -> expectedManager
                    .applyChange(new AddOntologyAnnotation(mergedOntology, annotation)));
            } else {
                IRI sourceDocumentIRI = IRI.create(invocation.sourceDocumentPath.toUri());
                expectedOntology = closure.stream().filter(ontology -> sourceManager
                    .getOntologyDocumentIRI(ontology).equals(sourceDocumentIRI)).findFirst()
                    .orElseThrow(() -> new OracleContractException("SOURCE_DOCUMENT_NOT_LOADED",
                        "sourceDocument", "Requested document is outside the original import closure"));
            }

            OWLOntologyManager actualManager = OWLManager.createOWLOntologyManager();
            actualManager.getIRIMappers().clear();
            Path nonResolvingOutputImportPath = invocation.catalogMappingsPath.getParent()
                .resolve("intentionally-absent-output-import.ofn");
            if (Files.exists(nonResolvingOutputImportPath)) {
                throw new OracleContractException("OFFLINE_IMPORT_SENTINEL_EXISTS",
                    "catalogMappings", "Reserved non-resolving import path already exists");
            }
            outputImportIRIMapper =
                new NonResolvingOutputImportIRIMapper(nonResolvingOutputImportPath);
            actualManager.getIRIMappers().add(outputImportIRIMapper);
            actualManager.setOntologyLoaderConfiguration(new OWLOntologyLoaderConfiguration()
                .setStrict(false).setLoadAnnotationAxioms(true)
                .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.SILENT));
            OWLOntology actualOntology = actualManager.loadOntologyFromOntologyDocument(
                IRI.create(invocation.verifyOutputPath.toUri()));
            outputUnparsedTriples = actualManager.getOntologyFormat(actualOntology)
                .getOntologyLoaderMetaData()
                .map(metadata -> metadata.getUnparsedTriples().map(Object::toString)
                    .sorted().collect(Collectors.toList()))
                .orElse(Collections.emptyList());
            structuralDifferences = OntologyStructuralComparison.describeDifferences(
                expectedOntology, actualOntology, expectedManager);
            expectedCounts = OntologyStructuralComparison.ontologyCounts(expectedOntology);
            actualCounts = OntologyStructuralComparison.ontologyCounts(actualOntology);
            comparison = OntologyStructuralComparison.compareOntologies(expectedOntology, actualOntology,
                expectedManager);
            if (comparisonKind == ComparisonKind.IMPORT_CLOSURE && catalogManifest.parsedSourceModels != null) {
                propagationEvidence = compareModelClosure(catalogManifest.parsedSourceModels,
                    sourceManager, closure, invocation.rootPath, nonResolvingOutputImportPath, actualOntology);
            }
            if (sourceDiagnostics.stream().anyMatch(diagnostic ->
                    !((List<?>) diagnostic.get("unparsedTriples")).isEmpty())) {
                throw new OracleContractException("SOURCE_UNPARSED_RDF", "sourceDiagnostics",
                    "Java reported source RDF statements it did not reconstruct");
            }
            if (!outputUnparsedTriples.isEmpty()) {
                throw new OracleContractException("OUTPUT_UNPARSED_RDF", "output",
                    "Java did not reconstruct candidate RDF statements: " + outputUnparsedTriples);
            }
            if (NETWORK_ACCESS_ATTEMPT_COUNT.get() != 0) {
                throw new OracleContractException("NETWORK_ACCESS_ATTEMPT",
                    "networkEvidence.networkAccessAttemptCount",
                    "The oracle blocked an attempted network access");
            }

            Map<String, Object> result = createResult(invocation.pinnedRevision, loadedOwlapiVersion, closureMemberIds,
                expectedCounts, actualCounts, comparison.anonymousIndividualBijectionSize,
                comparison.matches ? "MATCH" : "MISMATCH", comparison.mismatchCategory,
                comparison.mismatchPath, catalogManifest.mappings.size(),
                sourceIRIMapper.mappedImportCount.get(),
                outputImportIRIMapper.blockedImportCount.get(), sourceDiagnostics);
            result.put("structuralDifferences", structuralDifferences);
            result.put("propagationEvidence", propagationEvidence);
            result.put("structuralComparisonOutcome", comparison.matches ? "MATCH" : "MISMATCH");
            result.put("outputUnparsedTriples", outputUnparsedTriples);
            return result;
        } catch (Exception failure) {
            MissingExactCatalogEntryException missingCatalogEntry = findCause(failure,
                MissingExactCatalogEntryException.class);
            OntologyStructuralComparison.AnonymousIndividualComparisonLimitException searchLimit = findCause(failure,
                OntologyStructuralComparison.AnonymousIndividualComparisonLimitException.class);
            OracleContractException contractFailure = findCause(failure,
                OracleContractException.class);
            String mismatchCategory;
            String mismatchPath;
            if (missingCatalogEntry != null) {
                mismatchCategory = "CATALOG_ENTRY_MISSING";
                mismatchPath = missingCatalogEntry.ontologyIRI;
            } else if (searchLimit != null) {
                mismatchCategory = "COMPARISON_LIMIT";
                mismatchPath = "ontology";
            } else if (contractFailure != null) {
                mismatchCategory = contractFailure.category;
                mismatchPath = contractFailure.path;
            } else {
                mismatchCategory = "ORACLE_EXECUTION";
                mismatchPath = "oracle";
            }
            System.err.println(failure.getClass().getSimpleName() + ": " + failure.getMessage());
            Map<String, Object> result = createResult(invocation.pinnedRevision, loadedOwlapiVersion,
                closureMemberIds, expectedCounts, actualCounts, 0, "ERROR", mismatchCategory, mismatchPath,
                catalogManifest == null ? 0 : catalogManifest.mappings.size(),
                sourceIRIMapper == null ? 0 : sourceIRIMapper.mappedImportCount.get(),
                outputImportIRIMapper == null ? 0 : outputImportIRIMapper.blockedImportCount.get(),
                sourceDiagnostics);
            result.put("structuralDifferences", structuralDifferences);
            result.put("propagationEvidence", propagationEvidence);
            result.put("structuralComparisonOutcome", comparison == null ? null : comparison.matches ? "MATCH" : "MISMATCH");
            result.put("outputUnparsedTriples", outputUnparsedTriples);
            return result;
        }
    }

    private static String unparsedNQuads(OWLOntologyManager manager, OWLOntology ontology) {
        StringWriter text = new StringWriter();
        manager.getOntologyFormat(ontology).getOntologyLoaderMetaData().ifPresent(metadata ->
            Rio.write(metadata.getUnparsedTriples().map(triple -> java.util.Objects.requireNonNull(
                RioUtils.tripleAsStatement(triple), "Unparsed RDF triple could not be serialized"))
                .collect(Collectors.toList()), text, RDFFormat.NQUADS));
        return text.toString();
    }

    /** Delegate propagation, deduplication and root-only metadata to the native merger. */
    private static Map<String, Object> compareModelClosure(List<ParsedSourceModel> models,
        OWLOntologyManager sourceManager, List<OWLOntology> sourceClosure, Path rootPath,
        Path absentImportPath, OWLOntology actualOntology) throws Exception {
        Map<IRI, OWLOntology> expectedDocuments = new HashMap<>();
        sourceClosure.forEach(ontology -> expectedDocuments.put(
            sourceManager.getOntologyDocumentIRI(ontology), ontology));
        OWLOntologyManager modelManager = OWLManager.createOWLOntologyManager();
        modelManager.getIRIMappers().clear();
        modelManager.getIRIMappers().add(new NonResolvingOutputImportIRIMapper(absentImportPath));
        modelManager.setOntologyLoaderConfiguration(new OWLOntologyLoaderConfiguration()
            .setStrict(false).setLoadAnnotationAxioms(true)
            .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.SILENT));
        OWLOntology rootModel = null;
        Set<IRI> observedDocuments = new HashSet<>();
        for (ParsedSourceModel model : models) {
            IRI documentIRI = IRI.create(Path.of(model.sourceDocumentPath).toAbsolutePath().normalize().toUri());
            OWLOntology expectedDocument = expectedDocuments.get(documentIRI);
            if (expectedDocument == null || !observedDocuments.add(documentIRI)) {
                throw new OracleContractException("SOURCE_MODEL_SET_MISMATCH", "parsedSourceModels",
                    "Every source document requires exactly one compared model");
            }
            OWLOntology parsedModel = modelManager.loadOntologyFromOntologyDocument(
                IRI.create(Path.of(model.modelPath).toAbsolutePath().normalize().toUri()));
            if (!unparsedNQuads(modelManager, parsedModel).isEmpty()) {
                throw new OracleContractException("SOURCE_MODEL_UNPARSED_RDF", "parsedSourceModels",
                    "A compared model has unparsed RDF");
            }
            if (!OntologyStructuralComparison.ontologyIdentity(expectedDocument.getOntologyID()).equals(
                    OntologyStructuralComparison.ontologyIdentity(parsedModel.getOntologyID()))) {
                throw new OracleContractException("SOURCE_MODEL_ID_MISMATCH", "parsedSourceModels",
                    "A compared model does not retain its source ontology identity");
            }
            if (documentIRI.equals(IRI.create(rootPath.toUri()))) rootModel = parsedModel;
        }
        if (!observedDocuments.equals(expectedDocuments.keySet()) || rootModel == null) {
            throw new OracleContractException("SOURCE_MODEL_SET_MISMATCH", "parsedSourceModels",
                "The compared models do not cover the complete source closure");
        }
        OWLOntologyManager mergedManager = OWLManager.createOWLOntologyManager();
        OWLOntology merged = new OWLOntologyMerger(modelManager, false)
            .createMergedOntology(mergedManager, null);
        mergedManager.applyChange(new SetOntologyID(merged, rootModel.getOntologyID()));
        rootModel.annotations().forEach(annotation -> mergedManager.applyChange(
            new AddOntologyAnnotation(merged, annotation)));
        OntologyStructuralComparison.ComparisonOutcome comparison =
            OntologyStructuralComparison.compareOntologies(merged, actualOntology, mergedManager);
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("comparisonOutcome", comparison.matches ? "MATCH" : "MISMATCH");
        evidence.put("expectedCounts", OntologyStructuralComparison.ontologyCounts(merged));
        evidence.put("actualCounts", OntologyStructuralComparison.ontologyCounts(actualOntology));
        evidence.put("structuralDifferences", OntologyStructuralComparison.describeDifferences(
            merged, actualOntology, mergedManager));
        return evidence;
    }

    private static CatalogManifest readCatalogManifest(Path manifestPath) throws IOException {
        CatalogManifest manifest = JSON.readValue(manifestPath.toFile(), CatalogManifest.class);
        if (manifest.schemaVersion != RESULT_SCHEMA_VERSION || manifest.mappings == null) {
            throw new OracleContractException("CATALOG_MANIFEST_INVALID", "catalogMappings",
                "Catalog mapping manifest has an unsupported schema");
        }
        Set<String> ontologyIRIs = new HashSet<>();
        for (CatalogMapping mapping : manifest.mappings) {
            if (mapping == null || mapping.ontologyIRI == null || mapping.ontologyIRI.isEmpty()
                || mapping.documentPath == null || mapping.documentPath.isEmpty()) {
                throw new OracleContractException("CATALOG_MANIFEST_INVALID", "catalogMappings",
                    "Catalog mapping entries require ontologyIRI and documentPath");
            }
            if (!ontologyIRIs.add(mapping.ontologyIRI)) {
                throw new OracleContractException("CATALOG_ENTRY_DUPLICATE", mapping.ontologyIRI,
                    "Catalog mapping manifest contains a duplicate ontology IRI");
            }
            Path documentPath = Path.of(mapping.documentPath).toAbsolutePath().normalize();
            if (!Files.isRegularFile(documentPath)) {
                throw new OracleContractException("CATALOG_TARGET_NOT_FOUND", mapping.ontologyIRI,
                    "Catalog mapping target is not a regular file: " + documentPath);
            }
            mapping.documentPath = documentPath.toString();
        }
        return manifest;
    }

    private static Map<String, Object> createResult(String pinnedRevision, String owlapiVersion,
        List<Map<String, Object>> closureMemberIds, Map<String, Object> expectedCounts,
        Map<String, Object> actualCounts, int anonymousIndividualBijectionSize,
        String comparisonOutcome, String mismatchCategory, String mismatchPath,
        int catalogEntryCount, int mappedImportCount, int blockedOutputImportCount,
        List<Map<String, Object>> sourceDiagnostics) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", RESULT_SCHEMA_VERSION);
        result.put("pinnedRevision", pinnedRevision);
        result.put("owlapiVersion", owlapiVersion);
        result.put("closureMemberIds", closureMemberIds);
        result.put("expectedCounts", expectedCounts);
        result.put("actualCounts", actualCounts);
        result.put("anonymousIndividualBijectionSize", anonymousIndividualBijectionSize);
        result.put("comparisonOutcome", comparisonOutcome);
        result.put("mismatchCategory", mismatchCategory);
        result.put("mismatchPath", mismatchPath);
        Map<String, Object> parserConfiguration = new LinkedHashMap<>();
        parserConfiguration.put("strict", false);
        parserConfiguration.put("loadAnnotationAxioms", true);
        result.put("parserConfiguration", parserConfiguration);
        result.put("sourceDiagnostics", sourceDiagnostics);
        Map<String, Object> networkEvidence = new LinkedHashMap<>();
        networkEvidence.put("mode", "FAIL_CLOSED_EXACT_CATALOG");
        networkEvidence.put("catalogEntryCount", catalogEntryCount);
        networkEvidence.put("mappedImportCount", mappedImportCount);
        networkEvidence.put("blockedOutputImportCount", blockedOutputImportCount);
        networkEvidence.put("networkAccessAttemptCount", NETWORK_ACCESS_ATTEMPT_COUNT.get());
        result.put("networkEvidence", networkEvidence);
        return result;
    }

    private static <T extends Throwable> T findCause(Throwable failure, Class<T> type) {
        Throwable current = failure;
        Set<Throwable> visited = Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        while (current != null && visited.add(current)) {
            if (type.isInstance(current)) {
                return type.cast(current);
            }
            current = current.getCause();
        }
        return null;
    }

    public static final class CatalogManifest {
        public int schemaVersion;
        public List<CatalogMapping> mappings;
        public List<ParsedSourceModel> parsedSourceModels;
    }

    public static final class ParsedSourceModel {
        public String sourceDocumentPath;
        public String modelPath;
    }

    public static final class CatalogMapping {
        public String documentPath;
        public String ontologyIRI;
    }

    private static final class Invocation {
        private static final Map<String, String> REQUIRED_ARGUMENTS;

        static {
            Map<String, String> arguments = new LinkedHashMap<>();
            arguments.put("--catalog-mappings", "catalogMappings");
            arguments.put("--root", "root");
            arguments.put("--verify-output", "verifyOutput");
            arguments.put("--pinned-revision", "pinnedRevision");
            arguments.put("--owlapi-version", "owlapiVersion");
            REQUIRED_ARGUMENTS = Collections.unmodifiableMap(arguments);
        }

        private final Path catalogMappingsPath;
        private final Path rootPath;
        private final Path verifyOutputPath;
        private final Path sourceDocumentPath;
        private final String pinnedRevision;
        private final String expectedOwlapiVersion;

        private Invocation(Path catalogMappingsPath, Path rootPath, Path verifyOutputPath, Path sourceDocumentPath,
            String pinnedRevision, String expectedOwlapiVersion) {
            this.catalogMappingsPath = catalogMappingsPath;
            this.rootPath = rootPath;
            this.verifyOutputPath = verifyOutputPath;
            this.sourceDocumentPath = sourceDocumentPath;
            this.pinnedRevision = pinnedRevision;
            this.expectedOwlapiVersion = expectedOwlapiVersion;
        }

        private static Invocation parse(String[] arguments) {
            Map<String, String> values = new HashMap<>();
            if (arguments.length % 2 != 0) {
                throw new IllegalArgumentException("Every argument requires one value");
            }
            for (int index = 0; index < arguments.length; index += 2) {
                String property = REQUIRED_ARGUMENTS.get(arguments[index]);
                if ("--source-document".equals(arguments[index])) {
                    property = "sourceDocument";
                }
                if (property == null) {
                    throw new IllegalArgumentException("Unknown argument: " + arguments[index]);
                }
                if (values.put(property, arguments[index + 1]) != null) {
                    throw new IllegalArgumentException("Duplicate argument: " + arguments[index]);
                }
            }
            for (Map.Entry<String, String> required : REQUIRED_ARGUMENTS.entrySet()) {
                if (!values.containsKey(required.getValue())) {
                    throw new IllegalArgumentException("Missing argument: " + required.getKey());
                }
            }
            Path catalogMappingsPath = requireRegularFile(values.get("catalogMappings"));
            Path rootPath = requireRegularFile(values.get("root"));
            Path verifyOutputPath = requireRegularFile(values.get("verifyOutput"));
            Path sourceDocumentPath = values.containsKey("sourceDocument")
                ? requireRegularFile(values.get("sourceDocument")) : rootPath;
            return new Invocation(catalogMappingsPath, rootPath, verifyOutputPath, sourceDocumentPath,
                values.get("pinnedRevision"), values.get("owlapiVersion"));
        }

        private static Path requireRegularFile(String value) {
            Path path = Path.of(value).toAbsolutePath().normalize();
            if (!Files.isRegularFile(path)) {
                throw new IllegalArgumentException("Path is not a regular file: " + path);
            }
            return path;
        }
    }

    private static final class ExactCatalogIRIMapper implements OWLOntologyIRIMapper {
        private final Map<String, IRI> documentIRIByOntologyIRI = new HashMap<>();
        private final AtomicInteger mappedImportCount = new AtomicInteger();

        private ExactCatalogIRIMapper(Collection<CatalogMapping> mappings) {
            for (CatalogMapping mapping : mappings) {
                documentIRIByOntologyIRI.put(mapping.ontologyIRI,
                    IRI.create(Path.of(mapping.documentPath).toUri()));
            }
        }

        @Override
        public IRI getDocumentIRI(IRI ontologyIRI) {
            IRI documentIRI = documentIRIByOntologyIRI.get(ontologyIRI.toString());
            if (documentIRI == null) {
                throw new MissingExactCatalogEntryException(ontologyIRI.toString());
            }
            mappedImportCount.incrementAndGet();
            return documentIRI;
        }
    }

    private static final class NonResolvingOutputImportIRIMapper
        implements OWLOntologyIRIMapper {
        private final AtomicInteger blockedImportCount = new AtomicInteger();
        private final IRI nonResolvingDocumentIRI;

        private NonResolvingOutputImportIRIMapper(Path nonResolvingDocumentPath) {
            nonResolvingDocumentIRI = IRI.create(nonResolvingDocumentPath.toUri());
        }

        @Override
        public IRI getDocumentIRI(IRI ontologyIRI) {
            blockedImportCount.incrementAndGet();
            return nonResolvingDocumentIRI;
        }
    }

    private static final class DeniedNetworkURLStreamHandler extends URLStreamHandler {
        private final String protocol;

        private DeniedNetworkURLStreamHandler(String protocol) {
            this.protocol = protocol;
        }

        @Override
        protected URLConnection openConnection(URL url) throws IOException {
            NETWORK_ACCESS_ATTEMPT_COUNT.incrementAndGet();
            throw new IOException("Network protocol is disabled by the oracle: " + protocol);
        }
    }

    private static final class MissingExactCatalogEntryException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final String ontologyIRI;

        private MissingExactCatalogEntryException(String ontologyIRI) {
            super("No exact catalog entry exists for imported ontology " + ontologyIRI);
            this.ontologyIRI = ontologyIRI;
        }
    }

    private static final class OracleContractException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final String category;
        private final String path;

        private OracleContractException(String category, String path, String message) {
            super(message);
            this.category = category;
            this.path = path;
        }
    }

}
