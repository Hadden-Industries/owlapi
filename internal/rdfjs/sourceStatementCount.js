const statementCounts = new WeakMap();

/** Retain the syntax provider's emitted occurrences before dataset deduplication.
 * The selected reconstruction graph still owns normative metadata; this count
 * supplies the released Java consumer's statement-event metadata only.
 */
export const recordSourceStatementCount = (dataset, count) => {
  statementCounts.set(dataset, count);
};

export const readSourceStatementCount = (dataset) =>
  statementCounts.get(dataset);
