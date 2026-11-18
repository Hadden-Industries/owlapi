import { readFileSync } from "node:fs";
import {
  checkSharedOverrides,
  projectSharedOverrides,
} from "./project-shared-overrides.mjs";

const rootManifest = JSON.parse(readFileSync("package.json", "utf8"));
const transportPath = "tooling/artifact-transport/package.json";
const transport = JSON.parse(readFileSync(transportPath, "utf8"));

describe("shared npm override authority", () => {
  test("nested manifests match the root override values", () => {
    expect(checkSharedOverrides()).toEqual([]);
  });

  test("rewrites a drifted nested value from the root manifest", () => {
    const [key] = Object.keys(transport.overrides);
    const drifted = structuredClone(transport);
    drifted.overrides[key] = "0.0.0";
    expect(
      checkSharedOverrides({ manifests: { [transportPath]: drifted } }),
    ).toEqual([expect.stringMatching(/drifts from package\.json/u)]);
    const { manifest } = projectSharedOverrides(
      drifted,
      rootManifest.overrides,
      transportPath,
    );
    expect(manifest.overrides[key]).toEqual(rootManifest.overrides[key]);
  });

  test("rejects a nested override the root does not own", () => {
    const extra = structuredClone(transport);
    extra.overrides["example@<1.0.0"] = "1.0.0";
    expect(
      checkSharedOverrides({ manifests: { [transportPath]: extra } }),
    ).toEqual([
      `${transportPath}: override example@<1.0.0 has no root authority`,
    ]);
  });
});
