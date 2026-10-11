import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// These byte transitions are deliberately closed: fc74a553's factual additions,
// f07ec976's documented deadline policy, and b361bedf's reference-source update.
// The expectation manifest retains its original authority hashes.
const factualAmendment = {
  path: "docs/compatibility/canonical-vowl-prerequisites.md",
  previousSha256:
    "742ba46a79ef1c6f51c1aaad765c2292a30c07ca707955c5ff6191c9564b9d2b",
  currentSha256:
    "35997fd661175251c6391839c202d889132ab285764d414e1ebae3bf61a4b722",
  addedStatements: [
    "RDF graph selection that omits source quads likewise leaves source evidence unverified; selecting all source content or explicitly merging it does not.",
    "Each prepared document has a private proof identity, so shared base IRIs and blank-node labels cannot suppress another document's independent evidence.",
    "The XML parser fallback remains a lazy, bundler-visible import for workers without a native `DOMParser`.",
  ],
  scope:
    "Three factual documentation additions; frozen expectations are unchanged.",
};

const deadlineAmendment = {
  path: factualAmendment.path,
  previousSha256: factualAmendment.currentSha256,
  currentSha256:
    "f2719c65ccb3bce29356ae3cc54251c98513752f042bdcb683e1bb8430333e45",
  replacements: [
    {
      previous:
        "Default limits are `maxWork: 1000000`, `maxDepth: 256`, `maxNumericDigits: 4096`, `maxLiteralLength: 1048576` and `timeoutMs: 30000`.\n",
      current:
        "Default limits are `maxWork: 1000000`, `maxDepth: 256`, `maxNumericDigits: 4096`, `maxLiteralLength: 1048576` and `timeoutMs: null`.\n" +
        "Omitted or explicit `null` disables only the profile elapsed deadline; cancellation and other limits remain enforced.\n" +
        "An explicit nonnegative safe integer retains its elapsed deadline, including `0`; zero is not an unlimited sentinel.\n" +
        "Pass `{ timeoutMs: 30000 }` to retain the previous profile deadline.\n" +
        "The loader's separate 30,000 ms default remains unchanged; see the [default-policy inventory](default-behavior-inventory.md).\n",
    },
  ],
  scope:
    "Exact documented deadline-policy amendment from f07ec976; frozen expectations are unchanged.",
};

const referenceAmendment = {
  path: "util/owlapi-reference/pinned-version.json",
  previousSha256:
    "85835fbe8e8e3214eeb5d72d4d0b9341ad350dfa9adf41c195542cd2dcc7c2c1",
  currentSha256:
    "c6e6faedeb07eb531c53341d9c01eb06a02a2fedc04a8fbd69078498dd12c1b6",
  replacements: [
    {
      previous:
        '  "sourceRevision": "d7e997a53b470e32700de89cc610d9daf01ea769",\n  "sourceDescribe": "owlapi-parent-5.5.1-7-gd7e997a53",\n',
      current:
        '  "sourceRevision": "b61ebe2da83daceebb3e7ba7afbd2582c9240c33",\n  "sourceDescribe": "owlapi-parent-5.5.1-9-gb61ebe2da",\n',
    },
  ],
  scope:
    "Exact existing reference-source update from b361bedf; the current source revision is still enforced at execution.",
};

const approvedChains = [
  [factualAmendment, deadlineAmendment],
  [referenceAmendment],
];

/** Verify exact approved authority edits against the frozen expectation pin. */
export function verifyProfileAuthorityAmendments(authority, currentBytes) {
  const currentSha256 = sha256(currentBytes);
  if (currentSha256 === authority.sha256) return [];
  const chain = approvedChains.find(([first]) => first.path === authority.path);
  assert.ok(chain, "Unapproved authority path transition");
  assert.equal(
    authority.sha256,
    chain[0].previousSha256,
    "Unapproved prior authority pin",
  );
  const last = chain.findIndex(
    (amendment) => amendment.currentSha256 === currentSha256,
  );
  assert.ok(last >= 0, "Unapproved current authority pin");
  let reconstructed = currentBytes.toString("utf8");
  const evidence = [];
  for (const amendment of chain.slice(0, last + 1).reverse()) {
    assert.equal(
      sha256(Buffer.from(reconstructed, "utf8")),
      amendment.currentSha256,
      "Authority amendment chain does not match its current pin",
    );
    const replacements =
      amendment.replacements ??
      amendment.addedStatements.map((statement) => ({
        current: statement + "\n",
        previous: "",
      }));
    for (const { current, previous } of replacements) {
      assert.equal(
        reconstructed.split(current).length,
        2,
        "Amendment block must occur exactly once",
      );
      const start = reconstructed.indexOf(current);
      assert.ok(
        start === 0 || reconstructed[start - 1] === "\n",
        "Amendment block must occupy its declared lines",
      );
      reconstructed = reconstructed.replace(current, previous);
    }
    const reconstructedPreviousSha256 = sha256(
      Buffer.from(reconstructed, "utf8"),
    );
    assert.equal(
      reconstructedPreviousSha256,
      amendment.previousSha256,
      "Authority contains changes beyond the exact amendment",
    );
    evidence.push({
      ...amendment,
      reconstructedPreviousSha256,
    });
  }
  assert.equal(
    sha256(Buffer.from(reconstructed, "utf8")),
    authority.sha256,
    "Authority amendment chain must reconstruct the frozen pin",
  );
  return evidence.reverse();
}
