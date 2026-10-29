import { jest } from "@jest/globals";
import {
  rdfDataFactory as factory,
  rdfDatasetFactory,
} from "../rdfjs/environment.js";
import { createRdfReadView } from "./rdfReadView.js";

const named = (value) => factory.namedNode(`urn:${value}`);
const execution = () => ({ check: jest.fn() });

test("read queries preserve both native iteration orders without repeated datasets", () => {
  // A predicate can first occur as an object: rematerialization can change order.
  const input = rdfDatasetFactory.dataset([
    factory.quad(named("a"), named("p"), named("q")),
    factory.quad(named("b"), named("q"), named("r")),
    factory.quad(named("a"), named("r"), named("p")),
    factory.quad(named("a"), named("q"), named("r")),
    factory.quad(factory.blankNode("a"), named("q"), named("z")),
  ]);
  const expectedAll = [...input];
  const expectedMatched = [...input.match(null, null, null, null)];
  const expectedSubject = [...input.match(named("a"), null, null, null)];
  const match = jest.spyOn(input, "match");
  const read = createRdfReadView(input, execution());
  expect(read.quads).toEqual(expectedAll);
  expect(read.matchedQuads()).toEqual(expectedMatched);
  expect(read.matchedQuads()).toBe(read.matchedQuads());
  expect(read.outgoing(named("a"))).toEqual(expectedSubject);
  expect(read.outgoing(named("a"), "urn:q")).toEqual(
    expectedSubject.filter(({ predicate }) => predicate.value === "urn:q"),
  );
  expect(read.outgoing(factory.blankNode("a"))).toHaveLength(1);
  for (let i = 0; i < 100; i++) {
    expect(read.outgoing(named("a"), "urn:q")).toHaveLength(1);
    expect(read.outgoing(named("missing"))).toHaveLength(0);
  }
  expect(match).toHaveBeenCalledTimes(4);
  expect(Object.isFrozen(read.outgoing(named("a")))).toBe(true);
  expect(Object.isFrozen(read.outgoing(named("a"), "urn:q"))).toBe(true);
});

test("subject, predicate and whole-query ordering agrees with DatasetCore on shuffled inputs", () => {
  let seed = 19;
  const random = () => (seed = (seed * 16807) % 2147483647) % 12;
  for (let round = 0; round < 40; round++) {
    const input = rdfDatasetFactory.dataset(
      Array.from({ length: 50 }, () =>
        factory.quad(named(random()), named(random()), named(random())),
      ),
    );
    const read = createRdfReadView(input, execution());
    expect(read.quads).toEqual([...input]);
    expect(read.matchedQuads()).toEqual([...input.match()]);
    for (let index = 0; index < 12; index++) {
      const subject = named(index);
      const expected = [...input.match(subject)];
      expect(read.outgoing(subject)).toEqual(expected);
      for (let predicate = 0; predicate < 12; predicate++) {
        expect(read.outgoing(subject, `urn:${predicate}`)).toEqual(
          expected.filter(
            (quad) => quad.predicate.value === `urn:${predicate}`,
          ),
        );
      }
    }
  }
});

test("read views are operation-owned and check cancellation during construction and indexing", () => {
  const input = rdfDatasetFactory.dataset(
    Array.from({ length: 100 }, (_, i) =>
      factory.quad(named("a"), named("p"), named(i)),
    ),
  );
  const control = execution();
  const first = createRdfReadView(input, control);
  const second = createRdfReadView(input, execution());
  expect(first.quads).not.toBe(second.quads);
  let visits = 0;
  const failure = new Error("cancelled");
  control.check.mockImplementation(() => {
    if (++visits === 10) throw failure;
  });
  expect(() => first.outgoing(named("a"))).toThrow(failure);
  expect(visits).toBe(10);
  control.check.mockImplementation(() => {});
  expect(first.outgoing(named("a"))).toHaveLength(100);
  visits = 0;
  control.check.mockImplementation(() => {
    if (++visits === 10) throw failure;
  });
  expect(() => createRdfReadView(input, control)).toThrow(failure);
});

test("private native singleton reads retain provider results and every check", () => {
  const input = rdfDatasetFactory.dataset([
    factory.quad(named("one"), named("p"), named("q")),
    factory.quad(factory.blankNode("one"), named("q"), named("r")),
    factory.quad(named("two"), named("q"), named("r")),
    factory.quad(named("two"), named("r"), named("p")),
  ]);
  const originalControl = execution();
  const optimizedControl = execution();
  const original = createRdfReadView(input, originalControl);
  const optimized = createRdfReadView(input, optimizedControl, true);
  for (const subject of [
    named("one"),
    factory.blankNode("one"),
    named("two"),
    named("missing"),
  ]) {
    for (const predicate of [undefined, "urn:p", "urn:q", "urn:r"]) {
      expect(optimized.outgoing(subject, predicate)).toEqual(
        original.outgoing(subject, predicate),
      );
      expect(optimizedControl.check).toHaveBeenCalledTimes(
        originalControl.check.mock.calls.length,
      );
    }
  }
  const nativeMatch = input.match;
  const overridden = createRdfReadView(input, execution(), true);
  input.match = jest.fn((...args) => Reflect.apply(nativeMatch, input, args));
  expect(overridden.outgoing(named("one"))).toEqual([
    ...Reflect.apply(nativeMatch, input, [named("one")]),
  ]);
  expect(input.match).toHaveBeenCalledTimes(1);
});

test("private singleton admission retains provider-specific foreign term identifiers", () => {
  const subject = named("authored");
  subject.id = "urn:provider-identifier";
  const input = rdfDatasetFactory.dataset([
    factory.quad(subject, named("p"), named("q")),
  ]);
  for (const query of [
    subject,
    factory.namedNode(subject.id),
    named("authored"),
  ]) {
    // Query a fresh view: a prepared view's historical cache identifies
    // subjects by RDF type/value, whereas this deliberately nonstandard id
    // makes the provider distinguish objects with the same RDF value.
    const read = createRdfReadView(input, execution(), true);
    expect(read.outgoing(query)).toEqual([...input.match(query)]);
  }
});

test("private matched views preserve uniform subject order and fall back for cross-references and mixed graphs", () => {
  const statement = (s, p = "p", o = "o", graph) =>
    factory.quad(named(s), named(p), named(o), graph);
  const cases = [
    [statement("z"), statement("a"), statement("b")],
    [statement("z"), statement("p"), statement("a")],
    [statement("z"), statement("o"), statement("a")],
    [statement("z"), statement("z", "p", "other"), statement("a")],
    [statement("z"), statement("a", "p", "other")],
    [statement("z"), statement("a", "q")],
    [
      statement("z"),
      factory.quad(factory.blankNode("a"), named("p"), named("o")),
    ],
    [
      statement("z"),
      factory.quad(named("a"), named("p"), factory.literal("o")),
    ],
    [statement("z"), statement("a", "p", "o", named("graph"))],
  ];
  for (const quads of cases) {
    const input = rdfDatasetFactory.dataset(quads);
    const originalControl = execution(),
      optimizedControl = execution();
    const original = createRdfReadView(input, originalControl);
    const optimized = createRdfReadView(input, optimizedControl, true);
    expect(optimized.matchedQuads()).toEqual(original.matchedQuads());
    expect(optimizedControl.check).toHaveBeenCalledTimes(
      originalControl.check.mock.calls.length,
    );
    expect(Object.isFrozen(optimized.matchedQuads())).toBe(true);
  }
});

test("private matched views retain provider method getters without extra reads", () => {
  const input = rdfDatasetFactory.dataset(
    Array.from({ length: 20 }, (_, index) =>
      factory.quad(named(index), named("p"), named("o")),
    ),
  );
  const native = input._toId;
  let reads = 0;
  Object.defineProperty(input, "_toId", {
    get() {
      reads++;
      return native;
    },
  });
  const original = createRdfReadView(input, execution());
  const optimized = createRdfReadView(input, execution(), true);
  reads = 0;
  const expected = original.matchedQuads(),
    expectedReads = reads;
  reads = 0;
  expect(optimized.matchedQuads()).toEqual(expected);
  expect(reads).toBe(expectedReads);
});

test.each(["predicate", "value"])(
  "private singleton views preserve a foreign %s getter and the original checks",
  (field) => {
    const subject = named("accessor"),
      predicate = named("p"),
      object = named("o");
    let reads = 0;
    const quad = factory.quad(subject, predicate, object);
    if (field === "predicate")
      Object.defineProperty(quad, field, {
        get() {
          reads++;
          return predicate;
        },
      });
    else
      Object.defineProperty(predicate, "value", {
        get() {
          reads++;
          return "urn:p";
        },
      });
    const input = rdfDatasetFactory.dataset([quad]);
    // Both views use the historical singleton route; matched-view preparation
    // is outside this observation so only predicate-indexing reads are counted.
    const optimizedControl = execution();
    const optimized = createRdfReadView(input, optimizedControl, true);
    reads = 0;
    // Existing singleton indexing reads the predicate value twice.
    const result = optimized.outgoing(subject, "urn:p");
    expect(result).toEqual([quad]);
    expect(reads).toBe(2);
    expect(optimizedControl.check).toHaveBeenCalledTimes(9);
  },
);

test.each(
  ["_addToIndex", "_setQuad"].flatMap((method) =>
    ["function", "getter"].map((mode) => [method, mode]),
  ),
)(
  "matched views preserve a replaced native construction helper: %s %s",
  (method, mode) => {
    const input = rdfDatasetFactory.dataset([
      factory.quad(named("a"), named("p"), named("o")),
    ]);
    const original = createRdfReadView(input, execution());
    const optimized = createRdfReadView(input, execution(), true);
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
    const failure = new Error("provider construction hook");
    try {
      const fail = () => {
        throw failure;
      };
      Object.defineProperty(
        prototype,
        method,
        mode === "getter"
          ? { configurable: true, get: fail }
          : { ...descriptor, value: fail },
      );
      expect(() => original.matchedQuads()).toThrow(failure);
      expect(() => optimized.matchedQuads()).toThrow(failure);
    } finally {
      Object.defineProperty(prototype, method, descriptor);
    }
  },
);

test("matched views never read an unrelated Array.values accessor", () => {
  const input = rdfDatasetFactory.dataset([
    factory.quad(named("a"), named("p"), named("o")),
  ]);
  const read = createRdfReadView(input, execution(), true);
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "values");
  let reads = 0,
    result,
    error;
  try {
    Object.defineProperty(Array.prototype, "values", {
      configurable: true,
      get() {
        reads++;
        throw new Error("unrelated accessor");
      },
    });
    try {
      result = read.matchedQuads();
    } catch (caught) {
      error = caught;
    }
  } finally {
    Object.defineProperty(Array.prototype, "values", descriptor);
  }
  expect(error).toBeUndefined();
  expect(reads).toBe(0);
  expect(result).toHaveLength(1);
});

test.each(["predicate", "object"])(
  "uniform admission does not read a foreign %s termType getter",
  (field) => {
    let blocked = false,
      reads = 0;
    const term = {
      value: `urn:${field}`,
      get termType() {
        if (blocked) {
          reads++;
          throw new Error("foreign term type");
        }
        return "NamedNode";
      },
    };
    const quad = factory.quad(
      named("a"),
      field === "predicate" ? term : named("p"),
      field === "object" ? term : named("o"),
    );
    const input = rdfDatasetFactory.dataset([quad]);
    blocked = true;
    const read = createRdfReadView(input, execution(), true);
    expect(read.outgoing(named("a"))[0]).toBe(quad);
    expect(reads).toBe(0);
  },
);

test.each(["named", "default"])(
  "matched views preserve changed native %s term-type descriptors",
  (kind) => {
    const input = rdfDatasetFactory.dataset([
      factory.quad(named("a"), named("p"), named("o")),
    ]);
    const original = createRdfReadView(input, execution());
    const optimized = createRdfReadView(input, execution(), true);
    const prototype = Object.getPrototypeOf(
      kind === "named" ? named("probe") : factory.defaultGraph(),
    );
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "termType");
    const failure = new Error("native term type hook");
    try {
      Object.defineProperty(prototype, "termType", {
        configurable: true,
        get() {
          throw failure;
        },
      });
      expect(() => original.matchedQuads()).toThrow(failure);
      expect(() => optimized.matchedQuads()).toThrow(failure);
    } finally {
      Object.defineProperty(prototype, "termType", descriptor);
    }
  },
);

test("uniform admission requires a native named subject prototype", () => {
  const subject = factory.blankNode("subject");
  const input = rdfDatasetFactory.dataset([
    factory.quad(subject, named("p"), named("o")),
  ]);
  const original = createRdfReadView(input, execution());
  const prototype = Object.getPrototypeOf(subject);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "termType");
  const failure = new Error("blank subject hook");
  let throwing = false;
  try {
    Object.defineProperty(prototype, "termType", {
      configurable: true,
      get() {
        if (throwing) throw failure;
        return "NamedNode";
      },
    });
    const optimized = createRdfReadView(input, execution(), true);
    throwing = true;
    expect(() => original.matchedQuads()).toThrow(failure);
    expect(() => optimized.matchedQuads()).toThrow(failure);
  } finally {
    Object.defineProperty(prototype, "termType", descriptor);
  }
});
