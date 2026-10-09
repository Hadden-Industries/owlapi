import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { assertPublicRegistryFacts } from "./qualify-public-registry.mjs";
import { deriveWorkflowMetadata } from "./workflow-metadata.mjs";
import { PACKAGE_VERSION, PUBLIC_SUBPATHS } from "./package-identity.mjs";

const version = "0.1.0-rc.2",
  sha256 = "a".repeat(64);
const facts = (tags) => ({
  expectedVersion: version,
  retainedSha256: sha256,
  metadata: {
    name: "@hadden-industries/owlapi",
    version,
    dist: {
      integrity: "sha512-example",
      tarball: `https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-${version}.tgz`,
    },
  },
  distTags: tags,
  registryTarballSha256: sha256,
});

test("rc.2 registry acceptance requires next and latest to identify the exact qualified version", () => {
  expect(
    assertPublicRegistryFacts(facts({ next: version, latest: version })),
  ).toMatchObject({
    coordinate: `@hadden-industries/owlapi@${version}`,
    next: version,
    latest: version,
  });
  for (const tags of [
    { next: version },
    { latest: version },
    { next: version, latest: "0.1.0-rc.1" },
    { next: "0.1.0-rc.1", latest: version },
  ])
    expect(() => assertPublicRegistryFacts(facts(tags))).toThrow();
});

test("rc.2 configuration selects all eleven paths without inheriting rc.1 publication approval", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  const control = JSON.parse(
    readFileSync("docs/release/publication-control.json", "utf8"),
  );
  expect(PACKAGE_VERSION).toBe(version);
  expect(manifest.version).toBe(version);
  expect(PUBLIC_SUBPATHS).toHaveLength(11);
  expect(control).toMatchObject({
    enabled: false,
    mode: "UNRESOLVED",
    coordinate: `@hadden-industries/owlapi@${version}`,
    reviewedOn: null,
  });
  expect(
    deriveWorkflowMetadata({ manifest, publication: control })
      .publication_enabled,
  ).toBe("false");
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(
    readFileSync("docs/release/publication-control.schema.json", "utf8"),
  );
  const validate = ajv.compile(schema);
  expect(validate(control)).toBe(true);
  const historical = JSON.parse(
    readFileSync(
      "docs/release/history/0.1.0-rc.1-publication-control.json",
      "utf8",
    ),
  );
  expect(historical).toMatchObject({
    coordinate: "@hadden-industries/owlapi@0.1.0-rc.1",
    enabled: true,
    reviewedOn: "2026-10-03",
  });
  expect(validate(historical)).toBe(true);
  expect(() =>
    deriveWorkflowMetadata({ manifest, publication: historical }),
  ).toThrow();
});
