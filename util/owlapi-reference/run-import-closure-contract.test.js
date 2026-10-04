import { jest } from "@jest/globals";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileOntologyReferenceOracles,
  executeImportClosureOracle,
  OntologyReferenceOracleLauncherError,
  parseImportClosureContractArguments,
  parseOasisXmlCatalog,
  resolvePinnedReferenceEnvironment,
  runImportClosureContract,
} from "./run-import-closure-contract.mjs";

jest.setTimeout(120_000);

const fixtureDirectory = fileURLToPath(
  new URL("./fixtures/import-closure/", import.meta.url),
);
const fixturePath = (name) => join(fixtureDirectory, name);
const temporaryDirectories = [];

const temporaryDirectory = async (prefix) => {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

const writeTemporaryCatalog = async (xml) => {
  const directory = await temporaryDirectory("owlapi-catalog-test-");
  const catalogPath = join(directory, "catalog.xml");
  await writeFile(catalogPath, xml, "utf8");
  return { catalogPath, directory };
};

const oasisXmlCatalogDocument = (
  body,
) => `<?xml version="1.0" encoding="UTF-8"?>
  <catalog xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog">
    ${body}
  </catalog>`;

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("import-closure oracle launcher arguments", () => {
  it("accepts each required path exactly once in any order", () => {
    expect(
      parseImportClosureContractArguments([
        "--catalog",
        "catalog.xml",
        "--verify-output",
        "collapsed.ofn",
        "--root",
        "root.ofn",
      ]),
    ).toEqual({
      catalogPath: "catalog.xml",
      rootPath: "root.ofn",
      verifyOutputPath: "collapsed.ofn",
    });
  });

  it.each([
    [[], "ONTOLOGY_REFERENCE_ORACLE_ARGUMENT_MISSING"],
    [["--root", "root.ofn"], "ONTOLOGY_REFERENCE_ORACLE_ARGUMENT_MISSING"],
    [
      [
        "--root",
        "root.ofn",
        "--catalog",
        "catalog.xml",
        "--verify-output",
        "collapsed.ofn",
        "--root",
        "other.ofn",
      ],
      "ONTOLOGY_REFERENCE_ORACLE_ARGUMENT_DUPLICATE",
    ],
    [
      [
        "--root",
        "root.ofn",
        "--catalog",
        "catalog.xml",
        "--verify-output",
        "collapsed.ofn",
        "--network",
      ],
      "ONTOLOGY_REFERENCE_ORACLE_ARGUMENT_UNKNOWN",
    ],
  ])("rejects an invalid argument vector", (arguments_, code) => {
    expect(() => parseImportClosureContractArguments(arguments_)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("rejects missing input paths before invoking Java", async () => {
    const executeProcess = jest.fn();

    await expect(
      runImportClosureContract(
        {
          catalogPath: fixturePath("catalog.xml"),
          rootPath: fixturePath("missing-root.ofn"),
          verifyOutputPath: fixturePath("collapsed.ofn"),
        },
        { executeProcess },
      ),
    ).rejects.toMatchObject({
      code: "ONTOLOGY_REFERENCE_ORACLE_ROOT_NOT_FOUND",
    });
    expect(executeProcess).not.toHaveBeenCalled();
  });
});

describe("exact OASIS XML Catalog subset", () => {
  it("uses the XML parser and URL implementation to resolve exact nested URI entries", async () => {
    const mappings = await parseOasisXmlCatalog(fixturePath("catalog.xml"));

    expect(mappings).toEqual([
      {
        documentPath: fixturePath("member-a.ofn"),
        ontologyIRI: "urn:owlapi-js:import-closure:member-a",
      },
      {
        documentPath: fixturePath("member-b.ofn"),
        ontologyIRI: "urn:owlapi-js:import-closure:member-b",
      },
      {
        documentPath: fixturePath("root.ofn"),
        ontologyIRI: "urn:owlapi-js:import-closure:root",
      },
    ]);
  });

  it("rejects malformed XML", async () => {
    const { catalogPath } = await writeTemporaryCatalog(
      '<catalog xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog"><uri></catalog>',
    );

    await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
      code: "IMPORT_CLOSURE_CATALOG_XML_INVALID",
    });
  });

  it("rejects every DOCTYPE so external entities remain disabled", async () => {
    const { catalogPath } =
      await writeTemporaryCatalog(`<!DOCTYPE catalog SYSTEM "https://example.com/catalog.dtd">
      <catalog xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog"/>`);

    await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
      code: "IMPORT_CLOSURE_CATALOG_DOCTYPE_FORBIDDEN",
    });
  });

  it("rejects duplicate ontology-IRI entries", async () => {
    const { catalogPath, directory } = await writeTemporaryCatalog("");
    await writeFile(join(directory, "first.ofn"), "Ontology()", "utf8");
    await writeFile(join(directory, "second.ofn"), "Ontology()", "utf8");
    await writeFile(
      catalogPath,
      oasisXmlCatalogDocument(`<uri name="urn:test:duplicate" uri="first.ofn"/>
        <uri name="urn:test:duplicate" uri="second.ofn"/>`),
      "utf8",
    );

    await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
      code: "IMPORT_CLOSURE_CATALOG_ENTRY_DUPLICATE",
      ontologyIRI: "urn:test:duplicate",
    });
  });

  it.each(["rewriteURI", "delegateURI", "nextCatalog"])(
    "rejects the unsupported %s construct",
    async (localName) => {
      const { catalogPath } = await writeTemporaryCatalog(
        oasisXmlCatalogDocument(
          `<${localName} uriStartString="urn:test:" rewritePrefix="./"/>`,
        ),
      );

      await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
        code: "IMPORT_CLOSURE_CATALOG_CONSTRUCT_UNSUPPORTED",
        construct: localName,
      });
    },
  );

  it.each([
    [
      "catalog",
      '<catalog><uri name="urn:test:nested" uri="member.ofn"/></catalog>',
    ],
    [
      "group",
      '<group><group><uri name="urn:test:nested" uri="member.ofn"/></group></group>',
    ],
  ])(
    "rejects a nested %s container outside the supported OASIS content model",
    async (construct, nestedContent) => {
      const { catalogPath, directory } = await writeTemporaryCatalog("");
      await writeFile(join(directory, "member.ofn"), "Ontology()", "utf8");
      await writeFile(
        catalogPath,
        oasisXmlCatalogDocument(nestedContent),
        "utf8",
      );

      await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
        code: "IMPORT_CLOSURE_CATALOG_CONSTRUCT_UNSUPPORTED",
        construct,
      });
    },
  );

  it("rejects network catalog targets", async () => {
    const { catalogPath } = await writeTemporaryCatalog(
      oasisXmlCatalogDocument(
        '<uri name="urn:test:network" uri="https://example.com/import.ofn"/>',
      ),
    );

    await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
      code: "IMPORT_CLOSURE_CATALOG_TARGET_NOT_LOCAL",
      ontologyIRI: "urn:test:network",
    });
  });

  it.each(["member.ofn#fragment", "member.ofn?query=1", "..\\member.ofn"])(
    "rejects the ambiguous catalog target %s",
    async (target) => {
      const { catalogPath } = await writeTemporaryCatalog(
        oasisXmlCatalogDocument(
          `<uri name="urn:test:ambiguous" uri="${target}"/>`,
        ),
      );

      await expect(parseOasisXmlCatalog(catalogPath)).rejects.toMatchObject({
        code: "IMPORT_CLOSURE_CATALOG_TARGET_AMBIGUOUS",
        ontologyIRI: "urn:test:ambiguous",
      });
    },
  );
});

describe("Java process boundary", () => {
  const referenceEnvironment = Object.freeze({
    classpathFile: "classpath.txt",
    launcherSource: "RunWithClasspath.java",
    owlapiVersion: "5.5.1",
    oracleSources: [
      "RunImportClosureContract.java",
      "RunOntologyParsingContract.java",
      "OntologyReferenceContract.java",
      "OntologyStructuralComparison.java",
    ],
    pinnedRevision: "0123456789abcdef0123456789abcdef01234567",
  });

  it("classifies a Java compile failure without parsing compiler diagnostics", async () => {
    const outputDirectory = await temporaryDirectory("owlapi-compile-failure-");
    const executeProcess = jest.fn().mockResolvedValue({
      exitCode: 1,
      stderr: "authoritative javac diagnostic",
      stdout: "",
    });

    await expect(
      compileOntologyReferenceOracles(referenceEnvironment, outputDirectory, {
        executeProcess,
      }),
    ).rejects.toMatchObject({
      code: "ONTOLOGY_REFERENCE_ORACLE_COMPILE_FAILED",
      stage: "classpath-launcher",
    });
  });

  it.each(["stderr", "stdout"])(
    "rejects an exit-zero Java compile that emits a %s diagnostic",
    async (diagnosticStream) => {
      const outputDirectory = await temporaryDirectory(
        "owlapi-compile-diagnostic-",
      );
      const executeProcess = jest.fn().mockResolvedValue({
        exitCode: 0,
        stderr: diagnosticStream === "stderr" ? "authoritative diagnostic" : "",
        stdout: diagnosticStream === "stdout" ? "authoritative diagnostic" : "",
      });

      await expect(
        compileOntologyReferenceOracles(referenceEnvironment, outputDirectory, {
          executeProcess,
        }),
      ).rejects.toMatchObject({
        code: "ONTOLOGY_REFERENCE_ORACLE_COMPILE_FAILED",
        stage: "classpath-launcher",
      });
    },
  );

  it("classifies a Java non-zero exit that does not provide a result", async () => {
    const executeProcess = jest.fn().mockResolvedValue({
      exitCode: 17,
      stderr: "authoritative JVM diagnostic",
      stdout: "not JSON",
    });

    await expect(
      executeImportClosureOracle(
        {
          catalogMappings: [],
          compiledOracleDirectory: "compiled",
          rootPath: fixturePath("root.ofn"),
          verifyOutputPath: fixturePath("collapsed.ofn"),
        },
        referenceEnvironment,
        { executeProcess },
      ),
    ).rejects.toMatchObject({
      code: "ONTOLOGY_REFERENCE_ORACLE_JAVA_FAILED",
      exitCode: 17,
    });
  });
});

describe("pinned reference checkout configuration", () => {
  const pinnedRevision = "0123456789abcdef0123456789abcdef01234567";

  const createReferenceConfiguration = async () => {
    const sourceCheckoutPath = await temporaryDirectory(
      "owlapi-reference-checkout-",
    );
    const classpathDirectory = join(
      sourceCheckoutPath,
      "distribution",
      "target",
    );
    await mkdir(classpathDirectory, { recursive: true });
    await writeFile(
      join(classpathDirectory, "owlapi-runtime-classpath.txt"),
      "reference.jar\n",
    );
    const pinnedVersionPath = join(sourceCheckoutPath, "pinned-version.json");
    await writeFile(
      pinnedVersionPath,
      JSON.stringify({
        owlapiVersionLine: "5.5.1",
        sourceRevision: pinnedRevision,
        sourcePathForPhase0Evidence: join(
          sourceCheckoutPath,
          "historical-checkout",
        ),
      }),
    );
    return { pinnedVersionPath, sourceCheckoutPath };
  };

  it("uses an explicitly configured checkout without relocating historical provenance", async () => {
    const configuration = await createReferenceConfiguration();
    const executeProcess = jest.fn().mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: `${pinnedRevision}\n`,
    });

    await expect(
      resolvePinnedReferenceEnvironment({
        ...configuration,
        executeProcess,
      }),
    ).resolves.toMatchObject({
      pinnedRevision,
      sourceCheckout: configuration.sourceCheckoutPath,
      classpathFile: join(
        configuration.sourceCheckoutPath,
        "distribution",
        "target",
        "owlapi-runtime-classpath.txt",
      ),
    });
    expect(executeProcess).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining([
        "-C",
        configuration.sourceCheckoutPath,
        "rev-parse",
        "HEAD",
      ]),
    );
  });

  it("rejects a configured checkout at a different revision", async () => {
    const configuration = await createReferenceConfiguration();
    const executeProcess = jest.fn().mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: `${"f".repeat(40)}\n`,
    });

    await expect(
      resolvePinnedReferenceEnvironment({
        ...configuration,
        executeProcess,
      }),
    ).rejects.toMatchObject({
      code: "ONTOLOGY_REFERENCE_ORACLE_REVISION_MISMATCH",
    });
  });

  it("requires checkout configuration instead of using a historical machine path", async () => {
    const configuration = await createReferenceConfiguration();
    const executeProcess = jest.fn();

    await expect(
      resolvePinnedReferenceEnvironment({
        ...configuration,
        sourceCheckoutPath: "",
        executeProcess,
      }),
    ).rejects.toMatchObject({
      code: "ONTOLOGY_REFERENCE_ORACLE_REFERENCE_ENVIRONMENT_UNAVAILABLE",
    });
    expect(executeProcess).not.toHaveBeenCalled();
  });
});

let pinnedReferenceEnvironment;
if (process.env.OWLAPI_REFERENCE_CHECKOUT) {
  pinnedReferenceEnvironment = await resolvePinnedReferenceEnvironment();
}

const describePinnedOracle = pinnedReferenceEnvironment
  ? describe
  : describe.skip;

describePinnedOracle("pinned Java cyclic import-closure oracle", () => {
  let compiledOracleDirectory;

  beforeAll(async () => {
    compiledOracleDirectory = await temporaryDirectory(
      "owlapi-import-closure-java-",
    );
    await compileOntologyReferenceOracles(
      pinnedReferenceEnvironment,
      compiledOracleDirectory,
    );
  });

  const executeFixture = async ({ catalogPath, verifyOutputPath }) =>
    executeImportClosureOracle(
      {
        catalogMappings: await parseOasisXmlCatalog(catalogPath),
        compiledOracleDirectory,
        rootPath: fixturePath("root.ofn"),
        verifyOutputPath,
      },
      pinnedReferenceEnvironment,
    );

  const writeModifiedCollapsedOntology = async (prefix, transform) => {
    const directory = await temporaryDirectory(prefix);
    const outputPath = join(directory, "collapsed-modified.ofn");
    const source = await readFile(fixturePath("collapsed.ofn"), "utf8");
    await writeFile(outputPath, transform(source), "utf8");
    return outputPath;
  };

  it("records explicit Java parser settings and source diagnostics", async () => {
    const execution = await executeFixture({
      catalogPath: fixturePath("catalog.xml"),
      verifyOutputPath: fixturePath("collapsed.ofn"),
    });
    expect(execution.result.parserConfiguration).toEqual({
      strict: false,
      loadAnnotationAxioms: true,
    });
    expect(execution.result.sourceDiagnostics).toHaveLength(3);
    expect(
      execution.result.sourceDiagnostics.every(
        ({ unparsedTriples }) => unparsedTriples.length === 0,
      ),
    ).toBe(true);

    // Exercise transported bytes independently of the producer's checkout and home.
    const relocated = await temporaryDirectory("owlapi-relocated-reference-");
    const emptyHome = await temporaryDirectory("owlapi-empty-java-home-");
    const originalClasspath = (
      await readFile(pinnedReferenceEnvironment.classpathFile, "utf8")
    )
      .trim()
      .split(delimiter);
    expect(originalClasspath).toHaveLength(63);
    const orderedHashes = [];
    const relocatedClasspath = [];
    for (const [index, original] of originalClasspath.entries()) {
      const destination = join(
        relocated,
        `${String(index).padStart(3, "0")}.jar`,
      );
      await copyFile(original, destination);
      const originalBytes = await readFile(original);
      expect(await readFile(destination)).toEqual(originalBytes);
      orderedHashes.push(
        createHash("sha256").update(originalBytes).digest("hex"),
      );
      relocatedClasspath.push(destination);
    }
    const classpathFile = join(relocated, "classpath.txt");
    await writeFile(classpathFile, relocatedClasspath.join(delimiter), "utf8");
    const relocatedEnvironment = {
      ...pinnedReferenceEnvironment,
      classpathFile,
    };
    const isolatedProcess = (command, arguments_) => {
      expect(["java", "javac"]).toContain(command);
      let directCommand = command;
      let directArguments = arguments_;
      let observeOracleHome = false;
      if (command === "java") {
        // Resolve the launcher contract directly so the bounded process is the
        // actual compiler/oracle, without an unbounded nested JVM or lost -D flags.
        const [
          classpathFlag,
          ,
          launcher,
          suppliedClasspath,
          extraEntry,
          entryPoint,
          ...entryArguments
        ] = arguments_;
        expect(classpathFlag).toBe("-cp");
        expect(launcher).toBe("RunWithClasspath");
        expect(suppliedClasspath).toBe(classpathFile);
        const classpath = [extraEntry, ...relocatedClasspath].join(delimiter);
        if (entryPoint === "com.sun.tools.javac.Main") {
          directCommand = "javac";
          directArguments = ["-cp", classpath, ...entryArguments];
        } else {
          expect(entryPoint).toBe("RunImportClosureContract");
          observeOracleHome = true;
          directArguments = [
            "-XshowSettings:properties",
            "-cp",
            classpath,
            entryPoint,
            ...entryArguments,
          ];
        }
      }
      const prefix = directCommand === "javac" ? "-J-D" : "-D";
      const isolatedEnvironment = {
        ...process.env,
        HOME: emptyHome,
        USERPROFILE: emptyHome,
      };
      // An empty Java options variable still emits a startup diagnostic.
      // Remove ambient options rather than suppressing any compiler diagnostics.
      delete isolatedEnvironment.JAVA_TOOL_OPTIONS;
      delete isolatedEnvironment.JDK_JAVA_OPTIONS;
      delete isolatedEnvironment._JAVA_OPTIONS;
      return new Promise((resolve, reject) => {
        execFile(
          directCommand,
          [
            `${prefix}user.home=${emptyHome}`,
            `${prefix}maven.repo.local=${join(emptyHome, ".m2", "repository")}`,
            ...directArguments,
          ],
          {
            timeout: 60_000,
            maxBuffer: 8 * 1024 * 1024,
            windowsHide: true,
            env: isolatedEnvironment,
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else {
              try {
                if (observeOracleHome) {
                  const properties = stderr
                    .split(/\r?\n/u)
                    .map((line) => line.trim());
                  expect(properties).toContain(`user.home = ${emptyHome}`);
                  expect(properties).toContain(
                    `maven.repo.local = ${join(emptyHome, ".m2", "repository")}`,
                  );
                }
                resolve({ exitCode: 0, stdout, stderr });
              } catch (cause) {
                reject(cause);
              }
            }
          },
        );
      });
    };
    expect(await readdir(emptyHome)).toEqual([]);
    const relocatedOracles = join(relocated, "oracles");
    await compileOntologyReferenceOracles(
      relocatedEnvironment,
      relocatedOracles,
      {
        executeProcess: isolatedProcess,
      },
    );
    const relocatedExecution = await executeImportClosureOracle(
      {
        catalogMappings: await parseOasisXmlCatalog(fixturePath("catalog.xml")),
        compiledOracleDirectory: relocatedOracles,
        rootPath: fixturePath("root.ofn"),
        verifyOutputPath: fixturePath("collapsed.ofn"),
      },
      relocatedEnvironment,
      { executeProcess: isolatedProcess },
    );
    expect(relocatedExecution.result.comparisonOutcome).toBe("MATCH");
    expect(relocatedExecution.result).toEqual(execution.result);
    expect(await readdir(emptyHome)).toEqual([]);
    console.warn(
      JSON.stringify({
        nativeReferenceRelocation: {
          jarCount: relocatedClasspath.length,
          orderedClasspathSha256: createHash("sha256")
            .update(JSON.stringify(orderedHashes))
            .digest("hex"),
          comparisonOutcome: relocatedExecution.result.comparisonOutcome,
          isolatedHomeRemainedEmpty: true,
        },
      }),
    );
  });

  it("refuses an apparent match when native Java reports unparsed RDF", async () => {
    const directory = await temporaryDirectory("owlapi-unparsed-java-");
    const rootPath = join(directory, "root.rdf");
    const verifyOutputPath = join(directory, "output.ofn");
    await writeFile(
      rootPath,
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#"><owl:Ontology rdf:about="urn:root"/><rdf:Description rdf:about="urn:subject"><owl:unknownPredicate rdf:resource="urn:object"/></rdf:Description></rdf:RDF>`,
    );
    await writeFile(verifyOutputPath, "Ontology(<urn:root>)");
    const execution = await executeImportClosureOracle(
      {
        rootPath,
        verifyOutputPath,
        catalogMappings: [],
        compiledOracleDirectory,
      },
      pinnedReferenceEnvironment,
    );
    expect(execution.result).toMatchObject({
      comparisonOutcome: "ERROR",
      mismatchCategory: "SOURCE_UNPARSED_RDF",
    });
    expect(
      execution.result.sourceDiagnostics[0].unparsedTriples,
    ).not.toHaveLength(0);
  });

  it("refuses unparsed candidate RDF even when reconstructed axioms match", async () => {
    const directory = await temporaryDirectory("owlapi-unparsed-output-java-");
    const rootPath = join(directory, "root.ofn");
    const verifyOutputPath = join(directory, "output.rdf");
    await writeFile(rootPath, "Ontology(<urn:root>)");
    await writeFile(
      verifyOutputPath,
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#"><owl:Ontology rdf:about="urn:root"/><rdf:Description rdf:about="urn:subject"><owl:unknownPredicate rdf:resource="urn:object"/></rdf:Description></rdf:RDF>`,
    );
    const execution = await executeImportClosureOracle(
      {
        rootPath,
        verifyOutputPath,
        catalogMappings: [],
        compiledOracleDirectory,
      },
      pinnedReferenceEnvironment,
    );
    expect(execution.result).toMatchObject({
      comparisonOutcome: "ERROR",
      mismatchCategory: "OUTPUT_UNPARSED_RDF",
    });
    expect(execution.stderr).toContain("unknownPredicate");
  });

  it("matches a cyclic closure under one anonymous-individual bijection", async () => {
    const execution = await executeFixture({
      catalogPath: fixturePath("catalog.xml"),
      verifyOutputPath: fixturePath("collapsed.ofn"),
    });

    expect(execution.exitCode).toBe(0);
    expect(execution.result).toMatchObject({
      actualCounts: {
        axioms: 10,
        directImports: 0,
        ontologyAnnotations: 1,
      },
      anonymousIndividualBijectionSize: 3,
      closureMemberIds: expect.arrayContaining([
        expect.objectContaining({
          ontologyIRI: "urn:owlapi-js:import-closure:root",
          versionIRI: "urn:owlapi-js:import-closure:root:v1",
        }),
        expect.objectContaining({
          ontologyIRI: "urn:owlapi-js:import-closure:member-a",
        }),
        expect.objectContaining({
          ontologyIRI: "urn:owlapi-js:import-closure:member-b",
        }),
      ]),
      comparisonOutcome: "MATCH",
      expectedCounts: {
        axioms: 10,
        directImports: 0,
        ontologyAnnotations: 1,
      },
      mismatchCategory: null,
      mismatchPath: null,
      networkEvidence: {
        mode: "FAIL_CLOSED_EXACT_CATALOG",
        networkAccessAttemptCount: 0,
      },
      owlapiVersion: "5.5.1",
      pinnedRevision: pinnedReferenceEnvironment.pinnedRevision,
      schemaVersion: 1,
    });
  });

  it("matches anonymous ontology identities after an independent document load", async () => {
    const directory = await temporaryDirectory("owlapi-anonymous-ontology-");
    const rootPath = join(directory, "root.ofn");
    const verifyOutputPath = join(directory, "collapsed.ofn");
    const document =
      "Ontology(Declaration(Class(<urn:test:AnonymousRootClass>)))\n";
    await writeFile(rootPath, document, "utf8");
    await writeFile(verifyOutputPath, document, "utf8");

    const execution = await executeImportClosureOracle(
      {
        catalogMappings: [],
        compiledOracleDirectory,
        rootPath,
        verifyOutputPath,
      },
      pinnedReferenceEnvironment,
    );

    expect(execution.result).toMatchObject({
      comparisonOutcome: "MATCH",
      closureMemberIds: [{ ontologyIRI: null, versionIRI: null }],
      expectedCounts: { axioms: 1 },
      actualCounts: { axioms: 1 },
    });
    expect(execution.exitCode).toBe(0);
  });

  it("compares a large named-axiom set without exhausting the JVM call stack", async () => {
    const directory = await temporaryDirectory("owlapi-large-axiom-set-");
    const rootPath = join(directory, "root.ofn");
    const verifyOutputPath = join(directory, "collapsed.ofn");
    const axioms = Array.from(
      { length: 3000 },
      (_, index) => `Declaration(Class(<urn:test:LargeClass${index}>))`,
    );
    await writeFile(
      rootPath,
      `Ontology(<urn:test:large>\n${axioms.join("\n")}\n)\n`,
      "utf8",
    );
    await writeFile(
      verifyOutputPath,
      `Ontology(<urn:test:large>\n${axioms.toReversed().join("\n")}\n)\n`,
      "utf8",
    );

    const execution = await executeImportClosureOracle(
      {
        catalogMappings: [],
        compiledOracleDirectory,
        rootPath,
        verifyOutputPath,
      },
      pinnedReferenceEnvironment,
    ).catch((error) => {
      throw new Error(error.stderr || error.message, { cause: error });
    });

    expect(execution.result).toMatchObject({
      comparisonOutcome: "MATCH",
      anonymousIndividualBijectionSize: 0,
      expectedCounts: { axioms: 3000 },
      actualCounts: { axioms: 3000 },
    });
    expect(execution.exitCode).toBe(0);
  });

  it("returns one structured mismatch result for a changed structural axiom", async () => {
    const mismatchedOutput = await writeModifiedCollapsedOntology(
      "owlapi-output-mismatch-",
      (source) =>
        source.replace(
          "Declaration(Class(:MemberB))",
          "Declaration(Class(:DifferentMember))",
        ),
    );

    const execution = await executeFixture({
      catalogPath: fixturePath("catalog.xml"),
      verifyOutputPath: mismatchedOutput,
    });

    expect(execution.exitCode).not.toBe(0);
    expect(execution.result).toMatchObject({
      comparisonOutcome: "MISMATCH",
      mismatchCategory: "AXIOMS",
      mismatchPath: "ontology.axioms",
      networkEvidence: { networkAccessAttemptCount: 0 },
    });
  });

  it("reports all named structural differences after counts and earlier fields differ", async () => {
    const directory = await temporaryDirectory("owlapi-complete-differences-");
    const rootPath = join(directory, "root.ofn");
    const verifyOutputPath = join(directory, "output.ofn");
    await writeFile(
      rootPath,
      `Ontology(<urn:expected> <urn:expected:v1>
        Annotation(<urn:label> "expected")
        Declaration(Class(<urn:Common>))
        Declaration(Class(<urn:Missing>))
        Declaration(Class(<urn:Changed>)))`,
    );
    await writeFile(
      verifyOutputPath,
      `Ontology(<urn:actual> <urn:actual:v2>
        Import(<urn:unexpected:import>)
        Annotation(<urn:label> "actual")
        Declaration(Class(<urn:Common>))
        Declaration(Class(<urn:Replacement>)))`,
    );
    const { result } = await executeImportClosureOracle(
      {
        rootPath,
        verifyOutputPath,
        catalogMappings: [],
        compiledOracleDirectory,
      },
      pinnedReferenceEnvironment,
    );
    expect(result.comparisonOutcome).toBe("MISMATCH");
    expect(result.structuralDifferences).toEqual({
      ontologyId: {
        java: { ontologyIRI: "urn:expected", versionIRI: "urn:expected:v1" },
        js: { ontologyIRI: "urn:actual", versionIRI: "urn:actual:v2" },
      },
      imports: { javaOnly: [], jsOnly: ["urn:unexpected:import"] },
      annotations: {
        javaOnly: ['Annotation(<urn:label> "expected"^^xsd:string)'],
        jsOnly: ['Annotation(<urn:label> "actual"^^xsd:string)'],
      },
      axioms: {
        javaOnly: [
          "Declaration(Class(<urn:Changed>))",
          "Declaration(Class(<urn:Missing>))",
        ],
        jsOnly: ["Declaration(Class(<urn:Replacement>))"],
      },
      anonymousIndividualGraphs: { javaOnly: [], jsOnly: [] },
      anonymousIndividualComparison: "NOT_REQUIRED",
    });
  });

  it("does not treat reordered inverse-property operands as an axiom difference", async () => {
    const directory = await temporaryDirectory("owlapi-unordered-inverse-");
    const rootPath = join(directory, "root.ofn");
    const verifyOutputPath = join(directory, "output.ofn");
    await writeFile(
      rootPath,
      "Ontology(<urn:root> InverseObjectProperties(<urn:p> <urn:q>))",
    );
    await writeFile(
      verifyOutputPath,
      "Ontology(<urn:root> InverseObjectProperties(<urn:q> <urn:p>))",
    );
    const { result } = await executeImportClosureOracle(
      {
        rootPath,
        verifyOutputPath,
        catalogMappings: [],
        compiledOracleDirectory,
      },
      pinnedReferenceEnvironment,
    );
    expect(result.comparisonOutcome).toBe("MATCH");
    expect(result.structuralDifferences.axioms).toEqual({
      javaOnly: [],
      jsOnly: [],
    });
  });

  it("keeps renamed anonymous graphs matched while reporting an extra named axiom", async () => {
    const mismatchedOutput = await writeModifiedCollapsedOntology(
      "owlapi-anonymous-residual-differences-",
      (source) =>
        source.replace(
          "Declaration(Class(:MemberB))",
          "Declaration(Class(:MemberB))\nDeclaration(Class(:Unexpected))",
        ),
    );
    const { result } = await executeFixture({
      catalogPath: fixturePath("catalog.xml"),
      verifyOutputPath: mismatchedOutput,
    });
    expect(result.comparisonOutcome).toBe("MISMATCH");
    expect(result.structuralDifferences.axioms).toEqual({
      javaOnly: [],
      jsOnly: ["Declaration(Class(<urn:owlapi-js:import-closure#Unexpected>))"],
    });
    expect(result.structuralDifferences.anonymousIndividualGraphs).toEqual({
      javaOnly: [],
      jsOnly: [],
    });
    expect(result.structuralDifferences.anonymousIndividualComparison).toBe(
      "MATCH",
    );
  });

  it("retains structural differences when Java source RDF is unparsed", async () => {
    const directory = await temporaryDirectory(
      "owlapi-unparsed-full-differences-",
    );
    const rootPath = join(directory, "root.rdf");
    const verifyOutputPath = join(directory, "output.ofn");
    await writeFile(
      rootPath,
      `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#"><owl:Ontology rdf:about="urn:root"/><owl:Class rdf:about="urn:Expected"/><rdf:Description rdf:about="urn:s"><owl:unknownPredicate rdf:resource="urn:o"/></rdf:Description></rdf:RDF>`,
    );
    await writeFile(
      verifyOutputPath,
      "Ontology(<urn:root> Declaration(Class(<urn:Unexpected>)))",
    );
    const { result } = await executeImportClosureOracle(
      {
        rootPath,
        verifyOutputPath,
        catalogMappings: [],
        compiledOracleDirectory,
      },
      pinnedReferenceEnvironment,
    );
    expect(result).toMatchObject({
      comparisonOutcome: "ERROR",
      structuralComparisonOutcome: "MISMATCH",
      mismatchCategory: "SOURCE_UNPARSED_RDF",
      expectedCounts: { axioms: 1 },
      actualCounts: { axioms: 1 },
    });
    expect(result.sourceDiagnostics[0].unparsedNQuads).toContain(
      "<http://www.w3.org/2002/07/owl#unknownPredicate>",
    );
    expect(result.structuralDifferences.axioms).toEqual({
      javaOnly: ["Declaration(Class(<urn:Expected>))"],
      jsOnly: ["Declaration(Class(<urn:Unexpected>))"],
    });
    expect(result.sourceDiagnostics[0].unparsedTriples).not.toHaveLength(0);
  });

  it("reports an unmatched anonymous graph without parser-generated node labels", async () => {
    const directory = await temporaryDirectory(
      "owlapi-anonymous-graph-diagnostic-",
    );
    const rootPath = join(directory, "root.ofn");
    const verifyOutputPath = join(directory, "output.ofn");
    await writeFile(
      rootPath,
      'Ontology(<urn:root> AnnotationAssertion(<urn:facet> _:source-label "x"))',
    );
    await writeFile(verifyOutputPath, "Ontology(<urn:root>)");
    const { result } = await executeImportClosureOracle(
      {
        rootPath,
        verifyOutputPath,
        catalogMappings: [],
        compiledOracleDirectory,
      },
      pinnedReferenceEnvironment,
    );
    expect(result.structuralDifferences.anonymousIndividualGraphs).toEqual({
      javaOnly: [
        {
          anonymousIndividuals: 1,
          statements: [
            {
              category: "AXIOM",
              value:
                'AnnotationAssertion(<urn:facet> _:comparison-0 "x"^^xsd:string)',
            },
          ],
        },
      ],
      jsOnly: [],
    });
    expect(result.structuralDifferences.anonymousIndividualComparison).toBe(
      "MISMATCH",
    );
  });

  it("rejects a many-to-one anonymous-individual mapping across source documents", async () => {
    const nonBijectiveOutput = await writeModifiedCollapsedOntology(
      "owlapi-output-non-bijective-",
      (source) =>
        source.replaceAll(
          "_:collapsed-member-a-individual",
          "_:collapsed-root-individual",
        ),
    );

    const execution = await executeFixture({
      catalogPath: fixturePath("catalog.xml"),
      verifyOutputPath: nonBijectiveOutput,
    });

    expect(execution.exitCode).not.toBe(0);
    expect(execution.result).toMatchObject({
      actualCounts: { anonymousIndividuals: 2 },
      comparisonOutcome: "MISMATCH",
      expectedCounts: { anonymousIndividuals: 3 },
      mismatchCategory: "AXIOMS",
      mismatchPath: "ontology.axioms",
      networkEvidence: { networkAccessAttemptCount: 0 },
    });
  });

  it("serializes unparsed RDF blank nodes through an RDF writer, not as fake IRIs", async () => {
    const directory = await temporaryDirectory("owlapi-unparsed-blank-node-");
    const rootPath = join(directory, "root.ttl");
    const verifyOutputPath = join(directory, "output.ofn");
    await writeFile(
      rootPath,
      "@prefix owl: <http://www.w3.org/2002/07/owl#> . <urn:root> a owl:Ontology . <urn:d> owl:withRestrictions _:list .",
    );
    await writeFile(verifyOutputPath, "Ontology(<urn:root>)");
    const { result } = await executeImportClosureOracle(
      {
        catalogMappings: [],
        compiledOracleDirectory,
        rootPath,
        verifyOutputPath,
      },
      pinnedReferenceEnvironment,
    );
    expect(result.sourceDiagnostics[0].unparsedNQuads).toMatch(
      /<urn:d> <http:\/\/www\.w3\.org\/2002\/07\/owl#withRestrictions> _:/u,
    );
    expect(result.sourceDiagnostics[0].unparsedNQuads).not.toContain("<_:");
  });

  it("proves propagation using a native merge of the compared direct JavaScript models", async () => {
    const directory = await temporaryDirectory("owlapi-propagation-");
    const rootModel = join(directory, "root.ofn");
    const output = join(directory, "closure.ofn");
    const addClass = (text) =>
      text.replace(/\)\s*$/u, "Declaration(Class(<urn:baseline-extra>))\n)");
    await writeFile(
      rootModel,
      addClass(await readFile(fixturePath("root.ofn"), "utf8")),
    );
    await writeFile(
      output,
      addClass(await readFile(fixturePath("collapsed.ofn"), "utf8")),
    );
    const parsedSourceModels = ["root.ofn", "member-a.ofn", "member-b.ofn"].map(
      (name) => ({
        sourceDocumentPath: fixturePath(name),
        modelPath: name === "root.ofn" ? rootModel : fixturePath(name),
      }),
    );
    const options = {
      catalogMappings: await parseOasisXmlCatalog(fixturePath("catalog.xml")),
      compiledOracleDirectory,
      rootPath: fixturePath("root.ofn"),
      verifyOutputPath: output,
      parsedSourceModels,
    };
    const { result } = await executeImportClosureOracle(
      options,
      pinnedReferenceEnvironment,
    );
    expect(result).toMatchObject({
      comparisonOutcome: "MISMATCH",
      propagationEvidence: { comparisonOutcome: "MATCH" },
    });
    const unmatchedOutput = await executeImportClosureOracle(
      { ...options, verifyOutputPath: fixturePath("collapsed.ofn") },
      pinnedReferenceEnvironment,
    );
    expect(unmatchedOutput.result.propagationEvidence.comparisonOutcome).toBe(
      "MISMATCH",
    );
    const missingModel = await executeImportClosureOracle(
      { ...options, parsedSourceModels: parsedSourceModels.slice(1) },
      pinnedReferenceEnvironment,
    );
    expect(missingModel.result).toMatchObject({
      comparisonOutcome: "ERROR",
      mismatchCategory: "SOURCE_MODEL_SET_MISMATCH",
    });
  });

  it("loads an unexpected output import without permitting fallback network resolution", async () => {
    const outputWithImport = await writeModifiedCollapsedOntology(
      "owlapi-output-with-import-",
      (source) =>
        source.replace(
          "  Annotation(rdfs:label",
          "  Import(<https://example.com/forbidden-import>)\n  Annotation(rdfs:label",
        ),
    );

    const execution = await executeFixture({
      catalogPath: fixturePath("catalog.xml"),
      verifyOutputPath: outputWithImport,
    });

    expect(execution.exitCode).not.toBe(0);
    expect(execution.result).toMatchObject({
      actualCounts: { directImports: 1 },
      comparisonOutcome: "MISMATCH",
      mismatchCategory: "IMPORTS",
      mismatchPath: "ontology.imports",
      networkEvidence: {
        blockedOutputImportCount: 1,
        networkAccessAttemptCount: 0,
      },
    });
  });

  it.each([1.0, 1.1])(
    "blocks remote JSON-LD %s contexts before any HTTP client reaches the network",
    async (version) => {
      let receivedRequests = 0;
      const server = createServer((_request, response) => {
        receivedRequests += 1;
        response.writeHead(200, { "content-type": "application/ld+json" });
        response.end(JSON.stringify({ "@context": {} }));
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const executeWithLoopbackProxy = (command, arguments_) =>
        new Promise((resolve, reject) => {
          execFile(
            command,
            arguments_,
            {
              env: {
                ...process.env,
                JDK_JAVA_OPTIONS: [
                  process.env.JDK_JAVA_OPTIONS ?? "",
                  "-Dhttp.proxyHost=127.0.0.1",
                  `-Dhttp.proxyPort=${server.address().port}`,
                ].join(" "),
              },
              timeout: 20_000,
            },
            (error, stdout, stderr) => {
              if (error && typeof error.code !== "number") {
                reject(error);
                return;
              }
              resolve({ exitCode: error?.code ?? 0, stdout, stderr });
            },
          );
        });
      try {
        const directory = await temporaryDirectory("owlapi-remote-context-");
        const rootPath = join(directory, "root.jsonld");
        const verifyOutputPath = join(directory, "collapsed.ofn");
        const inlineContext = version === 1.1 ? { "@version": 1.1 } : {};
        await writeFile(
          rootPath,
          JSON.stringify([
            {
              "@context": inlineContext,
              "@id": "urn:test:remote-context",
              "@type": "http://www.w3.org/2002/07/owl#Ontology",
            },
          ]),
          "utf8",
        );
        await writeFile(
          verifyOutputPath,
          "Ontology(<urn:test:remote-context>)\n",
          "utf8",
        );

        const localExecution = await executeImportClosureOracle(
          {
            catalogMappings: [],
            compiledOracleDirectory,
            rootPath,
            verifyOutputPath,
          },
          pinnedReferenceEnvironment,
          { executeProcess: executeWithLoopbackProxy },
        );
        if (localExecution.result.comparisonOutcome === "ERROR") {
          throw new Error(localExecution.stderr);
        }
        expect(localExecution.result.comparisonOutcome).toBe("MATCH");

        await writeFile(
          rootPath,
          JSON.stringify([
            {
              // RDF4J allows this URL by default. The loopback proxy observes
              // any attempted fetch without contacting the external host.
              "@context": [inlineContext, "http://schema.org/"],
              "@id": "urn:test:remote-context",
              "@type": "http://www.w3.org/2002/07/owl#Ontology",
            },
          ]),
          "utf8",
        );

        const execution = await executeImportClosureOracle(
          {
            catalogMappings: [],
            compiledOracleDirectory,
            rootPath,
            verifyOutputPath,
          },
          pinnedReferenceEnvironment,
          { executeProcess: executeWithLoopbackProxy },
        );

        expect(receivedRequests).toBe(0);
        expect(execution.exitCode).not.toBe(0);
        expect(execution.result.comparisonOutcome).toBe("ERROR");
      } finally {
        server.closeAllConnections();
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it("fails closed when an authored import is absent from the catalog", async () => {
    const mappings = [
      {
        documentPath: fixturePath("root.ofn"),
        ontologyIRI: "urn:owlapi-js:import-closure:root",
      },
    ];

    const execution = await executeImportClosureOracle(
      {
        catalogMappings: mappings,
        compiledOracleDirectory,
        rootPath: fixturePath("root.ofn"),
        verifyOutputPath: fixturePath("collapsed.ofn"),
      },
      pinnedReferenceEnvironment,
    );

    expect(execution.exitCode).not.toBe(0);
    expect(execution.result).toMatchObject({
      comparisonOutcome: "ERROR",
      mismatchCategory: "CATALOG_ENTRY_MISSING",
      mismatchPath: "urn:owlapi-js:import-closure:member-a",
      networkEvidence: { networkAccessAttemptCount: 0 },
    });
  });
});

describe("launcher error identity", () => {
  it("uses one precise typed error for launcher failures", () => {
    const error = new OntologyReferenceOracleLauncherError("message", "CODE", {
      detail: "value",
    });

    expect(error).toMatchObject({
      code: "CODE",
      detail: "value",
      message: "message",
      name: "OntologyReferenceOracleLauncherError",
    });
  });
});
