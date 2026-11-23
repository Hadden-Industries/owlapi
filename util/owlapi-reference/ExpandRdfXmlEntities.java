import java.io.FilterOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import javax.xml.XMLConstants;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.sax.SAXTransformerFactory;
import javax.xml.transform.sax.TransformerHandler;
import javax.xml.transform.stream.StreamResult;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.ext.DefaultHandler2;
import org.xml.sax.helpers.XMLFilterImpl;

/** Produce a UTF-8 RDF/XML fixture with its internal XML entities resolved. */
public final class ExpandRdfXmlEntities {
    private ExpandRdfXmlEntities() {}

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 6) {
            throw new IllegalArgumentException("Expected input, output, output byte limit, "
                + "entity count limit, total entity size limit, and measurement flag");
        }
        long outputLimit = positive(arguments[2]);
        int entityCount = positive(arguments[3]);
        int entitySize = positive(arguments[4]);
        boolean measure = switch (arguments[5]) {
            case "measure" -> true;
            case "convert" -> false;
            default -> throw new IllegalArgumentException("Unknown XML expansion operation");
        };

        var sax = SAXParserFactory.newDefaultInstance();
        sax.setNamespaceAware(true);
        sax.setXIncludeAware(false);
        sax.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        sax.setFeature("http://xml.org/sax/features/external-general-entities", false);
        sax.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        sax.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        var reader = sax.newSAXParser().getXMLReader();
        reader.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        reader.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        reader.setProperty("jdk.xml.entityExpansionLimit", Integer.toString(entityCount));
        reader.setProperty("jdk.xml.totalEntitySizeLimit", Integer.toString(entitySize));
        if (measure) {
            reader.setProperty("http://www.oracle.com/xml/jaxp/properties/getEntityCountInfo", "yes");
        }

        var transformers = (SAXTransformerFactory) TransformerFactory.newDefaultInstance();
        transformers.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        transformers.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        transformers.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
        TransformerHandler writer = transformers.newTransformerHandler();
        writer.getTransformer().setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        writer.getTransformer().setOutputProperty(OutputKeys.INDENT, "no");
        writer.getTransformer().setOutputProperty("{http://xml.apache.org/xalan}line-separator", "\n");

        var guard = new XmlEvents(writer);
        reader.setEntityResolver(guard);
        reader.setDTDHandler(guard);
        reader.setErrorHandler(guard);
        reader.setProperty("http://xml.org/sax/properties/lexical-handler", guard);
        reader.setProperty("http://xml.org/sax/properties/declaration-handler", guard);
        var content = new XMLFilterImpl() {
            @Override
            public void skippedEntity(String name) throws SAXException {
                throw new SAXException("An XML entity was not resolved");
            }
        };
        content.setContentHandler(writer);
        reader.setContentHandler(content);
        try (var input = Files.newInputStream(Path.of(arguments[0]));
            var output = new BoundedOutput(
                Files.newOutputStream(Path.of(arguments[1]), StandardOpenOption.CREATE_NEW),
                outputLimit)) {
            writer.setResult(new StreamResult(output));
            reader.parse(new InputSource(input));
        }
    }

    private static int positive(String value) {
        int number = Integer.parseInt(value);
        if (number <= 0) throw new IllegalArgumentException("XML limits must be positive");
        return number;
    }

    private static final class XmlEvents extends DefaultHandler2 {
        private final TransformerHandler writer;
        private boolean inDtd;

        XmlEvents(TransformerHandler writer) {
            this.writer = writer;
        }

        @Override
        public void startDTD(String name, String publicId, String systemId) throws SAXException {
            if (publicId != null || systemId != null) throw externalResource();
            inDtd = true;
        }

        @Override
        public void endDTD() {
            inDtd = false;
        }

        @Override
        public void externalEntityDecl(String name, String publicId, String systemId)
            throws SAXException {
            throw externalResource();
        }

        @Override
        public void unparsedEntityDecl(String name, String publicId, String systemId,
            String notation) throws SAXException {
            throw externalResource();
        }

        @Override
        public InputSource resolveEntity(String publicId, String systemId) throws SAXException {
            throw externalResource();
        }

        @Override
        public InputSource resolveEntity(String name, String publicId, String baseURI,
            String systemId) throws SAXException {
            throw externalResource();
        }

        private static SAXException externalResource() {
            return new SAXException("The RDF/XML fixture contains an external XML resource");
        }

        @Override
        public void comment(char[] chars, int start, int length) throws SAXException {
            if (!inDtd) writer.comment(chars, start, length);
        }

        @Override
        public void startCDATA() throws SAXException {
            writer.startCDATA();
        }

        @Override
        public void endCDATA() throws SAXException {
            writer.endCDATA();
        }

        @Override
        public void error(SAXParseException failure) throws SAXException {
            throw failure;
        }

        @Override
        public void fatalError(SAXParseException failure) throws SAXException {
            throw failure;
        }
    }

    private static final class BoundedOutput extends FilterOutputStream {
        private long remaining;

        BoundedOutput(OutputStream output, long limit) {
            super(output);
            remaining = limit;
        }

        private void consume(int length) throws IOException {
            if (length > remaining) throw new IOException("RDF/XML output exceeds its byte limit");
            remaining -= length;
        }

        @Override
        public void write(int value) throws IOException {
            consume(1);
            out.write(value);
        }

        @Override
        public void write(byte[] bytes, int offset, int length) throws IOException {
            consume(length);
            out.write(bytes, offset, length);
        }
    }
}
