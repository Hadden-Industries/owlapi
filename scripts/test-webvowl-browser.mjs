import { createServer } from "node:http";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

import { chromium } from "@playwright/test";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return process.argv[index + 1];
};

const deployRoot = resolve(argument("--deploy-root"));
const outputPath = resolve(argument("--output"));

const contentTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
});

const resolveRequestPath = (requestUrl) => {
  const pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  const requested =
    pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = resolve(deployRoot, requested);
  const relation = relative(deployRoot, filePath);
  if (
    relation.startsWith(`..${sep}`) ||
    relation === ".." ||
    relation.startsWith(sep)
  ) {
    return undefined;
  }
  return filePath;
};

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url ?? "/");
  try {
    if (!filePath || !statSync(filePath).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type":
        contentTypes[extname(filePath)] ?? "application/octet-stream",
    });
    response.end(readFileSync(filePath));
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("The WebVOWL browser fixture did not receive a TCP address.");
}

const result = {
  browser: "chromium",
  browserVersion: null,
  consumptionMode: "webvowl-vite-production-bundle",
  result: "FAIL",
  assertions: [],
  consoleErrors: [],
  pageErrors: [],
};

let browser;
try {
  browser = await chromium.launch();
  result.browserVersion = browser.version();
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") {
      result.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => result.pageErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(
    () =>
      globalThis.document
        .querySelector("#result")
        ?.getAttribute("data-state") === "pass",
    undefined,
    { timeout: 30_000 },
  );
  result.assertions.push(
    "WebVOWL's Vite-built owl2vowl consumer completed RDF/XML ingestion",
  );

  const rendered = await page.locator("#result").textContent();
  if (!rendered?.includes("Candidate class")) {
    throw new Error(
      `WebVOWL did not render the converted class label: ${rendered}`,
    );
  }
  result.assertions.push(
    "the VOWL conversion contains the expected class label",
  );
  if (result.pageErrors.length > 0) {
    throw new Error(
      `WebVOWL raised page errors: ${result.pageErrors.join("; ")}`,
    );
  }
  result.assertions.push("no uncaught page error was raised");
  result.result = "PASS";
} finally {
  await browser?.close();
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose())),
  );
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

if (result.result !== "PASS") {
  process.exitCode = 1;
}
