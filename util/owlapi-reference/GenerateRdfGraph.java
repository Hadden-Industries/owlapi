import java.io.File;
import java.io.OutputStream;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.NTriplesDocumentFormat;
import org.semanticweb.owlapi.io.FileDocumentSource;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.MissingImportHandlingStrategy;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyManager;

/**
 * Emits the public Java OWLAPI OWL-to-RDF result as N-Triples test evidence.
 *
 * <p>The textual serialization is not compared. JavaScript reparses it to an
 * RDF/JS dataset and compares graph isomorphism, so statement order and blank
 * node labels remain non-contractual.</p>
 */
public final class GenerateRdfGraph {
    private GenerateRdfGraph() {}

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            throw new IllegalArgumentException(
                "Usage: GenerateRdfGraph <ontology-file> [ignored-import-iri ...]");
        }

        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLOntologyLoaderConfiguration configuration =
            new OWLOntologyLoaderConfiguration()
                .setMissingImportHandlingStrategy(MissingImportHandlingStrategy.SILENT);
        for (int index = 1; index < args.length; index += 1) {
            configuration = configuration.addIgnoredImport(IRI.create(args[index]));
        }
        OWLOntology ontology = manager.loadOntologyFromOntologyDocument(
            new FileDocumentSource(new File(args[0])), configuration);
        OutputStream output = System.out;
        NTriplesDocumentFormat format = new NTriplesDocumentFormat();
        // The W3C transformation maps Declaration axioms, not every entity merely
        // present in the signature. Disable OWLAPI's serializer convenience types
        // so the oracle comparison stays at the semantic translator boundary.
        format.setAddMissingTypes(false);
        manager.saveOntology(ontology, format, output);
        output.flush();
    }
}
