import java.nio.file.Files;
import java.nio.file.Path;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.krss1.parser.KRSSOWLParser;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyManager;

/** Development-only black-box snapshot harness for the pinned original-KRSS parser. */
public final class GenerateKRSS1SyntaxSnapshot {
    private GenerateKRSS1SyntaxSnapshot() {}

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) {
            System.err.println(
                "Usage: GenerateKRSS1SyntaxSnapshot <krss-document> <ontology-iri>");
            System.exit(2);
        }

        IRI ontologyIRI = IRI.create(arguments[1]);
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLOntology ontology = manager.createOntology(ontologyIRI);
        String document = Files.readString(Path.of(arguments[0]));

        // Direct invocation isolates the public KRSS1 parser contract from the
        // generic manager's format selection. A named ontology also makes the
        // parser's documented bare-name base deterministic for this fixture.
        new KRSSOWLParser().parse(
            new StringDocumentSource(document, ontologyIRI),
            ontology,
            new OWLOntologyLoaderConfiguration());
        System.out.println(GenerateStructuralSnapshot.snapshot(ontology));
    }
}
