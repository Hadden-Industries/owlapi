import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const launcher = fileURLToPath(
  new URL("./run-comparison-job.ps1", import.meta.url),
);

export async function runWindowsComparisonJob(request, environment, worker) {
  const budgetMiB = environment.memoryBudgetMiB ?? 3072;
  if (
    !Number.isSafeInteger(budgetMiB) ||
    budgetMiB < 256 ||
    budgetMiB > 65_536
  ) {
    throw new Error("Comparison memory budget must be 256 to 65536 MiB");
  }
  const nodeHeapMiB = environment.nodeHeapMiB ?? Math.floor(budgetMiB / 2);
  if (
    !Number.isSafeInteger(nodeHeapMiB) ||
    nodeHeapMiB < 64 ||
    nodeHeapMiB >= budgetMiB
  ) {
    throw new Error(
      "Node heap must be at least 64 MiB and smaller than the comparison job budget",
    );
  }
  if (!process.env.SystemRoot)
    throw new Error("Windows system PowerShell is unavailable");
  const powershell = join(
    process.env.SystemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const directory = await mkdtemp(join(tmpdir(), "owlapi-comparison-job-"));
  try {
    const path = join(directory, "request.json");
    await writeFile(
      path,
      JSON.stringify({
        request,
        environment: {
          ...environment,
          localSeeds: [...(environment.localSeeds ?? [])],
          memoryBudgetMiB: budgetMiB,
          nodeHeapMiB,
        },
      }),
      { flag: "wx" },
    );
    const { stderr } = await execute(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        launcher,
        "-NodeExecutable",
        process.execPath,
        "-Worker",
        worker,
        "-RequestFile",
        path,
        "-BudgetMiB",
        String(budgetMiB),
        "-NodeHeapMiB",
        String(nodeHeapMiB),
        "-ParentProcessId",
        String(process.pid),
        ...(process.execArgv.includes("--expose-gc") ? ["-ExposeGc"] : []),
      ],
      { windowsHide: true, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    try {
      return JSON.parse(await readFile(join(directory, "result.json"), "utf8"));
    } catch (cause) {
      throw new Error(
        stderr.trim() ||
          "The worker exited without completing its comparison report. Check the attempt directory for completed case receipts.",
        { cause },
      );
    }
  } catch (error) {
    const diagnostic = error.stderr?.trim() ?? error.message;
    throw new Error(
      `Comparison memory job failed: ${diagnostic.slice(0, 4096)}`,
      { cause: error },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
