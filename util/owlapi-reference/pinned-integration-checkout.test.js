import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPinnedIntegrationCheckout } from "./pinned-integration-checkout.mjs";

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "owlapi-pinned-checkout-"));
});
afterEach(async () => rm(root, { recursive: true, force: true }));
const git = (directory, args, input) =>
  execFileSync("git", ["-C", directory, ...args], {
    input,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
async function createRepository(directory) {
  await mkdir(directory, { recursive: true });
  git(directory, ["init", "--quiet"]);
  const tree = git(
    directory,
    ["hash-object", "-t", "tree", "-w", "--stdin"],
    "",
  );
  const commit = git(directory, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit-tree",
    "--no-gpg-sign",
    tree,
    "-m",
    "Pinned fixture",
  ]);
  git(directory, ["update-ref", "HEAD", commit]);
  return commit;
}
async function writeManifest(revision) {
  const directory = join(root, "util", "owlapi-reference");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "universal-ontology-july-2026.json"),
    JSON.stringify({ revision }),
  );
}
test("an absent integration checkout is normal", async () => {
  await expect(verifyPinnedIntegrationCheckout(root)).resolves.toBeUndefined();
});
test("only the declared revision in a separate contained Git root is admitted", async () => {
  const checkout = join(root, ".release", "universal-ontology");
  const revision = await createRepository(checkout);
  await writeManifest(revision);
  await expect(verifyPinnedIntegrationCheckout(root)).resolves.toBeUndefined();
  await writeManifest("0".repeat(40));
  await expect(verifyPinnedIntegrationCheckout(root)).rejects.toThrow(
    /July revision/u,
  );
});
test("a directory inheriting OwlAPI's Git root cannot claim the foreign boundary", async () => {
  const revision = await createRepository(root);
  await mkdir(join(root, ".release", "universal-ontology"), {
    recursive: true,
  });
  await writeManifest(revision);
  await expect(verifyPinnedIntegrationCheckout(root)).rejects.toThrow(
    /own Git root/u,
  );
});
test("a linked checkout is rejected even when it names a real repository", async () => {
  const external = join(root, "external");
  const revision = await createRepository(external);
  await mkdir(join(root, ".release"));
  await symlink(
    external,
    join(root, ".release", "universal-ontology"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await writeManifest(revision);
  await expect(verifyPinnedIntegrationCheckout(root)).rejects.toThrow(
    /real directory/u,
  );
});
