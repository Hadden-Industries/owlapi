/** Explicit native integration check, separate from ordinary Jest discovery. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWindowsComparisonJob } from "./comparison-job.mjs";

test(
  "the Windows job refuses the same bounded allocation that a larger job admits",
  { skip: process.platform !== "win32", timeout: 60_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "owlapi-memory-control-"));
    try {
      const worker = join(directory, "allocation.mjs");
      await writeFile(
        worker,
        [
          'import { writeFileSync } from "node:fs";',
          'import { dirname, join } from "node:path";',
          "let allocated;",
          "try { const bytes = Buffer.alloc(320 * 1024 * 1024, 1); allocated = bytes.at(-1) === 1; }",
          "catch (error) { if (!(error instanceof RangeError)) throw error; allocated = false; }",
          'writeFileSync(join(dirname(process.argv[3]), "result.json"), JSON.stringify({ allocated }));',
        ].join("\n"),
      );
      const run = (memoryBudgetMiB) =>
        runWindowsComparisonJob(
          { action: "run" },
          { memoryBudgetMiB, nodeHeapMiB: 96 },
          worker,
        );
      assert.deepEqual(await run(768), { allocated: true });
      assert.deepEqual(await run(320), { allocated: false });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
