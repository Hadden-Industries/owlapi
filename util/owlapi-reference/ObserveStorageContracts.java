import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.*;
import org.semanticweb.owlapi.model.*;

/** Public target and configuration outcomes, including failure bytes. */
public final class ObserveStorageContracts {
    static void row(String name, Object... values) { System.out.println(name + "\t" + Arrays.toString(values)); }
    public static void main(String[] arguments) throws Exception {
        var formats = List.of(new FunctionalSyntaxDocumentFormat(), new TurtleDocumentFormat(), new RDFXMLDocumentFormat(), new OWLXMLDocumentFormat());
        for (var format : formats) {
            var manager = OWLManager.createOWLOntologyManager();
            var factory = manager.getOWLDataFactory();
            var ontology = manager.createOntology(IRI.create("https://storage.example.test/ontology"));
            var axiom = factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(), IRI.create("https://storage.example.test/s"), factory.getOWLLiteral("label"));
            manager.addAxiom(ontology, axiom);
            manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(factory.getOWLClass(IRI.create("https://storage.example.test/C"))));
            var target = new StringDocumentTarget();
            manager.saveOntology(ontology, format, target);
            var first = target.toString();
            manager.saveOntology(ontology, format, target);
            row(format.getKey() + ":reuse", target.toString().equals(first + first));
            for (var parameter : List.of("ignored parameter", "force xsd:string on literals")) {
                for (java.io.Serializable value : List.<java.io.Serializable>of(true, "not a boolean")) {
                    format.setParameter(parameter, value);
                    var configuredTarget = new StringDocumentTarget();
                    try { manager.saveOntology(ontology, format, configuredTarget); row(format.getKey() + ":parameter:" + parameter + ":" + value, "RETURN", configuredTarget.toString().equals(first), configuredTarget.toString().contains("XMLSchema#string")); }
                    catch (Throwable error) { row(format.getKey() + ":parameter:" + parameter + ":" + value, "THROW", error.getClass().getName(), configuredTarget.toString().replace("\n", "\\n")); }
                }
                format.setParameter(parameter, false);
            }
            for (var mode : List.of("two-spaces", "no-indent", "no-banners", "labels", "save-ids")) {
                var configuration = new OWLOntologyWriterConfiguration();
                if (mode.equals("two-spaces")) configuration = configuration.withIndentSize(2);
                if (mode.equals("no-indent")) configuration = configuration.withIndenting(false);
                if (mode.equals("no-banners")) configuration = configuration.withBannersEnabled(false);
                if (mode.equals("labels")) configuration = configuration.withLabelsAsBanner(true);
                if (mode.equals("save-ids")) configuration = configuration.withSaveIdsForAllAnonymousIndividuals(true);
                manager.setOntologyWriterConfiguration(configuration);
                var configuredTarget = new StringDocumentTarget();
                manager.saveOntology(ontology, format, configuredTarget);
                row(format.getKey() + ":configuration:" + mode, configuredTarget.toString().equals(first), Base64.getEncoder().encodeToString(configuredTarget.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            }
            manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration());
            var foreign = OWLManager.createOWLOntologyManager();
            var foreignTarget = new StringDocumentTarget();
            try { foreign.saveOntology(ontology, format, foreignTarget); row(format.getKey() + ":foreign", foreignTarget.toString().equals(first), foreign.getOntologyFormat(ontology)); }
            catch (Throwable error) { row(format.getKey() + ":foreign-error", error.getClass().getName()); }
            manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration().withIndentSize(2));
            var ownerConfigured = new StringDocumentTarget();
            manager.saveOntology(ontology, format, ownerConfigured);
            var foreignConfigured = new StringDocumentTarget();
            foreign.saveOntology(ontology, format, foreignConfigured);
            row(format.getKey() + ":foreign-configuration", foreignConfigured.toString().equals(ownerConfigured.toString()), foreignConfigured.toString().equals(first));
            manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration().withIndentSize(-1));
            try { manager.saveOntology(ontology, format, target); row(format.getKey() + ":negative-indent", "success", target.toString().length() - first.length() * 2); }
            catch (Throwable error) { row(format.getKey() + ":negative-indent", error.getClass().getName(), target.toString().substring(first.length() * 2).replace("\n", "\\n")); }
            manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration());
            manager.addAxiom(ontology, factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(), IRI.create("https://storage.example.test/s"), factory.getOWLLiteral("invalid\u0000xml")));
            var invalid = new StringDocumentTarget();
            try { manager.saveOntology(ontology, format, invalid); row(format.getKey() + ":invalid-xml-character", "success"); }
            catch (Throwable error) { row(format.getKey() + ":invalid-xml-character", error.getClass().getName(), invalid.toString().replace("\n", "\\n")); }
            var malformedXmlOntology = manager.createOntology(IRI.create("https://storage.example.test/malformed"));
            manager.addAxiom(malformedXmlOntology, factory.getOWLAnnotationAssertionAxiom(factory.getRDFSLabel(), IRI.create("https://storage.example.test/s"), factory.getOWLLiteral("<unclosed>", factory.getOWLDatatype(IRI.create("http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral")))));
            try { manager.saveOntology(malformedXmlOntology, format, invalid); row(format.getKey() + ":xml-literal", "success"); }
            catch (Throwable error) { row(format.getKey() + ":xml-literal", error.getClass().getName(), invalid.toString().replace("\n", "\\n")); }
            var anonymousOntology = manager.createOntology(IRI.create("https://storage.example.test/anonymous"));
            var anonymous = factory.getOWLAnonymousIndividual("storage-anonymous");
            manager.addAxiom(anonymousOntology, factory.getOWLObjectPropertyAssertionAxiom(factory.getOWLObjectProperty(IRI.create("urn:storage:p")), factory.getOWLNamedIndividual(IRI.create("urn:storage:s")), anonymous));
            manager.addAxiom(anonymousOntology, factory.getOWLDataPropertyAssertionAxiom(factory.getOWLDataProperty(IRI.create("urn:storage:q")), anonymous, factory.getOWLLiteral("value")));
            String anonymousBaseline = null;
            for (boolean saveIds : List.of(false, true)) {
                manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration().withSaveIdsForAllAnonymousIndividuals(saveIds));
                var anonymousTarget = new StringDocumentTarget();
                manager.saveOntology(anonymousOntology, format, anonymousTarget);
                if (!saveIds) anonymousBaseline = anonymousTarget.toString();
                row(format.getKey() + ":configuration:anonymous-ids-" + saveIds, anonymousTarget.toString().equals(anonymousBaseline), Base64.getEncoder().encodeToString(anonymousTarget.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            }
            manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration());
            for (var state : List.of("empty", "declaration-only")) {
                var parameterOntology = manager.createOntology(IRI.create("https://storage.example.test/" + state));
                if (state.equals("declaration-only")) manager.addAxiom(parameterOntology, factory.getOWLDeclarationAxiom(factory.getOWLClass(IRI.create("urn:storage:Declared"))));
                for (java.io.Serializable value : Arrays.<java.io.Serializable>asList(null, "not a boolean")) {
                    format.setParameter("force xsd:string on literals", value);
                    var parameterTarget = new StringDocumentTarget();
                    try { manager.saveOntology(parameterOntology, format, parameterTarget); row(format.getKey() + ":parameter-boundary:" + state + ":" + value, "RETURN"); }
                    catch (Throwable error) { row(format.getKey() + ":parameter-boundary:" + state + ":" + value, "THROW", error.getClass().getName(), !parameterTarget.toString().isEmpty()); }
                }
            }
            format.setParameter("force xsd:string on literals", false);
            var singleAnonymousOntology = manager.createOntology(IRI.create("https://storage.example.test/single-anonymous"));
            manager.addAxiom(singleAnonymousOntology, factory.getOWLObjectPropertyAssertionAxiom(factory.getOWLObjectProperty(IRI.create("urn:storage:p")), factory.getOWLNamedIndividual(IRI.create("urn:storage:s")), factory.getOWLAnonymousIndividual("single-anonymous")));
            String singleAnonymousBaseline = null;
            for (boolean saveIds : List.of(false, true)) {
                manager.setOntologyWriterConfiguration(new OWLOntologyWriterConfiguration().withSaveIdsForAllAnonymousIndividuals(saveIds));
                var singleAnonymousTarget = new StringDocumentTarget();
                manager.saveOntology(singleAnonymousOntology, format, singleAnonymousTarget);
                if (!saveIds) singleAnonymousBaseline = singleAnonymousTarget.toString();
                row(format.getKey() + ":configuration:single-anonymous-id-" + saveIds, singleAnonymousTarget.toString().equals(singleAnonymousBaseline), Base64.getEncoder().encodeToString(singleAnonymousTarget.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            }
        }
    }
}
