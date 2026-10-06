import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../tooling/markdown/package.json", import.meta.url),
);
const katexPath = require.resolve("katex");
const root = fileURLToPath(new URL("../", import.meta.url));

// Prototype pollution must stay in a disposable child, never the test process.
function renderCheck(program) {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `const assert = require('node:assert/strict'); const katex = require(${JSON.stringify(katexPath)}); ${program}`,
    ],
    { cwd: root, encoding: "utf8", timeout: 3000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
}

test("ordinary math, explicit HTTPS trust and own macros remain supported", () => {
  renderCheck(String.raw`
    assert.match(katex.renderToString('x^2 + y^2'), /class="katex"/);
    assert.match(katex.renderToString('\\href{https://example.org}{reference}', {trust: true}), /href="https:\/\/example.org"/);
    assert.match(katex.renderToString('\\answer', {macros: {'\\answer': '42'}}), /42/);
  `);
});

for (const expression of [
  String.raw`\href{javascript:alert(1)}{click}`,
  String.raw`\includegraphics{https://example.org/untrusted.png}`,
]) {
  test(`inherited trust cannot authorize ${expression}`, () => {
    renderCheck(`
      Object.prototype.trust = true;
      const expression = ${JSON.stringify(expression)};
      for (const options of [{}, Object.create({trust: true})]) {
        const html = katex.renderToString(expression, options);
        assert.doesNotMatch(html, /<(?:a|img)(?: |>)/);
      }
    `);
  });
}

test("inherited setting metadata and macro names are not accepted", () => {
  renderCheck(String.raw`
    Object.prototype.default = true;
    Object.prototype.processor = () => true;
    Object.prototype['\\polluted'] = '42';
    assert.doesNotMatch(katex.renderToString('\\href{javascript:alert(1)}{click}'), /<a\s/);
    assert.throws(() => katex.renderToString('\\polluted'), /ParseError/);
    assert.match(katex.renderToString('x + 1'), /class="katex"/);
  `);
});
