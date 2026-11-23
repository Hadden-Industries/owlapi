import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.eclipse.rdf4j.rio.Rio;
import org.eclipse.rdf4j.rio.helpers.JSONLDSettings;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.RDFJsonLDDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.UnparsableOntologyException;
import org.semanticweb.owlapi.model.IRI;

/** Released manager parsing and provider whitelist observations without context retrieval. */
final class OntologyJsonLdComparison {
    private OntologyJsonLdComparison() {}

    static List<?> observeFirstStructure(JsonNode recipe) throws Exception {
        List<Map<String, Object>> outcomes = new ArrayList<>();
        for (var document : recipe.required("documents")) {
            var manager = OWLManager.createOWLOntologyManager();
            var source = new StringDocumentSource(document.required("text").asText(),
                IRI.create("urn:owlapi:comparison:jsonld"), new RDFJsonLDDocumentFormat(), null);
            try {
                var ontology = manager.loadOntologyFromOntologyDocument(source);
                outcomes.add(Map.of("status", "return", "axioms", ontology.getAxiomCount()));
            } catch (UnparsableOntologyException refusal) {
                outcomes.add(Map.of("status", "refused"));
            }
        }
        return outcomes;
    }

    static List<String> observeWhitelist() {
        var config = Rio.createParser(RDFFormat.JSONLD).getParserConfig();
        return config.get(JSONLDSettings.WHITELIST).stream().sorted().toList();
    }
}
