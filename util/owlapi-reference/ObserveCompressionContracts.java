import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import java.util.concurrent.*;
import org.semanticweb.owlapi.io.DocumentSources;
import org.semanticweb.owlapi.model.*;
import org.tukaani.xz.*;

/** Released-provider bytes and outcomes; encoders are independent of JS decoders. */
public final class ObserveCompressionContracts {
    record Fixture(String name, String suffix, String encoding, String disposition, byte[] bytes) {}
    static byte[] gzip(byte[] bytes) throws Exception {
        var output = new ByteArrayOutputStream();
        try (var stream = new GZIPOutputStream(output)) { stream.write(bytes); }
        return output.toByteArray();
    }
    static byte[] xz(byte[] bytes, int check) throws Exception {
        var output = new ByteArrayOutputStream();
        try (var stream = new XZOutputStream(output, new LZMA2Options(), check)) { stream.write(bytes); }
        return output.toByteArray();
    }
    static byte[] join(byte[] first, byte[] second) throws Exception {
        var output = new ByteArrayOutputStream(); output.write(first); output.write(second); return output.toByteArray();
    }
    static byte[] zip(boolean directoryFirst, boolean stored) throws Exception {
        var output = new ByteArrayOutputStream();
        try (var stream = new ZipOutputStream(output)) {
            for (String name : directoryFirst ? List.of("folder/", "second.owl") : List.of("first.txt", "second.owl")) {
                var bytes = (name.endsWith("/") ? "" : name.startsWith("first") ? "first" : "second").getBytes(StandardCharsets.UTF_8);
                var entry = new ZipEntry(name); entry.setTimeLocal(java.time.LocalDateTime.of(1980, 1, 1, 0, 0));
                if (stored) { var crc = new CRC32(); crc.update(bytes); entry.setMethod(ZipEntry.STORED); entry.setSize(bytes.length); entry.setCrc(crc.getValue()); }
                stream.putNextEntry(entry); stream.write(bytes); stream.closeEntry();
            }
        }
        return output.toByteArray();
    }
    public static void main(String[] arguments) throws Exception {
        var ok = "ok".getBytes(StandardCharsets.UTF_8);
        var bom = join(new byte[] {(byte) 0xef, (byte) 0xbb, (byte) 0xbf}, ok);
        var gz = gzip(ok); var compressed = xz(ok, XZ.CHECK_CRC64);
        var brokenGzip = gz.clone(); brokenGzip[brokenGzip.length - 8] ^= 1;
        var brokenXz = compressed.clone(); brokenXz[compressed.length - 24] ^= 1;
        var storedZip = zip(false, true); var brokenZip = storedZip.clone(); brokenZip[14] ^= 1;
        var fixtures = List.of(
            new Fixture("plain-bom", "", "", "", bom),
            new Fixture("gzip", "", "gzip", "", gz),
            new Fixture("gzip-concatenated", "", "gzip", "", join(gz, gz)),
            new Fixture("gzip-crc", "", "gzip", "", brokenGzip),
            new Fixture("gzip-truncated", "", "gzip", "", Arrays.copyOf(gz, gz.length - 2)),
            new Fixture("gzip-bom", "", "gzip", "", gzip(bom)),
            new Fixture("gzip-filename", ".gz", "", "", gz),
            new Fixture("gzip-filename-bom", ".gz", "", "", gzip(bom)),
            new Fixture("gzip-double", ".gz", "gzip", "", gzip(gz)),
            new Fixture("gzip-disposition", "", "", "attachment; filename=\"owned.gz\"", gz),
            new Fixture("xz-none", "", "xz", "", xz(ok, XZ.CHECK_NONE)),
            new Fixture("xz-crc32", "", "xz", "", xz(ok, XZ.CHECK_CRC32)),
            new Fixture("xz-crc64", "", "xz", "", compressed),
            new Fixture("xz-sha256", "", "xz", "", xz(ok, XZ.CHECK_SHA256)),
            new Fixture("xz-concatenated", "", "xz", "", join(compressed, compressed)),
            new Fixture("xz-crc", "", "xz", "", brokenXz),
            new Fixture("xz-truncated", "", "xz", "", Arrays.copyOf(compressed, compressed.length - 2)),
            new Fixture("xz-trailing", "", "xz", "", join(compressed, new byte[] {1})),
            new Fixture("xz-filename", ".xz", "", "", compressed),
            new Fixture("zip-first", ".zip", "", "", zip(false, false)),
            new Fixture("zip-directory", ".zip", "", "", zip(true, false)),
            new Fixture("zip-stored", ".zip", "", "", storedZip),
            new Fixture("zip-crc", ".zip", "", "", brokenZip),
            new Fixture("zip-no-central-directory", ".zip", "", "", Arrays.copyOf(storedZip, 53)),
            new Fixture("zip-open-tail", ".zip", "", "", Arrays.copyOf(storedZip, 53)),
            new Fixture("zip-truncated-header", ".zip", "", "", Arrays.copyOf(storedZip, 44)),
            new Fixture("zip-not-zip", ".zip", "", "", ok)
        );
        var tailRelease = new CountDownLatch(1);
        var tailClosed = new java.util.concurrent.atomic.AtomicBoolean(false);
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String name = exchange.getRequestURI().getPath().substring(1);
            var fixture = fixtures.stream().filter(f -> (f.name() + f.suffix()).equals(name)).findFirst().get();
            if (!fixture.encoding().isEmpty()) exchange.getResponseHeaders().set("Content-Encoding", fixture.encoding());
            if (!fixture.disposition().isEmpty()) exchange.getResponseHeaders().set("Content-Disposition", fixture.disposition());
            boolean openTail = fixture.name().equals("zip-open-tail");
            exchange.sendResponseHeaders(200, openTail ? 0 : fixture.bytes().length);
            try (var output = exchange.getResponseBody()) {
                output.write(fixture.bytes()); output.flush();
                if (openTail) try { tailRelease.await(5, TimeUnit.SECONDS); tailClosed.set(true); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            }
        });
        server.start();
        try {
            for (var fixture : fixtures) {
                String outcome;
                try (var input = DocumentSources.getInputStream(IRI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/" + fixture.name() + fixture.suffix()), new OWLOntologyLoaderConfiguration(), "text/plain").get()) {
                    outcome = "RETURN:" + Base64.getEncoder().encodeToString(input.readAllBytes());
                    if (fixture.name().equals("zip-open-tail") && tailClosed.get()) throw new AssertionError("The first ZIP entry waited for the HTTP tail");
                } catch (Throwable failure) { outcome = "THROW:" + failure.getClass().getSimpleName(); }
                finally { if (fixture.name().equals("zip-open-tail")) tailRelease.countDown(); }
                System.out.println(String.join("\t", fixture.name(), fixture.suffix(), fixture.encoding(), fixture.disposition(), Base64.getEncoder().encodeToString(fixture.bytes()), outcome));
            }
        } finally { server.stop(0); }
    }
}
