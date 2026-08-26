import { KRSSDialect, keywordSupportedByDialect } from "./dialect.js";

describe("KRSS-family dialect classification", () => {
  it.each([
    "define-primitive-concept",
    "define-concept",
    "define-primitive-role",
    "transitive",
    "range",
    "instance",
    "related",
    "equal",
    "distinct",
  ])(
    "keeps the shared top-level keyword %s available to both dialects",
    (keyword) => {
      expect(keywordSupportedByDialect(keyword, KRSSDialect.KRSS1)).toBe(true);
      expect(keywordSupportedByDialect(keyword, KRSSDialect.KRSS2)).toBe(true);
    },
  );

  it.each([
    "define-role",
    "disjoint",
    "equivalent",
    "implies",
    "disjoint-roles",
    "implies-role",
    "inverse",
    "roles-equivalent",
    "role-inclusion",
  ])(
    "classifies the extended top-level keyword %s as KRSS2-only",
    (keyword) => {
      expect(keywordSupportedByDialect(keyword, KRSSDialect.KRSS1)).toBe(false);
      expect(keywordSupportedByDialect(keyword, KRSSDialect.KRSS2)).toBe(true);
    },
  );

  it("rejects unknown keywords without promoting either format", () => {
    expect(
      keywordSupportedByDialect("define-data-role", KRSSDialect.KRSS1),
    ).toBe(false);
    expect(
      keywordSupportedByDialect("define-data-role", KRSSDialect.KRSS2),
    ).toBe(false);
  });
});
