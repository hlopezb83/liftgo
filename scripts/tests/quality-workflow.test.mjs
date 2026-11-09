import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const source=readFileSync('.github/workflows/ci.yml','utf8');
function job(name,workflow=source) {
 const match=workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [\\w-]+:|$(?![\\s\\S]))`,'m'));
 assert.ok(match,`Missing job ${name}`); return match[1];
}
function step(text,name) {
 const start=text.indexOf(`      - name: ${name}\n`); assert.ok(start>=0,`Missing step ${name}`);
 const next=text.indexOf('\n      - ',start+1); return text.slice(start,next<0?undefined:next);
}
const staticJob=job('quality-static'); const gate=job('quality');
function validate(workflow) {
 const section=workflow.slice(workflow.indexOf('  quality-static:'),workflow.indexOf('  tests:'));
 assert.deepEqual([...section.matchAll(/^  ([\w-]+):$/gm)].map(m=>m[1]),['quality-static','browser-a','browser-b','quality']);
 for(const lane of ['a','b']) {
  const browser=job(`browser-${lane}`,workflow);
  assert.doesNotMatch(browser,/^    (needs|if):|strategy:|matrix:|continue-on-error/m);
  const build=step(browser,'Compilar build ficticio independiente');
  assert.match(build,/run: node scripts\/browser-test-server.mjs --build-only$/);
  assert.doesNotMatch(build,/if:|continue-on-error/);
  const run=step(browser,'Ejecutar todas las suites en grupos internos aislados');
  assert.ok(run.includes(`run: python3 scripts/run-browser-acceptance.py --lane ${lane}`));
  assert.doesNotMatch(run,/if:|continue-on-error/);
 }
 const smoke=step(job('browser-a',workflow),'Smoke de arranque (build real)');
 assert.match(smoke,/run: bunx playwright test --config playwright.smoke.config.ts/);
 assert.doesNotMatch(smoke,/if:|continue-on-error/);
}
test('exactly four jobs start independently; each browser tests its own verified build',()=>validate(source));
test('sentinels reject missing build, acceptance or smoke and conditional skips',()=>{
 for(const command of ['node scripts/browser-test-server.mjs --build-only','python3 scripts/run-browser-acceptance.py --lane a','python3 scripts/run-browser-acceptance.py --lane b','bunx playwright test --config playwright.smoke.config.ts']) {
  assert.throws(()=>validate(source.replace(`run: ${command}`,'run: echo omitted')));
  assert.throws(()=>validate(source.replace(`run: ${command}`,`if: false\n        run: ${command}`)));
 }
});
test('all static controls remain required',()=>{
 assert.doesNotMatch(staticJob,/^    (needs|if):/m);
 for(const command of ['bun run lint --max-warnings=0','bun run typecheck','bun run typecheck:browser-tests','bash scripts/arch-check.sh']) assert.ok(staticJob.includes(`run: ${command}\n`));
 for(const contract of ['release-identity','eslint-guardrails','feature-imports','vitest-blob-provenance','browser-typecheck','lint-migrations','quality-workflow']) assert.ok(staticJob.includes(`scripts/tests/${contract}.test.mjs`));
 assert.ok(staticJob.includes('tests/offlineTeardown.test.mjs tests/design-group-c/artifactGuard.test.mjs'));
});
test('each browser strips dotenv and preserves fake backend, isolation and evidence',()=>{
 for(const lane of ['a','b']) {
  const browser=job(`browser-${lane}`);
  assert.ok(browser.indexOf('rm -f -- .env .env.*')<browser.indexOf('uses: ./.github/actions/setup-bun-project'));
  assert.ok(browser.indexOf('--build-only')<browser.indexOf('run-browser-acceptance.py'));
  assert.match(browser,/SMOKE_REUSE_BUILD: "1"/);
  assert.ok(browser.includes('node --test scripts/tests/browser-test-*.test.mjs'));
  const evidence=step(browser,'Subir evidencia del carril');
  assert.match(evidence,/if: always\(\)/);
  assert.ok(evidence.includes(`name: browser-${lane}-`));
  assert.match(evidence,/playwright-report\/\n            test-results\//);
 }
});
test('only lane a saves both caches',()=>{
 assert.equal(source.split('save-cache: "true"').length-1,2);
 assert.equal(job('browser-a').split('save-cache: "true"').length-1,2);
});
test('stable gate requires all three jobs and cannot skip failure',()=>{
 assert.match(gate,/name: Calidad \(lint, tipos, build y arranque\)/);
 assert.match(gate,/needs: \[quality-static, browser-a, browser-b\]/);
 assert.match(gate,/^    if: always\(\)$/m);
 const good={STATIC_RESULT:'success',A_RESULT:'success',B_RESULT:'success'};
 for(const [variable,dependency] of [['STATIC_RESULT','quality-static'],['A_RESULT','browser-a'],['B_RESULT','browser-b']]) assert.ok(gate.includes(`${variable}: \${{ needs.${dependency}.result }}`));
 const command=step(gate,'Exigir todos los controles de calidad').match(/        run: \|\n((?:          [^\n]*(?:\n|$))+)/)[1].replace(/^          /gm,'');
 const run=env=>spawnSync('bash',['-e','-o','pipefail','-c',command],{env:{...process.env,...env}}).status;
 assert.equal(run(good),0);
 for(const key of Object.keys(good)) for(const value of ['failure','cancelled','skipped','','neutral']) assert.notEqual(run({...good,[key]:value}),0);
});
