import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonGenerator;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Predicate;
import java.io.StringWriter;
import org.semanticweb.owlapi.functional.renderer.FunctionalSyntaxObjectRenderer;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.modularity.locality.*;

/** Public black-box locality observations; no native implementation is copied. */
public final class RunRC2Locality {
  private static String functional(OWLObject object) {
    StringWriter writer = new StringWriter();
    var renderer = new FunctionalSyntaxObjectRenderer(null, writer);
    renderer.setAddMissingDeclarations(false);
    object.accept(renderer);
    return writer.toString();
  }
  public static void main(String[] arguments) throws Exception {
    var manager = OWLManager.createOWLOntologyManager();
    var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(Files.readString(Path.of(arguments[0]))));
    List<OWLAxiom> axioms = ontology.axioms().sorted(Comparator.comparing(Object::toString)).toList();
    Set<OWLAxiom> probeSet = new LinkedHashSet<>(axioms);
    if (arguments.length > 2) {
      var profiles = new ObjectMapper().readTree(Files.readString(Path.of(arguments[2])));
      for (var row : profiles.get("observations")) {
        var probeManager = OWLManager.createOWLOntologyManager();
        var probe = probeManager.loadOntologyFromOntologyDocument(new StringDocumentSource(row.get("input").asText()));
        probe.axioms().forEach(probeSet::add);
      }
    }
    List<OWLAxiom> probeAxioms = probeSet.stream().sorted(Comparator.comparing(Object::toString)).toList();
    List<Map<String,Object>> rows = new ArrayList<>();
    for (int index = 0; index < probeAxioms.size(); index++) {
      OWLAxiom axiom = probeAxioms.get(index);
      List<OWLEntity> entities = axiom.signature().sorted().toList();
      List<List<OWLEntity>> seeds = new ArrayList<>();
      seeds.add(List.of()); seeds.add(entities);
      entities.forEach(entity -> seeds.add(List.of(entity)));
      for (int seedIndex = 0; seedIndex < seeds.size(); seedIndex++) {
        var seed = seeds.get(seedIndex);
        Map<String,Object> row = new LinkedHashMap<>();
        row.put("id", index + "-" + seedIndex);
        row.put("axiomType",axiom.getAxiomType().getName());
        row.put("input","Ontology(" + functional(axiom) + ")");
        row.put("seed",seed.stream().map(entity -> Map.of("kind",entity.getEntityType().getName(),"iri",entity.getIRI().toString())).toList());
        Map<String,Boolean> modes = new LinkedHashMap<>();
        Map<String,Object> extracted = new LinkedHashMap<>();
        Map<String,Object> evaluations = new LinkedHashMap<>();
        for (var mode : LocalityClass.values()) {
          var extractor = new SyntacticLocalityModuleExtractor(mode, java.util.stream.Stream.of(axiom));
          var module = extractor.extract(seed.stream()).toList();
          modes.put(mode.name(), !module.isEmpty());
          extracted.put(mode.name(),module.stream().map(RunRC2Locality::functional).toList());
          if (!mode.name().equals("STAR")) evaluations.put(mode.name(),SyntacticLocalityEvaluator.valueOf(mode.name()).isLocal(axiom,seed));
        }
        row.put("included",modes); row.put("extracted",extracted); row.put("local",evaluations); rows.add(row);
      }
    }
    List<Map<String,Object>> modules = new ArrayList<>();
    for (var mode : LocalityClass.values()) {
      for (var seed : List.of(List.<OWLEntity>of(), ontology.signature().sorted().toList())) {
        var extractor = new SyntacticLocalityModuleExtractor(mode, axioms.stream());
        modules.add(Map.of("mode",mode.name(),"seed",seed.stream().map(entity -> Map.of("kind",entity.getEntityType().getName(),"iri",entity.getIRI().toString())).toList(),"axioms",extractor.extract(seed.stream()).map(RunRC2Locality::functional).sorted().toList(),"base",extractor.axiomBase().map(RunRC2Locality::functional).sorted().toList()));
      }
    }
    String chainInput = "Ontology(SubClassOf(<urn:module:A> <urn:module:B>) SubClassOf(<urn:module:B> <urn:module:C>) SubClassOf(<urn:module:C> <urn:module:D>))";
    var chain = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(chainInput));
    var seed = manager.getOWLDataFactory().getOWLClass(IRI.create("urn:module:A"));
    Map<String,Object> chainCases = new LinkedHashMap<>();
    chainCases.put("input",chainInput); chainCases.put("seed",seed.getIRI().toString());
    for (var mode : LocalityClass.values()) {
      var extractor = new SyntacticLocalityModuleExtractor(mode, chain.axioms());
      Predicate<OWLAxiom> filter = axiom -> !axiom.signature().anyMatch(entity -> entity.getIRI().toString().equals("urn:module:C") && axiom.signature().anyMatch(other -> other.getIRI().toString().equals("urn:module:B")));
      chainCases.put(mode.name(),Map.of("all",extractor.extract(java.util.stream.Stream.of(seed)).map(Object::toString).sorted().toList(),"filtered",extractor.extract(java.util.stream.Stream.of(seed),Optional.of(filter)).map(Object::toString).sorted().toList()));
    }
    var fixture = Map.of("schemaVersion",1,"sourceRevision","b61ebe2da83daceebb3e7ba7afbd2582c9240c33","runtimeQualification","EXISTING_RUNTIME_OBSERVATION_REQUIRES_FRESH_BUILD_BINDING","harness","util/owlapi-reference/RunRC2Locality.java","input",Files.readString(Path.of(arguments[0])),"singleAxiomCases",rows,"modules",modules,"chain",chainCases);
    ObjectMapper mapper = new ObjectMapper(); mapper.getFactory().configure(JsonGenerator.Feature.ESCAPE_NON_ASCII,true);
    Files.writeString(Path.of(arguments[1]),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(fixture) + "\n");
  }
}
