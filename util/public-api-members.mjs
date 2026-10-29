/** Reflect repository-defined members without invoking accessors or exposing
 * Object/Function/Error runtime methods as part of the OWLAPI contract.
 */
export const publicMembers = (binding, { inherited = true } = {}) => {
  if (typeof binding !== "function") {
    if (Array.isArray(binding)) return binding.map(String);
    return binding !== null && typeof binding === "object"
      ? Object.keys(binding).sort()
      : [typeof binding];
  }
  const members = new Set();
  const builtins = new Set([
    Object,
    Function,
    Error,
    AggregateError,
    Object.prototype,
    Function.prototype,
    Error.prototype,
    AggregateError.prototype,
  ]);
  const collect = (start, prefix, omitted) => {
    for (
      let current = start;
      current && !builtins.has(current);
      current = inherited ? Object.getPrototypeOf(current) : null
    )
      for (const name of Object.getOwnPropertyNames(current))
        if (!omitted.includes(name)) members.add(`${prefix}${name}`);
  };
  collect(binding, "static ", [
    "length",
    "name",
    "prototype",
    "arguments",
    "caller",
  ]);
  collect(binding.prototype, "prototype.", ["constructor"]);
  return members.size ? [...members].sort() : ["constructor"];
};
