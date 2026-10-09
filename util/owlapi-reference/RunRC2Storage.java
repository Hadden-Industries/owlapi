import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.SetOntologyID;
import org.semanticweb.owlapi.model.OWLOntologyID;

/** Public save/reload probes distinguish storer defects from native parser behavior. */
public final class RunRC2Storage {
  public static void main(String[] arguments) throws Exception {
    var manager = OWLManager.createOWLOntologyManager();
    var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(Files.readString(Path.of(arguments[0]))));
    // Avoid the native storer's independent relative-URN IRI issue when
    // isolating anonymous individuals inside ObjectOneOf.
    if (arguments.length > 3) manager.applyChange(new SetOntologyID(ontology, new OWLOntologyID(IRI.create("https://rc2.example.test/ontology"))));
    var target = new StringDocumentTarget();
    var format = arguments[1].equals("OWL_XML") ? new OWLXMLDocumentFormat() : new TurtleDocumentFormat();
    manager.saveOntology(ontology, format, target);
    Files.writeString(Path.of(arguments[2]), target.toString());
    var reloaded = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(target.toString(), IRI.create("urn:rc2:stored"), format, null));
    Map<String,Object> result = new LinkedHashMap<>();
    result.put("inputAxioms",ontology.getAxiomCount());
    result.put("outputAxioms",reloaded.getAxiomCount());
    result.put("inputDisjointUnions",ontology.axioms().filter(value -> value.getAxiomType().getName().equals("DisjointUnion")).map(Object::toString).toList());
    result.put("outputDisjointUnions",reloaded.axioms().filter(value -> value.getAxiomType().getName().equals("DisjointUnion")).map(Object::toString).toList());
    System.out.println(new ObjectMapper().writeValueAsString(result));
  }
}
