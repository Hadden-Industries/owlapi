import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.util.OWLObjectDuplicator;

/** Observe all typed-map raw-IRI priorities through public duplicator calls. */
public final class RunRC2TransformsMatrix {
  public static void main(String[] arguments) throws Exception {
    var manager = OWLManager.createOWLOntologyManager();
    var factory = manager.getOWLDataFactory();
    var old = IRI.create("urn:transform:shared");
    List<OWLEntity> entities = List.of(factory.getOWLClass(old), factory.getOWLObjectProperty(old), factory.getOWLDataProperty(old), factory.getOWLAnnotationProperty(old), factory.getOWLNamedIndividual(old), factory.getOWLDatatype(old));
    List<Map<String,Object>> rows = new ArrayList<>();
    for (int subset = 1; subset < (1 << entities.size()); subset++) {
      for (boolean reverse : List.of(false, true)) {
        Map<OWLEntity,IRI> replacements = new LinkedHashMap<>();
        for (int step = 0; step < entities.size(); step++) {
          int index = reverse ? entities.size() - step - 1 : step;
          if ((subset & (1 << index)) != 0) replacements.put(entities.get(index), IRI.create("urn:transform:replacement:" + index));
        }
        var duplicator = new OWLObjectDuplicator(replacements, manager);
        rows.add(Map.of("subset", subset, "reverse", reverse, "rawIRI", duplicator.duplicateObject(old).toString(), "typedIRIs", entities.stream().map(entity -> duplicator.duplicateObject(entity).getIRI().toString()).toList()));
      }
    }
    Files.writeString(Path.of(arguments[0]), new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("schemaVersion",1,"sourceRevision","b61ebe2da83daceebb3e7ba7afbd2582c9240c33","runtimeQualification","FRESH_LOCAL_WINDOWS_NATIVE_BUILD_NOT_LINUX_IMAGE_EQUIVALENCE","entityKinds",entities.stream().map(entity -> entity.getEntityType().getName()).toList(),"observations",rows)) + "\n");
  }
}
