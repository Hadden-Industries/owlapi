import { expect, test } from "@playwright/test";

const BASE_URL = process.env.OWLAPI_BROWSER_BASE_URL;
if (!BASE_URL) {
  throw new Error(
    "OWLAPI_BROWSER_BASE_URL must identify the prepared local fixture server",
  );
}

const runConsumer = async (page, mode) => {
  const requests = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("requestfailed", (request) =>
    failedRequests.push({
      errorText: request.failure()?.errorText,
      url: request.url(),
    }),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto(`${BASE_URL}/${mode}/`);
  await page
    .waitForFunction(
      () =>
        /^(?:passed|failed)$/u.test(
          globalThis.document.body.dataset.state ?? "",
        ),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);

  const state = await page.locator("body").getAttribute("data-state");
  const error = await page.evaluate(() => globalThis.__OWLAPI_ERROR);
  // Firefox's native parser logs the deliberately malformed XML control.
  const expectedConsoleErrors =
    test.info().project.name === "firefox" && mode !== "worker"
      ? [
          expect.stringContaining(
            "XML Parsing Error: mismatched tag. Expected: </a>.",
          ),
        ]
      : [];
  expect({ consoleErrors, error, failedRequests, state }).toEqual({
    consoleErrors: expectedConsoleErrors,
    error: undefined,
    failedRequests: [],
    state: "passed",
  });

  const result = await page.evaluate(() => globalThis.__OWLAPI_RESULT);
  expect(result.bindingIdentity).toEqual({
    apibinding: true,
    formats: true,
    io: true,
    model: true,
    profiles: true,
    util: true,
  });
  expect(Object.keys(result.documents).sort()).toEqual([
    "functional",
    "jsonld",
    "rdfxml",
    "turtle",
  ]);
  for (const document of Object.values(result.documents)) {
    expect(Number.isSafeInteger(document.axiomCount)).toBe(true);
    expect(Number.isSafeInteger(document.importCount)).toBe(true);
    expect(document.mergedAxiomCount).toBe(document.axiomCount);
    expect(document.mergedImportCount).toBe(0);
  }
  expect(result.importClosure).toEqual({
    closureCount: 4,
    importLoadCount: 3,
    directAxiomCount: 26,
    rootAnnotationCount: 1,
    anonymousIndividualCount: 4,
    formats: ["functional", "rdfxml"],
    reloadLoaderCalls: 0,
    diagnosticCount: 0,
    retainedTargetAfterFailure: true,
    sourceReaderPreserved: true,
  });
  const { xmlControls, ...profile } = result.profile;
  expect(profile).toEqual({
    formal: "invalid",
    source: "invalid",
    closureCount: 2,
    sourceCodes: ["LITERAL_LEXICAL_SPACE"],
    formats: ["functional", "turtle"],
    importContext: true,
    cardinality: "9007199254740993",
    singletonOperands: 1,
    invalidXml: true,
    bounded: "unverified",
    abortName: "AbortError",
    stale: true,
  });
  expect(xmlControls).toHaveLength(2);
  expect(xmlControls[0]).toEqual({
    status: "valid",
    codes: [],
    unverified: [],
  });
  expect(xmlControls[1]).toMatchObject({
    status: "invalid",
    unverified: [],
  });
  expect(xmlControls[1].codes).toHaveLength(1);
  // Native XML parsers can return an error document instead of throwing;
  // canonical-form comparison must reject that document too.
  expect([
    "XML_LITERAL_NOT_WELL_FORMED",
    "XML_LITERAL_NOT_CANONICAL",
  ]).toContain(xmlControls[1].codes[0]);
  expect(
    requests.every((url) => new URL(url).origin === new URL(BASE_URL).origin),
  ).toBe(true);

  return requests;
};

for (const mode of ["bundler", "import-map"]) {
  test(`${mode} consumes the retained package through public specifiers`, async ({
    page,
  }) => {
    await runConsumer(page, mode);
  });
}

test("bundled DedicatedWorker returns clone-safe parsing evidence", async ({
  page,
}) => {
  await runConsumer(page, "worker");
});
