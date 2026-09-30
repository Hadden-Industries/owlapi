export const validateFormatSelection = (format) => {
  if (
    format !== undefined &&
    ((typeof format === "string" && format.length === 0) ||
      (typeof format !== "string" &&
        (format === null ||
          typeof format !== "object" ||
          typeof format.key !== "string" ||
          format.key.length === 0 ||
          !Object.isFrozen(format))))
  ) {
    throw new TypeError("format must be a format key or OWLDocumentFormat");
  }
};
