import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.*;

/** Real public creation, save and reload beyond the former 32 MiB JS bound. */
public final class ObserveResourceContracts {
    public static void main(String[] arguments) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var factory = manager.getOWLDataFactory();
        var ontology = manager.createOntology(IRI.create("urn:resources:large"));
        var text = "x".repeat(32 * 1024 * 1024 + 1);
        var subject = IRI.create("urn:resources:subject");
        manager.addAxiom(ontology, factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(), subject, factory.getOWLLiteral(text)));
        for (var format : List.of(new FunctionalSyntaxDocumentFormat(), new RDFXMLDocumentFormat(), new OWLXMLDocumentFormat(), new TurtleDocumentFormat())) {
            if (arguments.length > 0 && !format.getKey().equals(arguments[0])) continue;
            var target = new StringDocumentTarget();
            System.err.println("large-literal phase: save " + format.getKey());
            manager.saveOntology(ontology, format, target);
            var document = target.toString();
            var reloader = OWLManager.createOWLOntologyManager();
            System.err.println("large-literal phase: reload " + format.getKey());
            var loaded = reloader.loadOntologyFromOntologyDocument(new StringDocumentSource(document, IRI.create("urn:resources:document"), format, null));
            var literal = loaded.annotationAssertionAxioms(subject).findFirst().orElseThrow().getValue().asLiteral().orElseThrow().getLiteral();
            System.out.println("large-literal\t" + format.getKey() + "\t" + text.length() + "\t" + (document.getBytes(StandardCharsets.UTF_8).length > 32 * 1024 * 1024) + "\t" + literal.length() + "\t" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(literal.getBytes(StandardCharsets.UTF_8))));
        }
    }
}
