# Engineering conventions

Phase 0 records the existing WebVOWL JavaScript regime as the implementation
regime for `owlapi-js`:

- native ECMAScript modules and named exports;
- native JavaScript only—no TypeScript, `tsc`, `checkJs`, or generated
  declaration-file workflow;
- repository Prettier formatting and ESLint rules;
- Jest colocated `*.test.js` tests executed directly from ESM;
- lower camel case for values/functions, upper camel case for constructors and
  OWLAPI-aligned public type names;
- explicit parser-factory registration with no import-time global mutation;
- direct relative imports inside the module, with narrow public barrels only at
  `owlapi-js`, `owlapi-js/model`, and `owlapi-js/rdf`;
- browser and Node compatibility under the repository's `baseline widely
available` target;
- typed errors for observable failures and no broad catch-and-continue parser
  fallback;
- immutable public structural values and copying/read-only collection
  boundaries.

The authoritative commands are the existing root package scripts:
`format:check`, `lint:js`, and `test`. A phase does not add a competing formatter,
linter, test runner, module convention, or build system.
