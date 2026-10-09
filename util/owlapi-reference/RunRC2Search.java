import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonGenerator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.StringWriter;
import java.util.*;
import java.util.stream.Stream;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.functional.renderer.FunctionalSyntaxObjectRenderer;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.search.EntitySearcher;

/** Black-box probes of the selected EntitySearcher overloads and stream multiplicity. */
public final class RunRC2Search {
  private static String functional(OWLObject object) {
    StringWriter writer = new StringWriter();
    var renderer = new FunctionalSyntaxObjectRenderer(null, writer);
    renderer.setAddMissingDeclarations(false);
    object.accept(renderer);
    return writer.toString();
  }
  private static String wrapper(OWLObject value) {
    String text = functional(value), sentinel = "<urn:rc2:search:sentinel>";
    if (value instanceof OWLAxiom || value instanceof OWLAnnotation) return "Ontology(" + text + ")";
    if (value instanceof OWLEntity entity) return "Ontology(Declaration(" + entity.getEntityType().getName() + "(<" + entity.getIRI() + ">)))";
    if (value instanceof OWLClassExpression) return "Ontology(SubClassOf(" + sentinel + " " + text + "))";
    if (value instanceof OWLObjectPropertyExpression) return "Ontology(SubObjectPropertyOf(" + sentinel + " " + text + "))";
    if (value instanceof OWLDataRange) return "Ontology(DataPropertyRange(" + sentinel + " " + text + "))";
    return "Ontology(AnnotationAssertion(" + sentinel + " " + sentinel + " " + text + "))";
  }
  private static void primitives(Object object, Set<OWLPrimitive> result, Set<OWLObject> seen) {
    if (object instanceof OWLObject owl && seen.add(owl)) {
      if (owl instanceof OWLPrimitive primitive) result.add(primitive);
      owl.components().forEach(value -> primitives(value, result, seen));
    } else if (object instanceof Iterable<?> values) for (Object value : values) primitives(value, result, seen);
  }
  private static Map<String, Object> descriptor(OWLObject argument) {
    Map<String, Object> result = new LinkedHashMap<>();
    if (argument instanceof OWLEntity entity) { result.put("kind", entity.getEntityType().getName()); result.put("iri", entity.getIRI().toString()); }
    else if (argument instanceof IRI iri) { result.put("kind", "IRI"); result.put("iri", iri.toString()); }
    else if (argument instanceof OWLAnonymousIndividual) result.put("kind", "AnonymousIndividual");
    else if (argument instanceof OWLObjectInverseOf inverse) { result.put("kind", "ObjectInverseOf"); result.put("iri", inverse.getNamedProperty().getIRI().toString()); }
    else throw new IllegalArgumentException("Unselected search argument");
    return result;
  }
  public static void main(String[] args) throws Exception {
    String input = Files.readString(Path.of(args[0]));
    var manager = OWLManager.createOWLOntologyManager();
    var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(input));
    Set<OWLPrimitive> primitives = new LinkedHashSet<>();
    ontology.axioms().forEach(axiom -> primitives(axiom, primitives, new HashSet<>()));
    List<OWLObject> values = new ArrayList<>();
    for (var value : primitives) if (value instanceof OWLEntity || value instanceof IRI || value instanceof OWLAnonymousIndividual) values.add(value);
    ontology.objectPropertiesInSignature().map(OWLObjectProperty::getInverseProperty).forEach(values::add);
    values.add(manager.getOWLDataFactory().getOWLClass(IRI.create("urn:rc2:search:absent")));
    Set<String> names = Set.of("getAnnotations", "getAnnotationObjects", "getAnnotationAssertionAxioms", "getSubClasses", "getSuperClasses", "getEquivalentClasses", "getDisjointClasses", "getSubProperties", "getSuperProperties", "getDomains", "getRanges", "getInverses", "isFunctional", "isInverseFunctional", "isTransitive", "isSymmetric", "isAsymmetric", "isReflexive", "isIrreflexive");
    List<Map<String, Object>> rows = new ArrayList<>();
    Set<String> identities = new HashSet<>();
    for (var method : EntitySearcher.class.getMethods()) {
      if (!names.contains(method.getName()) || method.getParameterCount() < 2 || method.getParameterCount() > 3) continue;
      var types = method.getParameterTypes();
      boolean repeated = types[1] == Stream.class;
      if (!repeated && types[1] != OWLOntology.class) continue;
      if (method.getParameterCount() == 3 && types[2] != OWLAnnotationProperty.class) continue;
      // The accepted annotation-assertion overload takes one ontology only.
      if (repeated && method.getName().equals("getAnnotationAssertionAxioms")) continue;
      for (var value : values) {
        if (!types[0].isInstance(value)) continue;
        Map<String, Object> argument = descriptor(value);
        String identity = method.getName() + argument + repeated + method.getParameterCount();
        if (!identities.add(identity)) continue;
        Object scope = repeated ? Stream.of(ontology, ontology) : ontology;
        Object observed = method.getParameterCount() == 2 ? method.invoke(null, value, scope) : method.invoke(null, value, scope, manager.getOWLDataFactory().getRDFSLabel());
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("method", method.getName()); row.put("argument", argument); row.put("repeated", repeated); row.put("filtered", method.getParameterCount() == 3);
        if (observed instanceof Boolean flag) row.put("boolean", flag);
        else if (observed instanceof Stream<?> stream) row.put("results", stream.map(item -> wrapper((OWLObject) item)).toList());
        else throw new IllegalStateException("Unexpected result type");
        rows.add(row);
      }
    }
    var fixture = Map.of("schemaVersion", 1, "sourceRevision", "b61ebe2da83daceebb3e7ba7afbd2582c9240c33", "harness", "util/owlapi-reference/RunRC2Search.java", "input", input, "observations", rows);
    ObjectMapper mapper = new ObjectMapper(); mapper.getFactory().configure(JsonGenerator.Feature.ESCAPE_NON_ASCII, true);
    Files.writeString(Path.of(args[1]), mapper.writerWithDefaultPrettyPrinter().writeValueAsString(fixture) + "\n");
  }
}
