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
