import { StringDocumentSource } from "../../io/stringDocumentSource.js";

const DETECTION_RESULTS = new Set(["MATCH", "NO_MATCH", "INDETERMINATE"]);
const DETECTION_RANK = Object.freeze({
  MATCH: 0,
  INDETERMINATE: 1,
  NO_MATCH: 2,
});

const compareCodeUnits = (left, right) => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const normalizeMediaType = (value) =>
  typeof value === "string" ? value.split(";", 1)[0].trim().toLowerCase() : "";

const fileExtension = (fileName) => {
  if (typeof fileName !== "string") {
    return "";
  }
  const index = fileName.lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index + 1).toLowerCase();
};

const boundedUtf8Prefix = (text, maxBytes) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxSniffBytes must be a non-negative safe integer");
  }
  const capacity = Math.min(maxBytes, text.length * 3);
  const destination = new Uint8Array(capacity);
  const { read } = new TextEncoder().encodeInto(text, destination);
  return text.slice(0, read);
};

const validateDetection = (detection, parserId) => {
  if (!detection || !DETECTION_RESULTS.has(detection.result)) {
    throw new TypeError(
      `Parser ${parserId} returned an invalid detection result`,
    );
  }
  if (
    typeof detection.reasonCode !== "string" ||
    detection.reasonCode.length === 0 ||
    typeof detection.reason !== "string" ||
    detection.reason.length === 0
  ) {
    throw new TypeError(
      `Parser ${parserId} detection requires reasonCode and reason`,
    );
  }
  if (
    detection.selectionPriority !== undefined &&
    (!Number.isFinite(detection.selectionPriority) ||
      detection.selectionPriority < 0)
  ) {
    throw new TypeError(
      `Parser ${parserId} detection selectionPriority must be a non-negative finite number`,
    );
  }
  return Object.freeze({ ...detection });
};

export class ParserDescriptor {
  constructor({
    createParser,
    detect,
    format,
    id,
    priority,
    supportsCompatibleRecovery = false,
  }) {
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
      throw new TypeError("Parser descriptor id must be a stable lowercase id");
    }
    if (!Number.isFinite(priority)) {
      throw new TypeError("Parser descriptor priority must be finite");
    }
    if (!format || typeof format.key !== "string") {
      throw new TypeError("Parser descriptor format is required");
    }
    if (
      !Object.isFrozen(format) ||
      !Array.isArray(format.mediaTypes) ||
      !Object.isFrozen(format.mediaTypes) ||
      !Array.isArray(format.extensions) ||
      !Object.isFrozen(format.extensions)
    ) {
      throw new TypeError(
        "Parser descriptor format metadata must be immutable",
      );
    }
    if (typeof detect !== "function" || typeof createParser !== "function") {
      throw new TypeError("Parser descriptor requires detect and createParser");
    }
    if (typeof supportsCompatibleRecovery !== "boolean") {
      throw new TypeError("supportsCompatibleRecovery must be a boolean");
    }
    this.id = id;
    this.priority = priority;
    this.format = format;
    this.detect = detect;
    this.createParser = createParser;
    this.supportsCompatibleRecovery = supportsCompatibleRecovery;
    Object.freeze(this);
  }
}

export class OWLParserRegistry {
  #descriptors;

  constructor(descriptors = []) {
    const byId = new Map();
    const formatKeys = new Set();
    for (const descriptor of descriptors) {
      const normalized =
        descriptor instanceof ParserDescriptor
          ? descriptor
          : new ParserDescriptor(descriptor);
      if (byId.has(normalized.id)) {
        throw new TypeError(`Duplicate parser descriptor id: ${normalized.id}`);
      }
      if (formatKeys.has(normalized.format.key)) {
        throw new TypeError(
          `Duplicate parser format key: ${normalized.format.key}`,
        );
      }
      byId.set(normalized.id, normalized);
      formatKeys.add(normalized.format.key);
    }
    this.#descriptors = Object.freeze([...byId.values()]);
    Object.freeze(this);
  }

  getDescriptors() {
    return [...this.#descriptors];
  }

  resolveCandidates(source, configuration = {}) {
    const explicitFormat = configuration.format;
    if (explicitFormat !== undefined) {
      const key =
        typeof explicitFormat === "string"
          ? explicitFormat
          : explicitFormat.key;
      const matches = this.#descriptors.filter(
        (descriptor) => descriptor.format.key === key,
      );
      if (matches.length === 0) {
        throw new RangeError(`No parser is registered for format: ${key}`);
      }
      return matches.map((descriptor) =>
        Object.freeze({
          descriptor,
          detection: Object.freeze({
            reason: "The caller explicitly selected this format",
            reasonCode: "EXPLICIT_FORMAT",
            result: "MATCH",
          }),
          eligible: true,
          ordering: Object.freeze({
            contentTypeMatch: false,
            extensionMatch: false,
            explicit: true,
          }),
        }),
      );
    }

    const maxSniffBytes = configuration.maxSniffBytes ?? 8192;
    const boundedSource = new StringDocumentSource(
      boundedUtf8Prefix(source.getText(), maxSniffBytes),
      {
        contentType: source.getContentType(),
        documentIRI: source.getDocumentIRI(),
        fileName: source.getFileName(),
      },
    );
    const contentType = normalizeMediaType(source.getContentType());
    const extension = fileExtension(source.getFileName());

    const candidates = this.#descriptors.map((descriptor) => {
      const detection = validateDetection(
        descriptor.detect(boundedSource, configuration),
        descriptor.id,
      );
      const contentTypeMatch = descriptor.format.mediaTypes
        .map(normalizeMediaType)
        .includes(contentType);
      const extensionMatch = descriptor.format.extensions
        .map((item) => item.toLowerCase())
        .includes(extension);
      const eligible =
        detection.result === "MATCH" ||
        (detection.result === "INDETERMINATE" &&
          // A detector may attach a source-specific semantic preference (for
          // example, a dialect-bearing extension) without upgrading ambiguous
          // content to MATCH. Strict descriptors otherwise stay ineligible.
          (contentTypeMatch ||
            detection.selectionPriority !== undefined ||
            !descriptor.supportsCompatibleRecovery));
      return Object.freeze({
        descriptor,
        detection,
        eligible,
        ordering: Object.freeze({ contentTypeMatch, extensionMatch }),
      });
    });

    candidates.sort((left, right) => {
      const detectionDifference =
        DETECTION_RANK[left.detection.result] -
        DETECTION_RANK[right.detection.result];
      if (detectionDifference !== 0) {
        return detectionDifference;
      }
      if (left.ordering.contentTypeMatch !== right.ordering.contentTypeMatch) {
        return left.ordering.contentTypeMatch ? -1 : 1;
      }
      const selectionPriorityDifference =
        (left.detection.selectionPriority ?? 0) -
        (right.detection.selectionPriority ?? 0);
      if (selectionPriorityDifference !== 0) {
        return selectionPriorityDifference;
      }
      if (left.descriptor.priority !== right.descriptor.priority) {
        return left.descriptor.priority - right.descriptor.priority;
      }
      if (left.ordering.extensionMatch !== right.ordering.extensionMatch) {
        return left.ordering.extensionMatch ? -1 : 1;
      }
      return compareCodeUnits(left.descriptor.id, right.descriptor.id);
    });

    return candidates;
  }
}
