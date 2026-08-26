import { OWLDocumentFormats } from "../../../formats/owlDocumentFormats.js";
import { ParserDescriptor } from "../parserRegistry.js";
import { detectKRSSDialect } from "../krss/detection.js";

import { OWLKRSS2SyntaxOWLParser } from "./parser.js";

export const detectKRSS2 = (source) => detectKRSSDialect(source, "krss2");

export const krss2ParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLKRSS2SyntaxOWLParser(),
  detect: detectKRSS2,
  format: OWLDocumentFormats.KRSS2,
  id: "owl-krss2",
  priority: 16,
  supportsCompatibleRecovery: true,
});
