import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { oracleLockPath } from "./comparison-oracle.mjs";
import { scopedSwrlCases } from "./fixtures/swrl/cases.mjs";

const { oracle, observations: reference } = JSON.parse(
  await readFile(
    new URL("./fixtures/swrl/java-5.5.1.json", import.meta.url),
    "utf8",
  ),
);

test("the capture identifies its released classpath, Java probe and selected JDK", async () => {
  const digest = async (url) =>
    createHash("sha256")
      .update(await readFile(url))
      .digest("hex");
  expect(oracle.version).toBe("5.5.1.2024-09-07T21:41:32Z");
  expect(oracle.lockSha256).toBe(await digest(oracleLockPath));
  expect(oracle.probeSha256).toBe(
    await digest(new URL("./ObserveScopedSwrl.java", import.meta.url)),
  );
  expect(oracle.jdk.setupJavaVersion).toBe(
    (
      await readFile(new URL("../../.java-version", import.meta.url), "utf8")
    ).trim(),
  );
});

test("capture refuses an incomplete classpath before starting Java or writing evidence", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "owlapi-swrl-negative-"));
  try {
    const cp = join(scratch, "classpath"),
      output = join(scratch, "capture.json");
    await writeFile(cp, "");
    const launch = fileURLToPath(
      new URL("./capture-scoped-swrl.mjs", import.meta.url),
    );
    const run = spawnSync(process.execPath, [launch, cp, scratch, output], {
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("classpath differs in length");
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("every native SWRL observation belongs to the exact fixture and parser settings", async () => {
  const cases = await scopedSwrlCases();
  expect(Object.keys(reference).sort()).toEqual(
    cases.map(({ id }) => id).sort(),
  );
  for (const { id, text, format, strict, annotations } of cases) {
    expect(reference[id]).toMatchObject({
      sourceSha256: createHash("sha256").update(text).digest("hex"),
      format: format ?? "rdfxml",
      strict: strict ?? false,
      loadAnnotationAxioms: annotations ?? true,
    });
  }
});

test("the native readers agree on the declared rule and preserve its two variable IRIs", () => {
  const { simple, annotated, declarations } = reference;
  expect(simple.rules).toEqual(reference["simple-functional"].rules);
  expect(declarations).toMatchObject({ axioms: 3, declarations: 3, rules: [] });
  expect(simple).toMatchObject({
    axioms: 4,
    declarations: 3,
    individuals: [],
    inDL: true,
    inEL: false,
  });
  expect(simple.rules[0].variables).toEqual(["urn:swrl#x", "urn:swrl:var#x"]);
  expect(simple.rules[0].body).toHaveLength(2);
  expect(simple.rules[0].head).toHaveLength(1);
  expect(annotated.rules[0].annotations).toHaveLength(3);
  expect(annotated.rules[0].head).toHaveLength(2);
  expect(reference["annotations-disabled"].rules).toEqual(annotated.rules);
  expect(reference["strict-rdf"].rules).toEqual([]);
});

test("native boundary cases preserve explicit group roles and order", () => {
  expect(reference["free-head"].rules[0].variables).toHaveLength(2);
  expect(reference.duplicates.rules[0].body).toEqual(
    [...reference.reordered.rules[0].body].reverse(),
  );
  for (const id of ["empty-functional", "empty-rdf"])
    expect(reference[id].rules).toEqual([
      { body: [], head: [], variables: [], annotations: [] },
    ]);
  expect(reference["missing-head"].error).toBe("UnparsableOntologyException");
  expect(reference["unsupported-first"].rules).toEqual(
    reference["unsupported-last"].rules,
  );
  expect(reference["unsupported-first"].rules).toHaveLength(2);
  expect(reference["iri-annotation"].rules[0].annotations).toHaveLength(2);
  const c = (iri) =>
    "ClassAtom(<urn:owlapi:test:swrl#C> Variable(<" + iri + ">))";
  expect(reference["shared-list"].rules[0]).toMatchObject({
    body: [c("urn:swrl#x")],
    head: [c("urn:swrl#x")],
  });
  expect(reference["crossed-list"].rules[0]).toMatchObject({
    body: [],
    head: [c("urn:swrl:var#x"), c("urn:swrl#x")],
  });
});
