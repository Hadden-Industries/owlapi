import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonGenerator;
import java.nio.file.Files;
import java.nio.file.Path;
import org.semanticweb.owlapi.io.StringDocumentSource;
import java.io.File;
import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl;
import org.semanticweb.owlapi.util.*;

/** Independently authored public API observations for renderer/provider cases. */
public final class RunRC2Renderer {
    private static void typeIndices(Object object, Map<String,Integer> result, Set<OWLObject> seen) {
        if (object instanceof OWLObject owl && seen.add(owl)) {
            String name = owl.getClass().getSimpleName().replaceAll("Impl.*$", "");
            if (owl instanceof IRI) name = "IRI";
            if (owl instanceof OWLLiteral) name = "OWLLiteral";
            result.put(name, owl.typeIndex());
            owl.components().forEach(component -> typeIndices(component, result, seen));
        } else if (object instanceof Iterable<?> values) {
            for (Object value : values) typeIndices(value, result, seen);
        }
    }
    public static void main(String[] arguments) throws Exception {
        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLDataFactory f = manager.getOWLDataFactory();
        ManchesterOWLSyntaxOWLObjectRendererImpl renderer = new ManchesterOWLSyntaxOWLObjectRendererImpl();
        Map<String, Object> output = new LinkedHashMap<>();
        Map<String, OWLObject> cases = new LinkedHashMap<>();
        OWLClass a = f.getOWLClass(IRI.create("urn:render:A")), b = f.getOWLClass(IRI.create("https://example.test/path/B"));
        OWLObjectProperty p = f.getOWLObjectProperty(IRI.create("urn:render:p"));
        OWLDataProperty d = f.getOWLDataProperty(IRI.create("urn:render:d"));
        cases.put("class", a); cases.put("iri", a.getIRI()); cases.put("inverse", p.getInverseProperty());
        cases.put("someUnion", f.getOWLObjectSomeValuesFrom(p, f.getOWLObjectUnionOf(a,b)));
        cases.put("complementIntersection", f.getOWLObjectComplementOf(f.getOWLObjectIntersectionOf(a,b)));
        cases.put("nestedIntersection", f.getOWLObjectIntersectionOf(a, f.getOWLObjectUnionOf(a,b)));
        cases.put("min", f.getOWLObjectMinCardinality(2,p,a));
        cases.put("self", f.getOWLObjectHasSelf(p));
        cases.put("oneOf", f.getOWLObjectOneOf(f.getOWLNamedIndividual(IRI.create("urn:render:i"))));
        cases.put("lang", f.getOWLLiteral("line\nquote\"slash\\tab\t", "en"));
        cases.put("string", f.getOWLLiteral("text"));
        cases.put("integer", f.getOWLLiteral("01", f.getIntegerOWLDatatype()));
        cases.put("dataSome", f.getOWLDataSomeValuesFrom(d, f.getStringOWLDatatype()));
        cases.put("annotation", f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("label")));
        cases.put("nestedAnnotation", f.getOWLAnnotation(f.getRDFSLabel(), f.getOWLLiteral("label"), List.of(f.getOWLAnnotation(f.getRDFSComment(), f.getOWLLiteral("nested")))));
        cases.put("allUnion", f.getOWLObjectAllValuesFrom(p, f.getOWLObjectUnionOf(a,b)));
        cases.put("maxUnion", f.getOWLObjectMaxCardinality(2,p,f.getOWLObjectUnionOf(a,b)));
        cases.put("topDataIntersection", f.getOWLDataIntersectionOf(f.getIntegerOWLDatatype(), f.getStringOWLDatatype()));
        cases.put("topDataUnion", f.getOWLDataUnionOf(f.getIntegerOWLDatatype(), f.getStringOWLDatatype()));
        cases.put("topDataComplement", f.getOWLDataComplementOf(f.getIntegerOWLDatatype()));
        cases.put("dataOneOf", f.getOWLDataOneOf(f.getOWLLiteral("a"), f.getOWLLiteral("b", "fr")));
        cases.put("boolean", f.getOWLLiteral(true));
        cases.put("decimal", f.getOWLLiteral("01.0", f.getOWLDatatype(IRI.create("http://www.w3.org/2001/XMLSchema#decimal"))));
        cases.put("double", f.getOWLLiteral("1.0E1", f.getDoubleOWLDatatype()));
        Map<String, String> rendered = new LinkedHashMap<>();
        for (Map.Entry<String, OWLObject> entry : cases.entrySet()) rendered.put(entry.getKey(), renderer.render(entry.getValue()));
        output.put("cases", rendered);
        Map<String,Integer> indices = new TreeMap<>();
        Set<OWLObject> seen = new HashSet<>();
        cases.values().forEach(value -> typeIndices(value, indices, seen));
        SimpleShortFormProvider simple = new SimpleShortFormProvider();
        Map<String,String> shortForms = new LinkedHashMap<>();
        for (String iri : List.of("urn:render:A", "https://example.test/path/B", "https://example.test/path/", "https://example.test/#space%20name", "urn:render:two words", "urn:render:")) shortForms.put(iri, simple.getShortForm(f.getOWLClass(IRI.create(iri))));
        output.put("shortForms", shortForms);
        OWLOntology ontology = manager.createOntology();
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), a.getIRI(), f.getOWLLiteral("Zulu", "en")));
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), a.getIRI(), f.getOWLLiteral("Alpha", "fr")));
        AnnotationValueShortFormProvider labels = new AnnotationValueShortFormProvider(List.of(f.getRDFSLabel()), Map.of(f.getRDFSLabel(), List.of("en", "fr")), manager);
        output.put("preferredLabel", labels.getShortForm(a));
        output.put("fallbackLabel", labels.getShortForm(b));
        renderer.setShortFormProvider(labels);
        output.put("labelRendering", renderer.render(a));
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), a.getIRI(), f.getOWLLiteral("A label with spaces", "en")));
        output.put("preferredLabelTie", labels.getShortForm(a));
        OWLClass iriLabel = f.getOWLClass(IRI.create("urn:render:iriLabel"));
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), iriLabel.getIRI(), IRI.create("urn:render:iriValue")));
        output.put("iriLabel", labels.getShortForm(iriLabel));
        AnnotationValueShortFormProvider anyLanguage = new AnnotationValueShortFormProvider(List.of(f.getRDFSLabel()), Map.of(), manager);
        output.put("emptyLanguagePreferences", anyLanguage.getShortForm(a));
        OWLClass plainLabel = f.getOWLClass(IRI.create("urn:render:plainLabel"));
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), plainLabel.getIRI(), f.getOWLLiteral("Plain")));
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), plainLabel.getIRI(), f.getOWLLiteral("English", "en")));
        output.put("unlistedPlain", labels.getShortForm(plainLabel));
        OWLClass unmatched = f.getOWLClass(IRI.create("urn:render:unmatched"));
        manager.addAxiom(ontology, f.getOWLAnnotationAssertionAxiom(f.getRDFSLabel(), unmatched.getIRI(), f.getOWLLiteral("German", "de")));
        output.put("unlistedOnly", labels.getShortForm(unmatched));
        renderer.setShortFormProvider(entity -> "two words' quote");
        output.put("customSpaceQuote", renderer.render(a));
        renderer.setShortFormProvider(new SimpleShortFormProvider());
        if (arguments.length == 1) {
            OWLOntology all = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(Files.readString(Path.of(arguments[0]))));
            List<Map<String,String>> records = new ArrayList<>();
            all.axioms().sorted(Comparator.comparing(OWLAxiom::toString)).forEach(axiom -> records.add(Map.of("type", axiom.getAxiomType().getName(), "functional", axiom.toString(), "rendered", renderer.render(axiom))));
            output.put("axioms", records);
            all.axioms().forEach(value -> typeIndices(value, indices, seen));
        }
        output.put("typeIndices", indices);
        System.out.println(new ObjectMapper().configure(JsonGenerator.Feature.ESCAPE_NON_ASCII, true).writeValueAsString(output));
    }
}
