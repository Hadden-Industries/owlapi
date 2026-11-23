import { rdfDataFactory } from "./environment.js";

const rowsPerBlock = 65_536;
const width = 3;
const defaultGraph = rdfDataFactory.defaultGraph();

const empty = Object.freeze({
  size: 0,
  *[Symbol.iterator]() {},
});

function termCoordinates(term) {
  if (term.termType === "Literal") {
    const profile = JSON.stringify([
      term.datatype.value,
      term.language,
      term.direction,
    ]);
    return ["Literal" + profile, term.value];
  }
  if (term.termType === "Quad") {
    return [
      "Quad",
      JSON.stringify(
        [term.subject, term.predicate, term.object, term.graph].map(
          termCoordinates,
        ),
      ),
    ];
  }
  return [term.termType, term.value];
}

/** An RDF/XML parser-owned default graph with interned terms and packed rows. */
export class CompactDefaultGraph {
  #terms = [undefined];
  #termIds = new Map();
  #blocks = [];
  #rowCount = 0;
  #orders;
  #ranks;
  #replay;
  #rowByQuad = new WeakMap();

  #termId(term, insert = false) {
    const [type, value] = termCoordinates(term);
    let index = this.#termIds.get(type);
    const known = index?.get(value);
    if (known !== undefined || !insert) return known ?? 0;
    if (!index) this.#termIds.set(type, (index = new Map()));
    const id = this.#terms.length;
    this.#terms.push(term);
    index.set(value, id);
    return id;
  }

  add(quad) {
    if (this.#orders) throw new TypeError("The parsed RDF graph is sealed");
    if (quad.graph.termType !== "DefaultGraph")
      throw new TypeError(
        "RDF/XML statements must belong to the default graph",
      );
    const offset = (this.#rowCount % rowsPerBlock) * width;
    if (offset === 0) this.#blocks.push(new Uint32Array(rowsPerBlock * width));
    const block = this.#blocks.at(-1);
    block[offset] = this.#termId(quad.subject, true);
    block[offset + 1] = this.#termId(quad.predicate, true);
    block[offset + 2] = this.#termId(quad.object, true);
    this.#rowCount += 1;
  }

  #term(row, column) {
    return this.#blocks[Math.floor(row / rowsPerBlock)][
      (row % rowsPerBlock) * width + column
    ];
  }

  #key(row, column, ranks) {
    const term = this.#term(row, column);
    return ranks ? ranks[term] : term;
  }

  // Stable counting passes sort by each numeric column without materializing
  // statement objects. Only the subject index is needed until another is queried.
  #sort(rows, columns, ranks) {
    const offsets = new Uint32Array(this.#terms.length);
    let active = rows;
    let next = new Uint32Array(rows.length);
    for (let pass = columns.length - 1; pass >= 0; pass -= 1) {
      const column = columns[pass];
      for (const row of active) offsets[this.#key(row, column, ranks)] += 1;
      let end = 0;
      for (let term = 0; term < offsets.length; term += 1) {
        const count = offsets[term];
        offsets[term] = end;
        end += count;
      }
      for (const row of active) {
        const key = this.#key(row, column, ranks);
        next[offsets[key]++] = row;
      }
      if (pass > 0) {
        const previous = active;
        active = next;
        next = previous === rows ? new Uint32Array(rows.length) : previous;
        offsets.fill(0);
      }
    }
    return next;
  }

  seal() {
    const rows = new Uint32Array(this.#rowCount);
    for (let row = 0; row < rows.length; row += 1) rows[row] = row;
    const bySubject = this.#sort(rows, [0, 1, 2]);
    let distinct = 0;
    for (const row of bySubject) {
      const previous = bySubject[distinct - 1];
      if (
        previous !== undefined &&
        this.#term(previous, 0) === this.#term(row, 0) &&
        this.#term(previous, 1) === this.#term(row, 1) &&
        this.#term(previous, 2) === this.#term(row, 2)
      )
        continue;
      bySubject[distinct++] = row;
    }
    this.#orders = [bySubject.subarray(0, distinct)];
  }

  get size() {
    return this.#orders[0].length;
  }

  createRowMarks() {
    return new Uint8Array(this.#rowCount);
  }

  #projectRanks(rows) {
    const ranks = new Uint32Array(this.#terms.length);
    let nextRank = 1;
    for (const row of rows) {
      for (let column = 0; column < width; column += 1) {
        const term = this.#term(row, column);
        if (!ranks[term]) ranks[term] = nextRank++;
      }
    }
    return ranks;
  }

  /** Match the provider's order after matching and copying a default graph. */
  project(matchFirst = true) {
    if (this.#ranks) return this;
    const rows = this.#orders[0];
    const matched = matchFirst
      ? this.#sort(rows, [0, 1, 2], this.#projectRanks(rows))
      : rows;
    this.#ranks = this.#projectRanks(matched);
    this.#orders = [this.#sort(matched, [0, 1, 2], this.#ranks)];
    return this;
  }

  #quad(row) {
    const quad = rdfDataFactory.quad(
      this.#terms[this.#term(row, 0)],
      this.#terms[this.#term(row, 1)],
      this.#terms[this.#term(row, 2)],
      defaultGraph,
    );
    this.#rowByQuad.set(quad, row);
    return quad;
  }

  rowOf(quad) {
    const ownRow = this.#rowByQuad.get(quad);
    if (ownRow !== undefined) return ownRow;
    const equal = this.match(
      quad.subject,
      quad.predicate,
      quad.object,
      quad.graph,
    )
      [Symbol.iterator]()
      .next();
    return equal.done ? undefined : this.#rowByQuad.get(equal.value);
  }

  *#iterate(rows) {
    for (const row of rows) yield this.#quad(row);
  }

  [Symbol.iterator]() {
    return this.#iterate(this.#orders[0]);
  }

  replayed() {
    this.#replay ??= this.#sort(
      this.#orders[0],
      [0, 1, 2],
      this.#projectRanks(this.#orders[0]),
    );
    return this.#iterate(this.#replay);
  }

  #matchedOrder(matches) {
    const rows = [...matches];
    if (rows.length < 2) return rows;
    const ranks = new Map();
    for (const row of rows) {
      for (let column = 0; column < width; column += 1) {
        const term = this.#term(row, column);
        if (!ranks.has(term)) ranks.set(term, ranks.size);
      }
    }
    return rows.sort((left, right) => {
      for (let column = 0; column < width; column += 1) {
        const difference =
          ranks.get(this.#term(left, column)) -
          ranks.get(this.#term(right, column));
        if (difference !== 0) return difference;
      }
      return 0;
    });
  }

  match(subject, predicate, object, graph) {
    if (graph && graph.termType !== "DefaultGraph") return empty;
    const terms = [subject, predicate, object];
    const ids = terms.map((term) => (term ? this.#termId(term) : undefined));
    if (ids.includes(0)) return empty;
    if (ids.every((id) => id === undefined)) {
      const owner = this;
      return {
        size: owner.size,
        [Symbol.iterator]: () => owner.replayed(),
      };
    }
    const column =
      object && (subject || !predicate) ? 2 : subject ? 0 : predicate ? 1 : 0;
    const rows = (this.#orders[column] ??= this.#sort(
      this.#orders[0],
      [column, (column + 1) % width, (column + 2) % width],
      this.#ranks,
    ));
    const id = ids[column];
    const rank = this.#ranks ? this.#ranks[id] : id;
    const lower = (target) => {
      let start = 0;
      let end = rows.length;
      while (start < end) {
        const mid = start + Math.floor((end - start) / 2);
        if (this.#key(rows[mid], column, this.#ranks) < target) start = mid + 1;
        else end = mid;
      }
      return start;
    };
    const start = id === undefined ? 0 : lower(rank);
    const end = id === undefined ? rows.length : lower(rank + 1);
    const hasOtherBound = ids.some(
      (value, index) => index !== column && value !== undefined,
    );
    const owner = this;
    const matches = function* () {
      for (let index = start; index < end; index += 1) {
        const row = rows[index];
        if (
          !hasOtherBound ||
          ids.every(
            (id, column) => id === undefined || owner.#term(row, column) === id,
          )
        )
          yield row;
      }
    };
    return {
      get size() {
        if (!hasOtherBound) return end - start;
        let count = 0;
        for (const row of matches()) {
          void row;
          count += 1;
        }
        return count;
      },
      [Symbol.iterator]() {
        return owner.#iterate(owner.#matchedOrder(matches()));
      },
    };
  }
}
