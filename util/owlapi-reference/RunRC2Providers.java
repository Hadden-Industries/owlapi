import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.util.AnnotationValueShortFormProvider;

/** Independent priority and ontology-order observations using only public calls. */
public final class RunRC2Providers {
  public static void main(String[] arguments) throws Exception {
    var rows = new ArrayList<Map<String,Object>>();
    List<Map<String,String>> values = List.of(
      Map.of("lexical","Zulu","language","en"),
      Map.of("lexical","Alpha","language","fr"),
      Map.of("lexical","Plain","language",""),
      Map.of("iri","urn:provider:iriValue"),
      Map.of("anonymous","value"),
      Map.of("lexical","true","datatype","http://www.w3.org/2001/XMLSchema#boolean"),
      Map.of("lexical","Aardvark","language","en"),
      Map.of("iri","urn:provider:otherIRI")
    );
    List<List<String>> preferences = List.of(List.of(), List.of("en","fr"), List.of("fr","en",""));
    for (int left = 0; left < values.size(); left++)
    for (int right = 0; right < values.size(); right++)
    for (int preference = 0; preference < preferences.size(); preference++)
    for (int order = 0; order < 2; order++)
    for (int properties = 0; properties < 3; properties++) {
      var manager = OWLManager.createOWLOntologyManager();
      var factory = manager.getOWLDataFactory();
      var entity = factory.getOWLClass(IRI.create("urn:provider:entity"));
      var first = manager.createOntology(); var second = manager.createOntology();
      var propertyList = properties == 0 ? List.of(factory.getRDFSLabel()) : properties == 1 ? List.of(factory.getRDFSLabel(),factory.getRDFSComment()) : List.of(factory.getRDFSComment(),factory.getRDFSLabel());
      for (int index = 0; index < 2; index++) {
        var descriptor = values.get(index == 0 ? left : right);
        OWLAnnotationValue value;
        if (descriptor.containsKey("iri")) value = IRI.create(descriptor.get("iri"));
        else if (descriptor.containsKey("anonymous")) value = factory.getOWLAnonymousIndividual(descriptor.get("anonymous"));
        else if (descriptor.containsKey("datatype")) value = factory.getOWLLiteral(descriptor.get("lexical"),factory.getOWLDatatype(IRI.create(descriptor.get("datatype"))));
        else value = factory.getOWLLiteral(descriptor.get("lexical"),descriptor.get("language"));
        var ontology = index == 0 ? first : second;
        // Both same-property ordering and property priority are represented.
        var property = index == 0 || properties == 0 ? factory.getRDFSLabel() : factory.getRDFSComment();
        manager.addAxiom(ontology,factory.getOWLAnnotationAssertionAxiom(property,entity.getIRI(),value));
      }
      var members = order == 0 ? List.of(first,second) : List.of(second,first);
      OWLOntologySetProvider provider = () -> members.stream();
      var shortForms = new AnnotationValueShortFormProvider(propertyList,Map.of(factory.getRDFSLabel(),preferences.get(preference),factory.getRDFSComment(),preferences.get(preference)),provider);
      var row = new LinkedHashMap<String,Object>();
      row.put("id",left + "-" + right + "-" + preference + "-" + order + "-" + properties);
      row.put("values",List.of(values.get(left),values.get(right)));
      row.put("preferences",preferences.get(preference));
      row.put("reverseOntologies",order == 1);
      row.put("properties",properties);
      row.put("shortForm",shortForms.getShortForm(entity)); rows.add(row);
    }
    Files.writeString(Path.of(arguments[0]),new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("schemaVersion",1,"sourceRevision","b61ebe2da83daceebb3e7ba7afbd2582c9240c33","runtimeQualification","FRESH_LOCAL_WINDOWS_NATIVE_BUILD_NOT_LINUX_IMAGE_EQUIVALENCE","harness","util/owlapi-reference/RunRC2Providers.java","observations",rows)) + "\n");
  }
}
