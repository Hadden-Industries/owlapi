import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { arch, platform, release, version } from "node:os";
import { resolve } from "node:path";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};
const expectedOs = valueAfter("--expected-os");
const expectedArch = valueAfter("--expected-arch");
const requestedLabel = valueAfter("--label");
const selectedShell = valueAfter("--shell");
const outputPath = process.argv.includes("--output")
  ? resolve(valueAfter("--output"))
  : undefined;
const browserProject = process.argv.includes("--browser-project")
  ? valueAfter("--browser-project")
  : undefined;

const observedRunnerOs = process.env.RUNNER_OS;
const observedRunnerArch = process.env.RUNNER_ARCH;
if (observedRunnerOs && observedRunnerOs !== expectedOs) {
  throw new Error(
    `Runner OS ${observedRunnerOs} does not match ${expectedOs}.`,
  );
}
if (observedRunnerArch && observedRunnerArch !== expectedArch) {
  throw new Error(
    `Runner architecture ${observedRunnerArch} does not match ${expectedArch}.`,
  );
}

const npmCli = process.env.npm_execpath;
const npmVersion = npmCli
  ? spawnSync(process.execPath, [npmCli, "--version"], {
      encoding: "utf8",
    }).stdout.trim()
  : null;
const record = {
  schemaVersion: 1,
  requestedLabel,
  selectedShell,
  runner: {
    os: observedRunnerOs ?? null,
    architecture: observedRunnerArch ?? null,
    imageOS: process.env.ImageOS ?? null,
    imageVersion: process.env.ImageVersion ?? null,
  },
  operatingSystem: {
    platform: platform(),
    architecture: arch(),
    release: release(),
    version: version(),
  },
  runtime: {
    node: process.version,
    npm: npmVersion,
  },
};
if (browserProject) {
  const playwrightManifest = JSON.parse(
    readFileSync(
      new URL("../node_modules/@playwright/test/package.json", import.meta.url),
      "utf8",
    ),
  );
  const browserRegistry = JSON.parse(
    readFileSync(
      new URL("../node_modules/playwright-core/browsers.json", import.meta.url),
      "utf8",
    ),
  );
  const browser = browserRegistry.browsers.find(
    ({ name }) => name === browserProject,
  );
  if (!browser) {
    throw new Error(
      `No Playwright-managed revision exists for ${browserProject}.`,
    );
  }
  record.browser = {
    playwright: playwrightManifest.version,
    project: browserProject,
    revision: browser.revision,
    browserVersion: browser.browserVersion,
  };
}
const serialized = `${JSON.stringify(record, null, 2)}\n`;
if (outputPath) {
  writeFileSync(outputPath, serialized, "utf8");
}
process.stdout.write(serialized);
