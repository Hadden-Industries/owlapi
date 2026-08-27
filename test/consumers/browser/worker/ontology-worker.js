import { exerciseInstalledPackage } from "./exercise-package.js";

try {
  const result = await exerciseInstalledPackage();
  globalThis.postMessage({ ok: true, result });
} catch (error) {
  globalThis.postMessage({
    error: {
      message: String(error?.message ?? error),
      name: String(error?.name ?? "Error"),
      stack: String(error?.stack ?? ""),
    },
    ok: false,
  });
}
