import { readFileSync } from "node:fs";
import {
  IRI,
  OWLDataFactory,
  OWLOntology,
  OWLOntologyManager,
  OWLObjectKind as K,
} from "../../model/index.js";
import { StringDocumentSource, ResourceLimitError } from "../../io/index.js";
import { compareOntologies } from "../../internal/model/ontologyStructuralIsomorphism.js";
import { LocalityClass, SyntacticLocalityModuleExtractor } from "./index.js";

const f = new OWLDataFactory();
const a = f.getOWLClass(IRI.create("urn:locality:A"));
const b = f.getOWLClass(IRI.create("urn:locality:B"));
const c = f.getOWLClass(IRI.create("urn:locality:C"));
const ab = f.getOWLSubClassOfAxiom(a, b),
  bc = f.getOWLSubClassOfAxiom(b, c);
const read = (file) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../util/owlapi-reference/fixtures/rc2/${file}`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
const vectors = read("locality-observations.json");
const fixed = read("locality-fixed-points.json");
const load = (input) =>
  new OWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(input),
  );
const seedFor = (seed) =>
  seed.map(({ kind, iri }) => f[`getOWL${kind}`](IRI.create(iri)));
const equalModule = async (result, expected) => {
  const comparison = compareOntologies(
    new OWLOntology({ axioms: result }),
    await load(`Ontology(${expected.join(" ")})`),
  );
  expect(comparison).toEqual(expect.objectContaining({ equal: true }));
};

test.each(vectors.singleAxiomCases.map((row) => [row.id, row]))(
  "native single-axiom locality vector %s",
  async (_id, row) => {
    const ontology = await load(row.input);
    for (const mode of Object.values(LocalityClass)) {
      const extractor = new SyntacticLocalityModuleExtractor(
        mode,
        ontology.getAxioms(),
      );
      const module = await extractor.extract(seedFor(row.seed));
      expect(module.length !== 0).toBe(row.included[mode]);
      await equalModule(module, row.extracted[mode]);
    }
  },
);

test.each(fixed.observations.map((row) => [row.id, row]))(
  "native fixed-point locality vector %s",
  async (_id, row) => {
    const ontology = await load(row.input);
    for (const mode of Object.values(LocalityClass)) {
      const extractor = new SyntacticLocalityModuleExtractor(
        mode,
        ontology.getAxioms(),
      );
      const expected = row.modules[mode];
      if (expected.error) {
        expect(expected.error).toBe("NullPointerException");
        await expect(extractor.extract(seedFor(row.seed))).rejects.toThrow(
          TypeError,
        );
      } else {
        const module = await extractor.extract(seedFor(row.seed));
        await equalModule(module, expected.axioms);
        await equalModule(
          await extractor.extract(seedFor(row.seed)),
          expected.axioms,
        );
      }
    }
  },
);

test.each(vectors.modules.map((row, i) => [i, row]))(
  "native all-kind combined module %i",
  async (_id, row) => {
    const ontology = await load(vectors.input);
    const extractor = new SyntacticLocalityModuleExtractor(
      row.mode,
      ontology.getAxioms(),
    );
    await equalModule(extractor.axiomBase(), row.base);
    await equalModule(await extractor.extract(seedFor(row.seed)), row.axioms);
  },
);

test.each(["BOTTOM", "TOP", "STAR"])(
  "%s captures a defensive structural set and filters before propagation",
  async (mode) => {
    const base = [ab, bc, f.getOWLSubClassOfAxiom(a, b)];
    const extractor = new SyntacticLocalityModuleExtractor(
      LocalityClass[mode],
      base,
    );
    base.length = 0;
    expect(extractor.getLocalityClass()).toBe(mode);
    expect(extractor.axiomBase()).toHaveLength(2);
    extractor.axiomBase().length = 0;
    expect(extractor.containsAxiom(f.getOWLSubClassOfAxiom(a, b))).toBe(true);
    expect(extractor.containsAxiom(f.getOWLSubClassOfAxiom(c, a))).toBe(false);
    const filtered = await extractor.extract([a], (axiom) => !axiom.equals(bc));
    expect(filtered).toEqual(mode === "BOTTOM" ? [ab] : []);
    const all = await extractor.extract([a]);
    expect(new Set(all)).toEqual(new Set(mode === "BOTTOM" ? [ab, bc] : []));
    expect(await extractor.extract([])).toEqual([]);
  },
);

test("locality has no default depth cap; explicit limits reject without partial output", async () => {
  const p = f.getOWLObjectProperty(IRI.create("urn:locality:p"));
  let expression = b;
  for (let i = 0; i < 600; i++)
    expression = f.getOWLObjectSomeValuesFrom(p, expression);
  const axiom = f.getOWLSubClassOfAxiom(a, expression);
  const extractor = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
    axiom,
  ]);
  expect(await extractor.extract([a])).toEqual([axiom]);
  expect(
    await extractor.extract([a], undefined, {
      maxWork: 10000001,
      maxDepth: null,
    }),
  ).toEqual([axiom]);
  for (const options of [
    { maxWork: 0 },
    { maxAxioms: 0 },
    { maxDepth: 512 },
    { timeoutMs: 0 },
  ])
    await expect(extractor.extract([a], undefined, options)).rejects.toThrow(
      ResourceLimitError,
    );
  expect(await extractor.extract([a])).toEqual([axiom]);
});

test("locality options are captured before iterators and filters, with queued cancellation", async () => {
  const extractor = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
    ab,
    bc,
  ]);
  const controller = new AbortController();
  const checking = extractor.extract([a], undefined, {
    signal: controller.signal,
  });
  queueMicrotask(() => controller.abort());
  await expect(checking).rejects.toHaveProperty("name", "AbortError");
  const options = { maxWork: null };
  const seeds = {
    *[Symbol.iterator]() {
      options.maxWork = 0;
      yield a;
    },
  };
  expect(await extractor.extract(seeds, undefined, options)).toEqual([ab, bc]);
  let calls = 0;
  await expect(
    extractor.extract([a], () => {
      if (++calls === 2) throw new Error("late filter");
      return true;
    }),
  ).rejects.toThrow("late filter");
  expect(calls).toBe(2);
  await expect(extractor.extract([a], async () => true)).rejects.toThrow(
    TypeError,
  );
  expect(await extractor.extract([a])).toEqual([ab, bc]);
  for (const options of [
    { maxWork: -1 },
    { maxAxioms: 0.5 },
    { maxDepth: Infinity },
    { signal: {} },
    { unknown: true },
    {
      get maxWork() {
        throw new Error("accessor executed");
      },
    },
  ])
    await expect(extractor.extract([a], undefined, options)).rejects.toThrow(
      TypeError,
    );
});

test("locality rejects malformed, unsupported and absent-seed inputs before filters", async () => {
  expect(Object.isFrozen(LocalityClass)).toBe(true);
  expect(() => new SyntacticLocalityModuleExtractor("bogus", [ab])).toThrow(
    TypeError,
  );
  expect(
    () => new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [a]),
  ).toThrow(TypeError);
  expect(
    () =>
      new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
        Object.freeze({ kind: K.SUBCLASS_OF_AXIOM }),
      ]),
  ).toThrow(TypeError);
  const extractor = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
    ab,
  ]);
  let calls = 0;
  await expect(
    extractor.extract([c], () => {
      calls++;
      return true;
    }),
  ).rejects.toThrow(TypeError);
  await expect(
    extractor.extract([IRI.create("urn:locality:A")]),
  ).rejects.toThrow(TypeError);
  expect(calls).toBe(0);
});

test("an explicit annotation-depth limit is optional and enforced before filters", async () => {
  const label = f.getRDFSLabel(),
    literal = f.getOWLLiteral("nested");
  let annotation = f.getOWLAnnotation(label, literal);
  for (let i = 1; i < 65; i++)
    annotation = f.getOWLAnnotation(label, literal, [annotation]);
  const axiom = f.getOWLSubClassOfAxiom(a, b, [annotation]);
  const extractor = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
    axiom,
  ]);
  expect(await extractor.extract([a])).toEqual([axiom]);
  let calls = 0;
  await expect(
    extractor.extract(
      [a],
      () => {
        calls++;
        return true;
      },
      { maxAnnotationDepth: 64 },
    ),
  ).rejects.toThrow(ResourceLimitError);
  expect(calls).toBe(0);
  expect(
    await extractor.extract([a], undefined, { maxAnnotationDepth: 65 }),
  ).toEqual([axiom]);
});

test("the explicit work budget is shared across preparation and every STAR pass", async () => {
  const bottom = new SyntacticLocalityModuleExtractor(LocalityClass.BOTTOM, [
    ab,
    bc,
  ]);
  const star = new SyntacticLocalityModuleExtractor(LocalityClass.STAR, [
    ab,
    bc,
  ]);
  let low = 0,
    high = 4096;
  while (low < high) {
    const bound = Math.floor((low + high) / 2);
    try {
      await bottom.extract([a], undefined, { maxWork: bound });
      high = bound;
    } catch (error) {
      expect(error).toBeInstanceOf(ResourceLimitError);
      low = bound + 1;
    }
  }
  expect(low).toBeLessThan(4096);
  expect(await bottom.extract([a], undefined, { maxWork: low })).toEqual([
    ab,
    bc,
  ]);
  await expect(star.extract([a], undefined, { maxWork: low })).rejects.toThrow(
    ResourceLimitError,
  );
  expect(await star.extract([a])).toEqual([]);
});
