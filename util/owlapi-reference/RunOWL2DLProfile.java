import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.OWLOntology;
import org.semanticweb.owlapi.model.OWLOntologyManager;
import org.semanticweb.owlapi.profiles.OWL2DLProfile;
import org.semanticweb.owlapi.profiles.OWLProfileReport;
import org.semanticweb.owlapi.util.VersionInfo;

/** Project-owned bounded profile probe. Input and expectations are kept outside
 * the implementation; no Java verdict is rewritten as a normative expectation.
 */
public final class RunOWL2DLProfile {
    private RunOWL2DLProfile() {}
    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 1) throw new IllegalArgumentException("Expected a case manifest path");
        String version = VersionInfo.getVersionInfo().getVersion();
        if (!"5.5.1".equals(version)) throw new IllegalStateException("Unexpected OWLAPI version: " + version);
        ObjectMapper json = new ObjectMapper();
        JsonNode cases = json.readTree(Files.readString(Path.of(arguments[0])));
        if (!cases.isArray() || cases.size() != 20) {
            throw new IllegalArgumentException("Expected the bounded 20-case source manifest");
        }
        HashSet<String> ids = new HashSet<>();
        List<Map<String, Object>> observations = new ArrayList<>();
        for (JsonNode item : cases) {
            if (!item.path("id").isTextual() || item.path("id").asText().isEmpty()
                    || !ids.add(item.path("id").asText()) || !item.path("documents").isArray()
                    || item.path("documents").isEmpty()) {
                throw new IllegalArgumentException("Expected a unique case ID and nonempty document array");
            }
            OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
            OWLOntology root = null;
            for (JsonNode document : item.get("documents")) {
                if (!document.isTextual() || document.asText().isEmpty()) {
                    throw new IllegalArgumentException("Expected a nonempty Functional Syntax document");
                }
                root = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(document.asText()));
            }
            if (root == null) throw new IllegalArgumentException("No root document");
            OWLProfileReport report = new OWL2DLProfile().checkOntology(root);
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("id", item.get("id").asText());
            record.put("valid", report.isInProfile());
            record.put("closureSize", manager.getImportsClosure(root).size());
            record.put("violations", report.getViolations().stream().map(value -> value.getClass().getSimpleName()).distinct().sorted().toList());
            observations.add(record);
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("version", version);
        output.put("profileOrigin", OWL2DLProfile.class.getProtectionDomain().getCodeSource().getLocation().toString());
        output.put("managerOrigin", OWLManager.class.getProtectionDomain().getCodeSource().getLocation().toString());
        output.put("observations", observations);
        System.out.println(json.writeValueAsString(output));
    }
}
