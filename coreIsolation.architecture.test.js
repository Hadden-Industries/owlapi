import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `owlapi-js` is a general-purpose OWL library governed by the W3C OWL 2
// specifications. It is intended for extraction as a standalone package, so it
// must know nothing about VOWL, about WebVOWL, or about the visualization that
// consumes it. Section 15.1 puts the VOWL knowledge in `VOWLBuilder`, on the
// WebVOWL side of the seam.
//
// `vowlBuilder.architecture.test.js` guards the seam in one direction: the
// builder may not reach parsers or RDF modules. Nothing guarded the other
// direction, and that boundary is easy to erode by a single well-meaning import
// or helper. This test closes that gap.
const LIBRARY_ROOT = path.dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_TERM = /\bvowl\b/iu;
const RELATIVE_SPECIFIER =
  /(?:from|import|require)\s*\(?\s*["'](\.[^"']*)["']/gu;

const sourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(absolutePath);
    }
    return entry.name.endsWith(".js") ? [absolutePath] : [];
  });

const relative = (absolutePath) =>
  path.relative(LIBRARY_ROOT, absolutePath).replaceAll("\\", "/");

const SHIPPED_SOURCE_ROOTS = [
  "apibinding",
  "formats",
  "internal",
  "io",
  "model",
];

// Scan exactly the JavaScript admitted by the package manifest. Repository
// tooling, fixtures and installed dependencies are not package source; the root
// facade is included explicitly because it sits outside the namespace roots.
const productionFiles = [
  path.join(LIBRARY_ROOT, "index.js"),
  ...SHIPPED_SOURCE_ROOTS.flatMap((directory) =>
    sourceFiles(path.join(LIBRARY_ROOT, directory)),
  ),
].filter((filePath) => !filePath.endsWith(".test.js"));

const escapesLibrary = (filePath, specifier) => {
  const resolved = path.resolve(path.dirname(filePath), specifier);
  const relativeToRoot = path.relative(LIBRARY_ROOT, resolved);
  return relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot);
};

describe("owlapi-js core isolation", () => {
  it("scans a non-empty set of library sources", () => {
    expect(productionFiles.length).toBeGreaterThan(20);
  });

  it("never mentions VOWL in a shipped module", () => {
    const offenders = productionFiles
      .filter((filePath) => FORBIDDEN_TERM.test(readFileSync(filePath, "utf8")))
      .map(relative);

    expect(offenders).toEqual([]);
  });

  it("never imports from outside its own tree", () => {
    const offenders = [];
    for (const filePath of productionFiles) {
      const source = readFileSync(filePath, "utf8");
      for (const match of source.matchAll(RELATIVE_SPECIFIER)) {
        if (escapesLibrary(filePath, match[1])) {
          offenders.push(`${relative(filePath)} -> ${match[1]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
