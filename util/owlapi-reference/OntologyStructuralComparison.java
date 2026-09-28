import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
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
import java.util.stream.Collectors;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLAnonymousIndividual;
import org.semanticweb.owlapi.model.OWLDataFactory;
import org.semanticweb.owlapi.model.OWLEntity;
import org.semanticweb.owlapi.model.OWLLiteral;
import org.semanticweb.owlapi.model.OWLObject;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyID;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.util.OWLObjectDuplicator;
import org.semanticweb.owlapi.util.RemappingIndividualProvider;

/** Shared native OWL structural equality and anonymous-individual comparison for development oracles. */
final class OntologyStructuralComparison {
    private static final int MAXIMUM_COMPARISON_STATES = 250_000;

    private OntologyStructuralComparison() {}

    /** Discover every named difference and every unmatched connected anonymous graph. */
    static Map<String, Object> describeDifferences(OWLOntology expected, OWLOntology actual,
        OWLOntologyManager comparisonManager) throws IOException {
        Map<String, Object> differences = new LinkedHashMap<>();
        Map<String, Object> expectedId = ontologyIdentity(expected.getOntologyID());
        Map<String, Object> actualId = ontologyIdentity(actual.getOntologyID());
        Map<String, Object> changedId = new LinkedHashMap<>();
        changedId.put("java", expectedId);
        changedId.put("js", actualId);
        differences.put("ontologyId", expectedId.equals(actualId) ? null : changedId);
        differences.put("imports", setDifferences(expected.importsDeclarations()
            .map(declaration -> declaration.getIRI().toString()).collect(Collectors.toList()),
            actual.importsDeclarations().map(declaration -> declaration.getIRI().toString())
                .collect(Collectors.toList())));
        differences.put("annotations", setDifferences(expected.annotations()
            .filter(annotation -> annotation.getAnonymousIndividuals().isEmpty())
            .collect(Collectors.toList()), actual.annotations()
            .filter(annotation -> annotation.getAnonymousIndividuals().isEmpty())
            .collect(Collectors.toList())));
        differences.put("axioms", setDifferences(expected.axioms()
            .filter(axiom -> axiom.getAnonymousIndividuals().isEmpty()).collect(Collectors.toList()),
            actual.axioms().filter(axiom -> axiom.getAnonymousIndividuals().isEmpty())
                .collect(Collectors.toList())));

        // A connected anonymous graph is indivisible: matching its statements separately
        // could hide a change in sharing across axioms and ontology annotations.
        List<List<StructuralStatement>> expectedGraphs = anonymousGraphs(expected);
        List<List<StructuralStatement>> remainingActualGraphs = anonymousGraphs(actual);
        boolean hasAnonymousGraphs = !expectedGraphs.isEmpty() || !remainingActualGraphs.isEmpty();
        List<Map<String, Object>> javaOnly = new ArrayList<>();
        for (List<StructuralStatement> graph : expectedGraphs) {
            int matchedIndex = -1;
            for (int index = 0; index < remainingActualGraphs.size(); index++) {
                if (new AnonymousIndividualBijectionMatcher(comparisonManager, graph,
                    remainingActualGraphs.get(index)).match().matches) {
                    matchedIndex = index;
                    break;
                }
            }
            if (matchedIndex >= 0) {
                remainingActualGraphs.remove(matchedIndex);
            } else {
                javaOnly.add(describeAnonymousGraph(graph, comparisonManager));
            }
        }
        List<Map<String, Object>> jsOnly = new ArrayList<>();
        for (List<StructuralStatement> graph : remainingActualGraphs) {
            jsOnly.add(describeAnonymousGraph(graph, comparisonManager));
        }
        Comparator<Map<String, Object>> byStatements = Comparator.comparing(
            graph -> graph.get("statements").toString());
        javaOnly.sort(byStatements);
        jsOnly.sort(byStatements);
        Map<String, Object> graphDifferences = new LinkedHashMap<>();
        graphDifferences.put("javaOnly", javaOnly);
        graphDifferences.put("jsOnly", jsOnly);
        differences.put("anonymousIndividualGraphs", graphDifferences);
        differences.put("anonymousIndividualComparison", !hasAnonymousGraphs ? "NOT_REQUIRED"
            : javaOnly.isEmpty() && jsOnly.isEmpty() ? "MATCH" : "MISMATCH");
        return differences;
    }

    /** OWLAPI equality, not its display strings, decides membership in the difference. */
    private static <T> Map<String, Object> setDifferences(Collection<T> expected,
        Collection<T> actual) {
        Set<T> javaOnly = new HashSet<>(expected);
        javaOnly.removeAll(new HashSet<>(actual));
        Set<T> jsOnly = new HashSet<>(actual);
        jsOnly.removeAll(new HashSet<>(expected));
        Map<String, Object> differences = new LinkedHashMap<>();
        differences.put("javaOnly", javaOnly.stream().map(Object::toString).sorted()
            .collect(Collectors.toList()));
        differences.put("jsOnly", jsOnly.stream().map(Object::toString).sorted()
            .collect(Collectors.toList()));
        return differences;
    }

    private static List<List<StructuralStatement>> anonymousGraphs(OWLOntology ontology) {
        List<StructuralStatement> statements = new ArrayList<>();
        ontology.axioms().filter(axiom -> !axiom.getAnonymousIndividuals().isEmpty())
            .forEach(axiom -> statements.add(new StructuralStatement(StatementCategory.AXIOM, axiom)));
        ontology.annotations().filter(annotation -> !annotation.getAnonymousIndividuals().isEmpty())
            .forEach(annotation -> statements.add(new StructuralStatement(
                StatementCategory.ONTOLOGY_ANNOTATION, annotation)));
        List<List<StructuralStatement>> graphs = new ArrayList<>();
        List<Set<OWLAnonymousIndividual>> graphIndividuals = new ArrayList<>();
        for (StructuralStatement statement : statements) {
            List<StructuralStatement> graph = new ArrayList<>();
            graph.add(statement);
            Set<OWLAnonymousIndividual> individuals = new HashSet<>(
                statement.value.getAnonymousIndividuals());
            for (int index = graphs.size() - 1; index >= 0; index--) {
                if (!Collections.disjoint(individuals, graphIndividuals.get(index))) {
                    graph.addAll(graphs.remove(index));
                    individuals.addAll(graphIndividuals.remove(index));
                }
            }
            graphs.add(graph);
            graphIndividuals.add(individuals);
        }
        return graphs;
    }

    /** Stable diagnostic labels do not participate in the native equality decision. */
    private static Map<String, Object> describeAnonymousGraph(List<StructuralStatement> graph,
        OWLOntologyManager comparisonManager) throws IOException {
        List<OWLAnonymousIndividual> individuals = graph.stream()
            .flatMap(statement -> statement.value.anonymousIndividuals()).distinct()
            .collect(Collectors.toList());
        // Nine factorial already exceeds the shared search budget. Refuse that
        // diagnostic search explicitly instead of emitting unstable labels or truncating.
        if (individuals.size() > 8) {
            throw new AnonymousIndividualComparisonLimitException();
        }
        CanonicalGraphDescription description = new CanonicalGraphDescription();
        assignDiagnosticLabels(graph, individuals, comparisonManager, new HashMap<>(),
            new boolean[individuals.size()], 0, description);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("anonymousIndividuals", individuals.size());
        result.put("statements", description.statements);
        return result;
    }

    private static void assignDiagnosticLabels(List<StructuralStatement> graph,
        List<OWLAnonymousIndividual> individuals, OWLOntologyManager comparisonManager,
        Map<OWLAnonymousIndividual, OWLAnonymousIndividual> mapping, boolean[] usedLabels,
        int position, CanonicalGraphDescription description) throws IOException {
        if (position == individuals.size()) {
            OWLObjectDuplicator duplicator = new OWLObjectDuplicator(
                Collections.<OWLEntity, IRI>emptyMap(), Collections.<OWLLiteral, OWLLiteral>emptyMap(),
                comparisonManager, new MappedIndividualProvider(comparisonManager.getOWLDataFactory(),
                    mapping));
            List<Map<String, String>> rendered = new ArrayList<>();
            for (StructuralStatement statement : graph) {
                Map<String, String> entry = new LinkedHashMap<>();
                entry.put("category", statement.category.name());
                entry.put("value", duplicator.duplicateObject(statement.value).toString());
                rendered.add(entry);
            }
            rendered.sort(Comparator.comparing((Map<String, String> entry) -> entry.get("category"))
                .thenComparing(entry -> entry.get("value")));
            String key = new ObjectMapper().writeValueAsString(rendered);
            if (description.key == null || key.compareTo(description.key) < 0) {
                description.key = key;
                description.statements = rendered;
            }
            return;
        }
        for (int index = 0; index < usedLabels.length; index++) {
            if (!usedLabels[index]) {
                usedLabels[index] = true;
                mapping.put(individuals.get(position), comparisonManager.getOWLDataFactory()
                    .getOWLAnonymousIndividual("comparison-" + index));
                assignDiagnosticLabels(graph, individuals, comparisonManager, mapping,
                    usedLabels, position + 1, description);
                mapping.remove(individuals.get(position));
                usedLabels[index] = false;
            }
        }
    }

    private static final class CanonicalGraphDescription {
        private String key;
        private List<Map<String, String>> statements;
    }

    static ComparisonOutcome compareOntologies(OWLOntology expected,
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

    static Map<String, Object> ontologyCounts(OWLOntology ontology) {
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

    static Map<String, Object> ontologyIdentity(OWLOntologyID ontologyID) {
        Map<String, Object> identity = new LinkedHashMap<>();
        identity.put("ontologyIRI",
            ontologyID.getOntologyIRI().map(IRI::toString).orElse(null));
        identity.put("versionIRI", ontologyID.getVersionIRI().map(IRI::toString).orElse(null));
        return identity;
    }

    static int compareOntologyIdentity(Map<String, Object> left,
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

    static final class ComparisonOutcome {
        final boolean matches;
        final int anonymousIndividualBijectionSize;
        final String mismatchCategory;
        final String mismatchPath;

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

            Map<OWLObject, List<Integer>> actualIndexesBySkeleton = new HashMap<>();
            for (int index = 0; index < actualSkeletons.size(); index++) {
                actualIndexesBySkeleton.computeIfAbsent(actualSkeletons.get(index),
                    ignored -> new ArrayList<>()).add(index);
            }

            candidateActualStatementIndexes = new ArrayList<>();
            for (int expectedIndex = 0; expectedIndex < expectedStatements.size();
                expectedIndex++) {
                List<Integer> candidates = new ArrayList<>();
                StructuralStatement expectedStatement = expectedStatements.get(expectedIndex);
                int expectedAnonymousCount =
                    expectedStatement.value.getAnonymousIndividuals().size();
                for (int actualIndex : actualIndexesBySkeleton.getOrDefault(
                    expectedSkeletons.get(expectedIndex), Collections.emptyList())) {
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

    static final class AnonymousIndividualComparisonLimitException
        extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private AnonymousIndividualComparisonLimitException() {
            super("Anonymous-individual comparison exceeded its bounded search state limit");
        }
    }
}
