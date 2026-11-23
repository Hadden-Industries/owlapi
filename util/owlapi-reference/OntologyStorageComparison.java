import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.formats.RDFXMLDocumentFormat;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLDocumentFormat;

/** Public storage effects from the independently selected Java oracle. */
final class OntologyStorageComparison {
    private OntologyStorageComparison() {}

    static void observe(JsonNode recipe, Map<String, Object> result) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var factory = manager.getOWLDataFactory();
        var ontology = manager.createOntology(IRI.create(recipe.required("ontologyIRI").asText()));
        manager.addAxiom(ontology, factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(),
            IRI.create(recipe.required("subjectIRI").asText()), factory.getOWLLiteral(recipe.required("label").asText())));
        manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(
            factory.getOWLClass(IRI.create(recipe.required("entityIRI").asText()))));
        String syntax = recipe.required("format").asText();
        var target = new StringDocumentTarget();
        manager.saveOntology(ontology, format(syntax), target);
        String original = target.toString();
        if ("target-reuse".equals(recipe.required("kind").asText())) {
            manager.saveOntology(ontology, format(syntax), target);
            String second = target.toString();
            String publication = !original.isEmpty() && second.equals(original + original) ? "append"
                : !original.isEmpty() && second.equals(original) ? "replace" : "unexpected";
            result.put("storage", Map.of("publication", publication));
            result.put("storageDocumentSha256", List.of(digest(original), digest(second)));
            return;
        }
        if (!"parameters".equals(recipe.required("kind").asText())) {
            throw new IllegalArgumentException("Unsupported storage observation");
        }
        String invalid = recipe.required("invalidValue").asText();
        String forceString = recipe.required("forceStringParameter").asText();
        var ignored = format(syntax);
        ignored.setParameter(recipe.required("ignoredParameter").asText(), invalid);
        var ignoredTarget = new StringDocumentTarget();
        manager.saveOntology(ontology, ignored, ignoredTarget);
        var forced = format(syntax);
        forced.setParameter(forceString, true);
        var forcedTarget = new StringDocumentTarget();
        manager.saveOntology(ontology, forced, forcedTarget);
        var invalidFormat = format(syntax);
        invalidFormat.setParameter(forceString, invalid);
        var failedTarget = new StringDocumentTarget();
        boolean refusedInvalid = false;
        try {
            manager.saveOntology(ontology, invalidFormat, failedTarget);
        } catch (Exception failure) {
            refusedInvalid = true;
        }
        String failurePrefix = failedTarget.toString();
        result.put("storage", Map.of("ignoredSame", !original.isEmpty() && original.equals(ignoredTarget.toString()),
            "forceChanged", !original.equals(forcedTarget.toString()), "refusedInvalid", refusedInvalid,
            "failurePrefix", failurePrefix));
        result.put("storageDocumentSha256", List.of(digest(original), digest(ignoredTarget.toString()),
            digest(forcedTarget.toString()), digest(failurePrefix)));
    }

    private static OWLDocumentFormat format(String syntax) {
        return switch (syntax) {
            case "functional" -> new FunctionalSyntaxDocumentFormat();
            case "turtle" -> new TurtleDocumentFormat();
            case "rdfxml" -> new RDFXMLDocumentFormat();
            case "owlxml" -> new OWLXMLDocumentFormat();
            default -> throw new IllegalArgumentException("Unsupported storage format " + syntax);
        };
    }

    private static String digest(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
