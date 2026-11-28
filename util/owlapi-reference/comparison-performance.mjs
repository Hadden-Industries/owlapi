import { spawn } from "node:child_process";
import { once } from "node:events";
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
import { comparisonIdentity } from "./comparison-evidence.mjs";

/** Suspend a JS worker outside its operation while the parent reads its OS counters. */
export function performanceWorkerReporter({ caseId, executionId, sampleId }) {
  const emit = (message) =>
    process.stdout.write(
      JSON.stringify({ caseId, executionId, sampleId, ...message }) + "\n",
    );
  return {
    emit,
    async checkpoint(phase) {
      const waiting = once(process.stdin, "data");
      const { heapUsed, heapTotal, external, arrayBuffers } =
        process.memoryUsage();
      emit({
        kind: "checkpoint",
        phase,
        pid: process.pid,
        heapUsedBytes: heapUsed,
        heapTotalBytes: heapTotal,
        externalBytes: external,
        arrayBufferBytes: arrayBuffers,
      });
      process.stdin.resume();
      const [acknowledgement] = await waiting;
      process.stdin.pause();
      if (acknowledgement.toString() !== ".")
        throw new Error("Working-set observer disconnected");
    },
  };
}

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
export async function measureComparisonWorker(
  worker,
  { caseId, executionId, sampleId, materializeAxioms = false },
  mode,
  timeoutMs,
) {
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
  const phases = materializeAxioms
    ? ["before", "after", "materialized"]
    : ["before", "after"];
  let result;
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const message = JSON.parse(line);
      if (
        message.caseId !== caseId ||
        message.executionId !== executionId ||
        message.sampleId !== sampleId ||
        result
      )
        throw new Error("Worker changed its performance case identity");
      if (message.kind === "checkpoint") {
        const phase = phases[checkpoints.length];
        if (
          mode !== "cold" ||
          phase === undefined ||
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
          heapTotalBytes: message.heapTotalBytes,
          ...(message.externalBytes === undefined
            ? {}
            : {
                externalBytes: message.externalBytes,
                arrayBufferBytes: message.arrayBufferBytes,
              }),
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
    const error = new Error(
      failure?.message ?? `Performance worker incomplete: ${stderr.trim()}`,
    );
    error.checkpoints = checkpoints;
    throw error;
  }
  if (
    result.status === "completed" &&
    mode === "cold" &&
    checkpoints.length !== phases.length
  ) {
    throw new Error("Performance worker did not finish its OS observations");
  }
  return { ...result, checkpoints };
}

export const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[center]
    : (sorted[center - 1] + sorted[center]) / 2;
};

const byteCount = (value) => Number.isSafeInteger(value) && value >= 0;

function hasTimings(sample, identity, repetitions, slot) {
  return (
    sample?.status === "completed" &&
    sample.caseId === identity.caseId &&
    sample.executionId === identity.executionId &&
    sample.sampleId === slot &&
    Array.isArray(sample.wallNanos) &&
    sample.wallNanos.length === repetitions &&
    sample.wallNanos.every((nanos) => Number.isSafeInteger(nanos) && nanos > 0)
  );
}

function hasWorkingSet(point, phase) {
  return (
    point?.phase === phase &&
    byteCount(point.rssBytes) &&
    point.rssBytes > 0 &&
    byteCount(point.peakRssBytes) &&
    point.peakRssBytes >= point.rssBytes
  );
}

function validLoadWitness({ witness, axioms, networkAttempts }) {
  return (
    networkAttempts === 0 &&
    byteCount(axioms) &&
    witness?.axioms === axioms &&
    witness.identity &&
    ["ontologyIRI", "versionIRI"].every(
      (key) =>
        witness.identity[key] === null ||
        typeof witness.identity[key] === "string",
    ) &&
    byteCount(witness.ontologyAnnotations) &&
    Array.isArray(witness.imports) &&
    witness.imports.every((iri) => typeof iri === "string")
  );
}

export function hasMemoryCheckpoints(sample, phases, engine) {
  return (
    Array.isArray(sample.checkpoints) &&
    sample.checkpoints.length === phases.length &&
    sample.checkpoints.every(
      (point, i) =>
        hasWorkingSet(point, phases[i]) &&
        byteCount(point.heapUsedBytes) &&
        byteCount(point.heapTotalBytes) &&
        point.heapTotalBytes >= point.heapUsedBytes &&
        (engine !== "js" ||
          (byteCount(point.externalBytes) &&
            byteCount(point.arrayBufferBytes))),
    )
  );
}

/** Reconstruct the public load and optional materialization peaks from the original samples. */
export function isolatedLoadReport(samples, protocol, identity) {
  const summary = {};
  const witnesses = new Set();
  const ontologyIds = new Set();
  let consistentTrials = true;
  const phases = protocol.materializeAxioms
    ? ["before", "after", "materialized"]
    : ["before", "after"];
  let complete = true;
  if (Object.keys(samples ?? {}).length !== protocol.engines.length)
    throw new Error("Wrong set of load-only sample engines");
  for (const engine of protocol.engines) {
    const engineWitnesses = new Set();
    const cold = samples[engine]?.cold;
    if (!Array.isArray(cold) || cold.length !== protocol.coldSamples)
      throw new Error("Wrong number of isolated cold loads");
    const peaks = [],
      durations = [],
      setPeaks = [];
    for (const [index, sample] of cold.entries()) {
      if (sample?.status !== "completed") {
        complete = false;
        continue;
      }
      if (
        !hasTimings(sample, identity, 1, `${engine}-cold-${index}`) ||
        !validLoadWitness(sample) ||
        !hasMemoryCheckpoints(sample, phases, engine) ||
        (engine === "js" &&
          (!["stream", "string"].includes(sample.sourceTransport) ||
            (protocol.sourceTransport !== "auto" &&
              sample.sourceTransport !== protocol.sourceTransport)))
      )
        throw new Error("Invalid isolated load witness or phase checkpoint");
      peaks.push(sample.checkpoints[1].peakRssBytes);
      durations.push(sample.wallNanos[0]);
      if (protocol.materializeAxioms)
        setPeaks.push(sample.checkpoints[2].peakRssBytes);
      const digest = comparisonIdentity(sample.witness);
      engineWitnesses.add(digest);
      witnesses.add(digest);
      ontologyIds.add(comparisonIdentity(sample.witness.identity));
    }
    if (engineWitnesses.size > 1) consistentTrials = false;
    if (peaks.length === cold.length) {
      summary[engine] = {
        coldPeakBytes: median(peaks),
        coldMedianNanos: median(durations),
        ...(setPeaks.length ? { materializedPeakBytes: median(setPeaks) } : {}),
      };
    }
  }
  const unequalWork =
    complete &&
    consistentTrials &&
    ontologyIds.size === 1 &&
    witnesses.size > 1;
  const status = !complete
    ? "incomplete"
    : !consistentTrials || ontologyIds.size !== 1
      ? "failed"
      : protocol.allocationProfile || unequalWork
        ? "diagnostic-only"
        : "observed";
  return {
    status,
    measurementKind: protocol.allocationProfile
      ? "allocation-profile"
      : "clean",
    ...(unequalWork
      ? {
          reason:
            "The engines returned different load witnesses for the same ontology",
        }
      : {}),
    ...(protocol.allocationProfile || unequalWork
      ? { diagnosticSummary: summary }
      : { summary }),
    witnessDigests: [...witnesses].sort(),
    boundary: "loadOntologyFromOntologyDocument",
  };
}

export function loadPerformanceReport({
  samples,
  sameOperation,
  expectedCounts,
  protocol,
  identity,
}) {
  const engines = ["js", "java"];
  if (
    Object.keys(samples ?? {}).length !== engines.length ||
    engines.some(
      (engine) =>
        !Array.isArray(samples[engine]?.cold) ||
        samples[engine].cold.length !== protocol.coldSamples,
    )
  ) {
    throw new Error(
      "The performance report lacks the requested cold sample count",
    );
  }
  const hasMeasurements = (sample, slot) =>
    hasTimings(sample, identity, 1, slot) &&
    sample.checkpoints?.length === 2 &&
    sample.checkpoints.every((point, index) =>
      hasWorkingSet(point, ["before", "after"][index]),
    );
  const allCompleted = engines.every((engine) => {
    const { cold, warm } = samples[engine];
    const expected = expectedCounts[engine];
    const matches = (sample) =>
      Number.isSafeInteger(expected) &&
      sample.axioms === expected &&
      sample.networkAttempts === 0;
    return (
      cold.every(
        (sample, index) =>
          hasMeasurements(sample, `${engine}-cold-${index}`) && matches(sample),
      ) &&
      hasTimings(warm, identity, protocol.repetitions, `${engine}-warm-0`) &&
      matches(warm)
    );
  });
  const comparable = sameOperation && allCompleted;
  const summary = Object.fromEntries(
    Object.entries(samples).map(([engine, { cold, warm }]) => [
      engine,
      {
        coldPeakBytes: cold.every((sample, index) =>
          hasMeasurements(sample, `${engine}-cold-${index}`),
        )
          ? median(
              cold.map(({ checkpoints }) => checkpoints.at(-1).peakRssBytes),
            )
          : null,
        warmMedianNanos: hasTimings(
          warm,
          identity,
          protocol.repetitions,
          `${engine}-warm-0`,
        )
          ? median(warm.wallNanos)
          : null,
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
