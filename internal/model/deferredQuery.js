/** An ES iterable with one terminal consumption, matching selected Java streams.
 * Query creation captures its inputs; reading ontology revisions is deferred.
 * No Java stream operators or ambient behavior selection are introduced.
 */
export const deferredQuery = (read) => {
  let consumed = false;
  return Object.freeze({
    [Symbol.iterator]() {
      if (consumed)
        throw new TypeError("The query result has already been consumed");
      consumed = true;
      return (function* () {
        yield* read();
      })();
    },
  });
};
