import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.util.OWLOntologyMerger;
import java.util.stream.Stream;

/** Black-box observations of selected manager mutation boundaries. */
public final class ObserveMutationContracts {
    static void row(String name, Object... values) {
        System.out.println(name + "\t" + Arrays.toString(values));
    }
    static void mergerProbes() throws Exception {
        var sourceManager = OWLManager.createOWLOntologyManager();
        var source = sourceManager.createOntology(IRI.create("urn:copy:source"));
        var axiom = sourceManager.getOWLDataFactory().getOWLDeclarationAxiom(sourceManager.getOWLDataFactory().getOWLClass(IRI.create("urn:copy:C")));
        sourceManager.addAxiom(source, axiom);
        var destination = OWLManager.createOWLOntologyManager();
        var targetIRI = IRI.create("urn:copy:target");
        boolean[] publishedDuringProvider = {false};
        OWLOntologySetProvider provider = () -> { publishedDuringProvider[0] = destination.contains(targetIRI); return Stream.of(source); };
        var copied = new OWLOntologyMerger(provider).createMergedOntology(destination, targetIRI);
        row("merger-copy", publishedDuringProvider[0], copied != source, copied.getAxiomCount(), source.getAxiomCount(), copied.getOWLOntologyManager() == destination, source.getOWLOntologyManager() == sourceManager);
        int[] calls = {0};
        try { new OWLOntologyMerger(() -> { calls[0]++; return Stream.of(source); }).createMergedOntology(destination, targetIRI); }
        catch (Throwable error) { row("merger-collision", error.getClass().getSimpleName(), calls[0], destination.getOntology(targetIRI) == copied); }
        var failedIRI = IRI.create("urn:copy:failed");
        try { new OWLOntologyMerger(() -> Stream.concat(Stream.of(source), Stream.generate(() -> { throw new IllegalStateException("owned provider failure"); }))).createMergedOntology(destination, failedIRI); }
        catch (Throwable error) { row("merger-provider-failure", error.getClass().getSimpleName(), destination.getOntology(failedIRI).getAxiomCount(), source.getAxiomCount(), destination.getOntology(failedIRI).getOWLOntologyManager() == destination); }
    }
    public static void main(String[] arguments) throws Exception {
        mergerProbes();
        var owner = OWLManager.createOWLOntologyManager();
        var other = OWLManager.createOWLOntologyManager();
        var f = owner.getOWLDataFactory();
        var originalId = new OWLOntologyID(IRI.create("urn:mutation:original"));
        var nextId = new OWLOntologyID(IRI.create("urn:mutation:renamed"));
        var o = owner.createOntology(originalId);
        var ax = f.getOWLDeclarationAxiom(f.getOWLClass(IRI.create("urn:mutation:C")));
        row("empty", owner.applyChanges(List.of()));
        row("add", owner.addAxiom(o, ax), owner.addAxiom(o, ax));
        row("remove", owner.removeAxiom(o, ax), owner.removeAxiom(o, ax));
        row("net-zero", owner.applyChanges(List.of(new AddAxiom(o, ax), new RemoveAxiom(o, ax))), o.getAxiomCount());
        var annotation = f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("label"));
        row("annotation", other.applyChange(new AddOntologyAnnotation(o, annotation)), o.annotations().count());
        try {
            row("foreign-rename-result", other.applyChange(new SetOntologyID(o, nextId)));
        } catch (Throwable error) { row("foreign-rename-error", error.getClass().getName()); }
        row("foreign-rename-state", o.getOntologyID().equals(nextId), owner.getOntology(originalId) == o,
            owner.getOntology(nextId) == o, other.getOntology(originalId) == o, other.getOntology(nextId) == o,
            o.getOWLOntologyManager() == owner);
        var managed = owner.createOntology(IRI.create("urn:mutation:batch"));
        var collision = owner.createOntology(IRI.create("urn:mutation:collision"));
        try { owner.applyChanges(List.of(new AddAxiom(managed, ax), new SetOntologyID(managed, collision.getOntologyID()))); }
        catch (Throwable error) { row("collision", error.getClass().getName(), managed.getAxiomCount(),
            owner.getOntology(managed.getOntologyID()) == managed, owner.getOntology(collision.getOntologyID()) == collision); }
        var configuration = new OWLOntologyLoaderConfiguration().setLoadAnnotationAxioms(false);
        var filtered = owner.loadOntologyFromOntologyDocument(new StringDocumentSource("Ontology(<urn:mutation:filtered>)"), configuration);
        var annotationAxiom = f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), IRI.create("urn:mutation:C"), f.getOWLLiteral("ignored"));
        row("filtered", owner.addAxiom(filtered, annotationAxiom), filtered.getAxiomCount());
        row("filtered-batch", owner.applyChanges(List.of(new AddAxiom(filtered, ax), new RemoveAxiom(filtered, ax),
            new AddAxiom(filtered, annotationAxiom))), filtered.getAxiomCount(), filtered.containsAxiom(ax));
        row("filtered-foreign", other.addAxiom(filtered, annotationAxiom), filtered.getAxiomCount());
        var renamed = new OWLOntologyID(IRI.create("urn:mutation:filtered-renamed"));
        owner.applyChange(new SetOntologyID(filtered, renamed));
        row("filtered-renamed", owner.addAxiom(filtered, annotationAxiom), filtered.getAxiomCount());
        owner.removeOntology(filtered);
        var reloaded = owner.createOntology(IRI.create("urn:mutation:filtered"));
        row("configuration-retained", owner.addAxiom(reloaded, annotationAxiom), reloaded.getAxiomCount());
        var equalA = owner.createOntology(IRI.create("urn:mutation:equal-a"));
        var equalB = owner.createOntology(IRI.create("urn:mutation:equal-b"));
        var equalAId = equalA.getOntologyID();
        var equalBId = equalB.getOntologyID();
        row("equal-axiom-collision", owner.applyChange(new SetOntologyID(equalA, equalBId)),
            owner.contains(equalAId), owner.getOntology(equalBId) == equalA,
            equalB.getOWLOntologyManager() == owner);
        try { row("replaced-old-id-lookup", owner.getOntology(equalAId) == null); }
        catch (Throwable error) { row("replaced-old-id-lookup", error.getClass().getName(), error.getCause().getClass().getName()); }
        var sequence = owner.createOntology(IRI.create("urn:mutation:sequence-a"));
        var secondId = new OWLOntologyID(IRI.create("urn:mutation:sequence-b"));
        var thirdId = new OWLOntologyID(IRI.create("urn:mutation:sequence-c"));
        row("captured-original-id", owner.applyChanges(List.of(new SetOntologyID(sequence, secondId), new SetOntologyID(sequence, thirdId))),
            sequence.getOntologyID().equals(thirdId), owner.getOntology(secondId) == sequence, owner.getOntology(thirdId) == sequence);
        var annotationManager = OWLManager.createOWLOntologyManager();
        var annotationOntology = annotationManager.loadOntologyFromOntologyDocument(new StringDocumentSource("Ontology(<urn:mutation:configuration>)"), configuration);
        annotationManager.applyChange(new SetOntologyID(annotationOntology, new OWLOntologyID(IRI.create("urn:mutation:configuration-renamed"))));
        row("renamed-configuration-lookup", annotationManager.addAxiom(annotationOntology, annotationAxiom), annotationOntology.getAxiomCount());
    }
}
