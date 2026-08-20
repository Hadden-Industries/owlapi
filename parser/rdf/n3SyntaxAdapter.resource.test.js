import { Transform } from "node:stream";

import { jest } from "@jest/globals";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";

import { createTurtleSyntaxAdapter } from "./n3SyntaxAdapter.js";

const configuration = (values = {}) =>
  new OWLOntologyLoaderConfiguration(values);
const source = (text) => new StringDocumentSource(text);

const twoQuads = `@prefix ex: <urn:test:> .
  ex:s ex:first "one" ; ex:second "two" .`;

describe("N3SyntaxAdapter security and finite resources", () => {
  it("enforces input, lexer-token, quad, blank-node, and token-length limits", async () => {
    const adapter = createTurtleSyntaxAdapter();

    await expect(
      adapter.parse(source(twoQuads), configuration({ maxInputBytes: 1 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxInputBytes",
    });
    await expect(
      adapter.parse(source(twoQuads), configuration({ maxTokenCount: 1 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenCount",
    });
    await expect(
      adapter.parse(source(twoQuads), configuration({ maxQuads: 1 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxQuads",
    });
    await expect(
      adapter.parse(
        source("@prefix ex: <urn:test:> . [] ex:p [] ."),
        configuration({ maxBlankNodes: 1 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      observed: 2,
      resource: "maxBlankNodes",
    });
    await expect(
      adapter.parse(
        source('@prefix ex: <urn:test:> . ex:s ex:p "far too long" .'),
        configuration({ maxTokenLength: 4 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
    });
  });

  it("applies the token-length limit to datatype IRIs", async () => {
    const adapter = createTurtleSyntaxAdapter();

    await expect(
      adapter.parse(
        source('<urn:s> <urn:p> "x"^^<urn:datatype:far-too-long> .'),
        configuration({ maxTokenLength: 16 }),
      ),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "maxTokenLength",
      tokenType: "typeIRI",
    });
  });

  it("enforces timeout and pre-aborted signals", async () => {
    const adapter = createTurtleSyntaxAdapter();
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.parse(source(twoQuads), configuration({ timeoutMs: 0 })),
    ).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
      resource: "timeoutMs",
    });
    await expect(
      adapter.parse(
        source(twoQuads),
        configuration({ signal: controller.signal }),
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("terminates a dependency stream that stalls after input ends", async () => {
    let parser;
    let guardTimer;

    class StalledParser extends Transform {
      constructor() {
        super({ readableObjectMode: true });
        parser = this;
      }

      _transform(chunk, encoding, callback) {
        callback();
      }

      _flush() {}
    }

    const adapter = createTurtleSyntaxAdapter({
      loadImplementation: async () => ({
        Lexer: class StalledLexer {
          tokenize() {}
        },
        StreamParser: StalledParser,
      }),
    });
    const guard = new Promise((resolve, reject) => {
      guardTimer = globalThis.setTimeout(() => {
        parser?.destroy();
        reject(new Error("The test guard observed a stalled parser"));
      }, 200);
    });

    try {
      await expect(
        Promise.race([
          adapter.parse(source(twoQuads), configuration({ timeoutMs: 20 })),
          guard,
        ]),
      ).rejects.toMatchObject({
        code: "RESOURCE_LIMIT_EXCEEDED",
        resource: "timeoutMs",
      });
      expect(parser.destroyed).toBe(true);
    } finally {
      globalThis.clearTimeout(guardTimer);
      parser?.destroy();
    }
  });

  it("caps long watchdog delays at the host timer maximum", async () => {
    const adapter = createTurtleSyntaxAdapter();
    const originalSetTimeout = globalThis.setTimeout;
    const observedDelays = [];
    const setTimeoutSpy = jest
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback, delay, ...arguments_) => {
        observedDelays.push(delay);
        return originalSetTimeout(
          callback,
          Math.min(delay, 200),
          ...arguments_,
        );
      });

    try {
      await expect(
        adapter.parse(
          source(twoQuads),
          configuration({ timeoutMs: Number.MAX_SAFE_INTEGER }),
        ),
      ).resolves.toBeDefined();
      expect(observedDelays.length).toBeGreaterThan(0);
      expect(Math.max(...observedDelays)).toBeLessThanOrEqual(2_147_483_647);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("prefers scheduler.yield when the main-thread budget expires", async () => {
    const schedulerDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "scheduler",
    );
    const yieldTask = jest.fn(async () => {});
    let elapsed = 0;
    const nowSpy = jest
      .spyOn(globalThis.performance, "now")
      .mockImplementation(() => (elapsed += 60));
    Object.defineProperty(globalThis, "scheduler", {
      configurable: true,
      value: { yield: yieldTask },
    });

    try {
      const adapter = createTurtleSyntaxAdapter({ chunkSize: 8 });

      await expect(adapter.parse(source(twoQuads))).resolves.toBeDefined();
      expect(yieldTask).toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
      if (schedulerDescriptor) {
        Object.defineProperty(globalThis, "scheduler", schedulerDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "scheduler");
      }
    }
  });

  it("cooperatively delivers an in-flight abort while streaming chunks", async () => {
    const adapter = createTurtleSyntaxAdapter({ chunkSize: 32 });
    const controller = new AbortController();
    const triples = Array.from(
      { length: 20_000 },
      (_, index) => `<urn:s${index}> <urn:p> "${index}" .`,
    ).join("\n");
    const parsing = adapter.parse(
      source(triples),
      configuration({ signal: controller.signal, timeoutMs: 30_000 }),
    );
    globalThis.setTimeout(() => controller.abort(), 0);

    await expect(parsing).rejects.toMatchObject({ name: "AbortError" });
  });
});
