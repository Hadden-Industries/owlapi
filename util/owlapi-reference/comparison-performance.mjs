import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  arch,
  availableParallelism,
  platform,
  release,
  totalmem,
} from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { executeComparisonProcess } from "./comparison-oracle.mjs";

async function observeWorkingSet(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw new Error("Invalid worker process identity");
  if (process.platform === "win32") {
    const powershell = join(
      process.env.SystemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const command = [
      `$worker = Get-Process -Id ${pid} -ErrorAction Stop`,
      "[ordered]@{rssBytes=$worker.WorkingSet64;peakRssBytes=$worker.PeakWorkingSet64} | ConvertTo-Json -Compress",
    ].join("\n");
    const result = await executeComparisonProcess(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", command],
      {
        timeout: 15_000,
      },
    );
    if (result.exitCode !== 0)
      throw new Error("Could not read Windows process working set");
    return JSON.parse(result.stdout);
  }
  if (process.platform === "linux") {
    const status = await readFile(`/proc/${pid}/status`, "utf8");
    const value = (field) =>
      Number(new RegExp(`^${field}:\\s+(\\d+) kB$`, "mu").exec(status)?.[1]);
    return {
      rssBytes: value("VmRSS") * 1024,
      peakRssBytes: value("VmHWM") * 1024,
    };
  }
  throw new Error(`Working-set sampling is unavailable on ${process.platform}`);
}

/** A worker suspends outside the load clock until its parent has observed each checkpoint. */
export async function measureComparisonWorker(worker, caseId, mode, timeoutMs) {
  const child = spawn(worker.file, worker.args, {
    ...worker.options,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    signal: AbortSignal.timeout(timeoutMs),
  });
  let failure;
  let stderr = "";
  child.on("error", (error) => {
    failure = error;
  });
  child.stdin.on("error", (error) => {
    failure = error;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-65_536);
  });
  const exited = new Promise((resolve) => child.once("close", resolve));
  const checkpoints = [];
  let result;
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const message = JSON.parse(line);
      if (message.caseId !== caseId || result)
        throw new Error("Worker changed its performance case identity");
      if (message.kind === "checkpoint") {
        const phase = checkpoints.length === 0 ? "before" : "after";
        if (
          mode !== "cold" ||
          checkpoints.length >= 2 ||
          message.phase !== phase ||
          message.pid !== child.pid
        ) {
          throw new Error("Unexpected load measurement checkpoint");
        }
        const workingSet = await observeWorkingSet(child.pid);
        if (
          !Number.isSafeInteger(workingSet.rssBytes) ||
          !Number.isSafeInteger(workingSet.peakRssBytes) ||
          workingSet.peakRssBytes < workingSet.rssBytes
        ) {
          throw new Error("Invalid OS process working-set observation");
        }
        checkpoints.push({
          ...workingSet,
          phase,
          heapUsedBytes: message.heapUsedBytes,
        });
        child.stdin.write(".");
      } else if (message.kind === "sample") {
        result = message;
        child.stdin.end();
      } else throw new Error("Unknown performance worker message");
    }
  } catch (error) {
    child.kill();
    await exited;
    throw error;
  } finally {
    lines.close();
  }
  const code = await exited;
  if (failure || code !== 0 || !result) {
    throw new Error(
      failure?.message ?? `Performance worker incomplete: ${stderr.trim()}`,
    );
  }
  if (
    result.status === "completed" &&
    mode === "cold" &&
    checkpoints.length !== 2
  ) {
    throw new Error("Performance worker did not finish both OS observations");
  }
  return { ...result, checkpoints };
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[center]
    : (sorted[center - 1] + sorted[center]) / 2;
};

export function loadPerformanceReport({
  samples,
  sameOperation,
  expectedCounts,
}) {
  const allCompleted = Object.entries(samples).every(
    ([engine, { cold, warm }]) => {
      const expected = expectedCounts[engine];
      return (
        cold.every(
          (sample) =>
            sample.status === "completed" &&
            sample.axioms === expected &&
            sample.networkAttempts === 0,
        ) &&
        warm.status === "completed" &&
        warm.axioms === expected &&
        warm.networkAttempts === 0
      );
    },
  );
  const comparable = sameOperation && allCompleted;
  const summary = Object.fromEntries(
    Object.entries(samples).map(([engine, { cold, warm }]) => [
      engine,
      {
        coldPeakBytes: cold.every((item) => item.status === "completed")
          ? median(
              cold.map(({ checkpoints }) => checkpoints.at(-1).peakRssBytes),
            )
          : null,
        warmMedianNanos:
          warm.status === "completed" ? median(warm.wallNanos) : null,
      },
    ]),
  );
  return {
    schemaVersion: 1,
    boundary: "loadOntologyFromOntologyDocument",
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      logicalProcessors: availableParallelism(),
      physicalMemoryBytes: totalmem(),
    },
    samples,
    summary,
    comparison: comparable
      ? {
          status: "qualified",
          peakRssRatio: summary.js.coldPeakBytes / summary.java.coldPeakBytes,
          warmTimeRatio:
            summary.js.warmMedianNanos / summary.java.warmMedianNanos,
        }
      : {
          status: "diagnostic-only",
          reason: sameOperation
            ? "A worker failed or returned a different model count"
            : "An independent untimed comparison has not established equivalent completed loads",
        },
  };
}
