const partialOutputByFailure = new WeakMap();

/** Private renderer-to-target handoff; document content is not an error field. */
export const retainPartialStorageOutput = (error, text) => {
  partialOutputByFailure.set(error, text);
  return error;
};

export const readPartialStorageOutput = (error) =>
  partialOutputByFailure.get(error);

const prefixFailures = new WeakMap();

/** Mark the exact point at which Java's writer publishes the already emitted prefix. */
export function failAfterStoragePrefix(error, formatPrefix) {
  prefixFailures.set(error, formatPrefix);
  throw error;
}

/** Only string targets need to own the cumulative text or retain a failed prefix. */
export function collectStorageText(fragments) {
  let text = "";
  try {
    for (const fragment of fragments) text += fragment;
  } catch (error) {
    if (prefixFailures.has(error)) {
      const formatPrefix = prefixFailures.get(error);
      retainPartialStorageOutput(
        error,
        formatPrefix ? formatPrefix(text) : text,
      );
    }
    throw error;
  }
  return text;
}
