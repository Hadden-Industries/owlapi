/** Package identities observed by npm ls, independent of installation locations. */
export const flattenNpmGraph = (root, rootName = root?.name) => {
  const identities = new Set();
  const visit = (node, name) => {
    if (
      typeof name !== "string" ||
      !name ||
      typeof node?.version !== "string" ||
      !node.version
    )
      throw new Error(
        "npm production graph contains an incomplete package identity.",
      );
    identities.add(`${name}@${node.version}`);
    for (const [key, dependency] of Object.entries(node.dependencies ?? {}))
      visit(dependency, dependency?.name ?? key);
  };
  visit(root, rootName);
  return [...identities].sort();
};
