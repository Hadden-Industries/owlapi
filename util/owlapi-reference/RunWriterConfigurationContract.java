import java.nio.file.Files;
import java.nio.file.Path;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.RDFXMLDocumentFormat;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentTarget;
import org.semanticweb.owlapi.model.*;

/** Development-only public-call observations; no Java renderer source reuse. */
public final class RunWriterConfigurationContract {
    private static void observe(String name, OWLOntologyWriterConfiguration configuration) {
        System.out.println(name + "=" + configuration.isIndenting() + ","
            + configuration.getIndentSize() + "," + configuration.shouldUseBanners()
            + "," + configuration.isLabelsAsBanner());
    }

    public static void main(String[] arguments) throws Exception {
        Path output = Path.of(arguments[0]);
        Files.createDirectories(output);
        OWLOntologyWriterConfiguration defaults = new OWLOntologyWriterConfiguration();
        observe("defaults", defaults);
        observe("size-then-banners", defaults.withIndentSize(2).withBannersEnabled(false));
        observe("banners-then-size", defaults.withBannersEnabled(false).withIndentSize(2));
        observe("size-then-noop", defaults.withIndentSize(2).withIndenting(true));
        observe("size-then-indenting", defaults.withIndentSize(2).withIndenting(false));
        observe("banners-then-labels", defaults.withBannersEnabled(false).withLabelsAsBanner(true));
        for (int size : new int[] {-1, 0, 2, Integer.MAX_VALUE}) {
            try { observe("size-" + size, defaults.withIndentSize(size)); }
            catch (RuntimeException error) { System.out.println("size-" + size + "=" + error.getClass().getName()); }
        }
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLDataFactory factory = manager.getOWLDataFactory();
        OWLOntology ontology = manager.createOntology(IRI.create("urn:formatting:ontology"));
        OWLClass entity = factory.getOWLClass(IRI.create("urn:formatting:C"));
        manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(entity));
        for (String[] label : new String[][] {{"Zulu", "en"}, {"Alpha -- -", "fr"}, {"Plain", ""}}) {
            manager.addAxiom(ontology, factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(),
                entity.getIRI(), label[1].isEmpty() ? factory.getOWLLiteral(label[0]) : factory.getOWLLiteral(label[0], label[1])));
        }
        for (String mode : new String[] {"defaults", "no-banners", "labels", "no-indent"}) {
            OWLOntologyWriterConfiguration configuration = new OWLOntologyWriterConfiguration();
            if (mode.equals("no-banners")) configuration = configuration.withBannersEnabled(false);
            if (mode.equals("labels")) configuration = configuration.withLabelsAsBanner(true);
            if (mode.equals("no-indent")) configuration = configuration.withIndenting(false);
            manager.setOntologyWriterConfiguration(configuration);
            for (OWLDocumentFormat format : new OWLDocumentFormat[] {new RDFXMLDocumentFormat(), new FunctionalSyntaxDocumentFormat()}) {
                StringDocumentTarget target = new StringDocumentTarget();
                manager.saveOntology(ontology, format, target);
                Files.writeString(output.resolve(mode + (format instanceof RDFXMLDocumentFormat ? ".rdf" : ".ofn")), target.toString());
            }
        }
    }
}
