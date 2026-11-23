import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLOntology;

/** Use a fresh manager to observe each finite XML limit from the actual provider. */
final class OntologyXmlProviderComparison {
    private OntologyXmlProviderComparison() {}

    static void observe(JsonNode recipe, Map<String, Object> result) {
        String document = recipe.required("document").asText();
        List<Map<String, String>> outcomes = new ArrayList<>();
        List<String> failures = new ArrayList<>();
        for (JsonNode limit : recipe.required("limits")) {
            var manager = OWLManager.createOWLOntologyManager();
            var configuration = manager.getOntologyLoaderConfiguration().setEntityExpansionLimit(limit.asText());
            var source = new StringDocumentSource(document, IRI.create("urn:xml:provider"),
                new OWLXMLDocumentFormat(), null);
            OWLOntology ontology;
            try {
                ontology = manager.loadOntologyFromOntologyDocument(source, configuration);
            } catch (Exception failure) {
                outcomes.add(Map.of("status", "refused"));
                failures.add(failure.getClass().getSimpleName());
                continue;
            }
            var literal = ontology.annotations().findFirst().orElseThrow().getValue().asLiteral().orElseThrow();
            outcomes.add(Map.of("status", "return", "value", literal.getLiteral()));
            failures.add(null);
        }
        result.put("xmlProvider", outcomes);
        result.put("xmlProviderFailureCategories", failures);
    }
}
