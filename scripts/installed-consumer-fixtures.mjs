import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "./package-identity.mjs";

export const INSTALLED_TEST_SCRIPTS = Object.freeze([
  "installed-package-smoke.mjs",
  "installed-package-boundary.mjs",
  "installed-package-import-purity.mjs",
  "installed-package-no-network.mjs",
  "installed-package-import-closure.mjs",
  "installed-node-transport.mjs",
]);
const testRoot = fileURLToPath(new URL("../test/", import.meta.url));

/** Carry the reviewed production script decisions into isolated consumer roots.
 * npm owns enforcement; a dependency cannot grant itself install-script access.
 */
export const productionInstallScriptPolicy = () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );
  return Object.fromEntries(
    Object.entries(lock.packages)
      .filter(
        ([path, record]) => path && !record.dev && record.hasInstallScript,
      )
      .map(([path, record]) => {
        const name = record.name ?? path.split("node_modules/").at(-1);
        const identity = `${name}@${record.version}`;
        if (!Object.hasOwn(manifest.allowScripts, identity))
          throw new Error(
            `Missing production install-script decision: ${identity}`,
          );
        return [identity, manifest.allowScripts[identity]];
      }),
  );
};

/** Materialize identical consumer exercises using each real native installation name. */
export const writeInstalledConsumerFixtures = (
  directory,
  dependencyName = "owlapi",
) => {
  if (!["owlapi", PACKAGE_NAME].includes(dependencyName))
    throw new Error("Unexpected fixture dependency name.");
  mkdirSync(join(directory, "import-closure"));
  // Transport independently captured Java archive vectors, never a decoder-built oracle.
  const observations = JSON.parse(
    readFileSync(
      new URL(
        "../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).observations;
  const zipVectors = observations
    .find(({ probeId }) => probeId === "ObserveCompressionContracts")
    .stdout.trimEnd()
    .split("\n")
    .map((line) => line.split("\t"))
    .filter(([name]) => ["zip-first", "zip-stored", "zip-crc"].includes(name))
    .map(([name, suffix, encoding, disposition, base64, outcome]) => ({
      name,
      suffix,
      encoding,
      disposition,
      base64,
      outcome,
    }));
  if (zipVectors.length !== 3)
    throw new Error("Missing independent installed ZIP vectors");
  writeFileSync(
    join(directory, "compression-vectors.json"),
    `${JSON.stringify(zipVectors, null, 2)}\n`,
  );
  // Both source bridges and transported fixtures use the one pure encoder.
  copyFileSync(
    fileURLToPath(new URL("./canonical-json.mjs", import.meta.url)),
    join(directory, "import-closure", "json-identity.mjs"),
  );
  copyFileSync(
    join(testRoot, "import-closure", "public-contract.js"),
    join(directory, "import-closure", "public-contract.js"),
  );
  copyFileSync(
    join(testRoot, "import-closure", "rc2-public-contract.js"),
    join(directory, "import-closure", "rc2-public-contract.js"),
  );
  cpSync(
    join(testRoot, "import-closure", "fixtures"),
    join(directory, "import-closure", "fixtures"),
    { recursive: true },
  );
  for (const name of INSTALLED_TEST_SCRIPTS) {
    const source = readFileSync(join(testRoot, name), "utf8");
    // The fixture chooses a documented package specifier; Node still owns all resolution.
    const fixture =
      dependencyName === "owlapi"
        ? source
        : source.replaceAll(/"owlapi(?="|\/)/gu, `"${dependencyName}`);
    writeFileSync(join(directory, name), fixture);
  }
};
