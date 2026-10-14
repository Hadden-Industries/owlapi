import java.nio.file.*;
import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.util.SimpleIRIMapper;

/** Loading observations at the actual manager publication boundary. */
public final class ObserveLoadingContracts {
    static void row(String name, Object... values) { System.out.println(name + "\t" + Arrays.toString(values)); }
    static StringDocumentSource source(String text) { return new StringDocumentSource(text, IRI.create("urn:loading:document:" + UUID.randomUUID()), new FunctionalSyntaxDocumentFormat(), null); }
    public static void main(String[] arguments) throws Exception {
        var directory = Path.of(arguments[0]);
        Files.createDirectories(directory);
        Files.writeString(directory.resolve("child.ofn"), "Ontology(<urn:loading:child> Declaration(Class(<urn:loading:C>)))");
        var manager = OWLManager.createOWLOntologyManager();
        var rootId = new OWLOntologyID(IRI.create("urn:loading:root"));
        var childId = new OWLOntologyID(IRI.create("urn:loading:child"));
        manager.getIRIMappers().add(new SimpleIRIMapper(childId.getOntologyIRI().get(), IRI.create(directory.resolve("child.ofn").toFile())));
        manager.addOntologyLoaderListener(new OWLOntologyLoaderListener() {
            public void startedLoadingOntology(LoadingStartedEvent event) {
                if (event.isImported()) {
                    var root = manager.getOntology(rootId);
                    row("at-import-start", root != null, root == null ? -1 : root.getAxiomCount());
                }
            }
            public void finishedLoadingOntology(LoadingFinishedEvent event) {}
        });
        try { manager.loadOntologyFromOntologyDocument(source("Ontology(<urn:loading:root> Import(<urn:loading:child>) NOT_SYNTAX)")); }
        catch (Throwable error) { row("root-failure", error.getClass().getName(), manager.contains(rootId), manager.contains(childId)); }
        var root = manager.loadOntologyFromOntologyDocument(source("Ontology(<urn:loading:root> Import(<urn:loading:child>) Declaration(Class(<urn:loading:R>)))"));
        row("retry-after-parse-failure", root.getAxiomCount(), manager.getImportsClosure(root).size());
    }
}
