import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLAxiom;
import org.semanticweb.owlapi.model.OWLSubClassOfAxiom;
import org.semanticweb.owlapi.modularity.locality.LocalityClass;
import org.semanticweb.owlapi.modularity.locality.SyntacticLocalityModuleExtractor;

/** Observe the exact included axiom identities from Java's public extractor. */
final class OntologyLocalityComparison {
    private OntologyLocalityComparison() {}

    static Map<String, Object> observe(JsonNode recipe) {
        var factory = OWLManager.getOWLDataFactory();
        List<OWLAxiom> original = new ArrayList<>();
        for (JsonNode edge : recipe.required("edges")) {
            original.add(factory.getOWLSubClassOfAxiom(
                factory.getOWLClass(IRI.create(edge.get(0).asText())),
                factory.getOWLClass(IRI.create(edge.get(1).asText()))));
        }
        var seed = factory.getOWLClass(IRI.create(recipe.required("seed").asText()));
        var extractor = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, original.stream());
        List<String> excluded = List.of(recipe.required("excluded").get(0).asText(), recipe.required("excluded").get(1).asText());
        Predicate<OWLAxiom> filter = axiom -> !edge(axiom).equals(excluded);
        return Map.of(
            "all", edges(extractor.extract(Stream.of(seed))),
            "filtered", edges(extractor.extract(Stream.of(seed), Optional.of(filter))));
    }

    private static List<String> edge(OWLAxiom axiom) {
        var subClass = (OWLSubClassOfAxiom) axiom;
        return List.of(subClass.getSubClass().asOWLClass().getIRI().toString(),
            subClass.getSuperClass().asOWLClass().getIRI().toString());
    }

    private static List<List<String>> edges(Stream<OWLAxiom> axioms) {
        return axioms.map(OntologyLocalityComparison::edge)
            .sorted(Comparator.comparing((List<String> pair) -> pair.get(0)).thenComparing(pair -> pair.get(1))).toList();
    }
}
