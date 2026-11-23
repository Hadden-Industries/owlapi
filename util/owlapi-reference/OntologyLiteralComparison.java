import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.IRI;

/** Construct every registered literal independently through Java's public factory. */
final class OntologyLiteralComparison {
    private OntologyLiteralComparison() {}

    static List<Map<String, String>> observe(JsonNode recipe) {
        var factory = OWLManager.getOWLDataFactory();
        List<Map<String, String>> result = new ArrayList<>();
        for (JsonNode row : recipe.required("rows")) {
            String lexical = row.required("lexicalForm").asText();
            var literal = row.has("datatypeIRI")
                ? factory.getOWLLiteral(lexical, factory.getOWLDatatype(IRI.create(row.required("datatypeIRI").asText())))
                : factory.getOWLLiteral(lexical, row.required("inputLanguage").asText());
            result.add(Map.of("lexicalForm", literal.getLiteral(),
                "datatypeIRI", literal.getDatatype().getIRI().toString(), "language", literal.getLang()));
        }
        return result;
    }
}
