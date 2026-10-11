import { syncPythonProjections } from "./development-tool-policy.mjs";
syncPythonProjections(undefined, { write: process.argv.includes("--write") });
