import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.RDFJsonLDDocumentFormat;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.eclipse.rdf4j.rio.helpers.JSONLDSettings;
import org.eclipse.rdf4j.rio.Rio;
import org.eclipse.rdf4j.rio.RDFFormat;
import org.eclipse.rdf4j.rio.helpers.StatementCollector;
import java.io.StringReader;
import no.hasmac.jsonld.loader.HttpLoader;
import no.hasmac.jsonld.loader.DocumentLoaderOptions;

/** Actual Rio context requests. The normal parser path uses its public whitelist
 * directly, because OWLAPI forwards only getSupportedSettings(), which omits it.
 * One manager case independently measures the native loader settings' effect.
 */
public final class ObserveJsonLdTransport {
    static final List<String> events = new ArrayList<>();
    static String base;
    static final Map<String, String> responseFixtures = new HashMap<>();
    static final String contextJson = "{\"@context\":{\"Class\":\"http://www.w3.org/2002/07/owl#Class\"}}";
    static void documentProbe(String name) {
        events.clear();
        String outcome;
        try {
            var document = HttpLoader.defaultInstance().loadDocument(URI.create(base + "/document/" + name), new DocumentLoaderOptions());
            outcome = "RETURN:" + Base64.getEncoder().encodeToString(document.getJsonContent().orElseThrow().toString().getBytes(StandardCharsets.UTF_8))
                + ";base=" + document.getDocumentUrl().getPath() + ";context=" + (document.getContextUrl() == null ? "none" : document.getContextUrl().getPath());
        } catch (Throwable failure) { outcome = "THROW:" + failure.getClass().getSimpleName(); }
        System.out.println("document-" + name + "\t" + outcome + "\t" + events.size() + "\t" + String.join(" ", events) + "\t" + responseFixtures.get("/document/" + name));
    }
    static void readerProbe() {
        var manager = OWLManager.createOWLOntologyManager();
        String text = "{\"@id\":\"urn:jsonld:A\",\"@type\":\"http://www.w3.org/2002/07/owl#Class\"} trailing-content";
        try {
            var ontology = manager.loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:owned:reader"), new RDFJsonLDDocumentFormat(), null));
            System.out.println("reader-first-structure\tRETURN:" + ontology.getAxiomCount());
        } catch (Throwable failure) { System.out.println("reader-first-structure\tTHROW:" + failure.getClass().getSimpleName()); }
    }
    static void probe(String name, String path, OWLOntologyLoaderConfiguration config) {
        events.clear();
        var context = base + path;
        var format = new RDFJsonLDDocumentFormat();
        String outcome;
        try {
            String json = "{\"@context\":\"" + context + "\",\"@id\":\"urn:owned:C\",\"@type\":\"Class\"}";
            if (name.equals("context-native-settings")) {
                // This isolated JVM authorizes the owned test server. It does not
                // change the library or qualify a new production policy surface.
                System.setProperty(JSONLDSettings.SECURE_MODE.getKey(), "false");
                try {
                    var ontology = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(json, IRI.create("urn:owned:root"), format, null), config);
                    outcome = "RETURN:" + ontology.getAxiomCount();
                } finally { System.clearProperty(JSONLDSettings.SECURE_MODE.getKey()); }
            } else {
                var parser = Rio.createParser(RDFFormat.JSONLD);
                parser.getParserConfig().set(JSONLDSettings.WHITELIST, Set.of(context));
                var collector = new StatementCollector(); parser.setRDFHandler(collector);
                parser.parse(new StringReader(json), "urn:owned:root");
                outcome = "RETURN:" + collector.getStatements().size();
            }
        } catch (Throwable failure) { outcome = "THROW:" + failure.getClass().getSimpleName(); }
        System.out.println(name + "\t" + outcome + "\t" + events.size() + "\t" + String.join(" ", events));
    }
    public static void main(String[] arguments) throws Exception {
        var ownedFile = java.nio.file.Path.of(arguments[0]).resolve("jsonld-file-encoding.jsonld");
        try {
            java.nio.file.Files.write(ownedFile, (contextJson + " trailing").getBytes(StandardCharsets.UTF_16LE));
            var document = new no.hasmac.jsonld.loader.FileLoader().loadDocument(ownedFile.toUri(), new DocumentLoaderOptions());
            System.out.println("file-first-structure-utf16le\tRETURN:" + document.getJsonContent().orElseThrow());
        } finally { java.nio.file.Files.deleteIfExists(ownedFile); }
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            events.add(path + "[auth=" + Objects.toString(exchange.getRequestHeaders().getFirst("Authorization"), "none") + ";accept=" + exchange.getRequestHeaders().getFirst("Accept") + ";encoding=" + exchange.getRequestHeaders().getFirst("Accept-Encoding") + "]");
            int status = 200;
            if (path.startsWith("/redirect/")) {
                String[] parts = path.split("/"); status = Integer.parseInt(parts[2]);
                int remaining = Integer.parseInt(parts[3]);
                exchange.getResponseHeaders().set("Location", remaining == 1 ? "/final" : "/redirect/" + status + "/" + (remaining - 1));
            } else if (path.startsWith("/status/")) status = Integer.parseInt(path.substring(8));
            else if (path.equals("/loop")) { status = 302; exchange.getResponseHeaders().set("Location", "/loop"); }
            exchange.getResponseHeaders().set("Content-Type", "application/ld+json");
            byte[] bytes = contextJson.getBytes(StandardCharsets.UTF_8);
            if (path.startsWith("/document/")) {
                String name = path.substring("/document/".length());
                if (name.equals("missing-type")) exchange.getResponseHeaders().remove("Content-Type");
                if (name.equals("text-type") || name.startsWith("alternate")) exchange.getResponseHeaders().set("Content-Type", "text/plain");
                if (name.equals("json-type") || name.startsWith("context-link")) exchange.getResponseHeaders().set("Content-Type", "application/json");
                if (name.equals("suffix-type")) exchange.getResponseHeaders().set("Content-Type", "application/problem+json");
                if (name.equals("alternate")) exchange.getResponseHeaders().set("Link", "</document/json-type>; rel=\"alternate\"; type=\"application/ld+json\"");
                if (name.equals("alternate-loop")) exchange.getResponseHeaders().set("Link", "</document/alternate-loop>; rel=\"alternate\"; type=\"application/ld+json\"");
                if (name.equals("alternate-rel-list")) exchange.getResponseHeaders().set("Link", "</document/json-type>; rel=\"next alternate\"; type=\"application/ld+json\"");
                if (name.equals("context-link") || name.equals("ld-context-link")) exchange.getResponseHeaders().set("Link", "</document/json-type>; rel=\"http://www.w3.org/ns/json-ld#context\"");
                if (name.equals("context-link-multiple")) exchange.getResponseHeaders().set("Link", "</one>; rel=\"http://www.w3.org/ns/json-ld#context\", </two>; rel=\"http://www.w3.org/ns/json-ld#context\"");
                if (name.equals("utf8-bom")) bytes = ("\uFEFF" + contextJson).getBytes(StandardCharsets.UTF_8);
                if (name.equals("utf16le")) bytes = contextJson.getBytes(StandardCharsets.UTF_16LE);
                if (name.equals("utf16be")) bytes = contextJson.getBytes(StandardCharsets.UTF_16BE);
                if (name.equals("utf32le")) bytes = contextJson.getBytes(java.nio.charset.Charset.forName("UTF-32LE"));
                if (name.equals("utf32be")) bytes = contextJson.getBytes(java.nio.charset.Charset.forName("UTF-32BE"));
                if (name.equals("wrong-charset")) exchange.getResponseHeaders().set("Content-Type", "application/ld+json; charset=UTF-16");
                if (name.equals("trailing-content")) bytes = (contextJson + " this is not JSON").getBytes(StandardCharsets.UTF_8);
                if (name.equals("invalid-json")) bytes = "invalid-json".getBytes(StandardCharsets.UTF_8);
                if (name.equals("scalar")) bytes = "42".getBytes(StandardCharsets.UTF_8);
                if (name.equals("invalid-utf8")) bytes = new byte[] {123, 34, 120, 34, 58, 34, (byte) 0xC3, 34, 125};
                if (name.equals("gzip")) {
                    var compressed = new java.io.ByteArrayOutputStream();
                    try (var gzip = new java.util.zip.GZIPOutputStream(compressed)) { gzip.write(bytes); }
                    bytes = compressed.toByteArray(); exchange.getResponseHeaders().set("Content-Encoding", "gzip");
                }
            }
            responseFixtures.put(path, String.join("\t", Base64.getEncoder().encodeToString(bytes), Objects.toString(exchange.getResponseHeaders().getFirst("Content-Type"), ""), Objects.toString(exchange.getResponseHeaders().getFirst("Link"), ""), Objects.toString(exchange.getResponseHeaders().getFirst("Content-Encoding"), "")));
            exchange.sendResponseHeaders(status, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start(); base = "http://127.0.0.1:" + server.getAddress().getPort();
        try {
            var config = new OWLOntologyLoaderConfiguration();
            probe("context-default", "/default", config);
            probe("context-native-settings", "/settings", config.setConnectionTimeout(-1).setRetriesToAttempt(0).setFollowRedirects(false).setAuthorizationValue("Bearer owned-test-token").setAcceptingHTTPCompression(false));
            for (int status : List.of(301, 302, 303, 307, 308)) probe("context-redirect-" + status, "/redirect/" + status + "/1", config.setFollowRedirects(false));
            for (int count : List.of(9, 10, 11)) probe("context-redirect-count-" + count, "/redirect/302/" + count, config);
            for (int status : List.of(203, 201, 404, 503)) probe("context-status-" + status, "/status/" + status, config);
            probe("context-loop", "/loop", config);
            probe("context-linked-remote", "/document/context-link", config);
            readerProbe();
            for (String name : List.of("json-type", "suffix-type", "text-type", "missing-type", "alternate", "alternate-loop", "alternate-rel-list", "context-link", "context-link-multiple", "ld-context-link", "utf8-bom", "utf16le", "utf16be", "utf32le", "utf32be", "wrong-charset", "trailing-content", "invalid-json", "scalar", "invalid-utf8", "gzip")) documentProbe(name);
        } finally { server.stop(0); }
    }
}
