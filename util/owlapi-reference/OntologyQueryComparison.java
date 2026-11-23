import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.AddImport;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.RemoveImport;
import org.semanticweb.owlapi.model.UnknownOWLOntologyException;
import org.semanticweb.owlapi.search.EntitySearcher;
import org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider;

/** Observe search consumption and closure snapshots through the released Java APIs. */
final class OntologyQueryComparison {
    private OntologyQueryComparison() {}

    @SuppressWarnings("deprecation")
    static Map<String, Object> observe(JsonNode recipe) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var factory = manager.getOWLDataFactory();
        String kind = recipe.required("kind").asText();
        if ("deferred-search".equals(kind)) {
            var ontology = manager.createOntology();
            var a = factory.getOWLClass(IRI.create(recipe.required("a").asText()));
            var b = factory.getOWLClass(IRI.create(recipe.required("b").asText()));
            var c = factory.getOWLClass(IRI.create(recipe.required("c").asText()));
            var first = EntitySearcher.getSuperClasses(a, ontology);
            int[] callbacks = {0};
            var deferred = EntitySearcher.getSuperClasses(a, Stream.of(ontology).peek(ignored -> callbacks[0]++));
            var axiom = factory.getOWLSubClassOfAxiom(a, b);
            manager.addAxiom(ontology, axiom);
            int beforeConsumption = callbacks[0];
            var emptyThenAdd = first.map(value -> value.asOWLClass().getIRI().toString()).sorted().toList();
            var deferredMembers = deferred.map(value -> value.asOWLClass().getIRI().toString()).sorted().toList();
            int afterConsumption = callbacks[0];
            var present = EntitySearcher.getSuperClasses(a, ontology);
            manager.addAxiom(ontology, factory.getOWLSubClassOfAxiom(a, c));
            var presentThenAdd = present.map(value -> value.asOWLClass().getIRI().toString()).sorted().toList();
            var removed = EntitySearcher.getSuperClasses(a, ontology);
            manager.removeAxiom(ontology, axiom);
            var presentThenRemove = removed.map(value -> value.asOWLClass().getIRI().toString()).sorted().toList();
            boolean repeatRefused = false;
            try {
                removed.toList();
            } catch (IllegalStateException expected) {
                repeatRefused = true;
            }
            return Map.of("beforeConsumption", beforeConsumption, "emptyThenAdd", emptyThenAdd,
                "deferred", deferredMembers, "afterConsumption", afterConsumption,
                "presentThenAdd", presentThenAdd, "presentThenRemove", presentThenRemove, "repeatRefused", repeatRefused);
        }
        if (!"closure-provider".equals(kind)) throw new IllegalArgumentException("Unsupported query observation");
        var root = manager.createOntology(IRI.create(recipe.required("root").asText()));
        var child = IRI.create(recipe.required("child").asText());
        manager.createOntology(child);
        var provider = new OWLOntologyImportsClosureSetProvider(manager, root);
        var beforeImport = provider.ontologies();
        var declaration = factory.getOWLImportsDeclaration(child);
        manager.applyChange(new AddImport(root, declaration));
        var prior = members(beforeImport);
        var added = members(provider.ontologies());
        var beforeRemoval = provider.ontologies();
        manager.applyChange(new RemoveImport(root, declaration));
        var priorRemoval = members(beforeRemoval);
        var removed = members(provider.ontologies());
        var foreign = new OWLOntologyImportsClosureSetProvider(OWLManager.createOWLOntologyManager(), root);
        boolean foreignRefusedAtQuery = false;
        try {
            foreign.ontologies().count();
        } catch (UnknownOWLOntologyException expected) {
            foreignRefusedAtQuery = true;
        }
        return Map.of("beforeImport", prior, "afterImport", added, "beforeRemoval", priorRemoval,
            "afterRemoval", removed, "foreignRefusedAtQuery", foreignRefusedAtQuery);
    }

    private static List<String> members(Stream<OWLOntology> ontologies) {
        return ontologies.map(ontology -> ontology.getOntologyID().getOntologyIRI().orElseThrow().toString())
            .sorted().toList();
    }
}
