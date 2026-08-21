import java.io.File;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.FileDocumentSource;
import org.semanticweb.owlapi.model.IRI;
import org.semanticweb.owlapi.model.MissingImportHandlingStrategy;
import org.semanticweb.owlapi.model.OWLAxiom;
import org.semanticweb.owlapi.model.OWLEntity;
import org.semanticweb.owlapi.model.OWLImportsDeclaration;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyID;
import org.semanticweb.owlapi.model.OWLOntologyLoaderConfiguration;
import org.semanticweb.owlapi.model.OWLOntologyManager;

/** Development-only black-box snapshot harness for the pinned OWLAPI revision. */
public final class GenerateStructuralSnapshot {
    private GenerateStructuralSnapshot() {}

    public static void main(String[] arguments) throws Exception {
        if (arguments.length < 1) {
            System.err.println(
                "Usage: GenerateStructuralSnapshot <ontology-document> [ignored-import-iri ...]");
            System.exit(2);
        }

        OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
        OWLOntologyLoaderConfiguration configuration =
            new OWLOntologyLoaderConfiguration().setMissingImportHandlingStrategy(
                MissingImportHandlingStrategy.SILENT);
        for (int index = 1; index < arguments.length; index += 1) {
            configuration = configuration.addIgnoredImport(IRI.create(arguments[index]));
        }
        OWLOntology ontology = manager.loadOntologyFromOntologyDocument(
            new FileDocumentSource(new File(arguments[0])), configuration);
        System.out.println(snapshot(ontology));
    }

    static String snapshot(OWLOntology ontology) {
        OWLOntologyID id = ontology.getOntologyID();
        Map<String, Integer> axiomTypeCounts = new TreeMap<>();
        for (OWLAxiom axiom : ontology.getAxioms()) {
            axiomTypeCounts.merge(axiom.getAxiomType().getName(), 1, Integer::sum);
        }

        StringBuilder output = new StringBuilder();
        output.append('{');
        field(output, "ontologyIRI", optionalIri(id.getOntologyIRI()));
        output.append(',');
        field(output, "versionIRI", optionalIri(id.getVersionIRI()));
        output.append(',');
        arrayField(output, "imports", ontology.getImportsDeclarations(),
            declaration -> declaration.getIRI().toString());
        output.append(',');
        arrayField(output, "ontologyAnnotations", ontology.getAnnotations(), Object::toString);
        output.append(',');
        mapField(output, "axiomTypeCounts", axiomTypeCounts);
        output.append(',');
        arrayField(output, "axioms", ontology.getAxioms(), Object::toString);
        output.append(',');
        output.append("\"signature\":{");
        entityArrayField(output, "classes", ontology.getClassesInSignature());
        output.append(',');
        entityArrayField(output, "objectProperties", ontology.getObjectPropertiesInSignature());
        output.append(',');
        entityArrayField(output, "dataProperties", ontology.getDataPropertiesInSignature());
        output.append(',');
        entityArrayField(output, "annotationProperties", ontology.getAnnotationPropertiesInSignature());
        output.append(',');
        entityArrayField(output, "individuals", ontology.getIndividualsInSignature());
        output.append(',');
        entityArrayField(output, "datatypes", ontology.getDatatypesInSignature());
        output.append("}}");
        return output.toString();
    }

    private static String optionalIri(java.util.Optional<IRI> value) {
        return value.map(IRI::toString).orElse(null);
    }

    private static void entityArrayField(
        StringBuilder output,
        String name,
        Collection<? extends OWLEntity> entities
    ) {
        arrayField(output, name, entities, entity -> entity.getIRI().toString());
    }

    private static <T> void arrayField(
        StringBuilder output,
        String name,
        Collection<T> values,
        Function<T, String> renderer
    ) {
        List<String> rendered = new ArrayList<>();
        for (T value : values) {
            rendered.add(renderer.apply(value));
        }
        rendered.sort(String::compareTo);
        output.append(quote(name)).append(":");
        output.append('[');
        for (int index = 0; index < rendered.size(); index += 1) {
            if (index > 0) {
                output.append(',');
            }
            output.append(quote(rendered.get(index)));
        }
        output.append(']');
    }

    private static void mapField(
        StringBuilder output,
        String name,
        Map<String, Integer> values
    ) {
        output.append(quote(name)).append(":{");
        boolean first = true;
        for (Map.Entry<String, Integer> entry : values.entrySet()) {
            if (!first) {
                output.append(',');
            }
            first = false;
            output.append(quote(entry.getKey())).append(':').append(entry.getValue());
        }
        output.append('}');
    }

    private static void field(StringBuilder output, String name, String value) {
        output.append(quote(name)).append(':');
        output.append(value == null ? "null" : quote(value));
    }

    private static String quote(String value) {
        StringBuilder escaped = new StringBuilder(value.length() + 2);
        escaped.append('"');
        for (int index = 0; index < value.length(); index += 1) {
            char character = value.charAt(index);
            switch (character) {
                case '"': escaped.append("\\\""); break;
                case '\\': escaped.append("\\\\"); break;
                case '\b': escaped.append("\\b"); break;
                case '\f': escaped.append("\\f"); break;
                case '\n': escaped.append("\\n"); break;
                case '\r': escaped.append("\\r"); break;
                case '\t': escaped.append("\\t"); break;
                default:
                    if (character < 0x20) {
                        escaped.append(String.format("\\u%04x", (int) character));
                    } else {
                        escaped.append(character);
                    }
            }
        }
        return escaped.append('"').toString();
    }
}
