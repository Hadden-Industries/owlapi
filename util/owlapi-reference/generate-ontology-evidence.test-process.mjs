import { readFileSync } from "node:fs";

import { generateOntologyEvidence } from "./qualify-universal-ontology.mjs";

const options = JSON.parse(readFileSync(0, "utf8"));
const evidence = await generateOntologyEvidence(options);
process.stdout.write(JSON.stringify(evidence));
