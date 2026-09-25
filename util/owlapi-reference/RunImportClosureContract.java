import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.jsonldjava.core.DocumentLoader;
import java.io.IOException;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import org.eclipse.rdf4j.rio.helpers.JSONLDSettings;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.AddOntologyAnnotation;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.MissingImportHandlingStrategy;
import org.semanticweb.owlapi.model.OWLAnonymousIndividual;
import org.semanticweb.owlapi.model.OWLDataFactory;
import org.semanticweb.owlapi.model.OWLEntity;
import org.semanticweb.owlapi.model.OWLLiteral;
import org.semanticweb.owlapi.model.OWLObject;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyID;
import org.semanticweb.owlapi.model.OWLOntologyIRIMapper;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.model.SetOntologyID;
import org.semanticweb.owlapi.util.OWLObjectDuplicator;
import org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider;
import org.semanticweb.owlapi.util.OWLOntologyMerger;
import org.semanticweb.owlapi.util.RemappingIndividualProvider;
import org.semanticweb.owlapi.util.VersionInfo;

/** Development-only acceptance oracle backed by one pinned Java OWLAPI revision. */
public final class RunImportClosureContract {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int RESULT_SCHEMA_VERSION = 1;
    private static final int MAXIMUM_COMPARISON_STATES = 250_000;
    private static final AtomicInteger NETWORK_ACCESS_ATTEMPT_COUNT = new AtomicInteger();
    private static final Set<String> NETWORK_PROTOCOLS;

    static {
        Set<String> protocols = new HashSet<>();
        protocols.add("ftp");
        protocols.add("http");
        protocols.add("https");
        NETWORK_PROTOCOLS = Collections.unmodifiableSet(protocols);
    }

    private RunImportClosureContract() {}

    public static void main(String[] arguments) throws Exception {
        Invocation invocation = null;
        Map<String, Object> result;
        try {
            invocation = Invocation.parse(arguments);
            configureOfflineDocumentLoading();
            result = evaluateContract(invocation);
        } catch (Exception failure) {
            String pinnedRevision = invocation == null ? null : invocation.pinnedRevision;
            String owlapiVersion = invocation == null ? null : invocation.expectedOwlapiVersion;
            System.err.println(failure.getClass().getSimpleName() + ": " + failure.getMessage());
            result = createResult(pinnedRevision, owlapiVersion, Collections.emptyList(), null,
                null, 0, "ERROR", "ORACLE_EXECUTION", "oracle", 0, 0, 0);
        }

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

    private static Map<String, Object> evaluateContract(Invocation invocation) {
        CatalogManifest catalogManifest = null;
        ExactCatalogIRIMapper sourceIRIMapper = null;
        NonResolvingOutputImportIRIMapper outputImportIRIMapper = null;
        List<Map<String, Object>> closureMemberIds = Collections.emptyList();
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
                .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.THROW_EXCEPTION));
            OWLOntology rootOntology = sourceManager.loadOntologyFromOntologyDocument(
                IRI.create(invocation.rootPath.toUri()));

            List<OWLOntology> closure = sourceManager.importsClosure(rootOntology)
                .collect(Collectors.toList());
            closureMemberIds = closure.stream().map(ontology -> ontologyIdentity(
                ontology.getOntologyID())).sorted(RunImportClosureContract::compareOntologyIdentity)
                .collect(Collectors.toList());

            OWLOntologyManager expectedManager = OWLManager.createOWLOntologyManager();
            OWLOntologyMerger merger = new OWLOntologyMerger(
                new OWLOntologyImportsClosureSetProvider(sourceManager, rootOntology), false);
            OWLOntology expectedOntology = merger.createMergedOntology(expectedManager, null);
            expectedManager.applyChange(
                new SetOntologyID(expectedOntology, rootOntology.getOntologyID()));
            rootOntology.annotations().forEach(annotation -> expectedManager
                .applyChange(new AddOntologyAnnotation(expectedOntology, annotation)));

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
                .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.SILENT));
            OWLOntology actualOntology = actualManager.loadOntologyFromOntologyDocument(
                IRI.create(invocation.verifyOutputPath.toUri()));
            if (NETWORK_ACCESS_ATTEMPT_COUNT.get() != 0) {
                throw new OracleContractException("NETWORK_ACCESS_ATTEMPT",
                    "networkEvidence.networkAccessAttemptCount",
                    "The oracle blocked an attempted network access");
            }

            Map<String, Object> expectedCounts = ontologyCounts(expectedOntology);
            Map<String, Object> actualCounts = ontologyCounts(actualOntology);
            ComparisonOutcome comparison = compareOntologies(expectedOntology, actualOntology,
                expectedManager);
            return createResult(invocation.pinnedRevision, loadedOwlapiVersion, closureMemberIds,
                expectedCounts, actualCounts, comparison.anonymousIndividualBijectionSize,
                comparison.matches ? "MATCH" : "MISMATCH", comparison.mismatchCategory,
                comparison.mismatchPath, catalogManifest.mappings.size(),
                sourceIRIMapper.mappedImportCount.get(),
                outputImportIRIMapper.blockedImportCount.get());
        } catch (Exception failure) {
            MissingExactCatalogEntryException missingCatalogEntry = findCause(failure,
                MissingExactCatalogEntryException.class);
            AnonymousIndividualComparisonLimitException searchLimit = findCause(failure,
                AnonymousIndividualComparisonLimitException.class);
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
            return createResult(invocation.pinnedRevision, loadedOwlapiVersion,
                closureMemberIds, null, null, 0, "ERROR", mismatchCategory, mismatchPath,
                catalogManifest == null ? 0 : catalogManifest.mappings.size(),
                sourceIRIMapper == null ? 0 : sourceIRIMapper.mappedImportCount.get(),
                outputImportIRIMapper == null ? 0 : outputImportIRIMapper.blockedImportCount.get());
        }
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

    private static ComparisonOutcome compareOntologies(OWLOntology expected,
        OWLOntology actual, OWLOntologyManager comparisonManager) {
        if (!ontologyIdentity(expected.getOntologyID()).equals(
            ontologyIdentity(actual.getOntologyID()))) {
            return ComparisonOutcome.mismatch("ONTOLOGY_ID", "ontology.id");
        }
        if (!expected.getImportsDeclarations().equals(actual.getImportsDeclarations())) {
            return ComparisonOutcome.mismatch("IMPORTS", "ontology.imports");
        }

        List<StructuralStatement> expectedAnnotations = expected.annotations()
            .map(annotation -> new StructuralStatement(StatementCategory.ONTOLOGY_ANNOTATION,
                annotation)).collect(Collectors.toList());
        List<StructuralStatement> actualAnnotations = actual.annotations()
            .map(annotation -> new StructuralStatement(StatementCategory.ONTOLOGY_ANNOTATION,
                annotation)).collect(Collectors.toList());
        if (expectedAnnotations.size() != actualAnnotations.size()) {
            return ComparisonOutcome.mismatch("ONTOLOGY_ANNOTATIONS",
                "ontology.annotations");
        }

        List<StructuralStatement> expectedAxioms = expected.axioms()
            .map(axiom -> new StructuralStatement(StatementCategory.AXIOM, axiom))
            .collect(Collectors.toList());
        List<StructuralStatement> actualAxioms = actual.axioms()
            .map(axiom -> new StructuralStatement(StatementCategory.AXIOM, axiom))
            .collect(Collectors.toList());
        if (expectedAxioms.size() != actualAxioms.size()) {
            return ComparisonOutcome.mismatch("AXIOMS", "ontology.axioms");
        }

        if (!new AnonymousIndividualBijectionMatcher(comparisonManager, expectedAnnotations,
            actualAnnotations).match().matches) {
            return ComparisonOutcome.mismatch("ONTOLOGY_ANNOTATIONS",
                "ontology.annotations");
        }
        if (!new AnonymousIndividualBijectionMatcher(comparisonManager, expectedAxioms,
            actualAxioms).match().matches) {
            return ComparisonOutcome.mismatch("AXIOMS", "ontology.axioms");
        }

        List<StructuralStatement> expectedStatements = new ArrayList<>(expectedAnnotations);
        expectedStatements.addAll(expectedAxioms);
        List<StructuralStatement> actualStatements = new ArrayList<>(actualAnnotations);
        actualStatements.addAll(actualAxioms);
        ComparisonOutcome combined = new AnonymousIndividualBijectionMatcher(comparisonManager,
            expectedStatements, actualStatements).match();
        if (!combined.matches) {
            return ComparisonOutcome.mismatch("ANONYMOUS_INDIVIDUAL_BIJECTION", "ontology");
        }
        return combined;
    }

    private static Map<String, Object> ontologyCounts(OWLOntology ontology) {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("axioms", ontology.getAxiomCount());
        counts.put("directImports", ontology.getImportsDeclarations().size());
        counts.put("ontologyAnnotations", ontology.annotations().count());
        Set<OWLAnonymousIndividual> anonymousIndividuals = new HashSet<>();
        ontology.axioms().forEach(
            axiom -> anonymousIndividuals.addAll(axiom.getAnonymousIndividuals()));
        ontology.annotations().forEach(
            annotation -> anonymousIndividuals.addAll(annotation.getAnonymousIndividuals()));
        counts.put("anonymousIndividuals", anonymousIndividuals.size());
        return counts;
    }

    private static Map<String, Object> ontologyIdentity(OWLOntologyID ontologyID) {
        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("ontologyIRI",
            ontologyID.getOntologyIRI().map(IRI::toString).orElse(null));
        identity.put("versionIRI", ontologyID.getVersionIRI().map(IRI::toString).orElse(null));
        return identity;
    }

    private static int compareOntologyIdentity(Map<String, Object> left,
        Map<String, Object> right) {
        Comparator<String> nullableText = Comparator.nullsFirst(Comparator.naturalOrder());
        int ontologyIRIComparison = nullableText.compare((String) left.get("ontologyIRI"),
            (String) right.get("ontologyIRI"));
        if (ontologyIRIComparison != 0) {
            return ontologyIRIComparison;
        }
        return nullableText.compare((String) left.get("versionIRI"),
            (String) right.get("versionIRI"));
    }

    private static Map<String, Object> createResult(String pinnedRevision, String owlapiVersion,
        List<Map<String, Object>> closureMemberIds, Map<String, Object> expectedCounts,
        Map<String, Object> actualCounts, int anonymousIndividualBijectionSize,
        String comparisonOutcome, String mismatchCategory, String mismatchPath,
        int catalogEntryCount, int mappedImportCount, int blockedOutputImportCount) {
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
        private final String pinnedRevision;
        private final String expectedOwlapiVersion;

        private Invocation(Path catalogMappingsPath, Path rootPath, Path verifyOutputPath,
            String pinnedRevision, String expectedOwlapiVersion) {
            this.catalogMappingsPath = catalogMappingsPath;
            this.rootPath = rootPath;
            this.verifyOutputPath = verifyOutputPath;
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
            return new Invocation(catalogMappingsPath, rootPath, verifyOutputPath,
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

    private enum StatementCategory {
        AXIOM,
        ONTOLOGY_ANNOTATION
    }

    private static final class StructuralStatement {
        private final StatementCategory category;
        private final OWLObject value;

        private StructuralStatement(StatementCategory category, OWLObject value) {
            this.category = category;
            this.value = value;
        }
    }

    private static final class ComparisonOutcome {
        private final boolean matches;
        private final int anonymousIndividualBijectionSize;
        private final String mismatchCategory;
        private final String mismatchPath;

        private ComparisonOutcome(boolean matches, int anonymousIndividualBijectionSize,
            String mismatchCategory, String mismatchPath) {
            this.matches = matches;
            this.anonymousIndividualBijectionSize = anonymousIndividualBijectionSize;
            this.mismatchCategory = mismatchCategory;
            this.mismatchPath = mismatchPath;
        }

        private static ComparisonOutcome match(int anonymousIndividualBijectionSize) {
            return new ComparisonOutcome(true, anonymousIndividualBijectionSize, null, null);
        }

        private static ComparisonOutcome mismatch(String category, String path) {
            return new ComparisonOutcome(false, 0, category, path);
        }
    }

    private static final class AnonymousIndividualBijectionMatcher {
        private final OWLOntologyManager comparisonManager;
        private final List<StructuralStatement> expectedStatements;
        private final List<StructuralStatement> actualStatements;
        private final List<List<Integer>> candidateActualStatementIndexes;
        private final List<Integer> expectedStatementOrder;
        private final Map<OWLAnonymousIndividual, OWLAnonymousIndividual> expectedToActual =
            new HashMap<>();
        private final Map<OWLAnonymousIndividual, OWLAnonymousIndividual> actualToExpected =
            new HashMap<>();
        private final boolean[] usedActualStatements;
        private int exploredStates;

        private AnonymousIndividualBijectionMatcher(OWLOntologyManager comparisonManager,
            List<StructuralStatement> expectedStatements,
            List<StructuralStatement> actualStatements) {
            this.comparisonManager = comparisonManager;
            this.expectedStatements = expectedStatements;
            this.actualStatements = actualStatements;
            usedActualStatements = new boolean[actualStatements.size()];

            OWLDataFactory dataFactory = comparisonManager.getOWLDataFactory();
            OWLAnonymousIndividual sentinel = dataFactory.getOWLAnonymousIndividual(
                "owlapi-js-import-closure-structural-sentinel");
            OWLObjectDuplicator skeletonDuplicator = new OWLObjectDuplicator(
                Collections.<OWLEntity, IRI>emptyMap(),
                Collections.<OWLLiteral, OWLLiteral>emptyMap(), comparisonManager,
                new FixedIndividualProvider(dataFactory, sentinel));
            List<OWLObject> expectedSkeletons = expectedStatements.stream()
                .map(statement -> skeletonDuplicator.duplicateObject(statement.value))
                .collect(Collectors.toList());
            List<OWLObject> actualSkeletons = actualStatements.stream()
                .map(statement -> skeletonDuplicator.duplicateObject(statement.value))
                .collect(Collectors.toList());

            candidateActualStatementIndexes = new ArrayList<>();
            for (int expectedIndex = 0; expectedIndex < expectedStatements.size();
                expectedIndex++) {
                List<Integer> candidates = new ArrayList<>();
                StructuralStatement expectedStatement = expectedStatements.get(expectedIndex);
                int expectedAnonymousCount =
                    expectedStatement.value.getAnonymousIndividuals().size();
                for (int actualIndex = 0; actualIndex < actualStatements.size(); actualIndex++) {
                    StructuralStatement actualStatement = actualStatements.get(actualIndex);
                    if (expectedStatement.category == actualStatement.category
                        && expectedAnonymousCount
                            == actualStatement.value.getAnonymousIndividuals().size()
                        && expectedSkeletons.get(expectedIndex).equals(
                            actualSkeletons.get(actualIndex))) {
                        candidates.add(actualIndex);
                    }
                }
                candidateActualStatementIndexes.add(candidates);
            }
            expectedStatementOrder = new ArrayList<>();
            for (int index = 0; index < expectedStatements.size(); index++) {
                expectedStatementOrder.add(index);
            }
            expectedStatementOrder.sort(Comparator.comparingInt(
                index -> candidateActualStatementIndexes.get(index).size()));
        }

        private ComparisonOutcome match() {
            if (expectedStatements.size() != actualStatements.size()
                || candidateActualStatementIndexes.stream().anyMatch(List::isEmpty)) {
                return ComparisonOutcome.mismatch("STRUCTURE", "ontology");
            }
            Deque<ComparisonSearchStep> remainingSteps = new ArrayDeque<>();
            remainingSteps.push(steps -> matchStatement(steps, 0));
            while (!remainingSteps.isEmpty()) {
                registerExploredState();
                if (remainingSteps.pop().execute(remainingSteps)) {
                    return ComparisonOutcome.match(expectedToActual.size());
                }
            }
            return ComparisonOutcome.mismatch("STRUCTURE", "ontology");
        }

        private boolean matchStatement(Deque<ComparisonSearchStep> remainingSteps,
            int orderedExpectedPosition) {
            if (orderedExpectedPosition == expectedStatementOrder.size()) {
                return true;
            }
            int expectedIndex = expectedStatementOrder.get(orderedExpectedPosition);
            StructuralStatement expectedStatement = expectedStatements.get(expectedIndex);
            List<Integer> candidates = candidateActualStatementIndexes.get(expectedIndex);
            for (int candidateIndex = candidates.size() - 1; candidateIndex >= 0;
                candidateIndex--) {
                int actualIndex = candidates.get(candidateIndex);
                if (usedActualStatements[actualIndex]) {
                    continue;
                }
                StructuralStatement actualStatement = actualStatements.get(actualIndex);
                remainingSteps.push(steps -> matchStatementUnderBijection(steps,
                    expectedStatement.value, actualStatement.value, actualIndex,
                    orderedExpectedPosition));
            }
            return false;
        }

        private boolean matchStatementUnderBijection(
            Deque<ComparisonSearchStep> remainingSteps, OWLObject expected, OWLObject actual,
            int actualStatementIndex, int orderedExpectedPosition) {
            List<OWLAnonymousIndividual> expectedIndividuals = new ArrayList<>(
                new LinkedHashSet<>(expected.getAnonymousIndividuals()));
            List<OWLAnonymousIndividual> actualIndividuals = new ArrayList<>(
                new LinkedHashSet<>(actual.getAnonymousIndividuals()));
            Set<OWLAnonymousIndividual> expectedIndividualSet =
                new HashSet<>(expectedIndividuals);
            Set<OWLAnonymousIndividual> actualIndividualSet = new HashSet<>(actualIndividuals);

            for (OWLAnonymousIndividual expectedIndividual : expectedIndividuals) {
                OWLAnonymousIndividual mapped = expectedToActual.get(expectedIndividual);
                if (mapped != null && !actualIndividualSet.contains(mapped)) {
                    return false;
                }
            }
            for (OWLAnonymousIndividual actualIndividual : actualIndividuals) {
                OWLAnonymousIndividual mapped = actualToExpected.get(actualIndividual);
                if (mapped != null && !expectedIndividualSet.contains(mapped)) {
                    return false;
                }
            }

            List<OWLAnonymousIndividual> unmappedExpected = expectedIndividuals.stream()
                .filter(individual -> !expectedToActual.containsKey(individual))
                .collect(Collectors.toList());
            List<OWLAnonymousIndividual> availableActual = actualIndividuals.stream()
                .filter(individual -> !actualToExpected.containsKey(individual))
                .collect(Collectors.toList());
            if (unmappedExpected.size() != availableActual.size()) {
                return false;
            }
            remainingSteps.push(steps -> assignStatementIndividuals(steps, expected, actual,
                actualStatementIndex, orderedExpectedPosition, unmappedExpected,
                availableActual, 0));
            return false;
        }

        private boolean assignStatementIndividuals(
            Deque<ComparisonSearchStep> remainingSteps, OWLObject expected, OWLObject actual,
            int actualStatementIndex, int orderedExpectedPosition,
            List<OWLAnonymousIndividual> unmappedExpected,
            List<OWLAnonymousIndividual> availableActual, int expectedIndividualIndex) {
            if (expectedIndividualIndex == unmappedExpected.size()) {
                OWLObject remappedExpected = new OWLObjectDuplicator(
                    Collections.<OWLEntity, IRI>emptyMap(),
                    Collections.<OWLLiteral, OWLLiteral>emptyMap(), comparisonManager,
                    new MappedIndividualProvider(comparisonManager.getOWLDataFactory(),
                        expectedToActual)).duplicateObject(expected);
                if (!remappedExpected.equals(actual)) {
                    return false;
                }
                usedActualStatements[actualStatementIndex] = true;
                remainingSteps.push(steps -> {
                    usedActualStatements[actualStatementIndex] = false;
                    return false;
                });
                remainingSteps.push(steps -> matchStatement(steps, orderedExpectedPosition + 1));
                return false;
            }

            OWLAnonymousIndividual expectedIndividual =
                unmappedExpected.get(expectedIndividualIndex);
            for (int actualIndex = availableActual.size() - 1; actualIndex >= 0; actualIndex--) {
                OWLAnonymousIndividual actualIndividual = availableActual.get(actualIndex);
                remainingSteps.push(steps -> {
                    if (actualToExpected.containsKey(actualIndividual)) {
                        return false;
                    }
                    expectedToActual.put(expectedIndividual, actualIndividual);
                    actualToExpected.put(actualIndividual, expectedIndividual);
                    // LIFO rollback keeps each alternative's bijection isolated without
                    // making the JVM call-stack depth depend on ontology size.
                    steps.push(rollbackSteps -> {
                        expectedToActual.remove(expectedIndividual);
                        actualToExpected.remove(actualIndividual);
                        return false;
                    });
                    steps.push(nextSteps -> assignStatementIndividuals(nextSteps, expected,
                        actual, actualStatementIndex, orderedExpectedPosition, unmappedExpected,
                        availableActual, expectedIndividualIndex + 1));
                    return false;
                });
            }
            return false;
        }

        private void registerExploredState() {
            exploredStates++;
            if (exploredStates > MAXIMUM_COMPARISON_STATES) {
                throw new AnonymousIndividualComparisonLimitException();
            }
        }
    }

    @FunctionalInterface
    private interface ComparisonSearchStep {
        boolean execute(Deque<ComparisonSearchStep> remainingSteps);
    }

    private static final class FixedIndividualProvider extends RemappingIndividualProvider {
        private final OWLAnonymousIndividual individual;

        private FixedIndividualProvider(OWLDataFactory dataFactory,
            OWLAnonymousIndividual individual) {
            super(false, dataFactory);
            this.individual = individual;
        }

        @Override
        public OWLAnonymousIndividual getOWLAnonymousIndividual(String nodeId) {
            return individual;
        }
    }

    private static final class MappedIndividualProvider extends RemappingIndividualProvider {
        private final Map<String, OWLAnonymousIndividual> individualByExpectedNodeId =
            new HashMap<>();

        private MappedIndividualProvider(OWLDataFactory dataFactory,
            Map<OWLAnonymousIndividual, OWLAnonymousIndividual> expectedToActual) {
            super(false, dataFactory);
            expectedToActual.forEach((expected, actual) -> individualByExpectedNodeId.put(
                expected.getID().getID(), actual));
        }

        @Override
        public OWLAnonymousIndividual getOWLAnonymousIndividual(String nodeId) {
            OWLAnonymousIndividual mapped = individualByExpectedNodeId.get(nodeId);
            if (mapped == null) {
                throw new IllegalStateException(
                    "No anonymous-individual mapping exists for an expected node");
            }
            return mapped;
        }
    }

    private static final class AnonymousIndividualComparisonLimitException
        extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private AnonymousIndividualComparisonLimitException() {
            super("Anonymous-individual comparison exceeded its bounded search state limit");
        }
    }
}
