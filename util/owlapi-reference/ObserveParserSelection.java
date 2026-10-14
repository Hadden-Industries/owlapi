import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.*;
import org.semanticweb.owlapi.model.*;

/** Candidate order and failure classification through public loading APIs. */
public final class ObserveParserSelection {
    static void enumerationProbe(String individuals) {
        var manager = OWLManager.createOWLOntologyManager();
        String text = "<Ontology xmlns='http://www.w3.org/2002/07/owl#'><SubClassOf><Class IRI='urn:C'/><ObjectOneOf>" + individuals + "</ObjectOneOf></SubClassOf></Ontology>";
        try {
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:oneof"), new OWLXMLDocumentFormat(), null));
            var axiom = (OWLSubClassOfAxiom) ontology.axioms().findFirst().orElseThrow();
            var enumeration = (OWLObjectOneOf) axiom.getSuperClass();
            System.out.println("owlxml-enumeration\t" + individuals + "\t" + enumeration.getIndividuals().size() + "\t" + enumeration.individuals().filter(OWLIndividual::isAnonymous).count());
        } catch (Throwable error) { System.out.println("owlxml-enumeration\t" + individuals + "\tTHROW\t" + error.getClass().getName()); }
    }
    static void metadataProbe(String name, String text, OWLDocumentFormat format) {
        var manager = OWLManager.createOWLOntologyManager();
        try {
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:metadata:" + name), format, null));
            var metadata = (RDFParserMetaData) manager.getOntologyFormat(ontology).getOntologyLoaderMetaData().orElseThrow();
            System.out.println("metadata-" + name + "\t" + metadata.getHeaderState() + "\t" + metadata.getTripleCount());
        } catch (Throwable error) { System.out.println("metadata-" + name + "\tTHROW\t" + error.getClass().getName()); }
    }
    static void probe(String name, String text, OWLDocumentFormat format) {
        var manager = OWLManager.createOWLOntologyManager();
        try {
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:parser:" + name), format, null));
            System.out.println(name + "\tRETURN\t" + manager.getOntologyFormat(ontology).getKey() + "\t" + ontology.getAxiomCount());
        } catch (UnparsableOntologyException error) {
            System.out.println(name + "\tAGGREGATE\t" + error.getExceptions().keySet().stream().map(parser -> parser.getClass().getName()).toList());
        } catch (Throwable error) { System.out.println(name + "\tTHROW\t" + error.getClass().getName()); }
    }
    public static void main(String[] arguments) {
        try {
            var manager = OWLManager.createOWLOntologyManager();
            String text = "@prefix owl: <http://www.w3.org/2002/07/owl#>. @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>. @prefix xsd: <http://www.w3.org/2001/XMLSchema#>. <urn:D> a rdfs:Datatype; owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern \"x\"]).";
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:named-restriction"), new TurtleDocumentFormat(), null));
            System.out.println("named-datatype-restriction\t" + ontology.getAxiomCount(AxiomType.DATATYPE_DEFINITION) + "\t" + ontology.getAxiomCount(AxiomType.ANNOTATION_ASSERTION) + "\t" + ontology.axioms(AxiomType.ANNOTATION_ASSERTION).filter(a -> a.getSubject().isAnonymous()).count());
            var withoutAnnotations = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:named-restriction:without-annotations"), new TurtleDocumentFormat(), null), new OWLOntologyLoaderConfiguration().setLoadAnnotationAxioms(false));
            System.out.println("named-datatype-restriction-without-annotations\t" + withoutAnnotations.getAxiomCount(AxiomType.DATATYPE_DEFINITION) + "\t" + withoutAnnotations.getAxiomCount(AxiomType.ANNOTATION_ASSERTION));
            var anonymousAnnotation = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource("[] <urn:label> \"x\".", IRI.create("urn:anonymous-annotation"), new TurtleDocumentFormat(), null));
            System.out.println("anonymous-undeclared-annotation\t" + anonymousAnnotation.getAxiomCount(AxiomType.ANNOTATION_ASSERTION));
        } catch (Throwable error) { throw new IllegalStateException(error); }
        for (String individuals : List.of("<AnonymousIndividual nodeID='a'/>", "<NamedIndividual IRI='urn:i'/><AnonymousIndividual nodeID='a'/>", "")) enumerationProbe(individuals);
        System.out.println("factory-empty-enumeration\t" + OWLManager.getOWLDataFactory().getOWLObjectOneOf(Set.of()).getIndividuals().size());
        var registryManager = OWLManager.createOWLOntologyManager();
        for (var factory : registryManager.getOntologyParsers()) {
            var priority = factory.getClass().getAnnotation(org.semanticweb.owlapi.annotations.HasPriority.class);
            System.out.println("parser-factory\t" + factory.getSupportedFormat().getKey() + "\t" + (priority == null ? Double.MAX_VALUE : priority.value()));
        }
        probe("empty-auto", "", null);
        probe("broken-auto", "Broken(", null);
        probe("broken-functional", "Broken(", new FunctionalSyntaxDocumentFormat());
        probe("turtle-functional-hint", "<urn:A> a <http://www.w3.org/2002/07/owl#Class> .", new FunctionalSyntaxDocumentFormat());
        probe("invalid-functional-auto", "Ontology(Declaration(Class(<urn:A>))", null);
        probe("malformed-xml-auto", "<?xml version='1.0'?><Ontology", null);
        probe("invalid-jsonld-auto", "{\"@context\": 42}", null);
        for (int count : List.of(0, 1, 2)) {
            String turtle = "<urn:C> a <http://www.w3.org/2002/07/owl#Class> . ";
            String xml = "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#' xmlns:owl='http://www.w3.org/2002/07/owl#'><owl:Class rdf:about='urn:C'/>";
            for (int index = 0; index < count; index++) { turtle += "<urn:ontology:" + index + "> a <http://www.w3.org/2002/07/owl#Ontology> . "; xml += "<owl:Ontology rdf:about='urn:ontology:" + index + "'/>"; }
            metadataProbe("turtle-headers-" + count, turtle, new TurtleDocumentFormat());
            metadataProbe("rdfxml-headers-" + count, xml + "</rdf:RDF>", new RDFXMLDocumentFormat());
        }
        metadataProbe("turtle-duplicate", "<urn:C> a <http://www.w3.org/2002/07/owl#Class> . <urn:C> a <http://www.w3.org/2002/07/owl#Class> .", new TurtleDocumentFormat());
    }
}
