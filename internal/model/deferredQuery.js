/** An ES iterable with one terminal consumption, matching selected Java streams.
 * Query creation captures its inputs; reading ontology revisions is deferred.
 * No Java stream operators or ambient behavior selection are introduced.
 */
class DeferredQuery {
  #read;

  constructor(read) {
    this.#read = read;
    Object.freeze(this);
  }

  [Symbol.iterator]() {
    const read = this.#read;
    if (!read) {
      throw new TypeError("The query result has already been consumed");
    }
    this.#read = undefined;
    return read()[Symbol.iterator]();
  }
}

export const deferredQuery = (read) => new DeferredQuery(read);
