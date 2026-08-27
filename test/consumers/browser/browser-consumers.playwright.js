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
  expect({ consoleErrors, error, failedRequests, state }).toEqual({
    consoleErrors: [],
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
  }

  return requests;
};

for (const mode of ["bundler", "import-map"]) {
  test(`${mode} consumes the retained package through public specifiers`, async ({
    page,
  }) => {
    const requests = await runConsumer(page, mode);
    expect(requests.some((url) => /xmldom/iu.test(url))).toBe(false);
  });
}

test("bundled DedicatedWorker returns clone-safe parsing evidence", async ({
  page,
}) => {
  await runConsumer(page, "worker");
});
