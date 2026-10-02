import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PUBLIC_SUBPATHS,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { verifyRegistryInstallation } from "./public-registry-consumer.mjs";

const roots = [];
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value));
const fixture = (dependencyName = "owlapi") => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-registry-test-"));
  roots.push(directory);
  const metadata = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    dist: {
      tarball: `https://registry.npmjs.org/${PACKAGE_NAME}/-/owlapi-${PACKAGE_VERSION}.tgz`,
      integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
    },
  };
  const specifier =
    dependencyName === "owlapi"
      ? `npm:${PACKAGE_NAME}@${PACKAGE_VERSION}`
      : PACKAGE_VERSION;
  const dependencies = { [dependencyName]: specifier };
  writeJson(join(directory, "package.json"), { private: true, dependencies });
  writeJson(join(directory, "package-lock.json"), {
    lockfileVersion: 3,
    packages: {
      "": { dependencies },
      [`node_modules/${dependencyName}`]: {
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        resolved: metadata.dist.tarball,
        integrity: metadata.dist.integrity,
      },
    },
  });
  const packageRoot = join(directory, "node_modules", dependencyName);
  const exports = Object.fromEntries(
    [...PUBLIC_SUBPATHS]
      .reverse()
      .map((subpath) => [
        subpath ? `.${subpath}` : ".",
        subpath ? `.${subpath}/index.js` : "./index.js",
      ]),
  );
  for (const target of Object.values(exports)) {
    const path = join(packageRoot, target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "export const installed = true;\n");
  }
  writeJson(join(packageRoot, "package.json"), {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    type: "module",
    exports,
  });
  return { directory, dependencyName, metadata };
};
const mutateJson = (path, change) => {
  const value = JSON.parse(readFileSync(path, "utf8"));
  change(value);
  writeJson(path, value);
};
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test.each(["owlapi", PACKAGE_NAME])(
  "verifies seven native installed roots through %s",
  (dependencyName) => {
    const input = fixture(dependencyName);
    expect(verifyRegistryInstallation(input)).toMatchObject({
      mode: "PUBLIC_REGISTRY",
      package: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
      dependencyName,
      importSpecifiers: PUBLIC_SUBPATHS.map(
        (subpath) => `${dependencyName}${subpath}`,
      ),
    });
  },
);

test.each([
  [
    "bare identity",
    (value) => {
      value.name = "owlapi";
    },
  ],
  [
    "different scope",
    (value) => {
      value.name = "@someone/owlapi";
    },
  ],
  [
    "different version",
    (value) => {
      value.version = "0.1.0";
    },
  ],
  [
    "extra export",
    (value) => {
      value.exports["./internal"] = "./index.js";
    },
  ],
  [
    "retargeted export",
    (value) => {
      value.exports["./model"] = "./index.js";
    },
  ],
])("rejects installed %s", (_label, change) => {
  const input = fixture();
  mutateJson(join(input.directory, "node_modules/owlapi/package.json"), change);
  expect(() => verifyRegistryInstallation(input)).toThrow();
});

test.each([
  [
    "local tarball",
    (entry) => {
      entry.resolved = "file:../candidate.tgz";
    },
  ],
  [
    "wrong integrity",
    (entry) => {
      entry.integrity = `sha512-${Buffer.alloc(64, 2).toString("base64")}`;
    },
  ],
  [
    "linked checkout",
    (entry) => {
      entry.link = true;
    },
  ],
  [
    "alias relabeling",
    (entry) => {
      entry.name = "owlapi";
    },
  ],
])("rejects lockfile %s", (_label, change) => {
  const input = fixture();
  mutateJson(join(input.directory, "package-lock.json"), (value) =>
    change(value.packages["node_modules/owlapi"]),
  );
  expect(() => verifyRegistryInstallation(input)).toThrow(/exact registry/u);
});

test("rejects a floating alias even if the current installation happens to match", () => {
  const input = fixture();
  mutateJson(join(input.directory, "package.json"), (value) => {
    value.dependencies.owlapi = `npm:${PACKAGE_NAME}@next`;
  });
  expect(() => verifyRegistryInstallation(input)).toThrow(/exact registry/u);
});

test.each([
  "https://registry.npmjs.org/owlapi/-/owlapi-0.1.0-rc.1.tgz",
  "https://registry.npmjs.org/@someone/owlapi/-/owlapi-0.1.0-rc.1.tgz",
  "https://example.com/@hadden-industries/owlapi/-/owlapi-0.1.0-rc.1.tgz",
  "https://user@registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-0.1.0-rc.1.tgz",
  "https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-0.1.0-rc.1.tgz?redirect=x",
])("rejects registry location %s", (url) => {
  expect(() => assertRegistryTarballUrl(url)).toThrow();
});
