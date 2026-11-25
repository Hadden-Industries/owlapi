import { appendFile, mkdtemp } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { freezePayload } from "../tooling/artifact-transport/payload.mjs";

const { GITHUB_OUTPUT, GITHUB_WORKSPACE, OWLAPI_DIAGNOSTIC_PATH, RUNNER_TEMP } =
  process.env;
if (
  !OWLAPI_DIAGNOSTIC_PATH ||
  ![GITHUB_OUTPUT, GITHUB_WORKSPACE, RUNNER_TEMP].every(
    (path) => path && isAbsolute(path) && !/[\r\n]/u.test(path),
  )
)
  throw new Error(
    "Artifact staging requires the diagnostic path and runner paths",
  );

// The runner retires its temporary directory after the native upload step.
const temporary = await mkdtemp(join(RUNNER_TEMP, "owlapi-diagnostic-"));
const snapshot = await freezePayload({
  paths: OWLAPI_DIAGNOSTIC_PATH,
  workspace: GITHUB_WORKSPACE,
  destination: join(temporary, "payload"),
});
await appendFile(GITHUB_OUTPUT, `path=${snapshot.root}\n`);
