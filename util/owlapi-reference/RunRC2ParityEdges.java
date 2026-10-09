import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.model.parameters.Imports;
import org.semanticweb.owlapi.search.EntitySearcher;
import org.semanticweb.owlapi.util.*;
import org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl;

/** Public API probes for independent review regressions; no implementation code. */
public final class RunRC2ParityEdges {
  private static String payload(OWLAxiom ax) {
    if (ax instanceof OWLDeclarationAxiom d) return "Declaration|"+d.getEntity().getIRI();
    if (ax instanceof OWLSubClassOfAxiom s) return "SubClassOf|"+s.getSubClass().asOWLClass().getIRI()+"|"+s.getSuperClass().asOWLClass().getIRI();
    throw new IllegalArgumentException("Probe payload outside selected named-class fixture");
  }
  private static List<String> changes(List<? extends OWLOntologyChange> values) {
    return values.stream().map(c -> c.getClass().getSimpleName()+"|"+(c instanceof OWLAxiomChange a ? payload(a.getAxiom()) : c instanceof AddOntologyAnnotation a ? a.getAnnotation().getValue().toString() : ((RemoveOntologyAnnotation)c).getAnnotation().getValue().toString())).toList();
  }
  public static void main(String[] args) throws Exception {
    var m = OWLManager.createOWLOntologyManager();
    var f = m.getOWLDataFactory();
    var root = m.createOntology(IRI.create("urn:edge:root"));
    var child = m.createOntology(IRI.create("urn:edge:child"));
    var a = f.getOWLClass(IRI.create("urn:edge:A"));
    var b = f.getOWLClass(IRI.create("urn:edge:B"));
    var shared = f.getOWLSubClassOfAxiom(a, b);
    m.addAxiom(root, shared); m.addAxiom(child, shared);
    m.applyChange(new AddImport(root, f.getOWLImportsDeclaration(IRI.create("urn:edge:child"))));
    Map<String,Object> out = new LinkedHashMap<>();
    out.put("javaCommit", "b61ebe2da83daceebb3e7ba7afbd2582c9240c33");
    out.put("scopeCounts", List.of(root.getAxiomCount(Imports.INCLUDED), root.getAxiomCount(AxiomType.SUBCLASS_OF, Imports.INCLUDED), root.getLogicalAxiomCount(Imports.INCLUDED), root.getAxioms(Imports.INCLUDED).size()));
    var label = f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("x"));
    m.addAxiom(root, f.getOWLAnnotationAssertionAxiom(a.getIRI(), label));
    m.addAxiom(root, f.getOWLAnnotationAssertionAxiom(a.getIRI(), label, List.of(label)));
    out.put("annotationCounts", List.of(EntitySearcher.getAnnotations(a, root).count(), EntitySearcher.getAnnotationObjects(a, root).count(), EntitySearcher.getAnnotations(a, List.of(root,root).stream(), f.getRDFSLabel()).count()));
    m.addAxiom(child, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), b.getIRI(), f.getOWLLiteral("import label")));
    OWLOntologySetProvider provider = () -> java.util.stream.Stream.of(root);
    out.put("importLabel", new AnnotationValueShortFormProvider(List.of(f.getRDFSLabel()), Map.of(), provider).getShortForm(b));
    var p = f.getOWLObjectProperty(IRI.create("urn:edge:p"));
    m.addAxiom(root, f.getOWLInverseObjectPropertiesAxiom(p,p));
    out.put("selfInverse", EntitySearcher.getInverses(p, root).map(x -> x.asOWLObjectProperty().getIRI().toString()).toList());
    var target = IRI.create("urn:edge:literalIRI");
    var literal = f.getOWLLiteral(target.toString(), f.getOWLDatatype(IRI.create("http://www.w3.org/2001/XMLSchema#anyURI")));
    m.addAxiom(root, f.getOWLDataPropertyAssertionAxiom(f.getOWLDataProperty(IRI.create("urn:edge:d")), f.getOWLNamedIndividual(IRI.create("urn:edge:i")), literal));
    m.addAxiom(root, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), b.getIRI(), literal));
    out.put("anyURIReferences", root.getReferencingAxioms(target).size());
    var transform = m.createOntology();
    m.addAxiom(transform, f.getOWLDeclarationAxiom(a));
    m.addAxiom(transform, f.getOWLSubClassOfAxiom(a,b));
    m.applyChange(new AddOntologyAnnotation(transform, f.getOWLAnnotation(f.getRDFSLabel(), a.getIRI())));
    var renamer = new OWLEntityRenamer(m, List.of(transform,transform));
    out.put("renameEntity", renamer.changeIRI(a, IRI.create("urn:edge:next")).stream().map(x -> x.getClass().getSimpleName()).toList());
    var map = new LinkedHashMap<OWLEntity,IRI>(); map.put(a, IRI.create("urn:edge:next")); map.put(b, IRI.create("urn:edge:nextB"));
    out.put("renameMap", renamer.changeIRI(map).stream().map(x -> x.getClass().getSimpleName()).toList());
    out.put("renameIRI", renamer.changeIRI(a.getIRI(), IRI.create("urn:edge:next")).stream().map(x -> x.getClass().getSimpleName()).toList());
    var remover = new OWLEntityRemover(List.of(transform,transform)); remover.visit(a);
    out.put("remove", remover.getChanges().stream().map(x -> x.getClass().getSimpleName()).toList());
    out.put("renameEntityPayloads", changes(renamer.changeIRI(a, IRI.create("urn:edge:next"))));
    out.put("renameMapPayloads", changes(renamer.changeIRI(map)));
    out.put("renameIRIPayloads", changes(renamer.changeIRI(a.getIRI(), IRI.create("urn:edge:next"))));
    out.put("removePayloads", changes(remover.getChanges()));
    List<Map<String,Object>> matrix = new ArrayList<>();
    for (String mode : List.of("self", "chain", "collision")) {
      var owned = m.createOntology(); var unselected = m.createOntology(IRI.create("urn:edge:unselected:"+mode));
      m.addAxiom(owned, f.getOWLDeclarationAxiom(a)); m.addAxiom(owned, f.getOWLDeclarationAxiom(b)); m.addAxiom(owned, shared);
      m.addAxiom(unselected, shared);
      m.applyChange(new AddImport(owned, f.getOWLImportsDeclaration(unselected.getOntologyID().getOntologyIRI().get())));
      var replacements = new LinkedHashMap<OWLEntity,IRI>();
      replacements.put(a, mode.equals("self") ? a.getIRI() : b.getIRI());
      if (mode.equals("chain")) replacements.put(b, IRI.create("urn:edge:nextB"));
      var proposed = new OWLEntityRenamer(m,List.of(owned)).changeIRI(replacements);
      var row = new LinkedHashMap<String,Object>(); row.put("mode",mode); row.put("changes",changes(proposed));
      row.put("before", owned.axioms().map(RunRC2ParityEdges::payload).sorted().toList());
      m.applyChanges(proposed);
      row.put("after", owned.axioms().map(RunRC2ParityEdges::payload).sorted().toList());
      row.put("unselected", unselected.axioms().map(RunRC2ParityEdges::payload).sorted().toList());
      matrix.add(row);
    }
    out.put("renameMatrix",matrix);
    var renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl();
    Map<String,Object> literals = new LinkedHashMap<>();
    for (String type : List.of("float", "double")) for (String lexical : List.of("1.5", "1.0E1", "-0.0", "INF", "NaN", "bad")) {
      var value = f.getOWLLiteral(lexical, f.getOWLDatatype(IRI.create("http://www.w3.org/2001/XMLSchema#"+type)));
      literals.put(type+"|"+lexical, List.of(value.getLiteral(), renderer.render(value)));
    }
    out.put("literals", literals);
    System.out.println(new ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(out));
  }
}
