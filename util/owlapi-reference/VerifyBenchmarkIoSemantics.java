import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.*;

/** Untimed structural sink for the six remaining declaration-only I/O workloads. */
public class VerifyBenchmarkIoSemantics {
  private static OWLDocumentFormat format(String name) {
    return switch (name) {
      case "functional" -> new FunctionalSyntaxDocumentFormat();
      case "turtle" -> new TurtleDocumentFormat();
      case "nquads" -> new NQuadsDocumentFormat();
      case "trig" -> new TrigDocumentFormat();
      case "owlxml" -> new OWLXMLDocumentFormat();
      case "rdfxml" -> new RDFXMLDocumentFormat();
      default -> throw new IllegalArgumentException(name);
    };
  }

  private static Map<String, Object> observe(OWLOntology ontology) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("ontologyIRI", ontology.getOntologyID().getOntologyIRI().map(Object::toString).orElse(null));
    result.put("versionIRI", ontology.getOntologyID().getVersionIRI().map(Object::toString).orElse(null));
    result.put("ontologyAnnotations", ontology.getAnnotations().size());
    result.put("imports", ontology.getImportsDeclarations().size());
    List<String> declarations = new ArrayList<>();
    for (OWLAxiom axiom : ontology.getAxioms()) {
      if (!(axiom instanceof OWLDeclarationAxiom declaration)
          || !declaration.getEntity().isOWLClass() || !axiom.getAnnotations().isEmpty()) {
        throw new IllegalStateException("Unexpected axiom: " + axiom);
      }
      declarations.add(declaration.getEntity().getIRI().toString());
    }
    declarations.sort(String::compareTo);
    result.put("classDeclarations", declarations);
    result.put("logicalAxioms", ontology.getLogicalAxiomCount());
    return result;
  }

  public static void main(String[] args) throws Exception {
    ObjectMapper json = new ObjectMapper();
    JsonNode request = json.readTree(Path.of(args[0]).toFile());
    Map<String, Object> observations = new LinkedHashMap<>();
    for (JsonNode input : request.get("inputs")) {
      OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
      String text = Files.readString(Path.of(input.get("path").asText()), StandardCharsets.UTF_8);
      OWLOntology ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(
          text, IRI.create(input.get("documentIRI").asText()), format(input.get("format").asText()), null));
      observations.put(input.get("id").asText(), observe(ontology));
      if (input.has("saveDirectory")) {
        for (String name : List.of("owlxml", "rdfxml", "turtle")) {
          StringDocumentTarget target = new StringDocumentTarget();
          manager.saveOntology(ontology, format(name), target);
          Files.writeString(Path.of(input.get("saveDirectory").asText(), "java-" + name + ".txt"), target.toString(), StandardCharsets.UTF_8);
        }
        observations.put(input.get("id").asText() + ":after-save", observe(ontology));
      }
    }
    Files.writeString(Path.of(args[1]), json.writeValueAsString(observations), StandardCharsets.UTF_8);
  }
}
