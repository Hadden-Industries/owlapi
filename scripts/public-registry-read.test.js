import { jest } from "@jest/globals";
import { readPublicRegistry } from "./public-registry-read.mjs";

afterEach(() => jest.restoreAllMocks());

test.each([401, 403, 404])(
  "does not retry ordinary HTTP %i",
  async (status) => {
    const request = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status }));
    await expect(
      readPublicRegistry("https://registry.npmjs.org/example"),
    ).rejects.toThrow(`HTTP ${status}`);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    expect(request.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  },
);

test("retries a transient read, then returns the complete response bytes", async () => {
  const expected = new Response("{}");
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(expected);
  await expect(
    readPublicRegistry("https://registry.npmjs.org/example"),
  ).resolves.toEqual(Buffer.from("{}"));
  expect(request).toHaveBeenCalledTimes(2);
});

test("retries a transport failure after headers while reading the body", async () => {
  const failedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
      controller.error(new TypeError("connection reset during body"));
    },
  });
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(failedBody))
    .mockResolvedValueOnce(new Response("complete"));
  await expect(
    readPublicRegistry("https://registry.npmjs.org/example"),
  ).resolves.toEqual(Buffer.from("complete"));
  expect(request).toHaveBeenCalledTimes(2);
});

test("returns malformed JSON without retrying application-level failures", async () => {
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{malformed"));
  const bytes = await readPublicRegistry("https://registry.npmjs.org/example");
  expect(() => JSON.parse(bytes.toString("utf8"))).toThrow(SyntaxError);
  expect(request).toHaveBeenCalledTimes(1);
});

test("bounds a stalled successful response body with the same request signal", async () => {
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, { signal }) => {
      return new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => controller.error(signal.reason),
              { once: true },
            );
          },
        }),
      );
    });
  await expect(
    readPublicRegistry("https://registry.npmjs.org/example", {
      attempts: 1,
      timeoutMs: 20,
    }),
  ).rejects.toThrow(/abort|timeout/iu);
  expect(request).toHaveBeenCalledTimes(1);
});

test("stops after three transport failures", async () => {
  const request = jest
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("transport failure"));
  await expect(
    readPublicRegistry("https://registry.npmjs.org/example"),
  ).rejects.toThrow("transport failure");
  expect(request).toHaveBeenCalledTimes(3);
});
