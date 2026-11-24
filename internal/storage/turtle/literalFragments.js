import { chunksOf } from "../../parsing/rdf/streamPrimitives.js";
import { rdfDataFactory as data } from "../../rdfjs/environment.js";
import { XSD_NAMESPACE } from "../../rdfjs/vocabulary.js";

const fragmentLength = 8192;
const suffix = " .\n";
const emptyString = data.literal("");
const probeSubject = data.namedNode("urn:owlapi:lexical-subject");
const probePredicate = data.namedNode("urn:owlapi:lexical");
const abbreviations = new Set(
  ["integer", "decimal", "double"].map((name) => XSD_NAMESPACE + name),
);

/** A long boolean or a numeric value containing a nonnumeric character must
 * be quoted. Leave possible integer/decimal/double abbreviations to N3's
 * complete-term decision; this filter never attempts to recognize a number.
 */
export function canFragmentTurtleLiteral(term) {
  return (
    term.termType === "Literal" &&
    term.value.length > fragmentLength &&
    (!abbreviations.has(term.datatype.value) || /[^0-9eE+.-]/u.test(term.value))
  );
}

/** Preserve the active writer's subject/predicate grouping using a real empty
 * string object. Its final pair of quotes is the exact object boundary. A
 * second public quadToString call supplies the native language/datatype suffix.
 * Encoding each complete-code-point slice as an ordinary N3 string reuses the
 * provider's escaping without a private method or a second Turtle grammar.
 */
export function prepareTurtleLiteral(
  writer,
  chunkQueue,
  quad,
  subject,
  line,
  forceXsdString,
) {
  const { object, predicate, graph } = quad;
  let frame;
  if (line) frame = writer.quadToString(subject, predicate, emptyString, graph);
  else {
    writer.addQuad(subject, predicate, emptyString, graph);
    frame = chunkQueue.pop();
  }
  const terminator = line ? suffix : "";
  const prefix = frame.slice(0, -(2 + terminator.length));
  const emptyLine = writer.quadToString(
    probeSubject,
    probePredicate,
    emptyString,
  );
  const bodyStart = emptyLine.length - suffix.length - 1;
  const metadata = writer.quadToString(
    probeSubject,
    probePredicate,
    data.literal(
      "",
      object.language
        ? { language: object.language, direction: object.direction }
        : object.datatype,
    ),
  );
  const datatype =
    forceXsdString && object.datatype.value === XSD_NAMESPACE + "string"
      ? "^^<" + XSD_NAMESPACE + "string>"
      : metadata.slice(bodyStart + 1, -suffix.length);
  return function* fragments() {
    yield prefix + '"';
    // Leave one extra UTF-16 unit for a surrogate pair at a chunk boundary.
    for (const text of chunksOf(object.value, fragmentLength - 1)) {
      const encoded = writer.quadToString(
        probeSubject,
        probePredicate,
        data.literal(text),
      );
      yield encoded.slice(bodyStart, -(suffix.length + 1));
    }
    yield '"' + datatype + terminator;
  };
}
