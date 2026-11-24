import { IRI } from "../model/structural.js";
import { validateFormatSelection } from "../internal/parsing/formatSelection.js";

const optionalString = (value, name) => {
  if (value !== undefined && typeof value !== "string")
    throw new TypeError(`${name} must be a string when provided`);
  return value;
};

export function documentSourceMetadata({
  contentType,
  documentIRI,
  fileName,
  format,
} = {}) {
  const iri = documentIRI === undefined ? undefined : IRI.create(documentIRI);
  optionalString(contentType, "contentType");
  optionalString(fileName, "fileName");
  validateFormatSelection(format);
  return { contentType, documentIRI: iri, fileName, format };
}

export const readDocumentSourceMetadata = (source) => ({
  contentType: source.getContentType(),
  documentIRI: source.getDocumentIRI(),
  fileName: source.getFileName(),
  format: source.getFormat?.(),
});
