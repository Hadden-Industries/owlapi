import { describe, expect, test } from "@jest/globals";
import {
  assertNativeBuildClosure,
  createReferenceInputRecord,
  readNativeChecksums,
  referenceBuildRecipe,
  REFERENCE_RECIPE,
  referenceRecipeIdentity,
} from "./reference-inputs.mjs";

const entry = (path, hash = "a".repeat(128)) =>
  Buffer.from(`${hash}  ${path}\n`);
const artifact = "org/example/library/1.0/library-1.0.jar";
const inputs = () => ({
  sourceCommit: "d7e997a53b470e32700de89cc610d9daf01ea769",
  sourceTree: "8f871bacef5ab767afda979e60b1a1e0c98d6323",
  externalSha256: "1".repeat(64),
  runtimeGraphSha256: "2".repeat(64),
  mavenDistributionSha256: "3".repeat(64),
  jdkDistributionSha256: "4".repeat(64),
  environment: {
    runtime: "25.0.4.1+1-LTS",
    "java.version": "25.0.4.1",
    "java.vendor": "Eclipse Adoptium",
    "java.vm.name": "OpenJDK 64-Bit Server VM",
    "java.vm.version": "25.0.4.1+1-LTS",
    "os.name": "Linux",
    "os.version": "6.8.0",
    "os.arch": "amd64",
    "file.encoding": "UTF-8",
    "native.encoding": "UTF-8",
    "stdout.encoding": "UTF-8",
    "stderr.encoding": "UTF-8",
    locale: "en-GB",
    timezone: "UTC",
  },
  host: {
    os: "Linux",
    architecture: "X64",
    image: "ubuntu24",
    imageVersion: "20261001.1.0",
  },
});

describe("native reference preparation boundary", () => {
  test.each(["", "\n", "\r\n"])(
    "accepts a complete native final record with optional terminator %j",
    (terminator) => {
      const second = "org/example/parent/1.0/parent-1.0.pom";
      const bytes = Buffer.from(
        `${"a".repeat(128)}  ${artifact}\n${"b".repeat(128)}  ${second}${terminator}`,
      );
      expect([...readNativeChecksums(bytes)]).toEqual([
        [artifact, "a".repeat(128)],
        [second, "b".repeat(128)],
      ]);
      expect(assertNativeBuildClosure(bytes, bytes)).toMatchObject({
        prepared: 2,
        built: 2,
      });
    },
  );

  test("a conservative preparation accepts only unchanged executed external inputs", () => {
    const prepared = Buffer.concat([
      entry(artifact),
      entry("org/example/parent/1.0/parent-1.0.pom"),
    ]);
    expect(assertNativeBuildClosure(prepared, entry(artifact))).toMatchObject({
      prepared: 2,
      built: 1,
    });
    expect(() =>
      assertNativeBuildClosure(
        entry(artifact),
        entry(artifact, "b".repeat(128)),
      ),
    ).toThrow("absent or changed");
    expect(() =>
      assertNativeBuildClosure(
        entry(artifact),
        entry("org/other/1/other-1.jar"),
      ),
    ).toThrow("absent or changed");
  });

  test.each([
    Buffer.alloc(0),
    Buffer.from("\n"),
    Buffer.from("invalid\n"),
    Buffer.from(`${"a".repeat(127)}  ${artifact}`),
    Buffer.from(`${"a".repeat(128)}  `),
    Buffer.concat([entry(artifact), Buffer.from("\n")]),
    Buffer.concat([entry(artifact), Buffer.from("\r\n")]),
    entry("../outside.jar"),
    entry("/absolute.jar"),
    entry("a//b.jar"),
    entry("a/./b.jar"),
    entry("a\\b.jar"),
    entry("a/1-SNAPSHOT/a-1-SNAPSHOT.jar"),
    Buffer.concat([entry(artifact), entry(artifact)]),
    Buffer.from([0xff, 0x0a]),
    Buffer.alloc(1024 * 1024 + 1),
  ])(
    "rejects malformed, mutable, duplicate and incomplete native input inventories",
    (bytes) => {
      expect(() => readNativeChecksums(bytes)).toThrow();
    },
  );

  test("preserves native SHA512 and permits the explicitly declared signature input", () => {
    expect(
      readNativeChecksums(
        entry("org/codehaus/mojo/signature/java18/1.0/java18-1.0.signature"),
      ).get("org/codehaus/mojo/signature/java18/1.0/java18-1.0.signature"),
    ).toBe("a".repeat(128));
  });

  test("preparation identifies the qualified pin and controls both toolchain/settings scopes", () => {
    const recipe = referenceBuildRecipe({
      localRepository: "/private/repository",
      userHome: "/private/home",
      reportsDirectory: "/private/reports",
      summaryDirectory: "/private/prepared",
    });
    expect(REFERENCE_RECIPE.sourceCommit).toBe(
      "d7e997a53b470e32700de89cc610d9daf01ea769",
    );
    expect(REFERENCE_RECIPE.maven).toBe("3.10.0");
    for (const goal of [...recipe.preparation, recipe.build]) {
      expect(goal[goal.indexOf("-s") + 1]).toBe(recipe.settings);
      expect(goal[goal.indexOf("-gs") + 1]).toBe(recipe.settings);
      expect(goal[goal.indexOf("-t") + 1]).toBe(recipe.toolchains);
      expect(goal[goal.indexOf("-gt") + 1]).toBe(recipe.toolchains);
    }
    expect(recipe.preparation.at(-3)).toContain(
      `-Dartifact=${REFERENCE_RECIPE.declaredSignature}`,
    );
    expect(recipe.preparation.at(-3)).toContain("-Dtransitive=false");
    expect(recipe.preparation.at(-2)).toContain(
      "-Dartifact=org.slf4j:jcl-over-slf4j:1.7.32:jar",
    );
    expect(recipe.preparation.at(-2)).toContain("-Dtransitive=false");
    expect(recipe.jvmOptions).toContain("-Duser.timezone=UTC");
    expect(referenceRecipeIdentity()).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("semantic identity is independent of object insertion order and excludes arbitrary provenance", () => {
    const original = inputs();
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    reordered.environment = Object.fromEntries(
      Object.entries(original.environment).reverse(),
    );
    reordered.host = Object.fromEntries(
      Object.entries(original.host).reverse(),
    );
    expect(createReferenceInputRecord(reordered).keySha256).toBe(
      createReferenceInputRecord(original).keySha256,
    );
    expect(() =>
      createReferenceInputRecord({ ...original, producedAt: "2026-10-04" }),
    ).toThrow();
    expect(() =>
      createReferenceInputRecord({ ...original, token: "secret" }),
    ).toThrow();
  });

  test.each([
    "externalSha256",
    "runtimeGraphSha256",
    "mavenDistributionSha256",
    "jdkDistributionSha256",
  ])("changed actual %s invalidates reuse", (field) => {
    const original = inputs();
    expect(
      createReferenceInputRecord({ ...original, [field]: "f".repeat(64) })
        .keySha256,
    ).not.toBe(createReferenceInputRecord(original).keySha256);
  });

  test("image or unclassified platform changes are never treated as proven equivalence", () => {
    const original = inputs();
    const changed = inputs();
    changed.host.imageVersion = "20261002.1.0";
    expect(createReferenceInputRecord(changed).keySha256).not.toBe(
      createReferenceInputRecord(original).keySha256,
    );
    changed.environment["os.version"] = "6.8.1";
    expect(createReferenceInputRecord(changed).keySha256).not.toBe(
      createReferenceInputRecord(original).keySha256,
    );
    expect(() =>
      createReferenceInputRecord({
        ...original,
        host: { ...original.host, image: "ubuntu26" },
      }),
    ).toThrow();
  });

  test.each([
    ["runtime", "25.0.4.1"],
    ["java.vendor", "Unknown"],
    ["locale", "en-US"],
    ["timezone", "Europe/Bucharest"],
    ["file.encoding", "UTF-16"],
    ["other", "UNCLASSIFIED"],
  ])("unsupported build determinant %s rejects reuse", (field, value) => {
    const changed = inputs();
    changed.environment[field] = value;
    expect(() => createReferenceInputRecord(changed)).toThrow();
  });

  test("unknown upstream tree cannot inherit qualification of the reviewed recipe", () => {
    expect(() =>
      createReferenceInputRecord({ ...inputs(), sourceTree: "a".repeat(40) }),
    ).toThrow();
    expect(() =>
      createReferenceInputRecord({ ...inputs(), sourceCommit: "a".repeat(40) }),
    ).toThrow();
  });
});
