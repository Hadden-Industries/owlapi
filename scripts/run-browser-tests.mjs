import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startBrowserFixtureServer } from "./browser-fixture-server.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument`);
  }
  return process.argv[index + 1];
};

if (!process.env.npm_execpath) {
  throw new Error(
    "Run browser tests through the named npm script so the locked Playwright package is authoritative.",
  );
}

const fixtureRoot = resolve(valueAfter("--fixture-root"));
const project = process.argv.includes("--project")
  ? valueAfter("--project")
  : undefined;
const server = await startBrowserFixtureServer({ root: fixtureRoot });

try {
  const arguments_ = [
    fileURLToPath(import.meta.resolve("@playwright/test/cli")),
    "test",
    ...(project ? [`--project=${project}`] : []),
  ];
  const status = await new Promise((resolveStatus, reject) => {
    const child = spawn(process.execPath, arguments_, {
      cwd: REPOSITORY_ROOT,
      env: {
        ...process.env,
        OWLAPI_BROWSER_BASE_URL: server.baseUrl,
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", resolveStatus);
  });
  if (status !== 0) {
    throw new Error(
      `Playwright browser-consumer tests failed with status ${status}`,
    );
  }
} finally {
  await server.close();
}
