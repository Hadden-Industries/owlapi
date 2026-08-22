import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";
import { detectKRSSDialect } from "../krss/detection.js";

import { OWLKRSS1SyntaxOWLParser } from "./parser.js";

export const detectKRSS1 = (source) => detectKRSSDialect(source, "krss1");

export const krss1ParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLKRSS1SyntaxOWLParser(),
  detect: detectKRSS1,
  format: OWLDocumentFormats.KRSS1,
  id: "owl-krss1",
  priority: 15,
  supportsCompatibleRecovery: true,
});
