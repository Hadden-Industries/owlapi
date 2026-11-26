import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import {
  admitReleasedClasspath,
  compileComparisonOracle,
} from "./comparison-oracle.mjs";
import { scopedSwrlCases } from "./scoped-swrl-fixtures.mjs";

const [runDirectory, classpathFile, javaHome, destination] =
  process.argv.slice(2);
if (!destination)
  throw new Error(
    "Supply the comparison run, released classpath file, selected JDK home and a new output directory",
  );
const run = resolve(runDirectory);
const attempt = JSON.parse(await readFile(join(run, "attempt.json"), "utf8"));
const consumer = createRequire(join(run, "consumer", "package.json"));
const api = await import(pathToFileURL(consumer.resolve("owlapi")).href);
const environment = { classpathFile, javaHome, javaHeapMiB: 256 };
const classpath = await admitReleasedClasspath(environment);
const output = resolve(destination);
await mkdir(output);
const native = await compileComparisonOracle(environment, output, classpath);
const fixtures = new Map(
  (await scopedSwrlCases()).map((entry) => [entry.id, entry.text]),
);
const report = {
  tarballSha256: attempt.candidate.tarballSha256,
  oracle: native.identity,
  controls: [],
};

for (const id of ["simple", "changed-head", "edited-annotated"]) {
  const edited = id === "edited-annotated";
  const altered = id === "changed-head";
  const original = fixtures.get(edited ? "annotated" : "simple");
  const fixture = altered
    ? fixtures
        .get("simple-functional")
        .replace("Head(ObjectPropertyAtom(:q", "Head(ObjectPropertyAtom(:p")
    : original;
  const manager = api.OWLManager.createOWLOntologyManager({
    behaviorProfileId: "java-owlapi-5.5.1",
  });
  const format = altered
    ? api.OWLDocumentFormats.FUNCTIONAL
    : api.OWLDocumentFormats.RDF_XML;
  const documentIRI = "urn:owlapi:control:" + id;
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new api.StringDocumentSource(fixture, { format, documentIRI }),
    manager.getOntologyLoaderConfiguration().setStrict(false),
  );
  const [rule] = ontology.getAxiomsByType("SWRLRule");
  assert.equal(ontology.getAxiomsByType("SWRLRule").size, 1);
  assert.equal(rule.annotations.length, edited ? 3 : 0);
  assert.equal(rule.head.length, edited ? 2 : 1);
  if (!edited)
    assert.equal(
      rule.head[0].predicate.iri.value,
      "urn:owlapi:test:swrl#" + (altered ? "p" : "q"),
    );
  if (edited) {
    const factory = manager.getOWLDataFactory();
    manager.addAxiom(
      ontology,
      factory.getOWLDeclarationAxiom(
        factory.getOWLClass(api.IRI.create("urn:owlapi:test:edit")),
      ),
    );
  }
  // The native expected document comes from the hand-authored RDF, including its independently expressed edit.
  const expected = edited
    ? original.replace(
        "</rdf:RDF>",
        '<owl:Class rdf:about="urn:owlapi:test:edit"/></rdf:RDF>',
      )
    : original;
  const directory = join(output, id);
  await mkdir(directory);
  const path = join(directory, "expected.rdf");
  const functionalPath = join(directory, "model.ofn");
  const jsRdfXmlPath = join(directory, "model.rdf");
  await writeFile(path, expected);
  for (const [format, file] of [
    [api.OWLDocumentFormats.FUNCTIONAL, functionalPath],
    [api.OWLDocumentFormats.RDF_XML, jsRdfXmlPath],
  ]) {
    const target = new api.StringDocumentTarget();
    await manager.saveOntology(ontology, format, target);
    await writeFile(file, target.toString());
  }
  const caseId = comparisonIdentity({
    id,
    expected: sha256(expected),
    input: sha256(fixture),
  });
  const executionId = comparisonIdentity({
    caseId,
    tarball: report.tarballSha256,
    native: native.identity,
  });
  const { result, bytes } = await native.run(
    {
      schemaVersion: 1,
      caseId,
      executionId,
      oracleVersion: native.identity.version,
      document: { documentIRI, path, syntax: "rdfxml" },
      scenario: "direct-load",
      imports: [],
      compareStructure: true,
      functionalPath,
      jsRdfXmlPath,
    },
    directory,
  );
  await writeFile(join(directory, "native-result.json"), bytes, { flag: "wx" });
  assert.equal(result.javaLoad.status, "completed");
  assert.equal(
    result.javaLoad.ontology.counts.axioms,
    ontology.getAxiomCount(),
  );
  assert.equal(
    result.functionalReparse.ontology.counts.axioms,
    ontology.getAxiomCount(),
  );
  assert.equal(result.jsRdfXmlNativeReload.comparison.status, "match");
  assert.equal(result.networkAttempts, 0);
  assert.equal(result.structure.status, altered ? "mismatch" : "match");
  if (altered) assert.equal(result.structure.category, "AXIOMS");
  report.controls.push({
    id,
    caseId,
    executionId,
    axioms: ontology.getAxiomCount(),
    nativeResultSha256: sha256(bytes),
    structure: result.structure.status,
    nativeRdfXmlReload: result.jsRdfXmlNativeReload.comparison.status,
    networkAttempts: result.networkAttempts,
  });
}
await writeFile(
  join(output, "controls.json"),
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
