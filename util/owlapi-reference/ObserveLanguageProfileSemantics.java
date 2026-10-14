import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.FunctionalSyntaxDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.profiles.*;
import org.semanticweb.owlapi.vocab.OWL2Datatype;

/** Distinguish parser structure from profile verdict and lexical validation. */
public final class ObserveLanguageProfileSemantics {
    private static String encoded(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    private static void observeLiteral(OWLDataFactory factory, String datatypeIRI, String input) {
        var literal = factory.getOWLLiteral(input, factory.getOWLDatatype(IRI.create(datatypeIRI)));
        System.out.println("factory-literal\t" + datatypeIRI + "\t" + encoded(input) + "\t" + encoded(literal.getLiteral()) + "\t" + literal.getDatatype().getIRI() + "\t" + encoded(literal.getLang()));
    }
    public static void main(String[] arguments) throws Exception {
        var manager = OWLManager.createOWLOntologyManager();
        var text = "Prefix(:=<urn:profiles:>) Ontology(Declaration(Class(:A)) Declaration(DataProperty(:d)) Declaration(DataProperty(:e)) SubClassOf(:A DataSomeValuesFrom(:d :e <http://www.w3.org/2001/XMLSchema#string>)))";
        try {
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:profiles:source"), new FunctionalSyntaxDocumentFormat(), null));
            System.out.println("nary-data-range\t" + ontology.axioms().map(Object::toString).sorted().toList());
        } catch (OWLOntologyCreationException error) { System.out.println("nary-data-range\t" + error.getClass().getSimpleName()); }
        for (var datatype : OWL2Datatype.values()) {
            System.out.println("datatype-pattern\t" + datatype.getIRI() + "\t" + datatype.getPatternString());
            System.out.println("datatype-facets\t" + datatype.getIRI() + "\t" + datatype.getFacets().stream().map(f -> f.getIRI().toString()).sorted().collect(java.util.stream.Collectors.joining(" ")));
        }
        for (var datatype : OWL2Datatype.values()) for (var value : List.of("", "1", "4294967296", "bad", "-0", "+INF", "NaN", "2000-02-31T12:00:00Z", "1 / 0", "A B", "AB", "\u00a0", "a\nb", "bad\n", "😀")) {
            var f = manager.getOWLDataFactory();
            var tested = manager.createOntology();
            var property = f.getOWLDataProperty(IRI.create("urn:profiles:d"));
            manager.addAxiom(tested, f.getOWLDeclarationAxiom(property));
            var literal = f.getOWLLiteral(value, f.getOWLDatatype(datatype.getIRI()));
            manager.addAxiom(tested, f.getOWLDataPropertyAssertionAxiom(property, f.getOWLNamedIndividual(IRI.create("urn:profiles:i")), literal));
            System.out.println("datatype-literal\t" + datatype.getIRI() + "\t" + Base64.getEncoder().encodeToString(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)) + "\t" + Base64.getEncoder().encodeToString(literal.getLiteral().getBytes(java.nio.charset.StandardCharsets.UTF_8)) + "\t" + new OWL2DLProfile().checkOntology(tested).isInProfile());
        }
        var factory = manager.getOWLDataFactory();
        for (var datatype : List.of(OWL2Datatype.XSD_BOOLEAN, OWL2Datatype.XSD_INTEGER, OWL2Datatype.XSD_LONG, OWL2Datatype.XSD_FLOAT, OWL2Datatype.XSD_DOUBLE, OWL2Datatype.XSD_STRING, OWL2Datatype.RDF_PLAIN_LITERAL, OWL2Datatype.RDF_LANG_STRING)) {
            for (var value : List.of("", "0", "00", "+0", "-0", "+01", "-01", " 1 ", "\u00a01\u00a0", "\u00001\u0000", "2147483647", "2147483648", "-2147483649", "9223372036854775807", "9223372036854775808", "-9223372036854775808", "-9223372036854775809", "١٢٣", "１２３", "𝟙", "true", "TRUE", "bad", "1.0", "0.1", "1e-3", "1e-4", "1e7", "1e23", "1e-45", "4.9e-324", "-0.0", "-1e-9999", "1e9999", "+INF", "INF", "Infinity", "-Infinity", "NaN", "+NaN", "1f", "0x1.8p1", "0x1.0p-149", "0x1.0p-1074", "0x1.fffffffffffffp1023", "1.000000059604644775390625", "1.000000059604644775390625000001", "1.000000059604644775390624999999", "name@EN", "name@", "name@ en ", "a@b@EN")) {
                observeLiteral(factory, datatype.getIRI().toString(), value);
            }
        }
        var random = new Random(551);
        for (int i = 0; i < 128; i++) {
            observeLiteral(factory, OWL2Datatype.XSD_FLOAT.getIRI().toString(), Float.toHexString(Float.intBitsToFloat(random.nextInt())));
            observeLiteral(factory, OWL2Datatype.XSD_DOUBLE.getIRI().toString(), Double.toHexString(Double.longBitsToDouble(random.nextLong())));
        }
        for (var language : List.of("", "EN", " en ", "\tEN\n", "\u00a0EN\u00a0", "i-INVALID")) {
            var literal = factory.getOWLLiteral("hello", language);
            System.out.println("factory-language\t" + encoded(language) + "\t" + encoded(literal.getLiteral()) + "\t" + literal.getDatatype().getIRI() + "\t" + encoded(literal.getLang()));
        }
        var largeLiteral = factory.getOWLLiteral("x".repeat(32 * 1024 * 1024 + 1));
        var rendering = new org.semanticweb.owlapi.manchestersyntax.renderer.ManchesterOWLSyntaxOWLObjectRendererImpl().render(largeLiteral);
        System.out.println("manchester-large-literal\t" + largeLiteral.getLiteral().length() + "\t" + rendering.length() + "\t" + rendering.equals("\"" + largeLiteral.getLiteral() + "\""));
    }
}
