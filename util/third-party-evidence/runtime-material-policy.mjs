/** Licence policy for npm archives installed separately from OwlAPI (DEC-004). */
export const RECIPIENT_MATERIAL_POLICY = "DEC-004-2026-11-26-v1";

const separatelyInstalledLicences = new Set([
  "Apache-2.0",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

/** The shared allowlist supplies one criterion, alongside authenticated material evidence. */
export const isSeparatelyInstalledRuntimeLicence = (expression) =>
  separatelyInstalledLicences.has(expression);

// The @rubensworks/saxes 6.0.1 archive omits its licence text. This scope is
// bound to the exact archive rather than an install path or a later version.
const saxesArchiveSha256 =
  "f1b0c3b02664d080671072037a96b8f6dff8c6bf2b2e3202cc0941253a633eab";
const saxesExternalLicence = Object.freeze({
  url: "https://raw.githubusercontent.com/rubensworks/saxes/0f36739ccb43a87c50408e1e713382cda09e0b05/LICENSE",
  filename: "LICENSE",
  sha256: "0fac2374380621b22e6b50451057721a9c52935b02d16d106a9f04897f061d0e",
  observedOn: "2026-08-26",
  reason:
    "The installed npm tarball declares ISC but contains no top-level licence file; this is the exact licence at the immutable upstream commit behind v6.0.1.",
});

/** Reuse the pinned exception for the matching immutable, top-level archive. */
export const externalRuntimeLicenceEvidence = (artifact) =>
  artifact.name === "@rubensworks/saxes" &&
  artifact.version === "6.0.1" &&
  artifact.tarball.sha256 === saxesArchiveSha256
    ? [saxesExternalLicence]
    : [];
