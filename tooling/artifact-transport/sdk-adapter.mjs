/** Supported SDK operations execute in a cancellable, deadline-bound child process. */
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { policy } from "./identity.mjs";

export function createSdkAdapter({ worker, temporary }) {
  const call = (operation, args, { deadline, signal }) =>
    new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        reject(new Error("Artifact deadline exceeded"));
        return;
      }
      const child = fork(worker, [], {
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        execArgv: [],
      });
      let settled = false;
      const timer = setTimeout(
        () => finish(new Error("Artifact deadline exceeded")),
        remaining,
      );
      function finish(error, result) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        // Wait for handle closure before the caller retires owned temporary files.
        child.once("close", () => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        });
        child.kill();
      }
      function abort() {
        finish(new Error("Artifact operation cancelled"));
      }
      signal?.addEventListener("abort", abort, { once: true });
      child.on("message", (message) => {
        if (message.ok) {
          finish(null, message.result);
        } else {
          const error = new Error(
            `Artifact SDK ${operation} failed; disposition=${message.classification?.phase ?? "unknown"}`,
          );
          if (message.classification?.eligible) {
            error.name = "NetworkError";
            error.code = message.classification.code;
          }
          finish(error);
        }
      });
      child.on("error", () =>
        finish(new Error("Artifact SDK worker could not start")),
      );
      child.on("exit", () =>
        finish(new Error("Artifact SDK worker exited without a valid result")),
      );
      child.send({ operation, args });
    });
  return {
    upload: (name, snapshot, options, controls) =>
      call(
        "upload",
        {
          name,
          files: snapshot.files,
          root: snapshot.root,
          options: {
            retentionDays: options.retentionDays,
            compressionLevel: options.compressionLevel,
          },
        },
        controls,
      ),
    list: (controls) => call("list", {}, controls),
    inspect: async (artifact, controls) => {
      const directory = await mkdtemp(join(temporary, "download-"));
      try {
        const result = await call("inspect", { artifact, directory }, controls);
        return {
          ...result,
          dispose: () => rm(directory, { recursive: true, force: true }),
        };
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
    probe: () =>
      call(
        "probe",
        {},
        { deadline: performance.now() + policy.deadlineMilliseconds },
      ),
  };
}
