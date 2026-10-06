import {
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PACKAGE_FILE_STEM,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { assertOwlContractReport } from "./owl-contract-evidence.mjs";
const alphaVersion = "0.1.0-alpha.0";
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeBy = (records, key) =>
  [...records].sort((left, right) => compareCodeUnits(left[key], right[key]));

const normalizeAssets = (assets) => normalizeBy(assets, "name");
const REQUIRED_JOB_NAMES = Object.freeze(
  [
    "Release / qualified",
    "Release / publication preflight",
    "Release reconciliation / source verified",
    "Release reconciliation / accepted",
    "Release reconciliation / GitHub draft",
    "Release reconciliation / npm direct bootstrap",
    "Release reconciliation / fresh public registry",
  ].sort(compareCodeUnits),
);

/** Completed jobs needed before the fresh RC's evidence/finalization jobs may execute. */
export const SCOPED_RELEASE_JOB_NAMES = Object.freeze(
  [
    "Release / installed OWL contract",
    "Release / protected-main preflight",
    "Release / qualified",
    "Release / publication preflight",
    "Release / tag accepted",
    "Release / GitHub draft",
    "Release / npm direct bootstrap",
    "Release / fresh public registry",
  ].sort(compareCodeUnits),
);

export const assertReleaseExecutionIdentity = ({
  evidence,
  promotionCommit,
  sourceCommit,
  tag,
}) => {
  if (evidence?.reconciliation === null && evidence.schemaVersion !== 4)
    throw new Error(
      "Current producer release finalization requires schema-4 OWL contract proof.",
    );
  if (evidence?.reconciliation === null) {
    // Archive readability never grants authority to finalize a new release.
    assertOwlContractReport(evidence.producerContract, {
      candidateSha256: evidence.candidate.tarball.sha256,
      artifact: {
        id: Number(evidence.candidate.artifactId),
        digest: evidence.candidate.artifactDigest,
      },
    });
  }
  if (
    evidence?.workflow?.commit !== promotionCommit ||
    evidence.publication?.provenance?.sourceCommit !== promotionCommit
  ) {
    throw new Error(
      "Release evidence belongs to a different promotion workflow commit.",
    );
  }
  if (
    evidence.source?.commit !== sourceCommit ||
    evidence.source.tag !== tag ||
    evidence.qualificationWorkflow?.commit !== sourceCommit
  ) {
    throw new Error(
      "Release evidence belongs to a different canonical package source.",
    );
  }
  return { promotionCommit, sourceCommit, tag };
};

export const buildReleaseEvidence = (facts) => {
  const scoped = facts.reconciliation === null;
  const version = scoped ? PACKAGE_VERSION : alphaVersion;
  const packageName = scoped ? PACKAGE_NAME : "owlapi";
  const workflowName = scoped ? "Release" : "Release reconciliation";
  const workflowPath = scoped
    ? ".github/workflows/release.yml"
    : ".github/workflows/release-reconciliation.yml";
  if (
    facts.source?.repository !== "Hadden-Industries/owlapi" ||
    facts.source.ref !== `refs/tags/v${version}` ||
    facts.source.tag !== `v${version}`
  ) {
    throw new Error("Release source repository, ref, or tag is inconsistent.");
  }
  if (
    facts.workflow?.name !== workflowName ||
    !/^[0-9a-f]{40}$/u.test(facts.workflow.commit ?? "") ||
    facts.qualificationWorkflow?.name !== "Release" ||
    facts.qualificationWorkflow.commit !== facts.source.commit
  ) {
    throw new Error(
      "Qualification and promotion workflow identities are inconsistent.",
    );
  }
  if (
    scoped &&
    (facts.workflow.commit !== facts.source.commit ||
      ["name", "commit", "runId", "url"].some(
        (key) => facts.workflow[key] !== facts.qualificationWorkflow[key],
      ) ||
      !Number.isSafeInteger(facts.qualificationWorkflow.runAttempt) ||
      facts.qualificationWorkflow.runAttempt < 1 ||
      facts.qualificationWorkflow.runAttempt > facts.workflow.runAttempt)
  )
    throw new Error(
      "The scoped RC must use one canonical source and qualification run.",
    );
  if (
    facts.publication?.mode !== "DIRECT_BOOTSTRAP" ||
    facts.publication.coordinate !== `${packageName}@${version}` ||
    facts.publication.channel !== "next" ||
    facts.publication.next !== version ||
    facts.publication.latestPresent !== false ||
    facts.publication.provenance?.sourceCommit !== facts.workflow.commit ||
    facts.publication.provenance.sourceRef !== "refs/heads/main" ||
    facts.publication.provenance.workflow !== workflowPath ||
    facts.publication.provenance.subjectSha256 !==
      facts.candidate?.tarball?.sha256
  ) {
    throw new Error(
      "Release publication facts do not describe the reviewed package.",
    );
  }
  if (scoped) {
    assertOwlContractReport(facts.producerContract, {
      candidateSha256: facts.candidate.tarball.sha256,
      artifact: {
        id: Number(facts.candidate.artifactId),
        digest: facts.candidate.artifactDigest,
      },
    });
    const contractIdentity = facts.producerContract.identity;
    if (
      contractIdentity.workflow !== "Release" ||
      contractIdentity.commit !== facts.source.commit ||
      contractIdentity.runId !== Number(facts.workflow.runId) ||
      contractIdentity.runAttempt > facts.qualificationWorkflow.runAttempt
    )
      throw new Error(
        "Release contract belongs to another execution or future attempt.",
      );
    assertRegistryTarballUrl(facts.publication.tarballUrl);
    const provenance = facts.publication.provenance;
    if (
      provenance.runId !== facts.workflow.runId ||
      !Number.isSafeInteger(provenance.runAttempt) ||
      provenance.runAttempt < 1 ||
      provenance.runAttempt > facts.workflow.runAttempt
    ) {
      throw new Error(
        "Publication provenance belongs to another run or a future attempt.",
      );
    }
    if (
      facts.publication.publisherJob?.runAttempt !== provenance.runAttempt ||
      !["success", "failure"].includes(
        facts.publication.publisherJob?.conclusion,
      ) ||
      !facts.publication.publisherJob?.url
    )
      throw new Error(
        "Publication evidence omits the authenticated publisher job.",
      );
    if (
      facts.candidate?.tarball?.name !==
        `${PACKAGE_FILE_STEM}-${version}.tgz` ||
      facts.candidate?.sbom?.name !==
        `${PACKAGE_FILE_STEM}-${version}.cdx.json` ||
      facts.candidate?.checksums?.name !== "SHA256SUMS"
    ) {
      throw new Error(
        "Scoped release asset names disagree with the selected candidate.",
      );
    }
  }
  if (
    !scoped &&
    (facts.reconciliation?.failureClass !==
      "POST_QUALIFICATION_EVIDENCE_PERSISTENCE_FAILURE" ||
      facts.reconciliation.sourceFailureJob?.name !==
        "Release / tag accepted" ||
      facts.reconciliation.sourceFailureJob.conclusion !== "failure" ||
      facts.reconciliation.packageReproduction?.result !== "BYTE_IDENTICAL" ||
      facts.reconciliation.packageReproduction.bytes !==
        facts.candidate?.tarball?.bytes ||
      facts.reconciliation.packageReproduction.sha256 !==
        facts.candidate?.tarball?.sha256)
  ) {
    throw new Error(
      "Release reconciliation lacks exact package reproduction evidence.",
    );
  }
  const candidateAssets = normalizeAssets([
    facts.candidate.checksums,
    facts.candidate.sbom,
    facts.candidate.tarball,
  ]);
  if (
    JSON.stringify(candidateAssets) !==
    JSON.stringify(normalizeAssets(facts.githubRelease?.assets ?? []))
  ) {
    throw new Error("Draft GitHub release assets differ from the candidate.");
  }
  const approvedEnvironments = new Set(
    (facts.approvals ?? [])
      .filter(({ state }) => state === "approved")
      .map(({ environment }) => environment),
  );
  if (
    !approvedEnvironments.has("release-manual") ||
    !approvedEnvironments.has("npm-release")
  ) {
    throw new Error("The two reviewed release environments were not approved.");
  }
  const requiredJobs = normalizeBy(facts.requiredJobs ?? [], "name");
  if (
    JSON.stringify(requiredJobs.map(({ name }) => name)) !==
      JSON.stringify(scoped ? SCOPED_RELEASE_JOB_NAMES : REQUIRED_JOB_NAMES) ||
    requiredJobs.some(({ conclusion, url }) => conclusion !== "success" || !url)
  ) {
    throw new Error("The release required job inventory is incomplete.");
  }
  return {
    $schema: `https://raw.githubusercontent.com/Hadden-Industries/owlapi/${facts.workflow.commit}/docs/release/release-evidence.schema.json`,
    schemaVersion: scoped ? 4 : 2,
    ...(scoped ? { producerContract: facts.producerContract } : {}),
    package: {
      name: packageName,
      version,
      coordinate: `${packageName}@${version}`,
      channel: "next",
      registry: "https://registry.npmjs.org/",
    },
    generatedAt: facts.generatedAt,
    source: facts.source,
    workflow: facts.workflow,
    qualificationWorkflow: facts.qualificationWorkflow,
    candidate: facts.candidate,
    publication: facts.publication,
    reconciliation: facts.reconciliation,
    signing: facts.signing,
    githubRelease: {
      ...facts.githubRelease,
      assets: normalizeAssets(facts.githubRelease.assets),
    },
    // GitHub API collection order is not contractual. Canonical ordering keeps
    // the immutable evidence byte-stable for the same observed facts.
    approvals: normalizeBy(facts.approvals, "environment"),
    requiredJobs,
    extendedTests: normalizeBy(facts.extendedTests, "environment"),
    inputEvidence: normalizeBy(facts.inputEvidence, "name"),
  };
};
