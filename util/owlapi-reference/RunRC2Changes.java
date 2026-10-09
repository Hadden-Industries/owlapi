import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.util.*;

/** Black-box utility observations; no Java implementation bodies are reused. */
public final class RunRC2Changes {
    public static void main(String[] args) throws Exception {
        OWLOntologyManager m = OWLManager.createOWLOntologyManager();
        OWLDataFactory f = m.getOWLDataFactory();
        OWLOntology o = m.createOntology(IRI.create("urn:transform:ontology"));
        IRI old = IRI.create("urn:transform:old"), next = IRI.create("urn:transform:next");
        OWLClass c = f.getOWLClass(old), d = f.getOWLClass(next);
        OWLNamedIndividual i = f.getOWLNamedIndividual(old);
        OWLAnonymousIndividual anon = f.getOWLAnonymousIndividual("original");
        OWLAxiom ax = f.getOWLClassAssertionAxiom(c, anon);
        m.addAxiom(o, ax);
        m.addAxiom(o, f.getOWLDeclarationAxiom(i));
        m.addAxiom(o, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), old, old));
        m.applyChange(new AddOntologyAnnotation(o, f.getOWLAnnotation(f.getRDFSLabel(), old)));
        m.addAxiom(o, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), IRI.create("urn:transform:unrelated"), old));
        OWLObjectDuplicator duplicator = new OWLObjectDuplicator(m);
        OWLAnonymousIndividual first = duplicator.duplicateObject(anon), second = duplicator.duplicateObject(anon);
        System.out.println("anonymousPreserved=" + first.equals(anon));
        System.out.println("anonymousSameDuplicator=" + first.equals(second));
        System.out.println("anonymousAcrossDuplicators=" + first.equals(new OWLObjectDuplicator(m).duplicateObject(anon)));
        OWLObjectDuplicator typed = new OWLObjectDuplicator(Map.of(c, next), m);
        System.out.println("typedClass=" + typed.duplicateObject(c).equals(d));
        System.out.println("typedPunnedIndividual=" + typed.duplicateObject(i).equals(i));
        System.out.println("typedStandaloneIRI=" + typed.duplicateObject(old));
        OWLObjectDuplicator conflicts = new OWLObjectDuplicator(new LinkedHashMap<OWLEntity, IRI>() {{ put(c, next); put(i, IRI.create("urn:transform:other")); }}, m);
        System.out.println("conflictStandaloneIRI=" + conflicts.duplicateObject(old));
        OWLObjectDuplicator reverse = new OWLObjectDuplicator(new LinkedHashMap<OWLEntity, IRI>() {{ put(i, IRI.create("urn:transform:other")); put(c, next); }}, m);
        System.out.println("reverseConflictStandaloneIRI=" + reverse.duplicateObject(old));
        System.out.println("referencingClassWithAnnotation=" + o.getReferencingAxioms(c).size());
        System.out.println("referencingPunnedIndividual=" + o.getReferencingAxioms(i).size());
        OWLObjectDuplicator untyped = new OWLObjectDuplicator(m, Map.of(old, next));
        System.out.println("iriPunnedIndividual=" + untyped.duplicateObject(i).getIRI().equals(next));
        OWLEntityRenamer renamer = new OWLEntityRenamer(m, Set.of(o));
        List<OWLOntologyChange> changes = renamer.changeIRI(c, next);
        System.out.println("typedRenameChanges=" + changes.size());
        for (OWLOntologyChange change : changes) System.out.println("typedRename=" + change);
        System.out.println("iriRenameChanges=" + renamer.changeIRI(old, next).size());
        System.out.println("noopRenameChanges=" + renamer.changeIRI(c, old).size());
        OWLEntityRemover remover = new OWLEntityRemover(Set.of(o));
        c.accept(remover); c.accept(remover);
        System.out.println("removerRepeated=" + remover.getChanges().size());
        for (OWLOntologyChange change : remover.getChanges()) System.out.println("remove=" + change);
        remover.reset();
        System.out.println("removerReset=" + remover.getChanges().size());
        m.applyChanges(changes);
        System.out.println("renamedClass=" + o.containsClassInSignature(next));
        System.out.println("punnedIndividualRetained=" + o.containsIndividualInSignature(old));
        OWLOntology imported = m.createOntology(IRI.create("urn:transform:import"));
        OWLImportsDeclaration declaration = f.getOWLImportsDeclaration(IRI.create("urn:transform:import"));
        m.applyChange(new AddImport(o, declaration));
        System.out.println("addedImportClosure=" + m.getImportsClosure(o).size());
        m.applyChange(new RemoveImport(o, declaration));
        System.out.println("removedImportClosure=" + m.getImportsClosure(o).size());
        IRI missing = IRI.create("urn:transform:late");
        m.applyChange(new AddImport(o, f.getOWLImportsDeclaration(missing)));
        System.out.println("missingBeforeRegistration=" + m.getImportsClosure(o).size());
        m.createOntology(missing);
        System.out.println("missingAfterRegistration=" + m.getImportsClosure(o).size());
        m.applyChange(new AddImport(o, declaration));
        m.applyChange(new SetOntologyID(imported, new OWLOntologyID(IRI.create("urn:transform:moved"))));
        try { System.out.println("afterImportedIdentityChanged=" + m.getImportsClosure(o).size()); }
        catch (OWLRuntimeException error) { System.out.println("afterImportedIdentityChangedFailure=" + error.getCause().getClass().getSimpleName()); }
    }
}
