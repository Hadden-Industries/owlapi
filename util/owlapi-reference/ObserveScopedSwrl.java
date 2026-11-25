import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.formats.RDFXMLDocumentFormat;
import org.semanticweb.owlapi.functional.parser.OWLFunctionalSyntaxOWLParserFactory;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.profiles.OWL2DLProfile;
import org.semanticweb.owlapi.profiles.OWL2ELProfile;
import org.semanticweb.owlapi.rdf.rdfxml.parser.RDFXMLParserFactory;

/** Observe the released library directly, restricting each fixture to its declared native parser. */
public final class ObserveScopedSwrl {
    private static final ObjectMapper JSON = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        var results = new LinkedHashMap<String, Object>();
        for (JsonNode input : JSON.readTree(Path.of(args[0]).toFile())) {
            var manager = OWLManager.createOWLOntologyManager();
            boolean functional = input.path("format").asText().equals("functional");
            manager.getOntologyParsers().set(Set.of(functional
                ? new OWLFunctionalSyntaxOWLParserFactory() : new RDFXMLParserFactory()));
            manager.getIRIMappers().add(iri -> { throw new IllegalArgumentException("Unexpected fixture import " + iri); });
            String id = input.required("id").asText();
            var source = new StringDocumentSource(input.required("text").asText(), IRI.create("urn:owlapi:fixture:" + id),
                functional ? new FunctionalSyntaxDocumentFormat() : new RDFXMLDocumentFormat(), null);
            var config = new OWLOntologyLoaderConfiguration().setStrict(input.path("strict").asBoolean(false))
                .setLoadAnnotationAxioms(input.path("annotations").asBoolean(true));
            var result = new LinkedHashMap<String, Object>();
            result.put("sourceSha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(input.required("text").asText().getBytes(StandardCharsets.UTF_8))));
            result.put("format", functional ? "functional" : "rdfxml");
            result.put("strict", config.isStrict());
            result.put("loadAnnotationAxioms", config.isLoadAnnotationAxioms());
            try {
                OWLOntology ontology = manager.loadOntologyFromOntologyDocument(source, config);
                var rules = new ArrayList<Map<String, Object>>();
                ontology.axioms(AxiomType.SWRL_RULE).forEach(rule -> rules.add(observe(rule)));
                result.put("axioms", ontology.getAxiomCount());
                result.put("declarations", ontology.getAxiomCount(AxiomType.DECLARATION));
                result.put("individuals", ontology.individualsInSignature().map(entity -> entity.getIRI().toString()).sorted().toList());
                result.put("rules", rules.stream().sorted(java.util.Comparator.comparing(Object::toString)).toList());
                result.put("inDL", new OWL2DLProfile().checkOntology(ontology).isInProfile());
                result.put("inEL", new OWL2ELProfile().checkOntology(ontology).isInProfile());
            } catch (OWLOntologyCreationException rejected) {
                result.put("error", rejected.getClass().getSimpleName());
            }
            results.put(id, result);
        }
        JSON.writerWithDefaultPrettyPrinter().writeValue(Path.of(args[1]).toFile(), results);
    }

    private static Map<String, Object> observe(SWRLRule rule) {
        var row = new LinkedHashMap<String, Object>();
        row.put("body", rule.body().map(Object::toString).toList());
        row.put("head", rule.head().map(Object::toString).toList());
        row.put("variables", rule.variables().map(v -> v.getIRI().toString()).sorted().toList());
        row.put("annotations", rule.annotations().map(Object::toString).sorted().toList());
        return row;
    }
}
