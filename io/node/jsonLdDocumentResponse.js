import iconv from "iconv-lite";
import processor from "../../internal/parsing/jsonld/provider/jsonld.js";
import { JavaJsonStructureReader } from "../../internal/parsing/jsonld/javaJsonStructure.js";
import { DocumentLoadError, ResourceLimitError } from "../errors.js";

const contextRelation = "http://www.w3.org/ns/json-ld#context";
const mediaType = (header) => header?.split(";", 1)[0].trim().toLowerCase();
const isJsonMediaType = (type) =>
  type === "application/json" || type?.endsWith("+json");

/** Reuse the selected JSON-LD provider's Link parser. Hasmac also treats a
 * whitespace-separated rel list as individual relations. Context links on
 * remote contexts are validated but not applied by its ContextBuilder; passing
 * them to jsonld.js would perform an additional, non-Java context request.
 */
export function jsonLdAlternateDocument(response, documentUrl) {
  const type = mediaType(response.headers["content-type"]);
  const header = response.headers.link;
  const links = header
    ? Object.values(processor.parseLinkHeader(header)).flat()
    : [];
  const hasRelation = (link, relation) =>
    link.rel?.split(/\s+/u).includes(relation);
  if (!isJsonMediaType(type)) {
    const alternate = links.find(
      (link) =>
        hasRelation(link, "alternate") &&
        mediaType(link.type) === "application/ld+json",
    );
    if (alternate) return new URL(alternate.target, documentUrl);
    if (type)
      throw new DocumentLoadError(
        "The Java JSON-LD provider does not accept this media type",
        { phase: "response", contentType: type },
      );
  }
  if (
    type !== "application/ld+json" &&
    isJsonMediaType(type) &&
    links.filter((link) => hasRelation(link, contextRelation)).length > 1
  )
    throw new DocumentLoadError(
      "The JSON-LD response has multiple context Link headers",
      { phase: "response" },
    );
  return undefined;
}

// JSON-P detects these Unicode encodings from bytes, independently of the HTTP
// charset parameter. iconv-lite owns decoding, BOM removal and replacement of
// malformed sequences; this selection is the only provider-specific control.
const jsonEncoding = (prefix) => {
  if (prefix.length >= 4) {
    if (
      prefix.readUInt32BE(0) === 0x0000feff ||
      (prefix[0] === 0 && prefix[1] === 0 && prefix[2] === 0)
    )
      return "utf32-be";
    if (
      prefix.readUInt32LE(0) === 0x0000feff ||
      (prefix[1] === 0 && prefix[2] === 0 && prefix[3] === 0)
    )
      return "utf32-le";
  }
  if (prefix.length >= 2) {
    if (prefix.readUInt16BE(0) === 0xfeff || prefix[0] === 0) return "utf16-be";
    if (prefix.readUInt16LE(0) === 0xfeff || prefix[1] === 0) return "utf16-le";
  }
  return "utf8";
};

/** Decode and validate the first JSON structure, then close its response tail.
 * Java's context loader does not decode HTTP gzip/XZ or filename compression.
 */
export async function readJavaJsonDocument(
  stream,
  maximumBytes,
  resource = "remoteDocumentBytes",
) {
  const reader = new JavaJsonStructureReader();
  let prefix = Buffer.alloc(0);
  let decoder;
  let observed = 0;
  for await (let chunk of stream) {
    observed += chunk.length;
    if (observed > maximumBytes)
      throw new ResourceLimitError("The context byte limit was exceeded", {
        resource,
        limit: maximumBytes,
        observed,
      });
    if (!decoder) {
      prefix = Buffer.concat([prefix, chunk]);
      if (prefix.length < 4) continue;
      decoder = iconv.getDecoder(jsonEncoding(prefix));
      chunk = prefix;
    }
    const document = reader.append(decoder.write(chunk));
    if (document !== undefined) return JSON.stringify(document);
  }
  const finalText = decoder
    ? decoder.end()
    : iconv.decode(prefix, jsonEncoding(prefix));
  return JSON.stringify(reader.append(finalText ?? "") ?? reader.finish());
}
