import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.io.StringWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.functional.renderer.FunctionalSyntaxObjectRenderer;
import org.semanticweb.owlapi.modularity.locality.*;

/** Exercise fixed points solely by composing public native extractor calls. */
public final class RunRC2LocalityFixedPoints {
  private static String functional(OWLObject object) {
    var writer = new StringWriter();
    var renderer = new FunctionalSyntaxObjectRenderer(null, writer);
    renderer.setAddMissingDeclarations(false);
    object.accept(renderer);
    return writer.toString();
  }
  private static List<String> render(Collection<OWLAxiom> axioms) {
    return axioms.stream().map(RunRC2LocalityFixedPoints::functional).sorted().toList();
  }
  public static void main(String[] arguments) throws Exception {
    Map<String,String> cases = new LinkedHashMap<>();
    cases.put("forwardChain", "SubClassOf(:A :B) SubClassOf(:B :C) SubClassOf(:C :D)");
    cases.put("classCycle", "SubClassOf(:A :B) SubClassOf(:B :C) SubClassOf(:C :A) SubClassOf(:D :E)");
    cases.put("diamond", "SubClassOf(:A :B) SubClassOf(:A :C) SubClassOf(:B :D) SubClassOf(:C :D) SubClassOf(:D :E)");
    cases.put("mixedPropertyCycle", "SubObjectPropertyOf(:p :q) SubObjectPropertyOf(:q :p) ObjectPropertyDomain(:p :A) ObjectPropertyRange(:q :B) SubClassOf(:A :B)");
    cases.put("globals", "SubClassOf(owl:Thing :A) ClassAssertion(:B :i) ReflexiveObjectProperty(:p) SubClassOf(:C owl:Nothing)");
    cases.put("inverseRestrictions", "SubClassOf(:A ObjectSomeValuesFrom(ObjectInverseOf(:p) :B)) SubClassOf(:B ObjectAllValuesFrom(ObjectInverseOf(:q) :C)) ObjectPropertyDomain(ObjectInverseOf(:p) :C)");
    cases.put("starShrink", "SubClassOf(:A :B) SubClassOf(:B :C) SubClassOf(ObjectIntersectionOf(:A :D) :E) EquivalentClasses(:D :E) DisjointClasses(:B :D)");
    cases.put("annotationsAndDeclarations", "Declaration(Class(:A)) Declaration(Class(:B)) SubClassOf(Annotation(rdfs:comment \"one\") :A :B) SubClassOf(Annotation(rdfs:comment \"two\") :A :B) AnnotationAssertion(rdfs:label :A \"A\")");
    var rows = new ArrayList<Map<String,Object>>();
    for (var entry : cases.entrySet()) {
      String input = "Prefix(:=<urn:fixed:>) Ontology(" + entry.getValue().replace("owl:Thing", "<http://www.w3.org/2002/07/owl#Thing>").replace("owl:Nothing", "<http://www.w3.org/2002/07/owl#Nothing>").replace("rdfs:comment", "<http://www.w3.org/2000/01/rdf-schema#comment>").replace("rdfs:label", "<http://www.w3.org/2000/01/rdf-schema#label>") + ")";
      var manager = OWLManager.createOWLOntologyManager();
      var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(input));
      var base = ontology.getAxioms();
      var entities = ontology.signature().sorted().toList();
      var seeds = new ArrayList<List<OWLEntity>>();
      seeds.add(List.of()); seeds.add(entities);
      seeds.add(List.of(manager.getOWLDataFactory().getOWLClass(IRI.create("urn:fixed:absent"))));
      entities.forEach(entity -> seeds.add(List.of(entity)));
      for (int seedIndex = 0; seedIndex < seeds.size(); seedIndex++) {
        var seed = seeds.get(seedIndex);
        var row = new LinkedHashMap<String,Object>();
        row.put("id",entry.getKey() + "-" + seedIndex); row.put("input",input);
        row.put("seed",seed.stream().map(entity -> Map.of("kind",entity.getEntityType().getName(),"iri",entity.getIRI().toString())).toList());
        Map<String,Object> modules = new LinkedHashMap<>();
        for (var mode : LocalityClass.values()) {
          try { modules.put(mode.name(),Map.of("axioms",render(new SyntacticLocalityModuleExtractor(mode,base.stream()).extract(seed.stream()).toList()))); }
          catch (RuntimeException error) { modules.put(mode.name(),Map.of("error",error.getClass().getSimpleName())); }
        }
        row.put("modules",modules);
        Map<String,Object> alternations = new LinkedHashMap<>();
        for (var first : List.of(LocalityClass.BOTTOM, LocalityClass.TOP)) {
          Set<OWLAxiom> current = new LinkedHashSet<>(base);
          var steps = new ArrayList<Map<String,Object>>();
          var mode = first; int unchanged = 0;
          for (int iteration = 0; iteration < base.size() * 2 + 4 && unchanged < 2; iteration++) {
            Set<OWLAxiom> next;
            try { next = new LinkedHashSet<>(new SyntacticLocalityModuleExtractor(mode,current.stream()).extract(seed.stream()).toList()); }
            catch (RuntimeException error) { steps.add(Map.of("mode",mode.name(),"error",error.getClass().getSimpleName())); break; }
            unchanged = current.equals(next) ? unchanged + 1 : 0;
            current = next;
            steps.add(Map.of("mode",mode.name(),"axioms",render(current)));
            mode = mode == LocalityClass.BOTTOM ? LocalityClass.TOP : LocalityClass.BOTTOM;
          }
          alternations.put(first.name(),steps);
        }
        row.put("alternations",alternations); rows.add(row);
      }
    }
    Files.writeString(Path.of(arguments[0]), new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("schemaVersion",1,"sourceRevision","b61ebe2da83daceebb3e7ba7afbd2582c9240c33","runtimeQualification","FRESH_LOCAL_WINDOWS_NATIVE_BUILD_NOT_LINUX_IMAGE_EQUIVALENCE","harness","util/owlapi-reference/RunRC2LocalityFixedPoints.java","observations",rows)) + "\n");
  }
}
