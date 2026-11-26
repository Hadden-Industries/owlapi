/** Deterministic registry tarballs and independently specified npm v3 locations for offline installs. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../package-identity.mjs";

export async function installResolutionFixture(
  directory,
  npmCli,
  name,
  version,
) {
  const native = createRequire(npmCli);
  const cache = join(directory, "cache");
  const registry = "https://registry.npmjs.org/";
  const manifest = {
    name: "fixture",
    version: "1.0.0",
    private: true,
    dependencies: { [name]: "file:candidate.tgz" },
  };
  const packages = {
    "": {
      name: manifest.name,
      version: manifest.version,
      dependencies: manifest.dependencies,
    },
  };
  const first = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    dependencies: { reader: "1.0.0", host: "1.0.0" },
  };
  const foreign = process.platform === "linux" ? "win32" : "linux";
  const definitions = [
    [name, first],
    [
      "reader",
      {
        name: "reader",
        version: "1.0.0",
        dependencies: {
          "node-types": "*",
          older: "npm:leaf@^1.0.0",
          plugin: "1.0.0",
        },
        peerDependencies: { host: "^1" },
        optionalDependencies: { foreign: "1.0.0" },
      },
    ],
    ["host", { name: "host", version: "1.0.0" }],
    ["node-types", { name: "node-types", version }],
    ["older", { name: "leaf", version: "1.0.0" }],
    [
      "plugin",
      { name: "plugin", version: "1.0.0", dependencies: { leaf: "^2" } },
    ],
    ["leaf", { name: "leaf", version: "2.0.0" }],
    ["foreign", { name: "foreign", version: "1.0.0", os: [foreign] }],
  ];
  let tarball;
  for (const [binding, data] of definitions) {
    const work = join(
      directory,
      "archives",
      data.name.replace("/", "-") + "-" + data.version,
    );
    const contents = join(work, "package");
    mkdirSync(contents, { recursive: true });
    writeFileSync(join(contents, "package.json"), JSON.stringify(data));
    const tgz = join(work, "fixture.tgz");
    await native("tar").c(
      { file: tgz, cwd: work, gzip: true, portable: true, noMtime: true },
      ["package"],
    );
    const bytes = readFileSync(tgz);
    const integrity =
      "sha512-" + createHash("sha512").update(bytes).digest("base64");
    if (binding === name) {
      tarball = bytes;
      writeFileSync(join(directory, "candidate.tgz"), bytes);
    }
    const resolved =
      binding === name
        ? "file:candidate.tgz"
        : registry +
          data.name +
          "/-/" +
          data.name +
          "-" +
          data.version +
          ".tgz";
    packages["node_modules/" + binding] = {
      ...data,
      resolved,
      integrity,
      ...(data.name === "foreign" ? { optional: true } : {}),
    };
    await native("cacache").put(join(cache, "_cacache"), resolved, bytes);
  }
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  writeFileSync(
    join(directory, "package-lock.json"),
    JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      requires: true,
      lockfileVersion: 3,
      packages,
    }),
  );
  execFileSync(
    process.execPath,
    [
      npmCli,
      "ci",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      cache,
      "--userconfig",
      join(directory, "empty-user.npmrc"),
      "--globalconfig",
      join(directory, "empty-global.npmrc"),
    ],
    { cwd: directory, stdio: "pipe", timeout: 30000 },
  );
  return { tarball, first, packages };
}
