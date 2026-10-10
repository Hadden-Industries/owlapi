/** Surrogate-safe chunks and RDF stream events; execution controllers stay format-specific. */
export const DEFAULT_CHUNK_SIZE = 65_536;

export const MAX_TIMER_DELAY_MS = 2_147_483_647;

export const chunksOf = function* (text, chunkSize) {
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + chunkSize, text.length);
    if (
      end < text.length &&
      text.charCodeAt(end - 1) >= 0xd800 &&
      text.charCodeAt(end - 1) <= 0xdbff &&
      text.charCodeAt(end) >= 0xdc00 &&
      text.charCodeAt(end) <= 0xdfff
    ) {
      end += 1;
    }
    yield text.slice(start, end);
    start = end;
  }
};

export const waitForDrain = (parser) =>
  new Promise((resolve, reject) => {
    function cleanup() {
      parser.removeListener("drain", onDrain);
      parser.removeListener("error", onError);
    }
    function onDrain() {
      cleanup();
      resolve();
    }
    function onError(error) {
      cleanup();
      reject(error);
    }
    parser.once("drain", onDrain);
    parser.once("error", onError);
  });

export const blankNodeKeys = (term, keys) => {
  if (term?.termType === "BlankNode") {
    keys.add(term.value);
  } else if (term?.termType === "Quad") {
    blankNodeKeys(term.subject, keys);
    blankNodeKeys(term.predicate, keys);
    blankNodeKeys(term.object, keys);
    blankNodeKeys(term.graph, keys);
  }
};
