import { maintenanceTarget } from "./maintenance-published-health.mjs";

describe("published-package maintenance targeting", () => {
  test("does not treat a reviewed prerelease as a production latest release", () => {
    expect(maintenanceTarget({ enabled: true, channel: "next" })).toEqual({
      action: "NOT_APPLICABLE",
      reason: "NO_PRODUCTION_RELEASE",
      coordinate: "owlapi@latest",
    });
  });

  test("checks latest only after a production publication is enabled", () => {
    expect(maintenanceTarget({ enabled: true, channel: "latest" })).toEqual({
      action: "QUERY",
      coordinate: "owlapi@latest",
    });
  });
});
