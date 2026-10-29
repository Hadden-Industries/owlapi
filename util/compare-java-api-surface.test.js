import { compareSurface } from "./compare-java-api-surface.mjs";

test("surface comparison distinguishes added/removed exports, members and semantic changes", () => {
  const retained = {
    id: "retained",
    supportedMembers: ["prototype.old"],
    semanticQualifications: ["old contract"],
  };
  const removed = { id: "removed", supportedMembers: ["constructor"] };
  const changed = {
    ...retained,
    supportedMembers: ["prototype.new"],
    semanticQualifications: ["new contract"],
  };
  const added = { id: "new", supportedMembers: ["prototype.load"] };
  const result = compareSurface(
    { bindings: [retained, removed] },
    { bindings: [changed, added] },
  );
  expect(result.added).toEqual([added]);
  expect(result.removed).toEqual([removed]);
  expect(result.changed).toEqual([
    {
      binding: changed,
      prior: retained,
      fields: ["supportedMembers", "semanticQualifications"],
      added: ["prototype.new"],
      removed: ["prototype.old"],
    },
  ]);
});

test("unchanged binding order does not invent API changes", () => {
  const a = { id: "a", supportedMembers: ["constructor"] },
    b = { id: "b", supportedMembers: ["x"] };
  expect(compareSurface({ bindings: [a, b] }, { bindings: [b, a] })).toEqual({
    added: [],
    removed: [],
    changed: [],
  });
});

test("historical target naming does not invent a semantic API change", () => {
  const binding = { id: "old", supportedMembers: ["constructor"] };
  expect(
    compareSurface(
      { bindings: [{ ...binding, firstPublicRelease: "0.1.0-rc.2" }] },
      { bindings: [{ ...binding, firstPublicReleaseTarget: "0.1.0-rc.2" }] },
    ).changed,
  ).toEqual([]);
});

test("structured field comparison ignores object key order but preserves array order and values", () => {
  const binding = { id: "retained", supportedMembers: ["constructor"] };
  const compare = (before, after) =>
    compareSurface(
      { bindings: [{ ...binding, metadata: before }] },
      { bindings: [{ ...binding, metadata: after }] },
    ).changed;
  expect(
    compare(
      { profile: { name: "normative", enabled: true }, order: ["a", "b"] },
      { order: ["a", "b"], profile: { enabled: true, name: "normative" } },
    ),
  ).toEqual([]);
  for (const [before, after] of [
    [
      ["a", "b"],
      ["b", "a"],
    ],
    [{ enabled: true }, { enabled: false }],
    ["1", 1],
  ]) {
    expect(compare(before, after).map(({ fields }) => fields)).toEqual([
      ["metadata"],
    ]);
  }
});
