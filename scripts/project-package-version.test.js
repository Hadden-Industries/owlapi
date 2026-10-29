import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  projectPackageVersion,
  VERSION_PROJECTION_PATHS,
  synchronizePackageVersion,
} from "./project-package-version.mjs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const sources = () =>
  Object.fromEntries(
    VERSION_PROJECTION_PATHS.map((path) => [
      path,
      readFileSync(path, "utf8").replace(/\r\n/gu, "\n"),
    ]),
  );
const json = (files, path) => JSON.parse(files[path]);

test("a future candidate propagates without transferring approval, first-release targets or dependency versions", async () => {
  const files = sources();
  const publicationPath = "docs/release/publication-control.json";
  const oldApproval = {
    ...json(files, publicationPath),
    enabled: true,
    mode: "DIRECT_OIDC",
    reviewedOn: "2026-10-29",
    reason:
      "Approval applies to the previous exact artifact and latest tag only.",
  };
  files[publicationPath] = JSON.stringify(oldApproval);
  files["untouched-history.json"] =
    '{"version":"0.1.0-rc.2","approval":"retained"}';
  const input = structuredClone(files);
  const future = { ...manifest, version: "0.1.0-rc.9" };
  const output = await projectPackageVersion(files, future);
  expect(files).toEqual(input);
  expect(output["untouched-history.json"]).toBe(
    input["untouched-history.json"],
  );
  const lock = json(output, "package-lock.json");
  expect(lock.version).toBe("0.1.0-rc.9");
  expect(lock.packages[""].version).toBe("0.1.0-rc.9");
  delete lock.packages[""].version;
  const previousLock = json(input, "package-lock.json");
  delete previousLock.packages[""].version;
  expect(lock.packages).toEqual(previousLock.packages);
  expect(json(output, "docs/compatibility/capabilities.json").release).toBe(
    "0.1.0-rc.9",
  );
  expect(
    json(output, "docs/compatibility/dependency-seams.json").packageVersion,
  ).toBe("0.1.0-rc.9");
  const registryPath = "docs/compatibility/java-api-surface.json";
  expect(json(output, registryPath)).toEqual({
    ...json(input, registryPath),
    packageVersion: "0.1.0-rc.9",
  });
  expect(output["API.md"]).toContain("`@hadden-industries/owlapi` 0.1.0-rc.9.");
  expect(output["API.md"]).toContain("first public release target 0.1.0-rc.3");
  expect(json(output, publicationPath)).toMatchObject({
    coordinate: "@hadden-industries/owlapi@0.1.0-rc.9",
    enabled: false,
    mode: "UNRESOLVED",
    reviewedOn: null,
    reconciliation: null,
  });
  expect(json(output, publicationPath).reason).not.toContain(
    oldApproval.reason,
  );
  const availabilityPath = "docs/release/availability-policy.json";
  expect(json(output, availabilityPath)).toEqual({
    ...json(input, availabilityPath),
    coordinate: "@hadden-industries/owlapi@0.1.0-rc.9",
  });
  expect(await projectPackageVersion(output, future)).toEqual(output);
});

test("same-coordinate synchronization preserves the exact existing approval record", async () => {
  const files = sources();
  const output = await projectPackageVersion(files, manifest);
  expect(json(output, "docs/release/publication-control.json")).toEqual(
    json(files, "docs/release/publication-control.json"),
  );
  expect(await synchronizePackageVersion()).toEqual([]);
});

test("stable projection requires an explicit channel choice and retains closed historical channel rules", async () => {
  const files = sources();
  const stable = { ...manifest, version: "0.1.0" };
  await expect(projectPackageVersion(files, stable)).rejects.toThrow(
    /publishConfig.tag/,
  );
  stable.publishConfig = { ...stable.publishConfig, tag: "latest" };
  const output = await projectPackageVersion(files, stable);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(
    json(output, "docs/release/publication-control.schema.json"),
  );
  const control = json(output, "docs/release/publication-control.json");
  expect(control.channel).toBe("latest");
  expect(validate(control)).toBe(true);
  expect(validate({ ...control, channel: "next" })).toBe(false);
  const historical = JSON.parse(
    readFileSync(
      "docs/release/history/0.1.0-rc.1-publication-control.json",
      "utf8",
    ),
  );
  expect(validate(historical)).toBe(true);
  expect(validate({ ...historical, channel: "latest" })).toBe(false);
  expect(
    validate({
      ...control,
      enabled: true,
      mode: "DIRECT_BOOTSTRAP",
      reviewedOn: "2026-10-30",
    }),
  ).toBe(false);
});

test("manifest identity is loaded from the checkout, rejects other candidates and malformed versions", () => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-version-identity-"));
  try {
    mkdirSync(join(directory, "scripts"));
    copyFileSync(
      "scripts/package-identity.mjs",
      join(directory, "scripts", "package-identity.mjs"),
    );
    for (const name of ["npm-semver.mjs", "assert-workflow-runtime.mjs"])
      copyFileSync(join("scripts", name), join(directory, "scripts", name));
    const run = () =>
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'import {PACKAGE_VERSION, assertPackageIdentity} from "./scripts/package-identity.mjs"; assertPackageIdentity({name:"@hadden-industries/owlapi",version:"0.1.0-rc.9"}); console.log(PACKAGE_VERSION);',
        ],
        { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({ name: manifest.name, version: "0.1.0-rc.9" }),
    );
    expect(run().trim()).toBe("0.1.0-rc.9");
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
    expect(run).toThrow(/unexpected package coordinate/);
    for (const version of ["v0.1.0", "0.1.0; echo bad", "01.1.0", null]) {
      writeFileSync(
        join(directory, "package.json"),
        JSON.stringify({ ...manifest, version }),
      );
      expect(run).toThrow(/invalid package identity/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
