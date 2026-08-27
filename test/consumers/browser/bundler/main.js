import { exerciseInstalledPackage } from "./exercise-package.js";

try {
  globalThis.__OWLAPI_RESULT = await exerciseInstalledPackage();
  globalThis.document.body.dataset.state = "passed";
} catch (error) {
  globalThis.__OWLAPI_ERROR = {
    message: String(error?.message ?? error),
    name: String(error?.name ?? "Error"),
    stack: String(error?.stack ?? ""),
  };
  globalThis.document.body.dataset.state = "failed";
}
