import java.nio.file.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
public class ImportLookupPrecedenceProbe {
 static OWLOntology parse(OWLOntologyManager m,String text,String doc) throws Exception {
  return m.loadOntologyFromOntologyDocument(new StringDocumentSource(text,IRI.create(doc),new FunctionalSyntaxDocumentFormat(),null));
 }
 public static void main(String[] args) throws Exception {
  Path p=Path.of(args[0]);String file=IRI.create(p.toFile()).toString();
  Files.writeString(p,"Ontology(<urn:precedence:declared> Declaration(Class(<urn:precedence:Old>)))");
  var m=OWLManager.createOWLOntologyManager();
  var first=parse(m,"Ontology(<urn:precedence:first> Import(<"+file+">))","urn:precedence:doc-first");
  var current=parse(m,"Ontology(<"+file+"> Declaration(Class(<urn:precedence:New>)))","urn:precedence:doc-current");
  var second=parse(m,"Ontology(<urn:precedence:second> Import(<"+file+">))","urn:precedence:doc-second");
  System.out.println("R1 currentInSecond="+m.getImportsClosure(second).contains(current)+" currentInFirst="+m.getImportsClosure(first).contains(current));
  m=OWLManager.createOWLOntologyManager();
  var alias=parse(m,"Ontology(<urn:precedence:alias>)","urn:precedence:import");
  m.getIRIMappers().add(iri->iri.equals(IRI.create("urn:precedence:import"))?IRI.create(p.toFile()):null);
  var root=parse(m,"Ontology(<urn:precedence:root> Import(<urn:precedence:import>))","urn:precedence:doc-root");
  var loaded=m.getOntology(IRI.create("urn:precedence:declared"));
  System.out.println("R2 mappedInClosure="+m.getImportsClosure(root).contains(loaded)+" aliasInClosure="+m.getImportsClosure(root).contains(alias));
 }
}
