import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runJavaObservation } from "./run-java-observation.mjs";
import { observeCurrentJavaToolchain } from "../../scripts/java-toolchain.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [classpathFile, outputDirectory] = process.argv.slice(2);
if (!classpathFile || !outputDirectory)
  throw new Error(
    "Usage: replay-selected-parity.mjs CLASSPATH_FILE OUTPUT_DIRECTORY",
  );
const output = resolve(outputDirectory);
const javaToolchain = observeCurrentJavaToolchain();
mkdirSync(output, { recursive: true });
const classpath = readFileSync(classpathFile, "utf8").trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const fixture = JSON.parse(
  readFileSync(join(here, "fixtures/rc2/query-observations.json")),
);
if (typeof fixture.input !== "string" || !fixture.input.includes("Ontology("))
  throw new Error("Selected query fixture has no ontology input");
const input = join(output, "selected-ontology.ofn");
writeFileSync(input, fixture.input);
const profileOutput = join(output, "RunRC2Profiles.json");
const outputFor = (name) => join(output, `${name}.json`);
const jobs = [
  ["RunRC2Profiles", [profileOutput], [profileOutput]],
  [
    "RunRC2QueryMatrix",
    [input, outputFor("RunRC2QueryMatrix")],
    [outputFor("RunRC2QueryMatrix")],
  ],
  [
    "RunRC2Search",
    [input, outputFor("RunRC2Search")],
    [outputFor("RunRC2Search")],
  ],
  [
    "RunRC2Providers",
    [outputFor("RunRC2Providers")],
    [outputFor("RunRC2Providers")],
  ],
  ["RunRC2Renderer", [input], []],
  [
    "RunRC2Locality",
    [input, outputFor("RunRC2Locality"), profileOutput],
    [outputFor("RunRC2Locality")],
  ],
  [
    "RunRC2LocalityFixedPoints",
    [outputFor("RunRC2LocalityFixedPoints")],
    [outputFor("RunRC2LocalityFixedPoints")],
  ],
  [
    "RunRC2TransformsMatrix",
    [outputFor("RunRC2TransformsMatrix")],
    [outputFor("RunRC2TransformsMatrix")],
  ],
  ["RunRC2ParityEdges", [], []],
  ["RunRC2Queries", [], []],
  ["RunRC2Changes", [], []],
  [
    "RunRC2Storage",
    [input, "OWL_XML", join(output, "selected.owl.xml")],
    [join(output, "selected.owl.xml")],
  ],
  [
    "RunRC2Storage",
    [input, "TURTLE", join(output, "selected.ttl")],
    [join(output, "selected.ttl")],
  ],
  [
    "RunRC2Storage",
    [
      input,
      "OWL_XML",
      join(output, "selected-https.owl.xml"),
      "HTTPS_ONTOLOGY_IRI",
    ],
    [join(output, "selected-https.owl.xml")],
  ],
  [
    "RunRC2Storage",
    [input, "TURTLE", join(output, "selected-https.ttl"), "HTTPS_ONTOLOGY_IRI"],
    [join(output, "selected-https.ttl")],
  ],
];
const observations = [];
const normalize = (text) =>
  text.replaceAll("\r\n", "\n").replaceAll(output, "${PROBE_WORKSPACE}");
for (const [name, args, files] of jobs) {
  const sourcePath = join(here, `${name}.java`);
  for (const file of files) if (existsSync(file)) unlinkSync(file);
  const result = runJavaObservation({
    classpath,
    sourcePath,
    arguments: args,
    outputDirectory: output,
  });
  const expectedUrnRoundTripFailure =
    name === "RunRC2Storage" && args[1] === "OWL_XML" && args.length === 3;
  const matchesExpectedCompletion =
    !result.error &&
    result.signal === null &&
    (expectedUrnRoundTripFailure
      ? result.status === 1 &&
        result.stderr.includes(
          "org.semanticweb.owlapi.io.UnparsableOntologyException",
        ) &&
        result.stderr.includes("Expected scheme name at index 0: :A")
      : result.status === 0);
  observations.push({
    probeId: name,
    sourceSha256: hash(readFileSync(sourcePath)),
    arguments: args.map(normalize),
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    stdout: normalize(result.stdout ?? ""),
    stderr: normalize(result.stderr ?? ""),
    matchesExpectedCompletion,
    expectedCompletion: expectedUrnRoundTripFailure
      ? "OWL/XML URN-relative-IRI round-trip exception"
      : "normal return",
    outputs: files.filter(existsSync).map((path) => ({
      name: basename(path),
      content: normalize(readFileSync(path, "utf8")),
    })),
  });
  writeFileSync(
    join(output, "observations.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        javaToolchain,
        authorityNote:
          "Legacy sourceRevision/javaCommit strings emitted by retained probes are historical labels. The recorded runtime classpath identifies this execution.",
        ontologyInputSha256: hash(fixture.input),
        classpathEntries: classpath.split(delimiter).map((path) => ({
          name: basename(path),
          sha256: hash(readFileSync(path)),
        })),
        observations,
      },
      null,
      2,
    ) + "\n",
  );
  if (!matchesExpectedCompletion)
    throw new Error(
      `${name} produced an unclassified outcome: ${result.stderr}`,
    );
  process.stderr.write(`${name}: captured\n`);
}
