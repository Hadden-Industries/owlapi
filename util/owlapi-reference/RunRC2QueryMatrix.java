import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonGenerator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.StringWriter;
import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.functional.renderer.FunctionalSyntaxObjectRenderer;
import org.semanticweb.owlapi.model.*;

/** Differential probes invoke only the explicitly selected public index methods. */
public final class RunRC2QueryMatrix {
  private static String functional(OWLObject object) {
    StringWriter writer = new StringWriter();
    var renderer = new FunctionalSyntaxObjectRenderer(null,writer);
    renderer.setAddMissingDeclarations(false); object.accept(renderer); return writer.toString();
  }
  private static void primitives(Object object, Set<OWLPrimitive> result, Set<OWLObject> seen) {
    if (object instanceof OWLObject owl && seen.add(owl)) {
      if (owl instanceof OWLPrimitive primitive) result.add(primitive);
      owl.components().forEach(value -> primitives(value,result,seen));
    } else if (object instanceof Iterable<?> values) {
      for (Object value : values) primitives(value,result,seen);
    }
  }
  public static void main(String[] arguments) throws Exception {
    String input = Files.readString(Path.of(arguments[0]));
    var manager = OWLManager.createOWLOntologyManager();
    var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(input));
    Set<OWLPrimitive> primitives = new LinkedHashSet<>();
    primitives(ontology,primitives,new HashSet<>());
    ontology.axioms().forEach(axiom -> primitives(axiom,primitives,new HashSet<>()));
    ontology.signature().forEach(primitives::add);
    List<OWLObject> values = new ArrayList<>(primitives);
    ontology.objectPropertiesInSignature().map(OWLObjectProperty::getInverseProperty).forEach(values::add);
    List<String> methods = List.of("getDeclarationAxioms","getAnnotationAssertionAxioms","getSubClassAxiomsForSubClass","getSubClassAxiomsForSuperClass","getEquivalentClassesAxioms","getDisjointClassesAxioms","getObjectSubPropertyAxiomsForSubProperty","getObjectSubPropertyAxiomsForSuperProperty","getObjectPropertyDomainAxioms","getObjectPropertyRangeAxioms","getInverseObjectPropertyAxioms","getDataSubPropertyAxiomsForSubProperty","getDataSubPropertyAxiomsForSuperProperty","getDataPropertyDomainAxioms","getDataPropertyRangeAxioms","getSubAnnotationPropertyOfAxioms","getAnnotationPropertyDomainAxioms","getAnnotationPropertyRangeAxioms","getFunctionalObjectPropertyAxioms","getInverseFunctionalObjectPropertyAxioms","getSymmetricObjectPropertyAxioms","getAsymmetricObjectPropertyAxioms","getReflexiveObjectPropertyAxioms","getIrreflexiveObjectPropertyAxioms","getTransitiveObjectPropertyAxioms","getFunctionalDataPropertyAxioms","getClassAssertionAxioms","getDataPropertyAssertionAxioms","getObjectPropertyAssertionAxioms","getNegativeDataPropertyAssertionAxioms","getNegativeObjectPropertyAssertionAxioms","getSameIndividualAxioms","getDifferentIndividualAxioms","getReferencingAxioms");
    List<Map<String,Object>> rows = new ArrayList<>();
    for (String name : methods) for (var argument : values) {
      var method = Arrays.stream(OWLOntology.class.getMethods()).filter(candidate -> candidate.getName().equals(name) && candidate.getParameterCount()==1 && candidate.getParameterTypes()[0].isInstance(argument)).findFirst();
      if (method.isEmpty()) continue;
      @SuppressWarnings("unchecked") Set<OWLAxiom> result = (Set<OWLAxiom>) method.get().invoke(ontology,argument);
      Map<String,Object> descriptor = new LinkedHashMap<>();
      if (argument instanceof OWLEntity entity) { descriptor.put("kind",entity.getEntityType().getName()); descriptor.put("iri",entity.getIRI().toString()); }
      else if (argument instanceof IRI iri) { descriptor.put("kind","IRI"); descriptor.put("iri",iri.toString()); }
      else if (argument instanceof OWLAnonymousIndividual) descriptor.put("kind","AnonymousIndividual");
      else if (argument instanceof OWLLiteral literal) { descriptor.put("kind","Literal"); descriptor.put("lexicalForm",literal.getLiteral()); descriptor.put("language",literal.getLang()); descriptor.put("datatype",literal.getDatatype().getIRI().toString()); }
      else if (argument instanceof OWLObjectInverseOf inverse) { descriptor.put("kind","ObjectInverseOf"); descriptor.put("iri",inverse.getNamedProperty().getIRI().toString()); }
      else throw new IllegalStateException("Unselected argument");
      rows.add(Map.of("method",name,"argument",descriptor,"count",result.size(),"resultInput","Ontology(" + String.join(" ",result.stream().map(RunRC2QueryMatrix::functional).toList()) + ")"));
    }
    var fixture = Map.of("schemaVersion",1,"sourceRevision","b61ebe2da83daceebb3e7ba7afbd2582c9240c33","runtimeQualification","EXISTING_RUNTIME_OBSERVATION_REQUIRES_FRESH_BUILD_BINDING","harness","util/owlapi-reference/RunRC2QueryMatrix.java","input",input,"observations",rows);
    ObjectMapper mapper = new ObjectMapper(); mapper.getFactory().configure(JsonGenerator.Feature.ESCAPE_NON_ASCII,true);
    Files.writeString(Path.of(arguments[1]),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(fixture)+"\n");
  }
}
