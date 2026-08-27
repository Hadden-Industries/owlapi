import { startBrowserFixtureServer } from "./browser-fixture-server.mjs";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required ${name} argument`);
  }
  return process.argv[index + 1];
};

const server = await startBrowserFixtureServer({
  root: valueAfter("--root"),
  port: process.argv.includes("--port") ? Number(valueAfter("--port")) : 4173,
});
process.stdout.write(`${server.baseUrl}\n`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    await server.close();
    process.exitCode = 0;
  });
}
