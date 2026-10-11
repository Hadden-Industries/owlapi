import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyProfileAuthorityAmendments } from "./profile-authority-amendments.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url));
const expected = JSON.parse(
  read("./fixtures/profiles/canonical-vowl-expectations.json"),
);
const authority = expected.localAuthorities[0];
const current = read(
  "../../docs/compatibility/canonical-vowl-prerequisites.md",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("profile authority amendment verification", () => {
  it("reconstructs the frozen authority through both approved documentation transitions", () => {
    // Hashes come from the original manifest and the approved historical blobs,
    // independently of the verifier's amendment declarations.
    expect(authority.sha256).toBe(
      "742ba46a79ef1c6f51c1aaad765c2292a30c07ca707955c5ff6191c9564b9d2b",
    );
    expect(sha256(current)).toBe(
      "f2719c65ccb3bce29356ae3cc54251c98513752f042bdcb683e1bb8430333e45",
    );
    const amendments = verifyProfileAuthorityAmendments(authority, current);
    expect(
      amendments.map(
        ({ previousSha256, currentSha256, reconstructedPreviousSha256 }) => [
          previousSha256,
          currentSha256,
          reconstructedPreviousSha256,
        ],
      ),
    ).toEqual([
      [
        authority.sha256,
        "35997fd661175251c6391839c202d889132ab285764d414e1ebae3bf61a4b722",
        authority.sha256,
      ],
      [
        "35997fd661175251c6391839c202d889132ab285764d414e1ebae3bf61a4b722",
        sha256(current),
        "35997fd661175251c6391839c202d889132ab285764d414e1ebae3bf61a4b722",
      ],
    ]);
  });

  it.each([
    [
      "extra policy",
      Buffer.concat([current, Buffer.from("\nUnapproved rule.\n")]),
    ],
    [
      "missing statement",
      Buffer.from(
        current
          .toString()
          .replace(
            "Pass `{ timeoutMs: 30000 }` to retain the previous profile deadline.\n",
            "",
          ),
      ),
    ],
    [
      "altered deadline",
      Buffer.from(
        current.toString().replace("`timeoutMs: null`", "`timeoutMs: 1`"),
      ),
    ],
    [
      "different line endings",
      Buffer.from(current.toString().replaceAll("\n", "\r\n")),
    ],
  ])("rejects %s instead of issuing amendment evidence", (_name, bytes) => {
    expect(() => verifyProfileAuthorityAmendments(authority, bytes)).toThrow(
      "Unapproved current authority pin",
    );
  });

  it("retains the historical factual-only amendment and the original authority", () => {
    const factualOnly = Buffer.from(
      current
        .toString()
        .replace(
          /Default limits are .*\n(?:.*\n){4}The depth ceiling/u,
          "Default limits are `maxWork: 1000000`, `maxDepth: 256`, `maxNumericDigits: 4096`, `maxLiteralLength: 1048576` and `timeoutMs: 30000`.\nThe depth ceiling",
        ),
    );
    expect(sha256(factualOnly)).toBe(
      "35997fd661175251c6391839c202d889132ab285764d414e1ebae3bf61a4b722",
    );
    const amendments = verifyProfileAuthorityAmendments(authority, factualOnly);
    expect(amendments).toHaveLength(1);
    expect(amendments[0].reconstructedPreviousSha256).toBe(authority.sha256);
    const original = Buffer.from(
      factualOnly
        .toString()
        .replace(
          "RDF graph selection that omits source quads likewise leaves source evidence unverified; selecting all source content or explicitly merging it does not.\n",
          "",
        )
        .replace(
          "Each prepared document has a private proof identity, so shared base IRIs and blank-node labels cannot suppress another document's independent evidence.\n",
          "",
        )
        .replace(
          "The XML parser fallback remains a lazy, bundler-visible import for workers without a native `DOMParser`.\n",
          "",
        ),
    );
    expect(sha256(original)).toBe(authority.sha256);
    expect(verifyProfileAuthorityAmendments(authority, original)).toEqual([]);
  });

  it("rejects an altered original pin or a different authority path", () => {
    expect(() =>
      verifyProfileAuthorityAmendments(
        { ...authority, sha256: "0".repeat(64) },
        current,
      ),
    ).toThrow("Unapproved prior authority pin");
    expect(() =>
      verifyProfileAuthorityAmendments(
        { ...authority, path: "another.md" },
        current,
      ),
    ).toThrow("Unapproved authority path transition");
  });

  it("verifies only the approved reference update while preserving its original authority pin", () => {
    const pin = expected.localAuthorities[1];
    const bytes = read("./pinned-version.json");
    expect(pin.sha256).toBe(
      "85835fbe8e8e3214eeb5d72d4d0b9341ad350dfa9adf41c195542cd2dcc7c2c1",
    );
    const amendments = verifyProfileAuthorityAmendments(pin, bytes);
    expect(amendments).toHaveLength(1);
    expect(amendments[0].reconstructedPreviousSha256).toBe(pin.sha256);
    expect(amendments[0].currentSha256).toBe(sha256(bytes));
    expect(() =>
      verifyProfileAuthorityAmendments(
        pin,
        Buffer.from(
          bytes
            .toString()
            .replace(
              "b61ebe2da83daceebb3e7ba7afbd2582c9240c33",
              "0".repeat(40),
            ),
        ),
      ),
    ).toThrow("Unapproved current authority pin");
    const original = Buffer.from(
      bytes
        .toString()
        .replace(
          "b61ebe2da83daceebb3e7ba7afbd2582c9240c33",
          "d7e997a53b470e32700de89cc610d9daf01ea769",
        )
        .replace(
          "owlapi-parent-5.5.1-9-gb61ebe2da",
          "owlapi-parent-5.5.1-7-gd7e997a53",
        ),
    );
    expect(sha256(original)).toBe(pin.sha256);
    expect(verifyProfileAuthorityAmendments(pin, original)).toEqual([]);
  });
});
