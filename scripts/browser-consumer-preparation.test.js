import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareBrowserConsumers } from "./browser-consumer-preparation.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";
import { BROWSER_CONSUMER_SPECIFIERS } from "./reference-import-map.mjs";

const EXISTING = "https://ga.jspm.io/npm:example@1.0.0/index.js";
const NEW = "https://ga.jspm.io/npm:other@2.0.0/index.js";
const EXISTING_PIN =
  "sha384-ikZ73SkpeVKecHr7elzJWfj9+687EjDbwuBxv4Y9r+0kWi0jb5fuIoOCDE+E/0m6";
const REPLACEMENT_PIN =
  "sha384-o5TJSkK43MFut3k3W/kYknQVHavDIZPAB2IFiilcQywKTfaTJv9fC+Flk8t0+Whq";
const NEW_PIN =
  "sha384-z0dQZuTpVhlJhRpzBVjQTCgdq+BUSh89DMD4c8ea5gn4XTF+416jeLVKPWSl2O8q";
const EXISTING_MIRROR = "./provider/ga.jspm.io/npm%3Aexample%401.0.0/index.js";
const NEW_MIRROR = "./provider/ga.jspm.io/npm%3Aother%402.0.0/index.js";
const candidatePackage = { name: PACKAGE_NAME, version: PACKAGE_VERSION };
const json = (object) => `${JSON.stringify(object, null, 2)}\n`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const importsFor = (target) =>
  Object.fromEntries(
    BROWSER_CONSUMER_SPECIFIERS.map((specifier) => [specifier, target]),
  );

const mapFor = (existingPin, includeNew = false) => ({
  imports: importsFor("./package/owlapi/index.js"),
  integrity: {
    [EXISTING]: existingPin,
    ...(includeNew ? { [NEW]: NEW_PIN } : {}),
  },
  scopes: { "./package/owlapi/": { example: EXISTING } },
});

async function withPreparation(run) {
  const root = mkdtempSync(join(tmpdir(), "owlapi-browser-prep-"));
  try {
    const candidateDirectory = join(root, "candidate");
    const outputDirectory = join(root, "output");
    const fixtureDirectory = join(outputDirectory, "import-map");
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    const manifestPath = join(
      outputDirectory,
      "browser-consumer-manifest.json",
    );
    const reviewedDirectory = join(root, "reviewed");
    const reviewedMapPath = join(
      reviewedDirectory,
      "reference-import-map.json",
    );
    const approvalPath = join(root, "approved.json");
    mkdirSync(candidateDirectory);
    mkdirSync(reviewedDirectory);
    const tarball = {
      fileName: "candidate.tgz",
      sha256: sha256("retained candidate bytes\n"),
    };
    const tarballPath = join(candidateDirectory, tarball.fileName);
    writeFileSync(tarballPath, "retained candidate bytes\n");
    writeFileSync(
      join(candidateDirectory, "candidate-manifest.json"),
      json({ package: candidatePackage, tarball }),
    );
    const startingBytes = Buffer.from(json(mapFor(EXISTING_PIN)));
    writeFileSync(reviewedMapPath, startingBytes);
    const authorization = {
      startingMapSha256: sha256(startingBytes),
      replacements: [
        {
          url: EXISTING,
          previousIntegrity: EXISTING_PIN,
          replacementIntegrity: REPLACEMENT_PIN,
          evidenceReference: "evidence:approved-provider-bytes",
          decisionReference: "decision:approved-exact-replacement",
        },
      ],
    };
    const fetches = [];
    const prepare = ({
      existingPin = REPLACEMENT_PIN,
      includeNew = true,
      ...options
    } = {}) =>
      prepareBrowserConsumers({
        candidateDirectory,
        outputDirectory,
        reviewedMapPath,
        stageFixtures: async () => {
          const packageRoot = join(fixtureDirectory, "node_modules", "owlapi");
          mkdirSync(packageRoot, { recursive: true });
          writeFileSync(
            join(packageRoot, "package.json"),
            json(candidatePackage),
          );
          writeFileSync(
            join(packageRoot, "index.js"),
            "export const firstParty = 1;\n",
          );
          writeFileSync(
            join(fixtureDirectory, "main.js"),
            "import 'owlapi';\n",
          );
          writeFileSync(
            join(fixtureDirectory, "index.html"),
            '<head><!-- REFERENCE_IMPORT_MAP --></head><script type="module" src="./main.js"></script>',
          );
          return {
            directory: fixtureDirectory,
            packageRoot,
            fixtureModules: ["main.js"],
          };
        },
        createGenerator: () => ({
          link: async () => ({
            staticDeps: [EXISTING],
            dynamicDeps: includeNew ? [NEW] : [],
          }),
          getMap: () => ({
            imports: importsFor("./node_modules/owlapi/index.js"),
            integrity: {
              [EXISTING]: existingPin,
              ...(includeNew ? { [NEW]: NEW_PIN } : {}),
            },
            scopes: { "./node_modules/owlapi/": { example: EXISTING } },
          }),
        }),
        fetchImplementation: async (url, { redirect }) => {
          fetches.push({ url, redirect });
          const body =
            url === NEW
              ? "export {};\n"
              : existingPin === EXISTING_PIN
                ? "export const answer = 42;\n"
                : "export const answer = 43;\n";
          return {
            status: 200,
            url,
            redirected: false,
            arrayBuffer: async () => Buffer.from(body),
          };
        },
        ...options,
      });
    const read = (file) => JSON.parse(readFileSync(file, "utf8"));
    const expectUnpublished = () => {
      expect(readFileSync(reviewedMapPath)).toEqual(startingBytes);
      expect(existsSync(manifestPath)).toBe(false);
      expect(readdirSync(reviewedDirectory)).toEqual([
        "reference-import-map.json",
      ]);
    };
    await run({
      prepare,
      fetches,
      authorization,
      approvalPath,
      expectUnpublished,
      candidateDirectory,
      tarball,
      tarballPath,
      outputDirectory,
      fixtureDirectory,
      runtimeDirectory,
      manifestPath,
      reviewedMapPath,
      reviewedDirectory,
      startingBytes,
      read,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("browser-consumer preparation and publication", () => {
  it("rejects a tarball whose contents changed before staging", async () => {
    await withPreparation(
      async ({ prepare, tarballPath, outputDirectory, expectUnpublished }) => {
        writeFileSync(tarballPath, "changed candidate bytes\n");
        let staged = false;
        await expect(
          prepare({
            stageFixtures: async () => {
              staged = true;
            },
          }),
        ).rejects.toThrow(/tarball no longer matches/u);
        expect(staged).toBe(false);
        expect(existsSync(outputDirectory)).toBe(false);
        expectUnpublished();
      },
    );
  });

  it("refuses routine drift without hydrating or changing the reviewed map", async () => {
    await withPreparation(async ({ prepare, expectUnpublished, fetches }) => {
      await expect(prepare()).rejects.toThrow(
        /differs from the committed reviewed map/u,
      );
      expectUnpublished();
      expect(fetches).toEqual([]);
    });
  });

  it("refuses an update with both a new URL and an unapproved same-URL replacement", async () => {
    await withPreparation(async ({ prepare, expectUnpublished, fetches }) => {
      await expect(prepare({ writeReviewedMap: true })).rejects.toThrow(
        `Unapproved provider pin replacement for ${EXISTING}`,
      );
      expectUnpublished();
      expect(fetches).toEqual([]);
    });
  });

  it.each([
    [
      "stale starting digest",
      (approval) => {
        approval.startingMapSha256 = "0".repeat(64);
      },
      /exact starting reviewed map/u,
    ],
    [
      "wrong replacement pin",
      (approval) => {
        approval.replacements[0].replacementIntegrity = NEW_PIN;
      },
      /Extra or stale provider pin approval/u,
    ],
    [
      "an extra URL",
      (approval) => {
        approval.replacements.push({ ...approval.replacements[0], url: NEW });
      },
      /Extra or stale provider pin approval.*other@2\.0\.0/u,
    ],
    [
      "a duplicate URL",
      (approval) => {
        approval.replacements.push(approval.replacements[0]);
      },
      /Duplicate provider pin approval/u,
    ],
    [
      "missing evidence",
      (approval) => {
        approval.replacements[0].evidenceReference = " ";
      },
      /lacks evidence or decision reference/u,
    ],
  ])("refuses approval with %s before hydration", async (_, mutate, error) => {
    await withPreparation(
      async ({
        prepare,
        expectUnpublished,
        fetches,
        approvalPath,
        authorization,
      }) => {
        mutate(authorization);
        writeFileSync(approvalPath, json(authorization));
        await expect(
          prepare({
            writeReviewedMap: true,
            approvedProviderPinChangesPath: approvalPath,
          }),
        ).rejects.toThrow(error);
        expectUnpublished();
        expect(fetches).toEqual([]);
      },
    );
  });

  it("refuses a record that approves only one of two same-URL replacements", async () => {
    await withPreparation(
      async ({
        prepare,
        reviewedMapPath,
        approvalPath,
        authorization,
        fetches,
        manifestPath,
      }) => {
        const starting = mapFor(EXISTING_PIN, true);
        starting.integrity[NEW] = EXISTING_PIN;
        const bytes = json(starting);
        writeFileSync(reviewedMapPath, bytes);
        authorization.startingMapSha256 = sha256(bytes);
        writeFileSync(approvalPath, json(authorization));
        await expect(
          prepare({
            writeReviewedMap: true,
            approvedProviderPinChangesPath: approvalPath,
          }),
        ).rejects.toThrow(`Unapproved provider pin replacement for ${NEW}`);
        expect(readFileSync(reviewedMapPath, "utf8")).toBe(bytes);
        expect(existsSync(manifestPath)).toBe(false);
        expect(fetches).toEqual([]);
      },
    );
  });

  it("refuses an approval option in routine mode and an absent reviewed baseline in refresh mode", async () => {
    await withPreparation(
      async ({ prepare, reviewedMapPath, approvalPath, outputDirectory }) => {
        await expect(
          prepare({ approvedProviderPinChangesPath: approvalPath }),
        ).rejects.toThrow(/requires --write-reviewed-map/u);
        rmSync(reviewedMapPath);
        await expect(prepare({ writeReviewedMap: true })).rejects.toThrow(
          /Restore the approved starting reference import map/u,
        );
        expect(existsSync(outputDirectory)).toBe(false);
        expect(existsSync(reviewedMapPath)).toBe(false);
      },
    );
  });

  it("preserves a concurrent edit to the starting reviewed-map bytes", async () => {
    await withPreparation(
      async ({
        prepare,
        reviewedMapPath,
        startingBytes,
        fixtureDirectory,
        manifestPath,
        reviewedDirectory,
      }) => {
        const changed = `${startingBytes.toString("utf8")}\n`;
        await expect(
          prepare({
            existingPin: EXISTING_PIN,
            writeReviewedMap: true,
            fetchImplementation: async (url) => {
              writeFileSync(reviewedMapPath, changed);
              return {
                url,
                status: 200,
                redirected: false,
                arrayBuffer: async () =>
                  Buffer.from(
                    url === NEW
                      ? "export {};\n"
                      : "export const answer = 42;\n",
                  ),
              };
            },
          }),
        ).rejects.toThrow(/Starting reviewed map changed/u);
        expect(readFileSync(reviewedMapPath, "utf8")).toBe(changed);
        expect(
          existsSync(
            join(fixtureDirectory, "reference-import-map.generated.json"),
          ),
        ).toBe(true);
        expect(existsSync(manifestPath)).toBe(false);
        expect(readdirSync(reviewedDirectory)).toEqual([
          "reference-import-map.json",
        ]);
      },
    );
  });

  it.each([false, true])(
    "recovers a failed replacement reply (swap completed: %s)",
    async (swapped) => {
      await withPreparation(
        async ({
          prepare,
          reviewedMapPath,
          reviewedDirectory,
          fixtureDirectory,
          startingBytes,
          manifestPath,
        }) => {
          let called = false;
          await expect(
            prepare({
              existingPin: EXISTING_PIN,
              writeReviewedMap: true,
              replaceReviewedMap: (staged, destination) => {
                called = true;
                if (swapped) renameSync(staged, destination);
                throw new Error("Simulated interrupted refresh");
              },
            }),
          ).rejects.toThrow("Simulated interrupted refresh");
          expect(called).toBe(true);
          const staged = readFileSync(
            join(fixtureDirectory, "reference-import-map.generated.json"),
          );
          expect(staged.toString("utf8")).toBe(
            json(mapFor(EXISTING_PIN, true)),
          );
          expect(readFileSync(reviewedMapPath)).toEqual(
            swapped ? staged : startingBytes,
          );
          expect(existsSync(manifestPath)).toBe(false);
          expect(readdirSync(reviewedDirectory)).toEqual([
            "reference-import-map.json",
          ]);
        },
      );
    },
  );

  it("commits an ordinary new URL while preserving the existing pin without approval", async () => {
    await withPreparation(
      async ({ prepare, reviewedMapPath, read, manifestPath }) => {
        await prepare({ writeReviewedMap: true, existingPin: EXISTING_PIN });
        expect(read(reviewedMapPath)).toEqual(mapFor(EXISTING_PIN, true));
        expect(read(manifestPath).referenceImportMap.providerModuleCount).toBe(
          2,
        );
      },
    );
  });

  it("writes staged evidence before atomic replacement and publishes the success manifest last", async () => {
    await withPreparation(async (fixture) => {
      const {
        prepare,
        reviewedMapPath,
        approvalPath,
        authorization,
        startingBytes,
        manifestPath,
        tarball,
        fixtureDirectory,
        runtimeDirectory,
        read,
        reviewedDirectory,
        fetches,
      } = fixture;
      writeFileSync(approvalPath, json(authorization));
      const generatedPath = join(
        fixtureDirectory,
        "reference-import-map.generated.json",
      );
      const expectedGenerated = json(mapFor(REPLACEMENT_PIN, true));
      const expectedLocal = {
        imports: importsFor("./package/owlapi/index.js"),
        integrity: {
          [EXISTING_MIRROR]: REPLACEMENT_PIN,
          [NEW_MIRROR]: NEW_PIN,
        },
        scopes: { "./package/owlapi/": { example: EXISTING_MIRROR } },
      };
      const expectedInventory = {
        schemaVersion: 1,
        provider: "jspm.io",
        conditions: ["production", "browser", "module"],
        modules: [
          {
            providerUrl: EXISTING,
            localPath: EXISTING_MIRROR.slice(2),
            integrity: REPLACEMENT_PIN,
            bytes: 26,
            sha256: sha256("export const answer = 43;\n"),
          },
          {
            providerUrl: NEW,
            localPath: NEW_MIRROR.slice(2),
            integrity: NEW_PIN,
            bytes: 11,
            sha256: sha256("export {};\n"),
          },
        ],
      };
      let replaced = false;
      await prepare({
        writeReviewedMap: true,
        approvedProviderPinChangesPath: approvalPath,
        replaceReviewedMap: (temporaryPath, destination) => {
          expect(destination).toBe(reviewedMapPath);
          expect(readFileSync(destination)).toEqual(startingBytes);
          expect(readFileSync(temporaryPath, "utf8")).toBe(expectedGenerated);
          expect(readFileSync(generatedPath, "utf8")).toBe(expectedGenerated);
          expect(
            read(join(fixtureDirectory, "provider-inventory.json")),
          ).toEqual(expectedInventory);
          expect(
            read(join(runtimeDirectory, "reference-import-map.local.json")),
          ).toEqual(expectedLocal);
          const html = readFileSync(
            join(runtimeDirectory, "index.html"),
            "utf8",
          );
          expect(
            JSON.parse(
              html.match(/<script type="importmap">([^]*?)<\/script>/u)[1],
            ),
          ).toEqual(expectedLocal);
          expect(existsSync(manifestPath)).toBe(false);
          expect(
            readFileSync(join(runtimeDirectory, EXISTING_MIRROR), "utf8"),
          ).toBe("export const answer = 43;\n");
          renameSync(temporaryPath, destination);
          replaced = true;
        },
      });
      expect(replaced).toBe(true);
      expect(readFileSync(reviewedMapPath, "utf8")).toBe(expectedGenerated);
      expect(readdirSync(reviewedDirectory)).toEqual([
        "reference-import-map.json",
      ]);
      expect(fetches).toEqual([
        { url: EXISTING, redirect: "error" },
        { url: NEW, redirect: "error" },
      ]);
      expect(read(manifestPath)).toEqual({
        schemaVersion: 1,
        package: candidatePackage,
        candidate: { directory: "candidate", tarball },
        consumers: ["bundler", "import-map", "worker"],
        referenceImportMap: {
          integrityScope: "provider-only",
          generatedSha256: sha256(expectedGenerated),
          provider: "jspm.io",
          providerModuleCount: 2,
          reviewedPath:
            "test/consumers/browser/import-map/reference-import-map.json",
        },
      });
    });
  });
});
