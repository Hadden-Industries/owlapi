import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class RunWithClasspath {
    private RunWithClasspath() {}

    public static void main(String[] arguments) throws Exception {
        if (arguments.length < 3) {
            throw new IllegalArgumentException(
                "Usage: RunWithClasspath <classpath-file> <extra-entry> <main-class> [args...]"
            );
        }
        String classpath = arguments[1] + System.getProperty("path.separator")
            + Files.readString(Path.of(arguments[0])).trim();
        List<String> command = new ArrayList<>();
        boolean compiler = "com.sun.tools.javac.Main".equals(arguments[2]);
        if (compiler) {
            // java and javac can resolve from different installations on
            // Windows (including a JRE-only java). Invoke the working compiler
            // shim and carry the long classpath in its environment instead.
            command.add("javac");
        } else {
            command.add(Path.of(System.getProperty("java.home"), "bin", "java").toString());
            command.add("-cp");
            command.add(classpath);
            command.add(arguments[2]);
        }
        command.addAll(Arrays.asList(arguments).subList(3, arguments.length));
        ProcessBuilder process = new ProcessBuilder(command).inheritIO();
        if (compiler) {
            process.environment().put("CLASSPATH", classpath);
        }
        System.exit(process.start().waitFor());
    }
}
