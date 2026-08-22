import java.nio.file.Files;
import java.nio.file.Path;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.krss2.parser.KRSS2OWLParser;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyManager;

/** Development-only black-box snapshot harness for the pinned KRSS2 parser. */
public final class GenerateKRSS2SyntaxSnapshot {
    private GenerateKRSS2SyntaxSnapshot() {}

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) {
            System.err.println(
                "Usage: GenerateKRSS2SyntaxSnapshot <krss2-document> <document-iri>");
            System.exit(2);
        }

        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        IRI documentIRI = IRI.create(arguments[1]);
        OWLOntology ontology = manager.createOntology();
        String document = Files.readString(Path.of(arguments[0]));

        // Invoke the public OWLParser adapter directly: generic manager sniffing
        // is unrelated to the KRSS2 grammar and could select another headerless
        // parser. The fixture uses absolute names because OWLAPI 5.5.1's
        // anonymous-ontology bare-name base is unstable and not KRSS2 syntax.
        new KRSS2OWLParser().parse(
            new StringDocumentSource(document, documentIRI),
            ontology,
            new OWLOntologyLoaderConfiguration());
        System.out.println(GenerateStructuralSnapshot.snapshot(ontology));
    }
}
