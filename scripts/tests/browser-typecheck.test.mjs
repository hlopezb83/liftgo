import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const configPath = path.join(root, 'tsconfig.browser-tests.json');
function config() {
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(loaded.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  return parsed;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : /\.tsx?$/.test(filename) ? [filename] : [];
  });
}
test('browser typecheck includes every E2E spec, setup, teardown and fixture', () => {
  const roots = new Set(config().fileNames);
  const e2eFiles = walk(path.join(root, 'tests/e2e'));
  assert.ok(e2eFiles.filter(file => file.endsWith('.spec.ts')).length >= 17);
  assert.deepEqual(e2eFiles.filter(file => !roots.has(file)), []);
});
test('browser typecheck includes quote design specs, fixtures and config', () => {
  const roots = new Set(config().fileNames);
  const quoteFiles = walk(path.join(root, 'tests/quotes-design'));
  assert.ok(quoteFiles.some(file => file.endsWith('.spec.ts')), 'quote design must contain a spec');
  const expected = [...quoteFiles, path.join(root, 'playwright.quotes-design.config.ts')];
  assert.deepEqual(expected.filter(file => !roots.has(file)), []);
});
test('browser typecheck includes booking specs, fixtures and config', () => {
  const roots = new Set(config().fileNames);
  const bookingFiles = walk(path.join(root, 'tests/bookings'));
  assert.ok(bookingFiles.some(file => file.endsWith('.spec.ts')), 'booking acceptance must contain a spec');
  const expected = [...bookingFiles, path.join(root, 'tests/bookings/playwright.config.ts')];
  assert.deepEqual(expected.filter(file => !roots.has(file)), []);
});
test('browser typecheck includes all group C harness sources and shared teardown', () => {
  const roots = new Set(config().fileNames);
  const files = walk(path.join(root, 'tests/design-group-c'));
  assert.ok(files.some(file => file.endsWith('.tsx')), 'component fixtures must be included');
  const expected = [...files, ...[
    'playwright.group-c-design.config.ts', 'playwright.group-c-component.config.ts',
    'vite.group-c-fixture.config.ts', 'tests/offlineTeardown.ts',
  ].map(file => path.join(root, file))];
  assert.deepEqual(expected.filter(file => !roots.has(file)), []);
});

test('an incompatible type in a formerly excluded spec fails without executing it', () => {
  const parsed = config();
  const target = path.join(root, 'tests/e2e/customer-create.spec.ts');
  assert.ok(parsed.fileNames.includes(target), 'sentinel spec must be a root of the actual browser project');
  // Check the actual included spec, but keep this negative sentinel lightweight:
  // no module loading or transitive type graph. The separate CI tsc gate checks
  // the full project, including every import and the real timeout parameter.
  const options = { ...parsed.options, noResolve: true, noLib: true, types: [] };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = file => {
    const text = readFile(file);
    return path.resolve(file) === target && text !== undefined
      ? `${text}\nconst __browserTypecheckSentinel: number = "must fail";\n` : text;
  };
  const program = ts.createProgram([target], options, host);
  const source = program.getSourceFile(target);
  const sentinelLine = source.text.slice(0, source.text.indexOf('const __browserTypecheckSentinel')).split('\n').length - 1;
  const errors = program.getSemanticDiagnostics(source);
  assert.ok(errors.some(error => error.code === 2322 && error.file === source
    && source.getLineAndCharacterOfPosition(error.start).line === sentinelLine), 'TypeScript must reject the injected assignment');
});
