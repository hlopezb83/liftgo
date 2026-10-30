import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const helper = path.join(root, 'scripts/lib/postgres-factory.cjs');
const sourceRoots = ['src', 'scripts', 'tests', 'supabase/functions'];
const isRequire = (node, name) => ts.isCallExpression(node)
  && ts.isIdentifier(node.expression) && node.expression.text === 'require'
  && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
  && node.arguments[0].text === name;

function violations(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const result = [];
  function visit(node) {
    if (isRequire(node, 'postgres')) {
      const parent = node.parent;
      const callee = ts.isCallExpression(parent) ? parent.expression : undefined;
      const normalized = callee && ts.isCallExpression(callee)
        && ts.isIdentifier(callee.expression) && callee.expression.text === 'require'
        && callee.arguments.length === 1 && ts.isStringLiteral(callee.arguments[0])
        && callee.arguments[0].text.startsWith('.')
        && path.resolve(path.dirname(filename), callee.arguments[0].text) === helper
        && parent.arguments.length === 1 && parent.arguments[0] === node;
      if (!normalized) result.push(ast.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}

test('guard rejects new bare/default/alias/wrong-helper require and accepts exact normalization', () => {
  const file = path.join(root, 'scripts/tests/example.cjs');
  for (const source of ["const p = require('postgres');", "const p = require('postgres').default;",
    "const imported = require('postgres'); const p = normalize(imported);",
    "const p = require('./untrusted.cjs')(require('postgres'));", "const p = fn(require('postgres'));"])
    assert.equal(violations(source, file).length, 1, source);
  assert.deepEqual(violations("const p = require('../lib/postgres-factory.cjs')(require('postgres'));", file), []);
  assert.deepEqual(violations("// require('postgres')\nconst text = \"require('postgres')\";", file), []);
});

test('all repository literal CommonJS postgres imports use the shared normalizer', () => {
  const findings = [];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(?:c|m)?(?:js|ts|jsx|tsx)$/.test(entry.name))
        for (const line of violations(fs.readFileSync(file, 'utf8'), file)) findings.push(`${path.relative(root, file)}:${line}`);
    }
  }
  for (const folder of sourceRoots) walk(path.join(root, folder));
  assert.deepEqual(findings, [], 'literal require(postgres) must normalize via postgres-factory.cjs');
});

test('dependency CI gate covers every scanned source root and runs both postgres contracts', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const filter = workflow.split('            dependencies:\n')[1]?.split('            workflows:\n')[0];
  assert.ok(filter, 'dependencies path filter must exist');
  for (const folder of sourceRoots) assert.ok(filter.includes(`- '${folder}/**'`), folder);
  const command = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts['test:dependencies'];
  for (const file of ['postgres-compat-offline.test.cjs', 'postgres-import-guard.test.mjs'])
    assert.ok(command.includes(`scripts/tests/${file}`), file);
});
