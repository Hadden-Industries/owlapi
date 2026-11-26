import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  admitReleasedClasspath,
  comparisonJavaTools,
} from "./comparison-oracle.mjs";
import { sha256 } from "./comparison-evidence.mjs";
import { scopedSwrlCases } from "./scoped-swrl-fixtures.mjs";

const [classpathFile, javaHome, output] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Supply a released classpath file, selected JDK home and output file",
  );
const environment = { classpathFile, javaHome };
const { jars, identity } = await admitReleasedClasspath(environment);
const source = fileURLToPath(
  new URL("./ObserveScopedSwrl.java", import.meta.url),
);
const probeSha256 = sha256(await readFile(source));
const temp = await mkdtemp(join(tmpdir(), "owlapi-swrl-capture-"));
try {
  const { jdk, executeProcess } = comparisonJavaTools(environment, temp);
  const input = join(temp, "cases.json"),
    result = join(temp, "native.json");
  await writeFile(input, JSON.stringify(await scopedSwrlCases()));
  const run = await executeProcess("java", [
    "-cp",
    jars.join(delimiter),
    source,
    input,
    result,
  ]);
  if (run.exitCode !== 0)
    throw new Error("Native SWRL probe failed: " + run.stderr);
  if (sha256(await readFile(source)) !== probeSha256)
    throw new Error("Native SWRL probe changed during capture");
  const capture = {
    oracle: {
      version: identity.version,
      lockSha256: identity.lockSha256,
      probeSha256,
      jdk: jdk.identity,
    },
    observations: JSON.parse(await readFile(result, "utf8")),
  };
  await writeFile(output, JSON.stringify(capture, null, 2) + "\n");
} finally {
  await rm(temp, { recursive: true, force: true });
}
