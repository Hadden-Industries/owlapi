import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { format } from "prettier";
import { OWLManager } from "../apibinding/index.js";
import { OWLDocumentFormats } from "../formats/index.js";
import { StringDocumentSource, StringDocumentTarget } from "../io/index.js";
import { OWLObjectKind } from "../model/index.js";
import { prepareSharedFixtureDirectory } from "./benchmark-owlapi-java-parity.mjs";
import { observeCurrentJavaToolchain } from "../scripts/java-toolchain.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const lockPath =
  "docs/compatibility/profiles/java-owlapi-5.5.1/java-dependencies.lock.json";
const harnessPath = "util/owlapi-reference/VerifyBenchmarkIoSemantics.java";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const formats = {
  functional: OWLDocumentFormats.FUNCTIONAL,
  turtle: OWLDocumentFormats.TURTLE,
  nquads: OWLDocumentFormats.N_QUADS,
  trig: OWLDocumentFormats.TRIG,
  owlxml: OWLDocumentFormats.OWL_XML,
  rdfxml: OWLDocumentFormats.RDF_XML,
};
const loads = ["turtle", "nquads", "trig"];
const saves = ["owlxml", "rdfxml", "turtle"];
const profiles = ["java-owlapi-5.5.1", "normative-v1"];

/** Authored independently of the serializers and Java observations. */
export function expectedDeclarationWorkload(name) {
  const stem =
    name === "nquads" || name === "trig"
      ? `urn:owlapi-js:benchmark:${name}#`
      : "urn:owlapi-js:benchmark:";
  return {
    ontologyIRI:
      name === "functional" ? "urn:owlapi-js:benchmark:functional" : null,
    versionIRI: null,
    ontologyAnnotations: 0,
    imports: 0,
    classDeclarations: Array.from(
      { length: 100 },
      (_, i) => `${stem}C${i}`,
    ).sort(),
    logicalAxioms: 0,
  };
}

export function observeDeclarations(ontology) {
  const declarations = [...ontology.getAxioms()]
    .map((axiom) => {
      assert.equal(axiom.kind, OWLObjectKind.DECLARATION_AXIOM);
      assert.equal(axiom.entity.kind, OWLObjectKind.CLASS);
      assert.equal(axiom.annotations.length, 0);
      return axiom.entity.iri.value;
    })
    .sort();
  return {
    ontologyIRI: ontology.getOntologyID().ontologyIRI?.value ?? null,
    versionIRI: ontology.getOntologyID().versionIRI?.value ?? null,
    ontologyAnnotations: ontology.getAnnotations().size,
    imports: ontology.getImportsDeclarations().size,
    classDeclarations: declarations,
    logicalAxioms: ontology.getLogicalAxiomCount(),
  };
}

export function assertDeclarationWorkload(observation, name) {
  assert.deepEqual(observation, expectedDeclarationWorkload(name));
}

export async function verifyBenchmarkIoSemantics({ classpathFile, javaHome }) {
  // Resolve once in the caller's context; native children run at repository root.
  // Observation, hashing and execution must refer to the same admitted files.
  javaHome = resolve(javaHome);
  const lockBytes = readFileSync(join(root, lockPath));
  const lock = JSON.parse(lockBytes);
  const jars = readFileSync(resolve(classpathFile), "utf8")
    .trim()
    .split(delimiter)
    .map((path) => resolve(path));
  const classpath = jars.join(delimiter);
  assert.equal(jars.length, lock.orderedExecutionClasspath.length);
  for (let index = 0; index < jars.length; index++) {
    const artifact = lock.artifacts.find(
      (a) => a.repositoryPath === lock.orderedExecutionClasspath[index],
    );
    const bytes = readFileSync(jars[index]);
    assert.equal(bytes.length, artifact.byteLength);
    assert.equal(sha256(bytes), artifact.sha256, artifact.repositoryPath);
  }
  const executable = (name) =>
    join(javaHome, "bin", name + (process.platform === "win32" ? ".exe" : ""));
  const java = observeCurrentJavaToolchain(executable("java"));
  const fixtures = prepareSharedFixtureDirectory();
  const scratch = mkdtempSync(join(tmpdir(), "owlapi-io-semantics-"));
  const native = (program, args) => {
    const result = spawnSync(executable(program), args, {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            ![
              "JAVA_TOOL_OPTIONS",
              "JDK_JAVA_OPTIONS",
              "_JAVA_OPTIONS",
              "CLASSPATH",
            ].includes(key.toUpperCase()),
        ),
      ),
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
  };
  const observed = {};
  const artifacts = {};
  const expectations = new Map();
  const input = (id, path, name, expected = name, extra = {}) => {
    expectations.set(id, expected);
    artifacts[id] = sha256(readFileSync(path));
    return { id, path, format: name, documentIRI: `urn:bench:${id}`, ...extra };
  };
  const runJava = (inputs, suffix) => {
    const request = join(scratch, `request-${suffix}.json`);
    const output = join(scratch, `result-${suffix}.json`);
    writeFileSync(request, JSON.stringify({ inputs }));
    native("java", [
      "-cp",
      `${scratch}${delimiter}${classpath}`,
      "VerifyBenchmarkIoSemantics",
      request,
      output,
    ]);
    const rows = JSON.parse(readFileSync(output));
    assert.deepEqual(
      Object.keys(rows).sort(),
      inputs
        .flatMap((row) =>
          row.saveDirectory ? [row.id, row.id + ":after-save"] : [row.id],
        )
        .sort(),
    );
    for (const [id, row] of Object.entries(rows)) {
      assertDeclarationWorkload(
        row,
        expectations.get(id.replace(/:after-save$/u, "")),
      );
      observed[`java:${id}`] = row;
    }
  };
  const parseJs = async (text, name, profile, id, expected) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: profile,
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, {
        format: formats[name],
        documentIRI: `urn:bench:${id}`,
      }),
    );
    const row = observeDeclarations(ontology);
    assertDeclarationWorkload(row, expected);
    observed[`${profile}:${id}`] = row;
    return { manager, ontology };
  };
  try {
    native("javac", ["-cp", classpath, "-d", scratch, join(root, harnessPath)]);
    runJava(
      [
        ...loads.map((name) =>
          input(
            `load.${name}`,
            join(fixtures.fixturesDir, name + ".txt"),
            name,
          ),
        ),
        input(
          "save.input",
          join(fixtures.fixturesDir, "functional.txt"),
          "functional",
          "functional",
          { saveDirectory: scratch },
        ),
      ],
      "original",
    );
    const roundtrips = saves.map((name) =>
      input(
        `java-save.${name}`,
        join(scratch, `java-${name}.txt`),
        name,
        "functional",
      ),
    );
    for (const profile of profiles) {
      for (const name of loads)
        await parseJs(
          fixtures.syntaxTexts[name],
          name,
          profile,
          `load.${name}`,
          name,
        );
      const { manager, ontology } = await parseJs(
        fixtures.syntaxTexts.functional,
        "functional",
        profile,
        "save.input",
        "functional",
      );
      for (const name of saves) {
        const target = new StringDocumentTarget();
        await manager.saveOntology(ontology, formats[name], target);
        assertDeclarationWorkload(observeDeclarations(ontology), "functional");
        const text = target.toString();
        const path = join(scratch, `${profile}-${name}.txt`);
        writeFileSync(path, text);
        roundtrips.push(
          input(`${profile}-save.${name}`, path, name, "functional"),
        );
        await parseJs(text, name, profile, `own-save.${name}`, "functional");
        await parseJs(
          readFileSync(join(scratch, `java-${name}.txt`), "utf8"),
          name,
          profile,
          `java-save.${name}`,
          "functional",
        );
      }
    }
    runJava(roundtrips, "roundtrips");
    return {
      schemaVersion: 1,
      scope:
        "Six 100-class declaration I/O groups only; not full API, metadata, malformed-input or byte-for-byte serializer parity. Untimed sinks do not replace historical Java timings.",
      java,
      classpathLockSha256: sha256(lockBytes),
      harnessSha256: sha256(readFileSync(join(root, harnessPath))),
      sinkSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
      fixtureGeneratorSha256: sha256(
        readFileSync(join(root, "util/generate-owlapi-benchmark-fixtures.cjs")),
      ),
      observations: Object.fromEntries(
        Object.entries(observed).map(([id, row]) => [
          id,
          {
            structuralSha256: sha256(JSON.stringify(row)),
            classDeclarations: row.classDeclarations.length,
          },
        ]),
      ),
      inputSha256: artifacts,
    };
  } finally {
    fixtures.cleanup();
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { values } = parseArgs({
    options: {
      "classpath-file": { type: "string" },
      "java-home": { type: "string" },
      output: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  assert.ok(values["classpath-file"] && values["java-home"] && values.output);
  const result = await verifyBenchmarkIoSemantics({
    classpathFile: values["classpath-file"],
    javaHome: values["java-home"],
  });
  writeFileSync(
    values.output,
    await format(JSON.stringify(result), { parser: "json-stringify" }),
  );
  process.stdout.write(
    `${Object.keys(result.observations).length} structural observations passed on the released Java classpath and both JS profiles\n`,
  );
}
