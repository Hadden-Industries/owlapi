# Engineering conventions

Phase 0 records the existing WebVOWL JavaScript regime as the implementation
regime for the `src/owlapi-js/` staging tree and the future `owlapi` package:

- native ECMAScript modules and named exports;
- native JavaScript only—no TypeScript, `tsc`, `checkJs`, or generated
  declaration-file workflow;
- repository Prettier formatting and ESLint rules;
- Jest colocated `*.test.js` tests executed directly from ESM;
- lower camel case for values/functions, upper camel case for constructors and
  OWLAPI-aligned public type names;
- explicit parser-factory registration with no import-time global mutation;
- direct relative imports inside the staging module; its existing barrels are
  migration seams and do not determine the published package surface;
- in the standalone package, explicit named facades only at registry-approved
  Java-backed npm subpaths, with one canonical public definition in the
  matching Java-shaped namespace and cohesive non-mirrored private engines
  under `internal/`;
- browser and Node compatibility under the repository's `baseline widely
available` target;
- typed errors for observable failures and no broad catch-and-continue parser
  fallback;
- immutable public structural values and copying/read-only collection
  boundaries.

The authoritative commands are the existing root package scripts:
`format:check`, `lint:js`, and `test`. A phase does not add a competing formatter,
linter, test runner, module convention, or build system.

The publication-specific namespace and source-ownership rules in implementation
plan §2.10.4 supersede the earlier staging barrels at extraction. In particular,
`src/owlapi-js/rdf/index.js` does not authorize a public `owlapi/rdf` export.
