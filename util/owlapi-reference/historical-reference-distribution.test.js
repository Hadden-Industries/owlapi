import { jest } from "@jest/globals";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import {
  HISTORICAL_DISTRIBUTION_PURPOSE,
  materializeLocalHistoricalReferenceDistribution,
  verifyLocalHistoricalReferenceDistribution,
} from "./historical-reference-distribution.mjs";
import { resolvePinnedReferenceEnvironment } from "./run-import-closure-contract.mjs";

const sha1 = (bytes) => createHash("sha1").update(bytes).digest("hex");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const REQUIRED_REACTOR_MODULES = [
  "api",
  "apibinding",
  "compatibility",
  "impl",
  "oboformat",
  "parsers",
  "rio",
  "tools",
];

const tempRoots = [];
const makeTempRoot = async (prefix) => {
  const created = await mkdtemp(join(tmpdir(), prefix));
  const canonical = realpathSync.native(created);
  tempRoots.push(canonical);
  return canonical;
};

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("verified local historical reference distribution", () => {
  const createSyntheticFixture = async () => {
    const root = await makeTempRoot("owlapi-hist-dist-test-");
    const reactorTargetsDirectory = join(root, "reactor-targets");
    const mavenRepositoryDirectory = join(root, "maven-repo");
    const outputDirectory = join(root, "verified-dist");

    const classpathEntries = [];
    for (const moduleName of REQUIRED_REACTOR_MODULES) {
      const moduleTarget = join(reactorTargetsDirectory, moduleName, "target");
      await mkdir(moduleTarget, { recursive: true });
      const jarPath = join(moduleTarget, `owlapi-${moduleName}-5.5.1.jar`);
      await writeFile(jarPath, Buffer.from(`synthetic-reactor-${moduleName}`));
      classpathEntries.push(jarPath);
    }

    const ext1Bytes = Buffer.from("synthetic-ext-catalogue-pinned-jar");
    const ext2Bytes = Buffer.from("synthetic-ext-sha1-sidecar-jar");
    const ext1Rel = "org/example/pinned/1.0.0/pinned-1.0.0.jar";
    const ext2Rel = "org/example/supplement/2.0.0/supplement-2.0.0.jar";
    await mkdir(join(mavenRepositoryDirectory, "org/example/pinned/1.0.0"), {
      recursive: true,
    });
    await mkdir(
      join(mavenRepositoryDirectory, "org/example/supplement/2.0.0"),
      { recursive: true },
    );
    const ext1Path = join(mavenRepositoryDirectory, ext1Rel);
    const ext2Path = join(mavenRepositoryDirectory, ext2Rel);
    await writeFile(ext1Path, ext1Bytes);
    await writeFile(ext2Path, ext2Bytes);
    await writeFile(`${ext2Path}.sha1`, `${sha1(ext2Bytes)}\n`, "utf8");

    classpathEntries.push(ext1Path, ext2Path);
    const distributionTarget = join(
      reactorTargetsDirectory,
      "distribution",
      "target",
    );
    await mkdir(distributionTarget, { recursive: true });
    await writeFile(
      join(distributionTarget, "owlapi-runtime-classpath.txt"),
      classpathEntries.join(delimiter),
      "utf8",
    );

    const pinnedVersionPath = join(root, "pinned-version.json");
    const sourceRevision = "b61ebe2da83daceebb3e7ba7afbd2582c9240c33";
    await writeFile(
      pinnedVersionPath,
      JSON.stringify({
        owlapiVersionLine: "5.5.1",
        sourceRevision,
      }),
      "utf8",
    );

    const cataloguePath = join(root, "catalogue.json");
    await writeFile(
      cataloguePath,
      JSON.stringify({
        schemaVersion: 1,
        runtime: [
          {
            path: "runtime/000.jar",
            kind: "REACTOR",
            module: "api",
            coordinate: "net.sourceforge.owlapi:owlapi-api:5.5.1",
            filename: "owlapi-api-5.5.1.jar",
          },
          {
            path: "runtime/001.jar",
            kind: "EXTERNAL",
            coordinate: "org.example:pinned:1.0.0",
            repositoryPath: ext1Rel,
            filename: "pinned-1.0.0.jar",
            bytes: ext1Bytes.length,
            sha256: sha256(ext1Bytes),
          },
        ],
      }),
      "utf8",
    );

    return {
      root,
      reactorTargetsDirectory,
      mavenRepositoryDirectory,
      outputDirectory,
      pinnedVersionPath,
      cataloguePath,
      sourceRevision,
      ext1Rel,
      ext2Rel,
      distributionTarget,
      classpathEntries,
    };
  };

  it("materializes ordered JARs from native Maven classpath and verifies closed inventory", async () => {
    const fixture = await createSyntheticFixture();
    const materialized = await materializeLocalHistoricalReferenceDistribution({
      reactorTargetsDirectory: fixture.reactorTargetsDirectory,
      mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
      outputDirectory: fixture.outputDirectory,
      pinnedVersionPath: fixture.pinnedVersionPath,
      cataloguePath: fixture.cataloguePath,
    });

    expect(materialized.jarCount).toBe(10);
    expect(materialized.pinnedRevision).toBe(fixture.sourceRevision);
    expect(materialized.owlapiVersion).toBe("5.5.1");

    const classpathText = await readFile(materialized.classpathFile, "utf8");
    expect(classpathText.split(delimiter)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        join(
          fixture.outputDirectory,
          "runtime",
          `${String(index).padStart(3, "0")}.jar`,
        ),
      ),
    );

    const manifest = JSON.parse(
      await readFile(join(fixture.outputDirectory, "manifest.json"), "utf8"),
    );
    expect(manifest.purpose).toBe(HISTORICAL_DISTRIBUTION_PURPOSE);
    expect(manifest.entries[8]).toMatchObject({
      kind: "EXTERNAL",
      repositoryPath: fixture.ext1Rel,
    });
    expect(manifest.entries[9]).toMatchObject({
      kind: "EXTERNAL",
      repositoryPath: fixture.ext2Rel,
    });

    const verified = await verifyLocalHistoricalReferenceDistribution(
      fixture.outputDirectory,
      {
        pinnedVersionPath: fixture.pinnedVersionPath,
        cataloguePath: fixture.cataloguePath,
      },
    );
    expect(verified.manifestSha256).toBe(materialized.manifestSha256);
    expect(verified.jarCount).toBe(10);
  });

  it("rejects an external JAR whose SHA-256 differs from the catalogue", async () => {
    const fixture = await createSyntheticFixture();
    await writeFile(
      join(fixture.mavenRepositoryDirectory, fixture.ext1Rel),
      Buffer.from("tampered-pinned-external-bytes"),
    );

    await expect(
      materializeLocalHistoricalReferenceDistribution({
        reactorTargetsDirectory: fixture.reactorTargetsDirectory,
        mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
        outputDirectory: fixture.outputDirectory,
        pinnedVersionPath: fixture.pinnedVersionPath,
        cataloguePath: fixture.cataloguePath,
      }),
    ).rejects.toThrow(/external|sha256|mismatch/i);
  });

  it("rejects a non-catalogue external JAR whose SHA-1 sidecar disagrees", async () => {
    const fixture = await createSyntheticFixture();
    await writeFile(
      join(fixture.mavenRepositoryDirectory, `${fixture.ext2Rel}.sha1`),
      "0".repeat(40) + "\n",
      "utf8",
    );

    await expect(
      materializeLocalHistoricalReferenceDistribution({
        reactorTargetsDirectory: fixture.reactorTargetsDirectory,
        mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
        outputDirectory: fixture.outputDirectory,
        pinnedVersionPath: fixture.pinnedVersionPath,
        cataloguePath: fixture.cataloguePath,
      }),
    ).rejects.toThrow(/sha-?1|mismatch/i);
  });

  it("rejects incomplete reactor closures missing any required OWLAPI module", async () => {
    const fixture = await createSyntheticFixture();
    await writeFile(
      join(fixture.distributionTarget, "owlapi-runtime-classpath.txt"),
      fixture.classpathEntries.slice(1).join(delimiter),
      "utf8",
    );

    await expect(
      materializeLocalHistoricalReferenceDistribution({
        reactorTargetsDirectory: fixture.reactorTargetsDirectory,
        mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
        outputDirectory: fixture.outputDirectory,
        pinnedVersionPath: fixture.pinnedVersionPath,
        cataloguePath: fixture.cataloguePath,
      }),
    ).rejects.toThrow(/reactor|missing/i);
  });

  it("fails closed on tampered reactor JAR, deleted JAR, unexpected file, directory in runtime, or altered classpath", async () => {
    const fixture = await createSyntheticFixture();
    const verifyOpts = {
      pinnedVersionPath: fixture.pinnedVersionPath,
      cataloguePath: fixture.cataloguePath,
    };

    const runFreshMaterialize = async (suffix) => {
      const target = join(fixture.root, `dist-${suffix}`);
      await materializeLocalHistoricalReferenceDistribution({
        reactorTargetsDirectory: fixture.reactorTargetsDirectory,
        mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
        outputDirectory: target,
        pinnedVersionPath: fixture.pinnedVersionPath,
        cataloguePath: fixture.cataloguePath,
      });
      return target;
    };

    // 1. Tampered reactor JAR
    const distTamperedReactor = await runFreshMaterialize("tampered-reactor");
    await writeFile(
      join(distTamperedReactor, "runtime", "000.jar"),
      Buffer.from("tampered-reactor-jar"),
    );
    await expect(
      verifyLocalHistoricalReferenceDistribution(
        distTamperedReactor,
        verifyOpts,
      ),
    ).rejects.toThrow(/digest|size|mismatch/i);

    // 2. Deleted JAR
    const distDeletedJar = await runFreshMaterialize("deleted-jar");
    await unlink(join(distDeletedJar, "runtime", "009.jar"));
    await expect(
      verifyLocalHistoricalReferenceDistribution(distDeletedJar, verifyOpts),
    ).rejects.toThrow(/inventory|missing|runtime/i);

    // 3. Unexpected extra file in runtime/
    const distExtraFile = await runFreshMaterialize("extra-file");
    await writeFile(
      join(distExtraFile, "runtime", "unexpected.jar"),
      Buffer.from("extra"),
    );
    await expect(
      verifyLocalHistoricalReferenceDistribution(distExtraFile, verifyOpts),
    ).rejects.toThrow(/inventory|unexpected|runtime/i);

    // 4. Non-regular subdirectory in runtime/
    const distSubdir = await runFreshMaterialize("subdir-runtime");
    await mkdir(join(distSubdir, "runtime", "nested"));
    await expect(
      verifyLocalHistoricalReferenceDistribution(distSubdir, verifyOpts),
    ).rejects.toThrow(/regular|inventory|unexpected/i);

    // 5. Altered classpath file
    const distAlteredCp = await runFreshMaterialize("altered-cp");
    await writeFile(
      join(distAlteredCp, "owlapi-runtime-classpath.txt"),
      join(distAlteredCp, "runtime", "000.jar"),
      "utf8",
    );
    await expect(
      verifyLocalHistoricalReferenceDistribution(distAlteredCp, verifyOpts),
    ).rejects.toThrow(/classpath/i);
  });

  it("resolves pinned reference environment from a verified local distribution without invoking git", async () => {
    const fixture = await createSyntheticFixture();
    const materialized = await materializeLocalHistoricalReferenceDistribution({
      reactorTargetsDirectory: fixture.reactorTargetsDirectory,
      mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
      outputDirectory: fixture.outputDirectory,
      pinnedVersionPath: fixture.pinnedVersionPath,
      cataloguePath: fixture.cataloguePath,
    });
    const executeProcess = jest.fn();

    const env = await resolvePinnedReferenceEnvironment({
      referenceDistributionPath: fixture.outputDirectory,
      pinnedVersionPath: fixture.pinnedVersionPath,
      cataloguePath: fixture.cataloguePath,
      executeProcess,
    });

    expect(executeProcess).not.toHaveBeenCalled();
    expect(env.distributionKind).toBe("verified-local-distribution");
    expect(env.distributionManifestSha256).toBe(materialized.manifestSha256);
    expect(env.classpathFile).toBe(materialized.classpathFile);
    expect(env.pinnedRevision).toBe(fixture.sourceRevision);
  });

  it("rejects ambiguous ambient OWLAPI_REFERENCE_CHECKOUT + OWLAPI_REFERENCE_DISTRIBUTION while allowing explicit override", async () => {
    const fixture = await createSyntheticFixture();
    await materializeLocalHistoricalReferenceDistribution({
      reactorTargetsDirectory: fixture.reactorTargetsDirectory,
      mavenRepositoryDirectory: fixture.mavenRepositoryDirectory,
      outputDirectory: fixture.outputDirectory,
      pinnedVersionPath: fixture.pinnedVersionPath,
      cataloguePath: fixture.cataloguePath,
    });

    const previousCheckout = process.env.OWLAPI_REFERENCE_CHECKOUT;
    const previousDistribution = process.env.OWLAPI_REFERENCE_DISTRIBUTION;
    try {
      process.env.OWLAPI_REFERENCE_CHECKOUT = fixture.root;
      process.env.OWLAPI_REFERENCE_DISTRIBUTION = fixture.outputDirectory;

      await expect(
        resolvePinnedReferenceEnvironment({
          pinnedVersionPath: fixture.pinnedVersionPath,
          cataloguePath: fixture.cataloguePath,
        }),
      ).rejects.toMatchObject({
        code: "ONTOLOGY_REFERENCE_ORACLE_REFERENCE_ENVIRONMENT_UNAVAILABLE",
      });

      const resolvedExplicit = await resolvePinnedReferenceEnvironment({
        referenceDistributionPath: fixture.outputDirectory,
        pinnedVersionPath: fixture.pinnedVersionPath,
        cataloguePath: fixture.cataloguePath,
      });
      expect(resolvedExplicit.distributionKind).toBe(
        "verified-local-distribution",
      );
    } finally {
      if (previousCheckout === undefined) {
        delete process.env.OWLAPI_REFERENCE_CHECKOUT;
      } else {
        process.env.OWLAPI_REFERENCE_CHECKOUT = previousCheckout;
      }
      if (previousDistribution === undefined) {
        delete process.env.OWLAPI_REFERENCE_DISTRIBUTION;
      } else {
        process.env.OWLAPI_REFERENCE_DISTRIBUTION = previousDistribution;
      }
    }
  });
});
