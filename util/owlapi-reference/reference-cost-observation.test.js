import { describe, expect, test } from "@jest/globals";
import {
  observeFreshReferenceCost,
  referenceCostControlChanged,
  referenceCostObservationRequested,
} from "./reference-cost-observation.mjs";

describe("bounded native reference cost observation", () => {
  test("screens control changes without adding baseline builds to ordinary PRs", () => {
    expect(
      referenceCostControlChanged([
        "docs/implementation-plan.md",
        "src/index.js",
      ]),
    ).toBe(false);
    expect(
      referenceCostControlChanged([
        "docs/implementation-plan.md",
        "scripts/java-reference-command.mjs",
      ]),
    ).toBe(true);
    expect(
      referenceCostControlChanged([
        "util/owlapi-reference/reference-native-build.mjs",
      ]),
    ).toBe(true);
  });

  test("stops screening after activation and never adds a second baseline to main", () => {
    expect(referenceCostObservationRequested("pull_request", false)).toBe(true);
    expect(referenceCostObservationRequested("pull_request", true)).toBe(false);
    expect(referenceCostObservationRequested("push", false)).toBe(false);
    expect(referenceCostObservationRequested(undefined, false)).toBe(false);
    // No host, event file or tool lookup is attempted for an ordinary main push.
    expect(observeFreshReferenceCost({ GITHUB_EVENT_NAME: "push" })).toBeNull();
  });
});
