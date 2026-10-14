const partialOutputByFailure = new WeakMap();

/** Private renderer-to-target handoff; document content is not an error field. */
export const retainPartialStorageOutput = (error, text) => {
  partialOutputByFailure.set(error, text);
  return error;
};

export const readPartialStorageOutput = (error) =>
  partialOutputByFailure.get(error);
