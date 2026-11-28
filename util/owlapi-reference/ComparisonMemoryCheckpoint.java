import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;

/** Keep the target JVM alive while the parent observes its working set. */
final class ComparisonMemoryCheckpoint {
  private ComparisonMemoryCheckpoint() {}

  static void observe(ObjectMapper json, String caseId, String executionId, String sampleId,
      String phase) throws IOException {
    Runtime runtime = Runtime.getRuntime();
    System.out.println(json.writeValueAsString(Map.of(
        "caseId", caseId, "executionId", executionId, "sampleId", sampleId,
        "kind", "checkpoint", "phase", phase, "pid", ProcessHandle.current().pid(),
        "heapUsedBytes", runtime.totalMemory() - runtime.freeMemory(),
        "heapTotalBytes", runtime.totalMemory())));
    if (System.in.read() != '.') throw new IOException("Working-set observer disconnected");
  }
}
