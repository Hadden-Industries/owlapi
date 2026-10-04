import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** JDK-only observation of selected build determinants; no arbitrary environment dump. */
public final class ReferenceBuildEnvironment {
    public static void main(String[] args) throws Exception {
        if (args.length != 1 || !Files.isSameFile(Path.of(args[0]),
                Path.of(System.getProperty("java.home")))) {
            throw new IllegalArgumentException("The observed JVM is not the selected JDK");
        }
        Map<String, String> values = new LinkedHashMap<>();
        values.put("runtime", Runtime.version().toString());
        for (String property : new String[] {"java.version", "java.vendor", "java.vm.name",
                "java.vm.version", "os.name", "os.version", "os.arch", "file.encoding",
                "native.encoding", "stdout.encoding", "stderr.encoding"}) {
            values.put(property, System.getProperty(property));
        }
        values.put("locale", Locale.getDefault().toLanguageTag());
        values.put("timezone", TimeZone.getDefault().getID());
        StringBuilder json = new StringBuilder("{");
        for (Map.Entry<String, String> entry : values.entrySet()) {
            String value = entry.getValue();
            // These properties are a closed, bounded observation protocol. Unsupported
            // strings reject reuse rather than require a general JSON serializer here.
            if (value == null || value.isEmpty() || value.length() > 256
                    || value.chars().anyMatch(c -> c < 32 || c > 126 || c == '"' || c == '\\')) {
                throw new IllegalArgumentException("Unsupported build property: " + entry.getKey());
            }
            if (json.length() > 1) {
                json.append(',');
            }
            json.append('"').append(entry.getKey()).append("\":\"").append(value).append('"');
        }
        System.out.println(json.append('}'));
    }
}
