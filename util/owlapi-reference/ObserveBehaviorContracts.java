import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.parameters.OntologyCopy;
import org.semanticweb.owlapi.vocab.OWLFacet;

/** Independent public API observations for the selected profile contracts. */
public final class ObserveBehaviorContracts {
    static void row(String name, Object... values) {
        System.out.println(name + "\t" + Arrays.toString(values));
    }
    static void writer(String name, OWLOntologyWriterConfiguration c) {
        row(name, c.isIndenting(), c.getIndentSize(), c.shouldUseBanners(), c.isLabelsAsBanner(),
            c.shouldSaveIdsForAllAnonymousIndividuals(), c.shouldRemapAllAnonymousIndividualsIds(),
            c.isUseNamespaceEntities(), c.shouldOutputNamedGraphIRI());
    }
    static void loader(String name, OWLOntologyLoaderConfiguration c) {
        row(name, c.getConnectionTimeout(), c.getRetriesToAttempt(), c.isFollowRedirects(),
            c.getEntityExpansionLimit(), c.isStrict(), c.isLoadAnnotationAxioms(),
            c.getMissingImportHandlingStrategy(), c.getMissingOntologyHeaderStrategy(),
            c.getPriorityCollectionSorting(), c.getAuthorizationValue(), c.isAcceptingHTTPCompression(),
            c.shouldTrimToSize(), c.isReportStackTrace(), c.shouldRepairIllegalPunnings(),
            c.isTreatDublinCoreAsBuiltIn(), c.getBannedParsers(), c.shouldSkipModuleAnnotations(),
            c.shouldAllowDuplicatesInConstructSets());
    }
    public static void main(String[] arguments) throws Exception {
        OWLOntologyLoaderConfiguration defaults = new OWLOntologyLoaderConfiguration();
        loader("loader-defaults", defaults);
        row("loader-noop-identity", defaults == defaults.setConnectionTimeout(20000),
            defaults == defaults.setLoadAnnotationAxioms(true), defaults == defaults.setStrict(false));
        loader("loader-chain", defaults.setConnectionTimeout(123).setRetriesToAttempt(2)
            .setStrict(true).setLoadAnnotationAxioms(false).setEntityExpansionLimit("0"));
        row("loader-http-noop", defaults == defaults.setAuthorizationValue(""),
            defaults == defaults.setAcceptingHTTPCompression(true));
        var credentials = defaults.setAuthorizationValue("Bearer owned-test-token").setAcceptingHTTPCompression(false);
        row("loader-http-copy", credentials.getAuthorizationValue(), credentials.isAcceptingHTTPCompression(),
            credentials.setConnectionTimeout(3).getAuthorizationValue());
        var nullCredentials = defaults.setAuthorizationValue(null);
        row("loader-http-null", nullCredentials.getAuthorizationValue());
        try { row("loader-http-null-copy", nullCredentials.setAuthorizationValue("x").getAuthorizationValue()); }
        catch (Throwable error) { row("loader-http-null-copy", error.getClass().getName()); }
        for (String value : new String[] {"0", "-1", "1", "bad", "", "2147483648"}) {
            try { row("entity-limit-" + value, defaults.setEntityExpansionLimit(value).getEntityExpansionLimit()); }
            catch (Throwable error) { row("entity-limit-" + value, error.getClass().getName()); }
        }
        var w = new OWLOntologyWriterConfiguration();
        writer("writer-defaults", w);
        writer("writer-chain", w.withIndentSize(2).withBannersEnabled(false).withIndenting(false));
        writer("writer-noop-preserves", w.withIndentSize(2).withBannersEnabled(true));
        writer("writer-reset-fields", w.withSaveIdsForAllAnonymousIndividuals(true).withRemapAllAnonymousIndividualsIds(false)
            .withUseNamespaceEntities(true).withNamedGraphIRIEnabled(true).withLabelsAsBanner(true));
        for (String symbol : new String[] {"<", "<=", ">", ">="}) row("facet-" + symbol, OWLFacet.getFacetBySymbolicName(symbol).getIRI());
        var a = OWLManager.createOWLOntologyManager();
        var b = OWLManager.createOWLOntologyManager();
        var original = a.createOntology(IRI.create("urn:owner:original"));
        var factory = a.getOWLDataFactory();
        var axiom = factory.getOWLDeclarationAxiom(factory.getOWLClass(IRI.create("urn:owner:C")));
        try { row("foreign-add", b.addAxiom(original, axiom), original.getAxiomCount(),
            original.getOWLOntologyManager() == a, b.contains(original)); }
        catch (Throwable error) { row("foreign-add", error.getClass().getName(), original.getAxiomCount()); }
        var copy = b.copyOntology(original, OntologyCopy.DEEP);
        row("deep-copy", copy == original, original.getOWLOntologyManager() == a,
            copy.getOWLOntologyManager() == b, a.contains(original), b.contains(copy), copy.getAxiomCount());
    }
}
