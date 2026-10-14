import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.io.*;
import java.util.zip.*;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.OWLXMLDocumentFormat;
import org.semanticweb.owlapi.io.*;
import org.semanticweb.owlapi.model.*;

/** Actual loopback sockets and an owned file; no URLConnection test double. */
public final class ObserveNetworkContracts {
    static final List<String> events = new CopyOnWriteArrayList<>();
    static String base;
    static String fileIRI;
    static void probe(String name, String path, OWLOntologyLoaderConfiguration configuration) {
        events.clear();
        String outcome;
        try {
            var stream = DocumentSources.getInputStream(IRI.create(base + path), configuration, "text/plain");
            if (stream.isPresent()) try (var input = stream.get()) { outcome = "RETURN:" + new String(input.readAllBytes(), StandardCharsets.UTF_8); }
            else outcome = "EMPTY";
        } catch (Throwable error) { outcome = "THROW:" + error.getClass().getSimpleName(); }
        System.out.println(name + "\t" + outcome + "\t" + String.join(" ", events));
    }
    public static void main(String[] arguments) throws Exception {
        var directory = Path.of(arguments[0]);
        Files.createDirectories(directory);
        var file = directory.resolve("owned-external-entity.txt");
        Files.writeString(file, "owned-file");
        fileIRI = file.toUri().toString();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        var destination = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        destination.setExecutor(executor);
        destination.createContext("/", exchange -> {
            events.add("/crossport-final[auth=" + Objects.toString(exchange.getRequestHeaders().getFirst("Authorization"), "none") + "]");
            exchange.sendResponseHeaders(200, 2);
            try (var output = exchange.getResponseBody()) { output.write("ok".getBytes(StandardCharsets.UTF_8)); }
        });
        destination.start();
        String destinationBase = "http://127.0.0.1:" + destination.getAddress().getPort();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/", exchange -> {
            var path = exchange.getRequestURI().getPath();
            events.add(path + "[auth=" + Objects.toString(exchange.getRequestHeaders().getFirst("Authorization"), "none") + "]");
            int status = 200;
            String content = "ok";
            if (path.startsWith("/redirect/")) {
                var parts = path.split("/");
                status = Integer.parseInt(parts[2]);
                int remaining = Integer.parseInt(parts[3]);
                exchange.getResponseHeaders().set("Location", remaining == 1 ? base + "/ok" : base + "/redirect/" + status + "/" + (remaining - 1));
                content = "redirect-body";
            } else if (path.equals("/file")) {
                status = 308; exchange.getResponseHeaders().set("Location", fileIRI); content = "redirect-body";
            } else if (path.equals("/relative")) {
                status = 308; exchange.getResponseHeaders().set("Location", "/ok"); content = "redirect-body";
            } else if (path.equals("/loop")) {
                status = 308; exchange.getResponseHeaders().set("Location", base + "/loop"); content = "redirect-body";
            } else if (path.startsWith("/crossport/")) {
                status = Integer.parseInt(path.substring("/crossport/".length()));
                exchange.getResponseHeaders().set("Location", destinationBase + "/final"); content = "redirect-body";
            } else if (path.equals("/headers")) {
                content = exchange.getRequestHeaders().getFirst("Accept") + "|" + Objects.toString(exchange.getRequestHeaders().getFirst("Accept-Encoding"), "none");
            } else if (path.equals("/relative/rdf")) {
                status = 302; exchange.getResponseHeaders().set("Location", base + "/base/final.rdf"); content = "redirect-body";
            } else if (path.equals("/base/final.rdf")) {
                content = "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#' xmlns:owl='http://www.w3.org/2002/07/owl#'><owl:Class rdf:about='C'/></rdf:RDF>";
            } else if (path.equals("/error")) status = 503;
            var bytes = content.getBytes(StandardCharsets.UTF_8);
            if (List.of("/gzip", "/deflate", "/xz").contains(path)) {
                var buffer = new ByteArrayOutputStream();
                try (OutputStream compressed = path.equals("/gzip") ? new GZIPOutputStream(buffer)
                    : path.equals("/deflate") ? new DeflaterOutputStream(buffer, new Deflater(Deflater.DEFAULT_COMPRESSION, true))
                    : new org.tukaani.xz.XZOutputStream(buffer, new org.tukaani.xz.LZMA2Options())) { compressed.write(bytes); }
                bytes = buffer.toByteArray();
                exchange.getResponseHeaders().set("Content-Encoding", path.substring(1));
            }
            exchange.getResponseHeaders().set("Content-Type", "text/plain");
            exchange.sendResponseHeaders(status, bytes.length);
            if (path.equals("/slow-body")) try { Thread.sleep(80); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        try {
            var defaults = new OWLOntologyLoaderConfiguration();
            String numericBase = base; base = base.replace("127.0.0.1", "localhost");
            probe("hostname-localhost", "/ok", defaults); base = numericBase;
            for (int attempts : List.of(-1, 0, 1, 2, 5, 6)) probe("attempts-" + attempts, "/ok", defaults.setRetriesToAttempt(attempts));
            for (int timeout : List.of(-1, 0, 5)) probe("connect-timeout-" + timeout, "/slow-body", defaults.setConnectionTimeout(timeout));
            for (int status : List.of(301, 302, 303, 307, 308)) for (boolean follow : List.of(false, true)) probe("redirect-" + status + "-" + follow, "/redirect/" + status + "/1", defaults.setFollowRedirects(follow).setAuthorizationValue("Bearer owned-test-token"));
            for (int status : List.of(302, 308)) for (int length : List.of(10, 19, 20, 21)) probe("redirect-chain-" + status + "-" + length, "/redirect/" + status + "/" + length, defaults);
            probe("redirect-relative", "/relative", defaults);
            probe("redirect-loop", "/loop", defaults);
            probe("redirect-file", "/file", defaults);
            probe("status-503", "/error", defaults);
            for (int status : List.of(302, 308)) probe("cross-port-" + status, "/crossport/" + status, defaults.setAuthorizationValue("Bearer owned-test-token"));
            probe("headers-defaults", "/headers", defaults);
            probe("headers-no-compression", "/headers", defaults.setAcceptingHTTPCompression(false));
            for (String encoding : List.of("gzip", "deflate", "xz")) probe("encoding-" + encoding, "/" + encoding, defaults);
            var redirectedOntology = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(IRI.create(base + "/relative/rdf"));
            System.out.println("redirect-rdf-base\t" + redirectedOntology.classesInSignature().findFirst().get().getIRI().toString().replace(base, "${HTTP_BASE}"));
            for (String declaration : List.of("<!ENTITY e SYSTEM '" + fileIRI + "'>", "<!ENTITY e SYSTEM '" + base + "/external'>")) {
                events.clear();
                String text = "<!DOCTYPE Ontology [" + declaration + "]><Ontology xmlns='http://www.w3.org/2002/07/owl#'><Annotation><AnnotationProperty IRI='urn:p'/><Literal>&e;</Literal></Annotation></Ontology>";
                var ontology = OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:external:test"), new OWLXMLDocumentFormat(), null));
                var literal = (OWLLiteral) ontology.annotations().findFirst().get().getValue();
                System.out.println("external-" + (declaration.contains("file:") ? "file" : "http") + "\tRETURN:" + literal.getLiteral() + "\t" + events.size());
            }
            events.clear();
            String text = "<!DOCTYPE Ontology SYSTEM '" + base + "/dtd'><Ontology xmlns='http://www.w3.org/2002/07/owl#'/>";
            OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(text, IRI.create("urn:external:dtd"), new OWLXMLDocumentFormat(), null));
            System.out.println("external-dtd\tRETURN\t" + events.size());
        } finally { server.stop(0); destination.stop(0); executor.close(); }
    }
}
