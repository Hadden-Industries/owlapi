import { rdfDataFactory } from "./environment.js";

const rowsPerBlock = 65_536;
const width = 3;
const defaultGraph = rdfDataFactory.defaultGraph();
const graphs = new WeakSet();
const emptyRows = new Uint32Array(0);
const indexColumns = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
];

/** Only package-allocated graphs can take the integer cursor path. */
export const isCompactRdfGraph = (value) => graphs.has(value);

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

/** This private handle lets a reconstruction pass mark a row without a WeakMap insertion per visit. */
class StatementRow {
  constructor(owner, row, subject, predicate, object, graph) {
    this.owner = owner;
    this.row = row;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.graph = graph;
  }
}

/** A parser-owned immutable RDF dataset after seal(), with dictionary-coded SPO rows. */
export class CompactRdfGraph {
  #terms = [defaultGraph];
  #termIds = new Map();
  #blocks = [];
  #graphBlocks;
  #graphIdsByKey;
  #graphRanks;
  #graphRanges;
  #rowCount = 0;
  #orders;
  #ranks;
  #replay;

  constructor() {
    graphs.add(this);
  }

  #termId(term, insert = false) {
    if (term.termType === "DefaultGraph") return 0;
    const [type, value] = termCoordinates(term);
    let index = this.#termIds.get(type);
    const known = index?.get(value);
    if (known !== undefined || !insert) return known;
    if (!index) this.#termIds.set(type, (index = new Map()));
    const id = this.#terms.length;
    this.#terms.push(term);
    index.set(value, id);
    return id;
  }

  termId(term) {
    return this.#termId(term);
  }

  namedNodeId(value) {
    return this.#termIds.get("NamedNode")?.get(value);
  }

  termById(id) {
    return this.#terms[id];
  }

  /** The writer sorts integer IDs without materializing RDF statement objects. */
  rowTermId(row, column) {
    return this.#term(row, column);
  }

  get termCount() {
    return this.#terms.length;
  }

  add(quad) {
    if (this.#orders) throw new TypeError("The parsed RDF graph is sealed");
    const blockIndex = Math.floor(this.#rowCount / rowsPerBlock);
    const slot = this.#rowCount % rowsPerBlock;
    const offset = slot * width;
    let block = this.#blocks[blockIndex];
    if (!block || offset === block.length) {
      // Small documents need only a small first block. No completed block moves.
      const capacity = Math.min(rowsPerBlock, Math.max(64, slot * 2));
      const grown = new Uint32Array(capacity * width);
      if (block) grown.set(block);
      this.#blocks[blockIndex] = block = grown;
      if (this.#graphBlocks?.[blockIndex]) {
        const graphColumn = new Uint32Array(capacity);
        graphColumn.set(this.#graphBlocks[blockIndex]);
        this.#graphBlocks[blockIndex] = graphColumn;
      }
    }
    block[offset] = this.#termId(quad.subject, true);
    block[offset + 1] = this.#termId(quad.predicate, true);
    block[offset + 2] = this.#termId(quad.object, true);
    const graph = quad.graph;
    if (graph.termType !== "DefaultGraph") {
      if (!this.#graphBlocks) {
        this.#graphBlocks = [];
        this.#graphIdsByKey = Object.create(null);
        if (this.#rowCount) this.#graphIdsByKey[""] = 0;
      }
      const id = this.#termId(graph, true);
      const key =
        graph.termType === "BlankNode" ? "_:" + graph.value : graph.value;
      this.#graphIdsByKey[key] = id;
      const column = (this.#graphBlocks[blockIndex] ??= new Uint32Array(
        block.length / width,
      ));
      column[slot] = id;
    } else if (this.#graphIdsByKey) {
      this.#graphIdsByKey[""] = 0;
    }
    this.#rowCount += 1;
    return this;
  }

  #term(row, column) {
    if (column === 3)
      return (
        this.#graphBlocks?.[Math.floor(row / rowsPerBlock)]?.[
          row % rowsPerBlock
        ] ?? 0
      );
    return this.#blocks[Math.floor(row / rowsPerBlock)][
      (row % rowsPerBlock) * width + column
    ];
  }

  #key(row, column, ranks) {
    const term = this.#term(row, column);
    if (column === 3) return this.#graphRanks.get(term);
    return ranks ? ranks[term] : term;
  }

  // Stable counting passes sort by each numeric column without materializing
  // statement objects. Only the subject index is needed until another is queried.
  #sort(rows, columns, ranks) {
    if (rows.length < 2) return rows;
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
    if (this.#orders) return this;
    const rows = new Uint32Array(this.#rowCount);
    for (let row = 0; row < rows.length; row += 1) rows[row] = row;
    if (this.#graphBlocks) {
      // Provider graph names follow property enumeration order. A name does
      // not acquire an SPO rank until it also occurs in a triple.
      this.#graphRanks = new Map(
        Object.values(this.#graphIdsByKey).map((id, rank) => [id, rank]),
      );
      this.#ranks = this.#projectRanks(rows);
      this.#graphRanges = new Map();
    }
    const bySubject = this.#sort(rows, this.#columns(0), this.#ranks);
    let distinct = 0;
    for (const row of bySubject) {
      const previous = bySubject[distinct - 1];
      const graph = this.#term(row, 3);
      if (
        previous !== undefined &&
        this.#term(previous, 0) === this.#term(row, 0) &&
        this.#term(previous, 1) === this.#term(row, 1) &&
        this.#term(previous, 2) === this.#term(row, 2) &&
        this.#term(previous, 3) === graph
      )
        continue;
      if (this.#graphRanges) {
        const range = this.#graphRanges.get(graph);
        if (range) range[1] = distinct + 1;
        else this.#graphRanges.set(graph, [distinct, distinct + 1]);
      }
      bySubject[distinct++] = row;
    }
    this.#orders = [bySubject.subarray(0, distinct)];
    return this;
  }

  #columns(column) {
    return this.#graphBlocks
      ? [3, ...indexColumns[column]]
      : indexColumns[column];
  }

  get size() {
    return this.#orders[0].length;
  }

  createRowMarks() {
    return new Uint8Array(this.#rowCount);
  }

  /** End the manager's exclusive parse phase. Projections keep their own
   * references to shared blocks, while this graph relinquishes every index.
   */
  release() {
    this.#terms = this.#termIds = this.#blocks = undefined;
    this.#graphBlocks =
      this.#graphIdsByKey =
      this.#graphRanks =
      this.#graphRanges =
        undefined;
    this.#orders = this.#ranks = this.#replay = undefined;
    this.#rowCount = 0;
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

  /** Graph counts are unique quad counts; syntax adapters track source occurrences. */
  graphCounts() {
    const namedGraphs = new Map();
    let defaultQuadCount = this.size;
    if (this.#graphRanges) {
      defaultQuadCount = 0;
      for (const [id, [start, end]] of this.#graphRanges) {
        if (id === 0) defaultQuadCount = end - start;
        else {
          const term = this.#terms[id];
          namedGraphs.set(term.termType + ":" + term.value, {
            term,
            quadCount: end - start,
          });
        }
      }
    }
    return { defaultQuadCount, namedGraphs };
  }

  /** Select one graph, or merge all graphs when selectedGraph is undefined. */
  project(selectedGraph) {
    const result = new CompactRdfGraph();
    if (this.#graphBlocks) {
      const rows =
        selectedGraph === undefined
          ? this.#orders[0]
          : this.#matchedRows(
              undefined,
              undefined,
              undefined,
              this.termId(selectedGraph) ?? -1,
            );
      for (const row of rows) {
        result.add(
          rdfDataFactory.quad(
            this.#terms[this.#term(row, 0)],
            this.#terms[this.#term(row, 1)],
            this.#terms[this.#term(row, 2)],
          ),
        );
      }
      return result.seal();
    }
    // A default projection shares immutable packed rows and terms. Its ranks
    // belong to this view, so other projections can still read the source.
    result.#terms = this.#terms;
    result.#termIds = this.#termIds;
    result.#blocks = this.#blocks;
    result.#rowCount = this.#rowCount;
    const matched =
      selectedGraph === undefined ? this.#orders[0] : this.#replayedRows();
    result.#ranks = this.#projectRanks(matched);
    result.#orders = [this.#sort(matched, indexColumns[0], result.#ranks)];
    return result;
  }

  #quad(row) {
    return rdfDataFactory.quad(
      this.#terms[this.#term(row, 0)],
      this.#terms[this.#term(row, 1)],
      this.#terms[this.#term(row, 2)],
      this.#terms[this.#term(row, 3)],
    );
  }

  statementAt(row) {
    return new StatementRow(
      this,
      row,
      this.#terms[this.#term(row, 0)],
      this.#terms[this.#term(row, 1)],
      this.#terms[this.#term(row, 2)],
      this.#terms[this.#term(row, 3)],
    );
  }

  rowOf(quad) {
    if (quad instanceof StatementRow && quad.owner === this) return quad.row;
    const ids = [quad.subject, quad.predicate, quad.object, quad.graph].map(
      (term) => this.termId(term),
    );
    return ids.includes(undefined) ? undefined : this.#matchedRows(...ids)[0];
  }

  has(quad) {
    return this.rowOf(quad) !== undefined;
  }

  *#iterate(rows) {
    for (const row of rows) yield this.#quad(row);
  }

  [Symbol.iterator]() {
    return this.#iterate(this.#orders[0]);
  }

  #replayedRows() {
    return (this.#replay ??= this.#sort(
      this.#orders[0],
      this.#columns(0),
      this.#projectRanks(this.#orders[0]),
    ));
  }

  *statements(replay = false) {
    for (const row of replay ? this.#replayedRows() : this.#orders[0])
      yield this.statementAt(row);
  }

  #matchedOrder(rows) {
    if (rows.length < 2) return rows;
    const ranks = new Map();
    for (const row of rows) {
      for (let column = 0; column < width; column += 1) {
        const term = this.#term(row, column);
        if (!ranks.has(term)) ranks.set(term, ranks.size);
      }
    }
    return rows.slice().sort((left, right) => {
      if (this.#graphRanks) {
        const difference =
          this.#graphRanks.get(this.#term(left, 3)) -
          this.#graphRanks.get(this.#term(right, 3));
        if (difference) return difference;
      }
      for (let column = 0; column < width; column += 1) {
        const difference =
          ranks.get(this.#term(left, column)) -
          ranks.get(this.#term(right, column));
        if (difference !== 0) return difference;
      }
      return 0;
    });
  }

  #matchedRows(subject, predicate, object, graph) {
    const ids = [subject, predicate, object];
    if (!this.#graphBlocks && graph !== 0 && graph !== undefined)
      return emptyRows;
    if (
      ids.every((id) => id === undefined) &&
      (graph === undefined || !this.#graphBlocks)
    )
      return this.#replayedRows();
    const column =
      object && (subject || !predicate) ? 2 : subject ? 0 : predicate ? 1 : 0;
    const rows = (this.#orders[column] ??= this.#sort(
      this.#orders[0],
      this.#columns(column),
      this.#ranks,
    ));
    const id = ids[column];
    const rank = this.#ranks ? this.#ranks[id] : id;
    const lower = (target, start, end) => {
      while (start < end) {
        const mid = start + Math.floor((end - start) / 2);
        if (this.#key(rows[mid], column, this.#ranks) < target) start = mid + 1;
        else end = mid;
      }
      return start;
    };
    const hasOtherBound = ids.some(
      (value, index) => index !== column && value !== undefined,
    );
    const ranges = !this.#graphRanges
      ? [[0, rows.length]]
      : graph === undefined
        ? this.#graphRanges.values()
        : [this.#graphRanges.get(graph)];
    const matches = [];
    for (const range of ranges) {
      if (!range) continue;
      const start =
        id === undefined ? range[0] : lower(rank, range[0], range[1]);
      const end =
        id === undefined ? range[1] : lower(rank + 1, start, range[1]);
      if (!hasOtherBound && (!this.#graphRanges || graph !== undefined))
        return this.#matchedOrder(rows.subarray(start, end));
      for (let index = start; index < end; index += 1) {
        const row = rows[index];
        if (
          !hasOtherBound ||
          ids.every(
            (id, column) => id === undefined || this.#term(row, column) === id,
          )
        )
          matches.push(row);
      }
    }
    return this.#matchedOrder(matches);
  }

  match(subject, predicate, object, graph) {
    const ids = [subject, predicate, object, graph].map((term) =>
      term ? (this.termId(term) ?? -1) : undefined,
    );
    const rows = ids.includes(-1) ? emptyRows : this.#matchedRows(...ids);
    return { size: rows.length, [Symbol.iterator]: () => this.#iterate(rows) };
  }

  /** Visit a provider-ordered match as (row, subject, predicate, object, graph) IDs. */
  forEachMatchingRow(subject, predicate, object, graph, visit) {
    for (const row of this.#matchedRows(subject, predicate, object, graph))
      visit(
        row,
        this.#term(row, 0),
        this.#term(row, 1),
        this.#term(row, 2),
        this.#term(row, 3),
      );
  }

  /** Predicates filter the whole-subject replay in the same order as reconstruction. */
  forEachOutgoingRow(subject, predicate, visit) {
    if (subject === undefined) return;
    this.forEachMatchingRow(
      subject,
      undefined,
      undefined,
      undefined,
      (row, s, p, o, g) => {
        if (predicate === undefined || p === predicate) visit(row, s, p, o, g);
      },
    );
  }

  firstObjectId(subject, predicate) {
    if (subject === undefined || predicate === undefined) return undefined;
    for (const row of this.#matchedRows(
      subject,
      undefined,
      undefined,
      undefined,
    )) {
      if (this.#term(row, 1) === predicate) return this.#term(row, 2);
    }
    return undefined;
  }
}
