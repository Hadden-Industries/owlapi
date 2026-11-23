import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

/** Run only the frozen native probes whose requests target their own loopback servers. */
final class OntologyTransportComparison {
    private OntologyTransportComparison() {}

    static String observe(JsonNode recipe, Path directory) throws Exception {
        var bytes = new ByteArrayOutputStream();
        var original = System.out;
        try (var output = new PrintStream(bytes, true, StandardCharsets.UTF_8)) {
            System.setOut(output);
            String[] arguments = { directory.toAbsolutePath().toString() };
            switch (recipe.required("kind").asText()) {
                case "loopback" -> ObserveNetworkContracts.main(arguments);
                case "compression" -> ObserveCompressionContracts.main(arguments);
                case "context-transport" -> ObserveJsonLdTransport.main(arguments);
                default -> throw new IllegalArgumentException("Unsupported owned transport probe");
            }
        } finally {
            System.setOut(original);
        }
        return bytes.toString(StandardCharsets.UTF_8).replace("\r\n", "\n");
    }
}
