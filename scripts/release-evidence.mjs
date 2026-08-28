const version = "0.1.0-alpha.0";
const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeBy = (records, key) =>
  [...records].sort((left, right) => compareCodeUnits(left[key], right[key]));

const normalizeAssets = (assets) => normalizeBy(assets, "name");

export const buildReleaseEvidence = (facts) => {
  if (
    facts.source?.repository !== "Hadden-Industries/owlapi" ||
    facts.source.ref !== "refs/heads/main" ||
    facts.source.tag !== `v${version}`
  ) {
    throw new Error("Release source repository, ref, or tag is inconsistent.");
  }
  if (
    facts.publication?.mode !== "DIRECT_BOOTSTRAP" ||
    facts.publication.coordinate !== `owlapi@${version}` ||
    facts.publication.channel !== "next" ||
    facts.publication.next !== version ||
    facts.publication.latestPresent !== false
  ) {
    throw new Error(
      "Release publication facts do not describe the reviewed alpha.",
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
  if (
    !(facts.requiredJobs ?? []).some(
      ({ name, conclusion }) =>
        name === "Release / qualified" && conclusion === "success",
    )
  ) {
    throw new Error(
      "The stable Release / qualified aggregate did not succeed.",
    );
  }
  return {
    $schema: `https://raw.githubusercontent.com/Hadden-Industries/owlapi/${facts.source.commit}/docs/release/release-evidence.schema.json`,
    schemaVersion: 1,
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
    candidate: facts.candidate,
    publication: facts.publication,
    signing: facts.signing,
    githubRelease: {
      ...facts.githubRelease,
      assets: normalizeAssets(facts.githubRelease.assets),
    },
    // GitHub API collection order is not contractual. Canonical ordering keeps
    // the immutable evidence byte-stable for the same observed facts.
    approvals: normalizeBy(facts.approvals, "environment"),
    requiredJobs: normalizeBy(facts.requiredJobs, "name"),
    extendedTests: normalizeBy(facts.extendedTests, "environment"),
    inputEvidence: normalizeBy(facts.inputEvidence, "name"),
  };
};
