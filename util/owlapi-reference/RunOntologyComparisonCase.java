import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.StandardCopyOption;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.formats.NQuadsDocumentFormat;
import org.semanticweb.owlapi.formats.NTriplesDocumentFormat;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.formats.RDFXMLDocumentFormat;
import org.semanticweb.owlapi.formats.RioTurtleDocumentFormat;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.io.StreamDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.io.UnparsableOntologyException;
import org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl;
import org.semanticweb.owlapi.model.AddAxiom;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.AddOntologyAnnotation;
import org.semanticweb.owlapi.model.MissingImportHandlingStrategy;
import org.semanticweb.owlapi.model.OWLDocumentFormat;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyID;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyLoaderListener;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.model.OWLOntologyWriterConfiguration;
import org.semanticweb.owlapi.model.RemoveAxiom;
import org.semanticweb.owlapi.model.SetOntologyID;
import org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider;
import org.semanticweb.owlapi.util.OWLOntologyMerger;
import org.semanticweb.owlapi.util.SimpleIRIMapper;
import org.semanticweb.owlapi.util.VersionInfo;
import org.xml.sax.SAXParseException;

/** Public OWLAPI observations from one verified Java/JS case. */
public final class RunOntologyComparisonCase {
    private static final ObjectMapper JSON = new ObjectMapper();

    private RunOntologyComparisonCase() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Expected request and result paths");
        JsonNode request = JSON.readTree(Path.of(args[0]).toFile());
        String caseId = request.required("caseId").asText();
        if (request.required("schemaVersion").asInt() != 1 || !caseId.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Unsupported comparison request");
        }
        Path resultPath = Path.of(args[1]);
        Map<String, Object> result = observe(request, resultPath);
        if (request.path("performance").isObject()) return;
        result.put("schemaVersion", 1);
        result.put("caseId", caseId);

        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (DigestOutputStream output = new DigestOutputStream(
                Files.newOutputStream(resultPath, StandardOpenOption.CREATE_NEW), digest)) {
            JSON.writeValue(output, result);
        }
        System.out.println(JSON.writeValueAsString(Map.of(
            "schemaVersion", 1, "caseId", caseId, "stage", "native-comparison",
            "byteLength", Files.size(resultPath), "sha256", HexFormat.of().formatHex(digest.digest()))));
        Map<?, ?> structure = (Map<?, ?>) result.get("structure");
        Map<?, ?> load = (Map<?, ?>) result.get("javaLoad");
        boolean success = structure.get("status").equals("match") ||
            (structure.get("status").equals("not-requested") && load.get("status").equals("completed"));
        System.exit(success ? 0 : 1);
    }

    private static Map<String, Object> observe(JsonNode request, Path resultPath) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        String version = VersionInfo.getVersionInfo().getVersion();
        String expectedVersion = request.required("oracleVersion").asText();
        boolean matchesVersion = expectedVersion.equals(version) ||
            (request.path("oracleVersionLine").asBoolean(false) && version.startsWith(expectedVersion + "."));
        if (!matchesVersion) {
            throw new IllegalArgumentException("Unexpected OWLAPI implementation version " + version);
        }
        result.put("oracleVersion", version);
        if ("public-api-behavior".equals(request.path("scenario").asText())) {
            OntologyReferenceContract.configureOfflineDocumentLoading(Map.of());
            try {
                if (request.path("configuration").isObject()) {
                    result.put("configuration", observeConfiguration(request.required("configuration")));
                } else if (request.path("mutation").isObject()) {
                    result.put("mutation", observeMutation(request.required("mutation")));
                } else if (request.path("loadPublication").isObject()) {
                    observeLoadPublication(request.required("loadPublication"),
                        resultPath.resolveSibling("publication-child.ofn"), result);
                } else if (request.path("storage").isObject()) {
                    OntologyStorageComparison.observe(request.required("storage"), result);
                } else if (request.path("queryBehavior").isObject()) {
                    result.put("queryBehavior", OntologyQueryComparison.observe(request.required("queryBehavior")));
                } else if (request.path("parserBehavior").isObject()) {
                    result.put("parserBehavior", OntologyParserBehaviorComparison.observe(request.required("parserBehavior")));
                } else {
                    result.put("literalConstruction", OntologyLiteralComparison.observe(request.required("literalConstruction")));
                }
                result.put("javaLoad", Map.of("status", "completed"));
            } catch (Exception failure) {
                result.put("javaLoad", failure("public-api-behavior", failure));
            }
            result.put("networkAttempts", OntologyReferenceContract.networkAccessAttemptCount());
            result.put("structure", Map.of("status", "not-requested"));
            return result;
        }
        if (request.path("literal").isObject()) {
            OntologyReferenceContract.configureOfflineDocumentLoading(Map.of());
            JsonNode recipe = request.required("literal");
            String scenario = request.required("scenario").asText();
            try {
                Map<String, Object> observation;
                if ("large-literal-rendering".equals(scenario)) {
                    observation = renderLargeLiteral(recipe);
                } else if ("large-literal-roundtrip".equals(scenario)) {
                    String syntax = recipe.required("syntax").asText();
                    observation = largeLiteral(recipe,
                        syntax.equals("turtle") ? new TurtleDocumentFormat() : format(syntax));
                } else {
                    throw new IllegalArgumentException("Unknown large-literal scenario " + scenario);
                }
                result.put("javaLoad", Map.of("status", "completed"));
                result.put("literal", observation);
            } catch (Exception failure) {
                result.put("javaLoad", failure(scenario, failure));
            }
            result.put("networkAttempts", OntologyReferenceContract.networkAccessAttemptCount());
            result.put("structure", Map.of("status", "not-requested"));
            return result;
        }

        Map<String, IRI> imports = new LinkedHashMap<>();
        Map<String, Path> documents = new LinkedHashMap<>();
        for (JsonNode entry : request.required("imports")) {
            String iri = entry.required("ontologyIRI").asText();
            String documentIRI = entry.required("documentIRI").asText();
            Path path = Path.of(entry.required("path").asText());
            if (imports.putIfAbsent(iri, IRI.create(documentIRI)) != null) {
                throw new IllegalArgumentException("Repeated import mapping: " + iri);
            }
            Path existing = documents.putIfAbsent(documentIRI, path);
            if (existing != null && !existing.equals(path)) {
                throw new IllegalArgumentException("Conflicting logical document: " + documentIRI);
            }
        }
        OntologyReferenceContract.configureOfflineDocumentLoading(documents);

        OWLOntologyLoaderConfiguration configuration = new OWLOntologyLoaderConfiguration()
            .setStrict(false)
            .setLoadAnnotationAxioms(true)
            .setFollowRedirects(false)
            .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.THROW_EXCEPTION);
        result.put("effectiveSettings", Map.of(
            "strict", configuration.isStrict(),
            "documentIRI", request.required("document").required("documentIRI").asText(),
            "syntax", request.required("document").required("syntax").asText(),
            "format", sourceFormat(request).getClass().getSimpleName(),
            "loadAnnotationAxioms", configuration.isLoadAnnotationAxioms(),
            "missingImports", configuration.getMissingImportHandlingStrategy().name()));
        Map<String, String> xmlSettings = new LinkedHashMap<>();
        for (String property : List.of("jdk.xml.entityExpansionLimit", "jdk.xml.totalEntitySizeLimit",
            "jdk.xml.maxGeneralEntitySizeLimit", "jdk.xml.maxParameterEntitySizeLimit",
            "javax.xml.accessExternalDTD", "javax.xml.accessExternalSchema")) {
            xmlSettings.put(property, System.getProperty(property));
        }
        result.put("xmlSettings", xmlSettings);
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        Map<String, Object> requestedImports = new LinkedHashMap<>();
        installImportMappings(manager, imports, requestedImports);
        if (request.path("performance").isObject()) {
            sampleLoad(request, configuration, imports);
            return result;
        }
        try {
            OWLOntology expected;
            try {
                expected = load(manager, request.required("document"), configuration, sourceFormat(request));
                result.put("javaLoad", Map.of("status", "completed", "ontology", summarize(manager, expected)));
            } catch (Exception failure) {
                result.put("javaLoad", sourceLoadFailure(failure));
                result.put("structure", blocked("Java source load failed"));
                publishLoadStage(request, result, resultPath, requestedImports);
                return result;
            }
            publishLoadStage(request, result, resultPath, requestedImports);
            if (!request.required("compareStructure").asBoolean()) {
                result.put("structure", Map.of("status", "not-requested"));
                return result;
            }
            Path absent = resultPath.resolveSibling("absent-functional-import");
            if (Files.exists(absent)) throw new IllegalStateException("Import sentinel already exists");
            if ("closure-roundtrip".equals(request.required("scenario").asText())) {
                result.put("documentComparisons", compareDocuments(
                    request.required("sourceModels"), manager, expected, configuration, absent));
                OWLOntologyManager merger = OWLManager.createOWLOntologyManager();
                try {
                    expected = merge(manager, expected, merger);
                    result.put("merge", Map.of("status", "completed", "ontology", summarize(merger, expected)));
                } catch (Exception failure) {
                    result.put("merge", failure("merge", failure));
                    result.put("structure", blocked("Java closure merge failed"));
                    return result;
                }
                result.put("javaRdfXmlRoundTrip", roundTripRdfXml(
                    merger, expected, resultPath.resolveSibling("java-closure.rdf"),
                    request.required("document").required("documentIRI").asText(), configuration));
            }
            if (request.path("functionalPath").isNull() || request.path("functionalPath").isMissingNode()) {
                Path sourceModel = resultPath.resolveSibling("java-direct.ofn");
                try {
                    try (OutputStream stream = Files.newOutputStream(sourceModel, StandardOpenOption.CREATE_NEW)) {
                        expected.getOWLOntologyManager().saveOntology(expected, new FunctionalSyntaxDocumentFormat(), stream);
                    }
                    result.put("javaModel", Map.of("status", "completed", "artifact", pin(sourceModel)));
                } catch (Exception failure) {
                    result.put("javaModel", failure("java-functional-write", failure));
                }
                result.put("structure", blocked("JS Functional model is unavailable"));
                return result;
            }
            OWLOntology actual;
            try {
                actual = loadFunctional(Path.of(request.required("functionalPath").asText()), absent, configuration);
                result.put("functionalReparse", Map.of("status", "completed", "ontology",
                    summarize(actual.getOWLOntologyManager(), actual)));
            } catch (Exception failure) {
                result.put("functionalReparse", failure("functional-reparse", failure));
                result.put("structure", blocked("Native Functional reparse failed"));
                return result;
            }
            result.put("structure", compare(expected, actual));
            if (request.path("jsReloadPath").isTextual()) {
                try {
                    OWLOntology reloaded = loadFunctional(Path.of(request.required("jsReloadPath").asText()),
                        absent, configuration);
                    result.put("jsRdfXmlRoundTrip", compare(actual, reloaded));
                } catch (Exception failure) {
                    result.put("jsRdfXmlRoundTrip", failure("js-writer-functional-reparse", failure));
                }
            }
            return result;
        } finally {
            result.put("importRequests", requestedImports);
            result.put("networkAttempts", OntologyReferenceContract.networkAccessAttemptCount());
        }
    }

    private static OWLOntology load(OWLOntologyManager manager, JsonNode document,
        OWLOntologyLoaderConfiguration configuration, OWLDocumentFormat format) throws Exception {
        try (InputStream stream = Files.newInputStream(Path.of(document.required("path").asText()))) {
            return manager.loadOntologyFromOntologyDocument(new StreamDocumentSource(stream,
                IRI.create(document.required("documentIRI").asText()), format,
                null), configuration);
        }
    }

    private static void publishLoadStage(JsonNode request, Map<String, Object> result,
        Path resultPath, Map<String, Object> importRequests) throws Exception {
        var stage = new LinkedHashMap<>(result);
        stage.put("schemaVersion", 1);
        stage.put("caseId", request.required("caseId").asText());
        stage.put("stage", "native-source-load");
        stage.put("importRequests", importRequests);
        stage.put("networkAttempts", OntologyReferenceContract.networkAccessAttemptCount());
        Path pending = resultPath.resolveSibling("native-source-load.pending");
        try (OutputStream output = Files.newOutputStream(pending, StandardOpenOption.CREATE_NEW)) {
            JSON.writeValue(output, stage);
        }
        Files.move(pending, resultPath.resolveSibling("native-source-load.json"),
            StandardCopyOption.ATOMIC_MOVE);
    }

    private static void observeLoadPublication(JsonNode recipe, Path childPath,
        Map<String, Object> result) throws Exception {
        Files.writeString(childPath, recipe.required("childText").asText(), StandardOpenOption.CREATE_NEW);
        result.put("loadPublicationFixture", Map.of("status", "completed", "artifact", pin(childPath)));
        var manager = OWLManager.createOWLOntologyManager();
        var rootId = new OWLOntologyID(IRI.create(recipe.required("rootIRI").asText()));
        var childIRI = IRI.create(recipe.required("childIRI").asText());
        var childId = new OWLOntologyID(childIRI);
        manager.getIRIMappers().clear();
        manager.getIRIMappers().add(new SimpleIRIMapper(childIRI, IRI.create(childPath.toFile())));
        List<Integer> imports = new ArrayList<>();
        manager.addOntologyLoaderListener(new OWLOntologyLoaderListener() {
            @Override public void startedLoadingOntology(LoadingStartedEvent event) {
                if (event.isImported()) {
                    var root = manager.getOntology(rootId);
                    imports.add(root == null ? null : root.getAxiomCount());
                }
            }
            @Override public void finishedLoadingOntology(LoadingFinishedEvent event) {}
        });
        String failure = null;
        try {
            manager.loadOntologyFromOntologyDocument(new StringDocumentSource(recipe.required("failedText").asText(),
                IRI.create(recipe.required("failedDocumentIRI").asText()), new FunctionalSyntaxDocumentFormat(), null));
        } catch (Exception error) {
            failure = error.getClass().getSimpleName();
        }
        result.put("loadPublicationFailure", failure);
        var failed = Map.of("imports", new ArrayList<>(imports),
            "retainedRoot", manager.contains(rootId), "retainedChild", manager.contains(childId));
        imports.clear();
        var retry = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(recipe.required("retryText").asText(),
            IRI.create(recipe.required("retryDocumentIRI").asText()), new FunctionalSyntaxDocumentFormat(), null));
        result.put("loadPublication", Map.of("failed", failed, "retry", Map.of("imports", imports,
            "axioms", retry.getAxiomCount(), "closureSize", manager.getImportsClosure(retry).size())));
    }

    // The original mutation probe exercises the public single-axiom removal boundary.
    @SuppressWarnings("deprecation")
    private static Map<String, Object> observeMutation(JsonNode recipe) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var factory = manager.getOWLDataFactory();
        var originalId = new OWLOntologyID(IRI.create(recipe.required("ontologyIRI").asText()));
        var otherId = new OWLOntologyID(IRI.create(recipe.required("otherIRI").asText()));
        var ontology = manager.createOntology(originalId);
        var axiom = factory.getOWLDeclarationAxiom(
            factory.getOWLClass(IRI.create(recipe.required("entityIRI").asText())));
        String kind = recipe.required("kind").asText();
        if ("ontology-copy".equals(kind)) {
            manager.addAxiom(ontology, axiom);
            var destination = OWLManager.createOWLOntologyManager();
            var targetIRI = IRI.create(recipe.required("otherIRI").asText());
            boolean[] publishedDuringProvider = {false};
            var copied = new OWLOntologyMerger(() -> {
                publishedDuringProvider[0] = destination.contains(targetIRI);
                return Stream.of(ontology);
            }).createMergedOntology(destination, targetIRI);
            int[] providerCalls = {0};
            var collision = new OWLOntologyMerger(() -> {
                providerCalls[0]++;
                return Stream.of(ontology);
            });
            boolean refused = false;
            try {
                collision.createMergedOntology(destination, targetIRI);
            } catch (Exception expected) {
                refused = true;
            }
            var failedIRI = IRI.create(recipe.required("failedIRI").asText());
            var failure = new IllegalStateException("owned provider failure");
            var failing = new OWLOntologyMerger(() ->
                Stream.concat(Stream.of(ontology), Stream.generate(() -> { throw failure; })));
            boolean preserved = false;
            try {
                failing.createMergedOntology(destination, failedIRI);
            } catch (Exception error) {
                preserved = error == failure;
            }
            var partial = destination.getOntology(failedIRI);
            boolean ownsCopy = destination.getOntology(targetIRI) == copied;
            return Map.of("publishedDuringProvider", publishedDuringProvider[0],
                "distinctCopy", copied != ontology, "copyContainsDeclaration", copied.containsAxiom(axiom),
                "copyAxioms", copied.getAxiomCount(), "sourceAxioms", ontology.getAxiomCount(),
                "ownsCopy", ownsCopy, "ownsSource", manager.getOntology(originalId) == ontology,
                "collision", Map.of("refused", refused, "providerCalls", providerCalls[0], "retainsCopy", ownsCopy),
                "failure", Map.of("preserved", preserved, "retainsPartial", partial != null,
                    "partialAxioms", partial == null ? 0 : partial.getAxiomCount(),
                    "partialContainsDeclaration", partial != null && partial.containsAxiom(axiom)));
        }
        if ("foreign-manager".equals(kind)) {
            var foreign = OWLManager.createOWLOntologyManager();
            var add = foreign.addAxiom(ontology, axiom);
            var rename = foreign.applyChange(new SetOntologyID(ontology, otherId));
            return Map.of("add", add, "rename", rename, "axiomCount", ontology.getAxiomCount(),
                "renamed", ontology.getOntologyID().equals(otherId),
                "ownerFindsOriginal", manager.getOntology(originalId) == ontology,
                "ownerFindsRenamed", manager.getOntology(otherId) == ontology,
                "foreignFindsOriginal", foreign.getOntology(originalId) == ontology,
                "foreignFindsRenamed", foreign.getOntology(otherId) == ontology);
        }
        if (!"batch-publication".equals(kind)) throw new IllegalArgumentException("Unknown mutation kind " + kind);
        var empty = manager.applyChanges(List.of());
        var add = List.of(manager.addAxiom(ontology, axiom), manager.addAxiom(ontology, axiom));
        var remove = List.of(manager.removeAxiom(ontology, axiom), manager.removeAxiom(ontology, axiom));
        var netZero = manager.applyChanges(List.of(new AddAxiom(ontology, axiom), new RemoveAxiom(ontology, axiom)));
        int netZeroAxiomCount = ontology.getAxiomCount();
        var occupied = manager.createOntology(otherId);
        boolean rejected = false;
        try {
            manager.applyChanges(List.of(new AddAxiom(ontology, axiom), new SetOntologyID(ontology, otherId)));
        } catch (RuntimeException failure) {
            rejected = true;
        }
        var collision = Map.of("rejected", rejected, "axiomCount", ontology.getAxiomCount(),
            "retainsOriginal", ontology.getOntologyID().equals(originalId) && manager.getOntology(originalId) == ontology,
            "retainsOccupied", manager.getOntology(otherId) == occupied);
        return Map.of("empty", empty, "add", add, "remove", remove, "netZero", netZero,
            "netZeroAxiomCount", netZeroAxiomCount, "collision", collision);
    }

    private static Map<String, Object> observeConfiguration(JsonNode recipe) {
        String kind = recipe.required("kind").asText();
        if ("loader".equals(kind)) {
            var original = new OWLOntologyLoaderConfiguration();
            int timeout = recipe.required("timeout").asInt();
            var chain = original.setConnectionTimeout(timeout).setRetriesToAttempt(recipe.required("retries").asInt())
                .setStrict(true).setLoadAnnotationAxioms(false).setEntityExpansionLimit(recipe.required("entityLimit").asText());
            var noOp = List.of(original == original.setConnectionTimeout(original.getConnectionTimeout()),
                original == original.setLoadAnnotationAxioms(true), original == original.setStrict(false),
                original == original.setAuthorizationValue(""), original == original.setAcceptingHTTPCompression(true));
            var retained = original.setAuthorizationValue(recipe.required("authorization").asText())
                .setAcceptingHTTPCompression(false).setConnectionTimeout(timeout);
            return Map.of("original", loaderState(original), "chain", loaderState(chain),
                "noOp", noOp, "retained", loaderState(retained));
        }
        if ("writer".equals(kind)) {
            var original = new OWLOntologyWriterConfiguration();
            int indentSize = recipe.required("indentSize").asInt();
            var chain = original.withIndentSize(indentSize).withBannersEnabled(false).withIndenting(false);
            var noOp = List.of(original == original.withIndentSize(original.getIndentSize()));
            var retained = original.withIndentSize(indentSize).withBannersEnabled(true);
            return Map.of("original", writerState(original), "chain", writerState(chain),
                "noOp", noOp, "retained", writerState(retained));
        }
        throw new IllegalArgumentException("Unknown configuration kind " + kind);
    }

    private static List<Object> loaderState(OWLOntologyLoaderConfiguration configuration) {
        return List.of(configuration.getConnectionTimeout(), configuration.getRetriesToAttempt(),
            configuration.isFollowRedirects(), configuration.getEntityExpansionLimit(), configuration.isStrict(),
            configuration.isLoadAnnotationAxioms(), configuration.getAuthorizationValue(),
            configuration.isAcceptingHTTPCompression());
    }

    private static List<Object> writerState(OWLOntologyWriterConfiguration configuration) {
        return List.of(configuration.isIndenting(), configuration.getIndentSize(), configuration.shouldUseBanners(),
            configuration.isLabelsAsBanner(), configuration.shouldSaveIdsForAllAnonymousIndividuals());
    }

    private static Map<String, Object> renderLargeLiteral(JsonNode recipe) throws Exception {
        var literal = OWLManager.getOWLDataFactory().getOWLLiteral(
            recipe.required("character").asText().repeat(recipe.required("length").asInt()));
        byte[] rendered = new ManchesterOWLSyntaxOWLObjectRendererImpl()
            .render(literal).getBytes(StandardCharsets.UTF_8);
        String lexical = literal.getLiteral();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return Map.of("lexicalLength", lexical.length(), "literalSha256",
            HexFormat.of().formatHex(digest.digest(lexical.getBytes(StandardCharsets.UTF_8))),
            "renderedBytes", rendered.length, "renderedSha256",
            HexFormat.of().formatHex(digest.digest(rendered)));
    }

    private static Map<String, Object> largeLiteral(JsonNode recipe, OWLDocumentFormat format) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var factory = manager.getOWLDataFactory();
        var ontology = manager.createOntology(IRI.create(recipe.required("ontologyIRI").asText()));
        var subject = IRI.create(recipe.required("subjectIRI").asText());
        int length = recipe.required("length").asInt();
        manager.addAxiom(ontology, factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(),
            subject, factory.getOWLLiteral(recipe.required("character").asText().repeat(length))));
        var target = new StringDocumentTarget();
        manager.saveOntology(ontology, format, target);
        String document = target.toString();
        byte[] savedBytes = document.getBytes(StandardCharsets.UTF_8);
        String savedSha256 = HexFormat.of().formatHex(
            MessageDigest.getInstance("SHA-256").digest(savedBytes));
        var reloaded = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
            new StringDocumentSource(document, IRI.create("urn:resources:document"), format, null));
        String lexical = reloaded.annotationAssertionAxioms(subject).findFirst().orElseThrow()
            .getValue().asLiteral().orElseThrow().getLiteral();
        return Map.of("documentBytes", savedBytes.length, "documentSha256", savedSha256,
            "reloadedLength", lexical.length(), "literalSha256", HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(lexical.getBytes(StandardCharsets.UTF_8))));
    }

    private static void installImportMappings(OWLOntologyManager manager, Map<String, IRI> imports,
        Map<String, Object> requestedImports) {
        manager.getIRIMappers().clear();
        manager.getIRIMappers().add(iri -> {
            IRI mapped = imports.get(iri.toString());
            requestedImports.put(iri.toString(), mapped == null ? null : mapped.toString());
            if (mapped == null) throw new IllegalArgumentException("Unmapped import " + iri);
            return mapped;
        });
    }

    private static void sampleLoad(JsonNode request, OWLOntologyLoaderConfiguration configuration,
        Map<String, IRI> imports) throws Exception {
        JsonNode protocol = request.required("performance");
        JsonNode document = request.required("document");
        String caseId = request.required("caseId").asText();
        boolean cold = "cold".equals(protocol.required("mode").asText());
        int warmups = cold ? 0 : protocol.required("warmups").asInt();
        int repetitions = cold ? 1 : protocol.required("repetitions").asInt();
        List<Long> wallNanos = new java.util.ArrayList<>();
        OWLOntology ontology = null;
        Map<String, Object> observation = new LinkedHashMap<>();
        observation.put("caseId", caseId);
        observation.put("kind", "sample");
        observation.put("wallNanos", wallNanos);
        try {
            for (int index = 0; index < warmups + repetitions; index++) {
                ontology = null;
                OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
                installImportMappings(manager, imports, new LinkedHashMap<>());
                try (InputStream stream = Files.newInputStream(Path.of(document.required("path").asText()))) {
                    StreamDocumentSource source = new StreamDocumentSource(stream,
                        IRI.create(document.required("documentIRI").asText()),
                        sourceFormat(request), null);
                    if (cold) observeCheckpoint(caseId, "before");
                    long start = System.nanoTime();
                    ontology = manager.loadOntologyFromOntologyDocument(source, configuration);
                    long elapsed = System.nanoTime() - start;
                    if (cold) observeCheckpoint(caseId, "after");
                    if (index >= warmups) wallNanos.add(elapsed);
                }
            }
            observation.put("status", "completed");
            observation.put("axioms", ontology.getAxiomCount());
            observation.put("networkAttempts", OntologyReferenceContract.networkAccessAttemptCount());
        } catch (Exception failure) {
            observation.putAll(failure("public-load", failure));
        }
        System.out.println(JSON.writeValueAsString(observation));
    }

    private static void observeCheckpoint(String caseId, String phase) throws Exception {
        Runtime runtime = Runtime.getRuntime();
        System.out.println(JSON.writeValueAsString(Map.of("caseId", caseId, "kind", "checkpoint",
            "phase", phase, "pid", ProcessHandle.current().pid(),
            "heapUsedBytes", runtime.totalMemory() - runtime.freeMemory())));
        if (System.in.read() != '.') throw new IllegalStateException("Working-set observer disconnected");
    }

    private static OWLOntology loadFunctional(Path path, Path absent,
        OWLOntologyLoaderConfiguration configuration) throws Exception {
        OWLOntologyManager reader = OWLManager.createOWLOntologyManager();
        reader.getIRIMappers().clear();
        reader.getIRIMappers().add(iri -> IRI.create(absent.toUri()));
        try (InputStream stream = Files.newInputStream(path)) {
            return reader.loadOntologyFromOntologyDocument(new StreamDocumentSource(stream,
                IRI.create("urn:owlapi:comparison:functional"), new FunctionalSyntaxDocumentFormat(), null),
                configuration.setMissingImportHandlingStrategy(MissingImportHandlingStrategy.SILENT));
        }
    }

    private static List<Map<String, Object>> compareDocuments(JsonNode sourceModels,
        OWLOntologyManager manager, OWLOntology root, OWLOntologyLoaderConfiguration configuration,
        Path absent) {
        Map<String, Path> models = new LinkedHashMap<>();
        for (JsonNode model : sourceModels) {
            String documentIRI = model.required("documentIRI").asText();
            if (models.putIfAbsent(documentIRI, Path.of(model.required("path").asText())) != null) {
                throw new IllegalArgumentException("Repeated source model for " + documentIRI);
            }
        }
        return manager.importsClosure(root).map(document -> {
            String documentIRI = manager.getOntologyDocumentIRI(document).toString();
            Path model = models.get(documentIRI);
            Map<String, Object> verdict = blocked("JS direct model is unavailable");
            if (model != null) {
                try {
                    verdict = compare(document, loadFunctional(model, absent, configuration));
                } catch (Exception failure) {
                    verdict = failure("direct-functional-reparse", failure);
                }
            }
            return Map.<String, Object>of("documentIRI", documentIRI, "comparison", verdict);
        }).toList();
    }

    private static OWLOntology merge(OWLOntologyManager source, OWLOntology root,
        OWLOntologyManager target) throws Exception {
        OWLOntology merged = new OWLOntologyMerger(
            new OWLOntologyImportsClosureSetProvider(source, root), false).createMergedOntology(target, null);
        target.applyChange(new SetOntologyID(merged, root.getOntologyID()));
        root.annotations().forEach(annotation -> target.applyChange(new AddOntologyAnnotation(merged, annotation)));
        return merged;
    }

    private static Map<String, Object> roundTripRdfXml(OWLOntologyManager manager, OWLOntology original,
        Path output, String logicalBase, OWLOntologyLoaderConfiguration configuration) {
        Map<String, Object> stages = new LinkedHashMap<>();
        try {
            try (OutputStream stream = Files.newOutputStream(output, StandardOpenOption.CREATE_NEW)) {
                manager.saveOntology(original, new RDFXMLDocumentFormat(), stream);
            }
            stages.put("write", Map.of("status", "completed", "artifact", pin(output)));
        } catch (Exception failure) {
            stages.put("write", failure("rdfxml-write", failure));
            return stages;
        }
        OWLOntologyManager reloader = OWLManager.createOWLOntologyManager();
        reloader.getIRIMappers().clear();
        reloader.getIRIMappers().add(iri -> {
            throw new IllegalArgumentException("A merged document cannot load imports");
        });
        try (InputStream stream = Files.newInputStream(output)) {
            OWLOntology reloaded = reloader.loadOntologyFromOntologyDocument(new StreamDocumentSource(
                stream, IRI.create(logicalBase), new RDFXMLDocumentFormat(), null), configuration);
            stages.put("reload", Map.of("status", "completed", "ontology", summarize(reloader, reloaded)));
            stages.put("comparison", compare(original, reloaded));
        } catch (Exception failure) {
            stages.put("reload", failure("rdfxml-reload", failure));
        }
        return stages;
    }

    private static Map<String, Object> pin(Path file) throws Exception {
        var digest = MessageDigest.getInstance("SHA-256");
        long length = 0;
        byte[] buffer = new byte[64 * 1024];
        try (InputStream stream = Files.newInputStream(file)) {
            int size;
            while ((size = stream.read(buffer)) != -1) {
                digest.update(buffer, 0, size);
                length += size;
            }
        }
        return Map.of("name", file.getFileName().toString(), "byteLength", length,
            "sha256", HexFormat.of().formatHex(digest.digest()));
    }

    private static OWLDocumentFormat sourceFormat(JsonNode request) {
        String syntax = request.required("document").required("syntax").asText();
        if (syntax.equals("turtle") && "owlapi".equals(request.path("javaTurtle").asText())) {
            return new TurtleDocumentFormat();
        }
        return format(syntax);
    }

    private static OWLDocumentFormat format(String syntax) {
        return switch (syntax) {
            case "rdfxml" -> new RDFXMLDocumentFormat();
            case "turtle" -> new RioTurtleDocumentFormat();
            case "functional" -> new FunctionalSyntaxDocumentFormat();
            case "owlxml" -> new OWLXMLDocumentFormat();
            case "ntriples" -> new NTriplesDocumentFormat();
            case "nquads" -> new NQuadsDocumentFormat();
            default -> throw new IllegalArgumentException("Unsupported explicit ontology syntax " + syntax);
        };
    }

    private static Map<String, Object> summarize(OWLOntologyManager manager, OWLOntology ontology) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("identity", OntologyStructuralComparison.ontologyIdentity(ontology.getOntologyID()));
        result.put("counts", OntologyStructuralComparison.ontologyCounts(ontology));
        result.put("imports", ontology.importsDeclarations().map(value -> value.getIRI().toString())
            .sorted().collect(Collectors.toList()));
        result.put("closure", manager.importsClosure(ontology).map(member ->
            OntologyStructuralComparison.ontologyIdentity(member.getOntologyID()))
            .sorted(OntologyStructuralComparison::compareOntologyIdentity).collect(Collectors.toList()));
        result.put("unparsedRdf", manager.getOntologyFormat(ontology).getOntologyLoaderMetaData()
            .map(metadata -> metadata.getUnparsedTriples().map(Object::toString).sorted().toList())
            .orElse(List.of()));
        return result;
    }

    private static Map<String, Object> compare(OWLOntology expected, OWLOntology actual) {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        Map<String, Object> comparison = new LinkedHashMap<>();
        Map<String, Long> phases = new LinkedHashMap<>();
        OntologyStructuralComparison.ComparisonOutcome outcome =
            OntologyStructuralComparison.compareOntologies(expected, actual, manager, phases);
        comparison.put("status", outcome.matches ? "match" :
            "COMPARISON_LIMIT".equals(outcome.mismatchCategory) ? "inconclusive" : "mismatch");
        comparison.put("category", outcome.mismatchCategory);
        comparison.put("path", outcome.mismatchPath);
        if (!outcome.matches && !"COMPARISON_LIMIT".equals(outcome.mismatchCategory)) {
            long start = System.nanoTime();
            try {
                comparison.put("differences", OntologyStructuralComparison.describeDifferences(expected, actual, manager));
                comparison.put("detailStatus", "completed");
            } catch (Exception failure) {
                comparison.put("detailStatus", "incomplete");
                comparison.put("detailFailure", failure("render-structural-differences", failure));
            } finally {
                phases.put("differenceRendering", System.nanoTime() - start);
            }
        }
        comparison.put("elapsedNanos", phases);
        return comparison;
    }

    private static Map<String, Object> blocked(String reason) {
        return Map.of("status", "blocked", "reason", reason);
    }

    private static Map<String, Object> sourceLoadFailure(Exception error) {
        var result = new LinkedHashMap<>(failure("load", error));
        if (error instanceof UnparsableOntologyException unparsable &&
            unparsable.getExceptions().values().stream().anyMatch(RunOntologyComparisonCase::isTotalEntityLimit)) {
            result.put("diagnosticCode", "JAXP00010004");
            result.put("resource", "jdk.xml.totalEntitySizeLimit");
        }
        return result;
    }

    private static boolean isTotalEntityLimit(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof SAXParseException && cause.getMessage() != null &&
                cause.getMessage().startsWith("JAXP00010004:") &&
                cause.getMessage().contains("jdk.xml.totalEntitySizeLimit")) {
                return true;
            }
        }
        return false;
    }

    private static Map<String, Object> failure(String phase, Exception failure) {
        return Map.of("status", "failed", "phase", phase, "category", failure.getClass().getSimpleName(),
            "message", String.valueOf(failure.getMessage()));
    }
}
