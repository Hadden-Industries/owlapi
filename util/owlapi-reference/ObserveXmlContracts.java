import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;

/** Native XML behavior measured through the selected ontology loader. */
public final class ObserveXmlContracts {
    static void probe(String name, String subset, String value, String limit) {
        probe(name, subset, value, limit, "");
    }
    static void probe(String name, String subset, String value, String limit, String literalAttributes) {
        var manager = OWLManager.createOWLOntologyManager();
        var document = "<!DOCTYPE Ontology [" + subset + "]><Ontology xmlns=\"http://www.w3.org/2002/07/owl#\"><Annotation><AnnotationProperty IRI=\"urn:xml:p\"/><Literal " + literalAttributes + ">" + value + "</Literal></Annotation></Ontology>";
        var configuration = new OWLOntologyLoaderConfiguration().setEntityExpansionLimit(limit);
        try {
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(document, IRI.create("urn:xml:" + name), new OWLXMLDocumentFormat(), null), configuration);
            var result = (OWLLiteral) ontology.annotations().findFirst().get().getValue();
            System.out.println(name + "\tRETURN\t" + result.getLiteral().length() + "\t" + (result.getLiteral().length() < 32 ? result.getLiteral() : "<long-value>") + "\t" + result.getLang() + "\t" + result.getDatatype().getIRI());
        } catch (Throwable error) { System.out.println(name + "\tTHROW\t" + error.getClass().getName()); }
    }
    public static void main(String[] arguments) {
        for (var limit : List.of("0", "1", "2", "-1", "bad", "100000000")) probe("twice-limit-" + limit, "<!ENTITY a 'x'>", "&a;&a;", limit);
        probe("unused-external", "<!ENTITY a SYSTEM 'file:///definitely-not-present'>", "x", "100000000");
        probe("used-external", "<!ENTITY a SYSTEM 'file:///definitely-not-present'>", "&a;", "100000000");
        probe("unused-cycle", "<!ENTITY a '&a;'>", "x", "100000000");
        probe("used-cycle", "<!ENTITY a '&a;'>", "&a;", "100000000");
        probe("nested-limit-2", "<!ENTITY a 'x'><!ENTITY b '&a;&a;'>", "&b;", "2");
        probe("nested-limit-3", "<!ENTITY a 'x'><!ENTITY b '&a;&a;'>", "&b;", "3");
        probe("unused-entity-100000", "<!ENTITY a '" + "x".repeat(100000) + "'>", "x", "0");
        probe("unused-entity-100001", "<!ENTITY a '" + "x".repeat(100001) + "'>", "x", "0");
        probe("unused-total-120000", "<!ENTITY a '" + "x".repeat(60000) + "'><!ENTITY b '" + "x".repeat(60000) + "'>", "x", "0");
        probe("repeated-entity-60000", "<!ENTITY a '" + "x".repeat(60000) + "'>", "&a;&a;", "0");
        probe("single-entity-60000", "<!ENTITY a '" + "x".repeat(60000) + "'>", "&a;", "0");
        probe("single-entity-50000", "<!ENTITY a '" + "x".repeat(50000) + "'>", "&a;", "0");
        probe("duplicate-entity", "<!ENTITY a 'first'><!ENTITY a 'second'>", "&a;", "0");
        probe("parameter-entity", "<!ENTITY % definitions \"<!ENTITY a 'value'>\">%definitions;", "&a;", "0");
        probe("unused-parameter-15000", "<!ENTITY % a '" + "x".repeat(15000) + "'>", "x", "0");
        probe("unused-parameter-15001", "<!ENTITY % a '" + "x".repeat(15001) + "'>", "x", "0");
        probe("dtd-element", "<!ELEMENT Ontology ANY>", "x", "0");
        probe("dtd-default", "<!ATTLIST Literal xml:lang CDATA 'en'>", "x", "0");
        probe("dtd-explicit", "<!ATTLIST Literal xml:lang CDATA 'en'>", "x", "0", "xml:lang='de'");
        probe("dtd-token", "<!ATTLIST Literal xml:lang NMTOKENS '  en  '>", "x", "0");
        probe("dtd-fixed", "<!ATTLIST Literal xml:lang CDATA #FIXED 'en'>", "x", "0", "xml:lang='de'");
        probe("external-attribute", "<!ENTITY a SYSTEM 'file:///definitely-not-present'>", "x", "0", "xml:lang='&a;'");
        probe("parameter-charref", "<!ENTITY % definitions \"&#60;!ENTITY a 'value'>\">%definitions;", "&a;", "0");
        probe("qualified-name-total-1002", "", "x", "0", "xmlns:p='urn:xml:p' p:" + "a".repeat(1000) + "='v'");
        probe("bad-external-declaration", "<!ENTITY a SYSTEM bogus>", "x", "0");
        probe("notation-system", "<!NOTATION image SYSTEM 'urn:image'>", "x", "0");
        probe("notation-public", "<!NOTATION image PUBLIC 'Image Format'>", "x", "0");
        probe("notation-invalid", "<!NOTATION image bogus>", "x", "0");
        probe("unparsed-unused", "<!NOTATION image SYSTEM 'urn:image'><!ENTITY a SYSTEM 'file:///never-read' NDATA image>", "x", "0");
        probe("unparsed-used", "<!NOTATION image SYSTEM 'urn:image'><!ENTITY a SYSTEM 'file:///never-read' NDATA image>", "&a;", "0");
        probe("element-sequence", "<!ELEMENT Ontology ((Annotation|Class)+,Import?)>", "x", "0");
        probe("element-pcdata", "<!ELEMENT Ontology (#PCDATA)>", "x", "0");
        probe("element-mixed", "<!ELEMENT Ontology (#PCDATA|Annotation)*>", "x", "0");
        probe("element-empty-choice", "<!ELEMENT Ontology ()>", "x", "0");
        probe("element-trailing-choice", "<!ELEMENT Ontology (Annotation|)>", "x", "0");
        probe("element-mixed-separators", "<!ELEMENT Ontology (Annotation,Class|Import)>", "x", "0");
        probe("element-missing-star", "<!ELEMENT Ontology (#PCDATA|Annotation)>", "x", "0");
        probe("dtd-bad-comment", "<!-- bad -- comment -->", "x", "0");
        probe("dtd-notation-attribute", "<!ATTLIST Literal marker NOTATION (image|text) #IMPLIED>", "x", "0");
        probe("unparsed-without-notation", "<!ENTITY a SYSTEM 'file:///never-read' NDATA image>", "&a;", "0");
        for (int count : List.of(199, 200, 201)) {
            var attributes = new StringBuilder();
            for (int index = 0; index < count; index++) attributes.append(" a" + index + "='v'");
            probe("attributes-" + count, "", "y", "0", attributes.toString());
        }
        for (int count : List.of(1000, 1001)) probe("name-" + count, "", "y", "0", "a".repeat(count) + "='v'");
    }
}
