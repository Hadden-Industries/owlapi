import java.nio.file.Files;
import java.nio.file.Path;
import org.semanticweb.owlapi.dlsyntax.parser.DLSyntaxParser;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.apibinding.OWLManager;

/** Development-only black-box snapshot harness for the pinned DL Syntax parser. */
public final class GenerateDLSyntaxSnapshot {
    private GenerateDLSyntaxSnapshot() {}

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2) {
            System.err.println(
                "Usage: GenerateDLSyntaxSnapshot <dl-ontology-document> <default-namespace>");
            System.exit(2);
        }

        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLOntology ontology = manager.createOntology();
        String document = Files.readString(Path.of(arguments[0]));
        // OWLAPI 5.5.1's DL document entry point rejects an otherwise inert
        // terminal line ending. Normalize only that transport-level suffix so
        // the snapshot still represents the fixture's complete axiom content.
        while (document.endsWith("\n") || document.endsWith("\r")) {
            document = document.substring(0, document.length() - 1);
        }
        DLSyntaxParser parser = new DLSyntaxParser(document);
        parser.setOWLDataFactory(manager.getOWLDataFactory());
        parser.setDefaultNamespace(arguments[1]);
        manager.addAxioms(ontology, parser.parseAxioms());
        System.out.println(GenerateStructuralSnapshot.snapshot(ontology));
    }
}
