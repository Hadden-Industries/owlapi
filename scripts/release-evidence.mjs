const version = "0.1.0-alpha.0";
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

export const assertReleaseExecutionIdentity = ({
  evidence,
  promotionCommit,
  sourceCommit,
  tag,
}) => {
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
  if (
    facts.source?.repository !== "Hadden-Industries/owlapi" ||
    facts.source.ref !== `refs/tags/v${version}` ||
    facts.source.tag !== `v${version}`
  ) {
    throw new Error("Release source repository, ref, or tag is inconsistent.");
  }
  if (
    facts.workflow?.name !== "Release reconciliation" ||
    !/^[0-9a-f]{40}$/u.test(facts.workflow.commit ?? "") ||
    facts.qualificationWorkflow?.name !== "Release" ||
    facts.qualificationWorkflow.commit !== facts.source.commit
  ) {
    throw new Error(
      "Qualification and promotion workflow identities are inconsistent.",
    );
  }
  if (
    facts.publication?.mode !== "DIRECT_BOOTSTRAP" ||
    facts.publication.coordinate !== `owlapi@${version}` ||
    facts.publication.channel !== "next" ||
    facts.publication.next !== version ||
    facts.publication.latestPresent !== false ||
    facts.publication.provenance?.sourceCommit !== facts.workflow.commit ||
    facts.publication.provenance.sourceRef !== "refs/heads/main" ||
    facts.publication.provenance.workflow !==
      ".github/workflows/release-reconciliation.yml" ||
    facts.publication.provenance.subjectSha256 !==
      facts.candidate?.tarball?.sha256
  ) {
    throw new Error(
      "Release publication facts do not describe the reviewed alpha.",
    );
  }
  if (
    facts.reconciliation?.failureClass !==
      "POST_QUALIFICATION_EVIDENCE_PERSISTENCE_FAILURE" ||
    facts.reconciliation.sourceFailureJob?.name !== "Release / tag accepted" ||
    facts.reconciliation.sourceFailureJob.conclusion !== "failure" ||
    facts.reconciliation.packageReproduction?.result !== "BYTE_IDENTICAL" ||
    facts.reconciliation.packageReproduction.bytes !==
      facts.candidate?.tarball?.bytes ||
    facts.reconciliation.packageReproduction.sha256 !==
      facts.candidate?.tarball?.sha256
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
      JSON.stringify(REQUIRED_JOB_NAMES) ||
    requiredJobs.some(({ conclusion, url }) => conclusion !== "success" || !url)
  ) {
    throw new Error("The release required job inventory is incomplete.");
  }
  return {
    $schema: `https://raw.githubusercontent.com/Hadden-Industries/owlapi/${facts.workflow.commit}/docs/release/release-evidence.schema.json`,
    schemaVersion: 2,
    package: {
      name: "owlapi",
      version,
      coordinate: `owlapi@${version}`,
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
