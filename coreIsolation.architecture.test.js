import { checkRuntime } from "./scripts/dependency-graph.mjs";

// npm owns package membership; dependency-cruiser owns dependency resolution.
// The lexical domain invariant remains an independent oracle.

describe("owlapi-js core isolation", () => {
  let result;
  beforeAll(async () => {
    result = await checkRuntime();
  }, 120000);

  it("scans the complete non-empty shipped JavaScript inventory", () => {
    expect(result.inventory.runtime.length).toBeGreaterThan(20);
    expect(result.graph.modules.map(({ source }) => source)).toEqual(
      expect.arrayContaining(result.inventory.runtime),
    );
  });

  it("never mentions VOWL in a shipped module", () => {
    expect(result.lexical).toEqual([]);
  });

  it("resolves runtime dependencies within the repository and package boundary", () => {
    expect(result.errors).toEqual([]);
  });
});
