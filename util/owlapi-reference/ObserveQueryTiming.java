import java.util.*;
import java.util.stream.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.search.EntitySearcher;
import org.semanticweb.owlapi.util.OWLOntologyImportsClosureSetProvider;

/** Observes construction, mutation and consumption through selected stream APIs. */
public final class ObserveQueryTiming {
    static void row(String name, Object... values) { System.out.println(name + "\t" + Arrays.toString(values)); }
    public static void main(String[] arguments) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var factory = manager.getOWLDataFactory();
        var ontology = manager.createOntology();
        var a = factory.getOWLClass(IRI.create("urn:timing:A"));
        var b = factory.getOWLClass(IRI.create("urn:timing:B"));
        var c = factory.getOWLClass(IRI.create("urn:timing:C"));
        var axiom = factory.getOWLSubClassOfAxiom(a, b);
        var first = EntitySearcher.getSuperClasses(a, ontology);
        int[] callbacks = {0};
        var multiple = EntitySearcher.getSuperClasses(a, Stream.of(ontology).peek(o -> callbacks[0]++));
        manager.addAxiom(ontology, axiom);
        row("before-consumption", callbacks[0]);
        row("empty-then-add-single", first.toList());
        row("empty-then-add-stream", multiple.toList(), callbacks[0]);
        var present = EntitySearcher.getSuperClasses(a, ontology);
        manager.addAxiom(ontology, factory.getOWLSubClassOfAxiom(a, c));
        row("present-then-add-single", present.toList());
        var removed = EntitySearcher.getSuperClasses(a, ontology);
        manager.removeAxiom(ontology, axiom);
        row("present-then-remove-single", removed.toList());
        try { removed.toList(); row("repeat-consumption", "success"); }
        catch (Throwable error) { row("repeat-consumption", error.getClass().getName()); }
        var root = manager.createOntology(IRI.create("urn:timing:root"));
        var child = manager.createOntology(IRI.create("urn:timing:child"));
        var provider = new OWLOntologyImportsClosureSetProvider(manager, root);
        var beforeImport = provider.ontologies();
        var declaration = factory.getOWLImportsDeclaration(IRI.create("urn:timing:child"));
        manager.applyChange(new AddImport(root, declaration));
        row("closure-before-import-stream", beforeImport.count());
        row("closure-fresh-after-import", provider.ontologies().count());
        var beforeRemoval = provider.ontologies();
        manager.applyChange(new RemoveImport(root, declaration));
        row("closure-before-removal-stream", beforeRemoval.count());
        row("closure-fresh-after-removal", provider.ontologies().count());
        var foreignManager = OWLManager.createOWLOntologyManager();
        var foreignProvider = new OWLOntologyImportsClosureSetProvider(foreignManager, root);
        row("closure-foreign-construction", "success");
        try { row("closure-foreign-result", foreignProvider.ontologies().count()); }
        catch (Throwable error) { row("closure-foreign-result", error.getClass().getName()); }
    }
}
