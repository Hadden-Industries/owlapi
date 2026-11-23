import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.formats.RDFXMLDocumentFormat;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.io.RDFParserMetaData;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.UnparsableOntologyException;
import org.semanticweb.owlapi.model.AxiomType;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLDocumentFormat;
import org.semanticweb.owlapi.model.OWLIndividual;
import org.semanticweb.owlapi.model.OWLObjectOneOf;
import org.semanticweb.owlapi.model.OWLOntology;

/** Public parser and metadata observations for the selected finite input rows. */
final class OntologyParserBehaviorComparison {
    private OntologyParserBehaviorComparison() {}

    static List<Map<String, Object>> observe(JsonNode recipe) throws Exception {
        String kind = recipe.required("kind").asText();
        List<Map<String, Object>> outcomes = new ArrayList<>();
        for (JsonNode row : recipe.required("rows")) {
            var manager = OWLManager.createOWLOntologyManager();
            if (row.path("factory").asBoolean()) {
                var empty = manager.getOWLDataFactory().getOWLObjectOneOf(Set.of());
                outcomes.add(Map.of("status", "return", "individuals", empty.getIndividuals().size(), "anonymous", 0));
                continue;
            }
            var source = new StringDocumentSource(row.required("text").asText(),
                IRI.create("urn:parser:" + kind + ":" + row.required("id").asText()), format(row.path("format").asText()), null);
            var configuration = manager.getOntologyLoaderConfiguration();
            if (row.has("strict")) configuration = configuration.setStrict(row.required("strict").asBoolean());
            if (row.has("annotations")) configuration = configuration.setLoadAnnotationAxioms(row.required("annotations").asBoolean());
            OWLOntology ontology;
            try {
                ontology = manager.loadOntologyFromOntologyDocument(source, configuration);
            } catch (UnparsableOntologyException refused) {
                outcomes.add(Map.of("status", "aggregate"));
                continue;
            }
            var loadedFormat = manager.getOntologyFormat(ontology);
            switch (kind) {
                case "selection" -> outcomes.add(Map.of("status", "return",
                    "format", loadedFormat.getKey().equals("Turtle") ? "turtle" : loadedFormat.getKey(),
                    "axioms", ontology.getAxiomCount()));
                case "rdf-metadata" -> {
                    var metadata = (RDFParserMetaData) loadedFormat.getOntologyLoaderMetaData().orElseThrow();
                    outcomes.add(Map.of("headers", metadata.getHeaderState().name(), "tripleCount", metadata.getTripleCount()));
                }
                case "individual-enumeration" -> {
                    var axiom = ontology.axioms(AxiomType.SUBCLASS_OF).findFirst().orElseThrow();
                    var enumeration = (OWLObjectOneOf) axiom.getSuperClass();
                    outcomes.add(Map.of("status", "return", "individuals", enumeration.getIndividuals().size(),
                        "anonymous", enumeration.individuals().filter(OWLIndividual::isAnonymous).count()));
                }
                case "named-datatype-restriction" -> outcomes.add(Map.of(
                    "definitions", ontology.getAxiomCount(AxiomType.DATATYPE_DEFINITION),
                    "annotations", ontology.getAxiomCount(AxiomType.ANNOTATION_ASSERTION),
                    "anonymousAnnotations", ontology.axioms(AxiomType.ANNOTATION_ASSERTION)
                        .filter(axiom -> axiom.getSubject().isAnonymous()).count()));
                default -> throw new IllegalArgumentException("Unsupported parser observation");
            }
        }
        return outcomes;
    }

    private static OWLDocumentFormat format(String syntax) {
        return switch (syntax) {
            case "" -> null;
            case "functional" -> new FunctionalSyntaxDocumentFormat();
            case "turtle" -> new TurtleDocumentFormat();
            case "rdfxml" -> new RDFXMLDocumentFormat();
            case "owlxml" -> new OWLXMLDocumentFormat();
            default -> throw new IllegalArgumentException("Unsupported parser format " + syntax);
        };
    }
}
