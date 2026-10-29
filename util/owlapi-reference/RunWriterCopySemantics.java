import org.semanticweb.owlapi.model.OWLOntologyWriterConfiguration;

/** Semantic observations only: no timers, warmups or benchmark measurement. */
public class RunWriterCopySemantics {
    static void observe(String step, OWLOntologyWriterConfiguration c) {
        System.out.println(step + "=" + c.isIndenting() + "," + c.getIndentSize()
            + "," + c.shouldUseBanners() + "," + c.isLabelsAsBanner()
            + "," + c.shouldSaveIdsForAllAnonymousIndividuals());
    }
    public static void main(String[] args) {
        System.out.println("origin=" + OWLOntologyWriterConfiguration.class.getProtectionDomain().getCodeSource().getLocation());
        var c = new OWLOntologyWriterConfiguration();
        observe("defaults", c);
        c = c.withIndenting(false); observe("indenting", c);
        c = c.withIndentSize(2); observe("indentSize", c);
        c = c.withBannersEnabled(false); observe("banners", c);
        c = c.withLabelsAsBanner(true); observe("labels", c);
        c = c.withSaveIdsForAllAnonymousIndividuals(true); observe("saveIds", c);
        observe("labelsThenIndent", c.withIndentSize(3));
        System.out.println("labelsNoOpIdentity=" + (c.withLabelsAsBanner(true) == c));
    }
}
