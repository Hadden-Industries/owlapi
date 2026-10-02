import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.TurtleDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.util.VersionInfo;

/** Project-authored, offline characterization of the selected Java contract. */
public final class RunRdfConsumerContract {
    private static final String PREFIXES = """
        @prefix : <urn:consumer:> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
        """;

    public static void main(String[] args) throws Exception {
        String version = VersionInfo.getVersionInfo().getVersion();
        if (!version.equals("5.5.1")) throw new IllegalStateException("Unexpected oracle " + version);
        Map<String, String> cases = new LinkedHashMap<>();
        cases.put("inverse-functional", ":root a owl:Ontology . :C a owl:Class . :q a owl:ObjectProperty . :p a owl:FunctionalProperty; owl:inverseOf :q; rdfs:domain :C; rdfs:range :C .");
        cases.put("multiple-headers", ":root a owl:Ontology; rdfs:label \"selected\"; owl:imports :a . :secondary a owl:Ontology; rdfs:label \"secondary\"; owl:imports :b .");
        cases.put("dual-role", ":root a owl:Ontology . :p a owl:ObjectProperty, owl:DatatypeProperty; rdfs:domain :C; rdfs:range :C . :C a owl:Class .");
        cases.put("time-and-custom", ":p a owl:DatatypeProperty; rdfs:range xsd:time . xsd:time a rdfs:Datatype . :i :p \"12:00:00\"^^xsd:time, \"verbatim\"^^:Custom .");
        cases.put("unparsed", "_:local :unknown \"0001\"^^xsd:integer .");
        cases.put("literal-import", ":root a owl:Ontology . :secondary a owl:Ontology; owl:imports \"not an IRI\" .");
        Map<String, Object> observations = new LinkedHashMap<>();
        for (var item : cases.entrySet()) {
            var manager = OWLManager.createOWLOntologyManager();
            // Resolve imports from manager-owned ontologies; this probe never fetches.
            manager.createOntology(IRI.create("urn:consumer:a"));
            manager.createOntology(IRI.create("urn:consumer:b"));
            manager.getIRIMappers().add(iri -> { throw new IllegalStateException("Unexpected import " + iri); });
            OWLOntology ontology = manager.loadOntologyFromOntologyDocument(
                new StringDocumentSource(PREFIXES + item.getValue(), IRI.create("urn:consumer:root"), new TurtleDocumentFormat(), null),
                new OWLOntologyLoaderConfiguration().setStrict(false));
            var metadata = manager.getOntologyFormat(ontology).getOntologyLoaderMetaData().orElseThrow();
            Map<String, Object> observation = new LinkedHashMap<>();
            observation.put("axioms", ontology.axioms().map(Object::toString).sorted().toList());
            observation.put("annotations", ontology.annotations().map(Object::toString).sorted().toList());
            observation.put("imports", ontology.importsDeclarations().map(d -> d.getIRI().toString()).sorted().toList());
            observation.put("headerState", metadata.getHeaderState().name());
            observation.put("tripleCount", metadata.getTripleCount());
            observation.put("unparsed", metadata.getUnparsedTriples().map(Object::toString).sorted().toList());
            observations.put(item.getKey(), observation);
        }
        if (args.length == 2) {
            var manager = OWLManager.createOWLOntologyManager();
            manager.getIRIMappers().add(iri -> { throw new IllegalStateException("Unexpected import " + iri); });
            manager.loadOntologyFromOntologyDocument(new StringDocumentSource(
                Files.readString(Path.of(args[1])),
                IRI.create("https://haddenindustries.com/ontology/external/BenchmarkOntologyModule.ttl"),
                new TurtleDocumentFormat(), null));
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(
                Files.readString(Path.of(args[0])), IRI.create("http://ontovibe.visualdataweb.org"),
                new TurtleDocumentFormat(), null));
            var metadata = manager.getOntologyFormat(ontology).getOntologyLoaderMetaData().orElseThrow();
            observations.put("matched-ontovibe", Map.of(
                "closureSize", manager.getImportsClosure(ontology).size(),
                "targetedAxioms", ontology.axioms().map(Object::toString).filter(s -> s.contains("functionalPropertyAsInverse")).sorted().toList(),
                "unparsed", metadata.getUnparsedTriples().map(Object::toString).sorted().toList()));
        } else if (args.length != 0) throw new IllegalArgumentException("Expected zero args or matched root and module paths");
        System.out.println(new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(Map.of(
            "version", version,
            "managerOrigin", OWLManager.class.getProtectionDomain().getCodeSource().getLocation().toString(),
            "observations", observations)));
    }
}
