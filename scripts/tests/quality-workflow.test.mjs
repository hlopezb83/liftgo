import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { FAKE_BACKEND } from '../browser-test-config.mjs';

const source = readFileSync('.github/workflows/ci.yml', 'utf8');
// These narrow structural assertions are not a YAML parser. Actionlint is the
// separate syntax/expression gate; here we exercise the checked-in shell too.
function job(name, workflow = source) {
  const match = workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`, 'm'));
  assert.ok(match, `Missing job: ${name}`);
  return match[1];
}
function step(text, name) {
  const start = text.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `Missing step: ${name}`);
  const next = text.indexOf('\n      - ', start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}
function shell(text) {
  const match = text.match(/        run: \|\n((?:          [^\n]*(?:\n|$))+)/);
  assert.ok(match, 'Missing executable shell');
  return match[1].replace(/^          /gm, '');
}
function bash(command, cwd, env = {}) {
  return spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', command], {
    cwd, encoding: 'utf8', env: { ...process.env, ...env },
  });
}
const staticScript = readFileSync('scripts/quality-static.sh', 'utf8');
const buildScript = readFileSync('scripts/quality-build-smoke.sh', 'utf8');
const producerScript = readFileSync('scripts/quality-producer.py', 'utf8');
const staticJob = job('quality-build');
const buildJob = job('quality-build');
const browserJob = job('browser-a');
const gate = job('quality');
function assertAllSuites(workflow) {
  const build = job('quality-build', workflow);
  const browser = job('browser-a', workflow);
  assert.ok(buildScript.includes('bunx playwright test --config playwright.smoke.config.ts'));
  for (const lane of ['a', 'b']) {
    const consumer = job(`browser-${lane}`, workflow);
    const orchestration = step(consumer, 'Ejecutar todas las suites en grupos internos aislados');
    assert.doesNotMatch(orchestration, /if:|continue-on-error/);
    assert.ok(orchestration.includes(`run: python3 scripts/run-browser-acceptance.py --lane ${lane}`));
  }

}

test('quality has exactly four jobs including its stable gate, without a browser matrix', () => {
  assertAllSuites(source);
  const qualitySection = source.slice(source.indexOf('  quality-build:'), source.indexOf('  tests:'));
  const names = [...qualitySection.matchAll(/^  ([\w-]+):$/gm)].map(match => match[1]);
  assert.deepEqual(names, ['quality-build', 'browser-a', 'browser-b', 'quality']);
  assert.doesNotMatch(browserJob, /strategy:|matrix:|continue-on-error/);
  assert.match(browserJob, /SMOKE_REUSE_BUILD: "1"/);
});

test('sentinel catches dropped or conditional orchestration', () => {
  assert.throws(() => assertAllSuites(source.replace('run: python3 scripts/run-browser-acceptance.py', 'run: echo omitted')));
  assert.throws(() => assertAllSuites(source.replace('run: python3 scripts/run-browser-acceptance.py', 'if: false\n        run: python3 scripts/run-browser-acceptance.py')));
});

test('static and build start independently, acceptance waits for the validated build', () => {
  for (const text of [staticJob, buildJob]) assert.doesNotMatch(text, /^    (?:needs|if):/m);
  assert.match(browserJob, /^    needs: quality-build$/m);
  assert.doesNotMatch(browserJob, /^    if:/m);
  assert.equal(buildScript.split('node scripts/browser-test-server.mjs --build-only\n').length - 1, 1);
  assert.ok(producerScript.includes("BRANCHES = ('static', 'build-smoke')"));
  assert.ok(producerScript.includes('supervisor.cleanup_descendants()'));
  for (const command of ['bun run lint --max-warnings=0', 'bun run typecheck', 'bun run typecheck:browser-tests', 'bash scripts/arch-check.sh']) {
    assert.ok(staticScript.includes(`${command}\n`), `Missing static control: ${command}`);
  }
  for (const name of ['release-identity', 'eslint-guardrails', 'feature-imports', 'vitest-blob-provenance', 'browser-typecheck', 'lint-migrations', 'quality-workflow']) {
    assert.ok(staticScript.includes(`scripts/tests/${name}.test.mjs`), `Missing contract: ${name}`);
  }
  assert.ok(staticScript.includes('tests/offlineTeardown.test.mjs tests/design-group-c/artifactGuard.test.mjs'));
  assert.ok(buildScript.includes('node --test scripts/tests/browser-test-*.test.mjs'));
});

test('only the producer saves caches, and all consumers strip local dotenv before installing', () => {
  for (const text of [staticJob, buildJob, browserJob]) {
    assert.ok(text.indexOf('rm -f -- .env .env.*') < text.indexOf('uses: ./.github/actions/setup-bun-project'));
  }
  assert.equal(source.split('save-cache: "true"').length - 1, 2);
  assert.equal(buildJob.split('save-cache: "true"').length - 1, 2);
});

test('artifact is run/attempt scoped, built only after smoke and checked before extraction', () => {
  assert.ok(buildJob.includes('build-artifact-name: ${{ steps.pack.outputs.artifact-name }}'));
  assert.ok(buildJob.includes('name: ${{ steps.pack.outputs.artifact-name }}'));
  assert.ok(browserJob.includes('name: ${{ needs.quality-build.outputs.build-artifact-name }}'));
  assert.match(buildJob, /artifact-name=browser-build-\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT/);
  const download = step(browserJob, 'Descargar sólo el build validado por el productor');
  assert.doesNotMatch(download, /github\.run_attempt/);
  assert.match(buildJob, /retention-days: 7/);
  assert.ok(buildJob.indexOf('python3 scripts/quality-producer.py') < buildJob.indexOf('id: pack'));
  assert.match(buildJob, /path: \$\{\{ runner\.temp \}\}\/browser-build\.tar\.gz/);
  assert.match(buildJob, /if-no-files-found: error/);
  const restore = shell(step(browserJob, 'Verificar bytes y restaurar build'));
  assert.ok(restore.indexOf('sha256sum --check --strict') < restore.indexOf('tar -xzf'));
  assert.ok(restore.includes('assertBuildUsesFakeBackend(process.cwd())'));
  assert.match(browserJob, /BUILD_SHA256: \$\{\{ needs\.quality-build\.outputs\.build-sha256 \}\}/);
});

test('all suite evidence is preserved on failure', () => {
  const evidence = step(browserJob, 'Subir evidencia del carril');
  assert.match(evidence, /if: always\(\)/);
  assert.ok(evidence.includes('name: browser-a-${{ github.run_id }}-${{ github.run_attempt }}'));
  assert.match(evidence, /playwright-report\/\n            test-results\//);
});

test('stable quality check explicitly requires all dependencies and cannot be skipped on failure', () => {
  assert.match(gate, /name: Calidad \(lint, tipos, build y arranque\)/);
  assert.match(gate, /needs: \[quality-build, browser-a, browser-b\]/);
  assert.match(gate, /^    if: always\(\)$/m);
  for (const [env, dependency] of [['A_RESULT', 'browser-a'], ['BUILD_RESULT', 'quality-build'], ['B_RESULT', 'browser-b']]) {
    assert.ok(gate.includes(`${env}: \${{ needs.${dependency}.result }}`));
  }
});

const gateShell = shell(step(gate, 'Exigir todos los controles de calidad'));
const good = { A_RESULT: 'success', BUILD_RESULT: 'success', B_RESULT: 'success' };
test('actual gate shell succeeds only when every result is success', () => {
  assert.equal(bash(gateShell, process.cwd(), good).status, 0);
  for (const variable of Object.keys(good)) {
    for (const status of ['failure', 'cancelled', 'skipped', '', 'neutral']) {
      assert.notEqual(bash(gateShell, process.cwd(), { ...good, [variable]: status }).status, 0, `${variable}: ${status}`);
    }
  }
});

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'liftgo-build-transfer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const producer = path.join(root, 'producer');
  const consumer = path.join(root, 'consumer');
  const runnerTemp = path.join(root, 'runner');
  for (const directory of [path.join(producer, 'dist/client'), path.join(producer, 'dist/server'), path.join(consumer, 'scripts'), path.join(runnerTemp, 'browser-build')]) mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(producer, 'dist/client/app.js'), JSON.stringify(FAKE_BACKEND));
  writeFileSync(path.join(producer, 'dist/server/index.mjs'), 'export default {};');
  writeFileSync(path.join(producer, '.env'), 'DO_NOT_PACKAGE=synthetic');
  copyFileSync('scripts/browser-test-config.mjs', path.join(consumer, 'scripts/browser-test-config.mjs'));
  const output = path.join(root, 'github-output');
  const pack = bash(shell(step(buildJob, 'Empaquetar el build ficticio validado')), producer, { RUNNER_TEMP: runnerTemp, GITHUB_OUTPUT: output, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' });
  assert.equal(pack.status, 0, pack.stderr);
  const outputs = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map(line => line.split('=')));
  const sha256 = outputs.sha256;
  assert.equal(outputs['artifact-name'], 'browser-build-123-1');
  const archive = path.join(runnerTemp, 'browser-build/browser-build.tar.gz');
  copyFileSync(path.join(runnerTemp, 'browser-build.tar.gz'), archive);
  return { producer, consumer, runnerTemp, sha256, archive };
}
const restoreShell = shell(step(browserJob, 'Verificar bytes y restaurar build'));

test('actual transfer preserves bytes and reuses producer attempt 1 for consumer attempt 2', t => {
  const f = fixture(t);
  const restored = bash(restoreShell, f.consumer, { RUNNER_TEMP: f.runnerTemp, BUILD_SHA256: f.sha256, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2' });
  assert.equal(restored.status, 0, restored.stderr);
  for (const file of ['dist/client/app.js', 'dist/server/index.mjs']) {
    assert.deepEqual(readFileSync(path.join(f.producer, file)), readFileSync(path.join(f.consumer, file)));
  }
  assert.equal(existsSync(path.join(f.consumer, '.env')), false);
});

for (const corruption of ['different digest', 'missing digest', 'changed archive']) {
  test(`transfer rejects ${corruption} before extraction`, t => {
    const f = fixture(t);
    let expected = f.sha256;
    if (corruption === 'different digest') expected = '0'.repeat(64);
    if (corruption === 'missing digest') expected = '';
    if (corruption === 'changed archive') writeFileSync(f.archive, 'corrupt bytes');
    const restored = bash(restoreShell, f.consumer, { RUNNER_TEMP: f.runnerTemp, BUILD_SHA256: expected });
    assert.notEqual(restored.status, 0);
    assert.equal(existsSync(path.join(f.consumer, 'dist')), false);
  });
}
