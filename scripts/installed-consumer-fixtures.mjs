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
]);
const testRoot = fileURLToPath(new URL("../test/", import.meta.url));

/** Materialize identical consumer exercises using each real native installation name. */
export const writeInstalledConsumerFixtures = (
  directory,
  dependencyName = "owlapi",
) => {
  if (!["owlapi", PACKAGE_NAME].includes(dependencyName))
    throw new Error("Unexpected fixture dependency name.");
  mkdirSync(join(directory, "import-closure"));
  copyFileSync(
    join(testRoot, "import-closure", "public-contract.js"),
    join(directory, "import-closure", "public-contract.js"),
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
        : source.replaceAll('"owlapi', `"${dependencyName}`);
    writeFileSync(join(directory, name), fixture);
  }
};
