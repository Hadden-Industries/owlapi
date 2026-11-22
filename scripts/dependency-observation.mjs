import { format } from "dependency-cruiser";

// Keep dependency-cruiser's topology and add the file edges in the same
// direction: from dependent to dependency, including output to producer.
export function includeFileDependencies(
  native,
  { relationships, diagnostics },
) {
  const modules = new Map(
    native.modules.map((module) => [
      module.source,
      {
        ...module,
        dependencies: [...module.dependencies],
        dependents: [...module.dependents],
      },
    ]),
  );
  const node = (source) => {
    if (!modules.has(source)) {
      modules.set(source, {
        source,
        dependencies: [],
        dependents: [],
        valid: true,
      });
    }
    return modules.get(source);
  };
  const edges = new Map();
  for (const { from, to, kind, evidence } of relationships) {
    const key = JSON.stringify([from, to, kind]);
    let edge = edges.get(key);
    if (!edge) {
      edge = {
        module: to,
        resolved: to,
        kind,
        evidence: [],
      };
      edges.set(key, edge);
      node(from).dependencies.push(edge);
      const target = node(to);
      if (!target.dependents.includes(from)) target.dependents.push(from);
    }
    for (const site of evidence) {
      if (
        !edge.evidence.some(
          ({ file, line }) => file === site.file && line === site.line,
        )
      ) {
        edge.evidence.push(site);
      }
    }
  }
  return {
    ...native,
    modules: [...modules.values()],
    resourceDiagnostics: diagnostics,
  };
}

const nativeFileEdge = {
  moduleSystem: "es6",
  dependencyTypes: ["local"],
  coreModule: false,
  couldNotResolve: false,
  followable: true,
  circular: false,
  dynamic: false,
  exoticallyRequired: false,
  matchesDoNotFollow: false,
  valid: true,
};

// The native renderer validates its own schema. Give it a projection of the
// exported graph, then preserve the typed edges in its JSON selections.
export function observationRenderer(graph) {
  const { resourceDiagnostics, ...native } = graph;
  const typed = new Map();
  const projection = {
    ...native,
    modules: native.modules.map((module) => {
      if (!module.dependencies.some(({ kind }) => kind)) return module;
      typed.set(module.source, module.dependencies);
      return {
        ...module,
        dependencies: module.dependencies.map(
          ({ kind, evidence, ...dependency }) =>
            kind ? { ...dependency, ...nativeFileEdge } : dependency,
        ),
      };
    }),
  };
  return async (options) => {
    const { output } = await format(projection, options);
    if (options.outputType !== "json" || !resourceDiagnostics) return output;
    const selected = JSON.parse(output);
    for (const module of selected.modules) {
      const original = typed.get(module.source);
      if (!original) continue;
      const targets = new Set(
        module.dependencies.map(({ resolved }) => resolved),
      );
      module.dependencies = original.filter(({ resolved }) =>
        targets.has(resolved),
      );
    }
    return JSON.stringify(selected, null, 2) + "\n";
  };
}
