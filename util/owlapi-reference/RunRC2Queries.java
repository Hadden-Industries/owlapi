import java.util.List;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.parameters.*;
import org.semanticweb.owlapi.search.EntitySearcher;

/** Independently authored black-box observations for the accepted rc.2 query contract. */
public final class RunRC2Queries {
    public static void main(String[] args) throws Exception {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLDataFactory factory = manager.getOWLDataFactory();
        OWLOntology root = manager.createOntology(IRI.create("urn:rc2:root"));
        OWLOntology imported = manager.createOntology(IRI.create("urn:rc2:import"));
        OWLClass a = factory.getOWLClass(IRI.create("urn:rc2:A"));
        OWLClass b = factory.getOWLClass(IRI.create("urn:rc2:B"));
        OWLClass c = factory.getOWLClass(IRI.create("urn:rc2:C"));
        OWLAnnotation label = factory.getOWLAnnotation(factory.getRDFSLabel(), factory.getOWLLiteral("A", "en"));
        OWLAxiom plain = factory.getOWLSubClassOfAxiom(a, b);
        OWLAxiom annotated = plain.getAnnotatedAxiom(List.of(label));
        manager.addAxiom(root, plain);
        manager.addAxiom(root, annotated);
        manager.addAxiom(root, factory.getOWLDeclarationAxiom(a));
        manager.addAxiom(imported, factory.getOWLSubClassOfAxiom(b, c));
        manager.applyChange(new AddImport(root, factory.getOWLImportsDeclaration(IRI.create("urn:rc2:import"))));
        System.out.println("directAxioms=" + root.getAxiomCount());
        System.out.println("closureAxioms=" + root.getAxiomCount(Imports.INCLUDED));
        System.out.println("logicalAxioms=" + root.getLogicalAxiomCount());
        System.out.println("subPosition=" + root.getSubClassAxiomsForSubClass(a).size());
        System.out.println("superPosition=" + root.getSubClassAxiomsForSuperClass(a).size());
        System.out.println("annotationVariants=" + root.getAxiomsIgnoreAnnotations(plain).size());
        System.out.println("copyMergedAnnotations=" + annotated.getAnnotatedAxiom(List.of(label)).annotations().count());
        System.out.println("copyRemovedAnnotations=" + annotated.getAxiomWithoutAnnotations().equals(plain));
        System.out.println("searchRepeatedOntologies=" + EntitySearcher.getSuperClasses(a, List.of(root, root).stream()).count());
        System.out.println("searchDirectOnly=" + EntitySearcher.getSuperClasses(b, root).count());
        System.out.println("closureClasses=" + root.getClassesInSignature(Imports.INCLUDED).size());
        System.out.println("containsImportedDirect=" + root.containsAxiom(factory.getOWLSubClassOfAxiom(b, c)));
        System.out.println("containsImportedClosure=" + root.containsAxiom(factory.getOWLSubClassOfAxiom(b, c), Imports.INCLUDED, AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS));
        System.out.println("referenceEntity=" + root.getReferencingAxioms(a).size());
        System.out.println("referenceIRI=" + root.getReferencingAxioms(a.getIRI()).size());
        System.out.println("referenceLiteral=" + root.getReferencingAxioms(factory.getOWLLiteral("A", "en")).size());
        OWLObjectProperty p = factory.getOWLObjectProperty(IRI.create("urn:rc2:p"));
        manager.addAxiom(root, factory.getOWLObjectPropertyDomainAxiom(p, a));
        System.out.println("objectDomain=" + root.getObjectPropertyDomainAxioms(p).size());
        System.out.println("inverseDomain=" + root.getObjectPropertyDomainAxioms(p.getInverseProperty()).size());
        OWLAnnotation nested = factory.getOWLAnnotation(factory.getRDFSComment(), factory.getOWLLiteral("nested"));
        OWLAnnotationAssertionAxiom assertion = factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(), a.getIRI(), factory.getOWLLiteral("A", "en"), List.of(nested));
        manager.addAxiom(root, assertion);
        System.out.println("searchAnnotationsNested=" + EntitySearcher.getAnnotations(a, root).findFirst().get().annotations().count());
        System.out.println("searchAnnotationObjectsNested=" + EntitySearcher.getAnnotationObjects(a, root).findFirst().get().annotations().count());
        System.out.println("searchAnnotationsValues=" + EntitySearcher.getAnnotations(a, root).map(x -> x.getProperty().getIRI() + "|" + x.getValue()).collect(java.util.stream.Collectors.joining(";")));
        System.out.println("searchAnnotationObjectsValues=" + EntitySearcher.getAnnotationObjects(a, root).map(x -> x.getProperty().getIRI() + "|" + x.getValue()).collect(java.util.stream.Collectors.joining(";")));
        System.out.println("searchFilteredAnnotations=" + EntitySearcher.getAnnotations(a, List.of(root, root).stream(), factory.getRDFSLabel()).count());
        manager.addAxiom(root, factory.getOWLEquivalentClassesAxiom(a, b, c));
        System.out.println("searchEquivalentIncludesSelf=" + EntitySearcher.getEquivalentClasses(a, root).anyMatch(a::equals));
        System.out.println("searchEquivalentCount=" + EntitySearcher.getEquivalentClasses(a, root).count());
    }
}
