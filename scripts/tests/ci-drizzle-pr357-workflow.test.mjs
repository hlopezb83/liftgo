import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const read=(file)=>readFileSync(fileURLToPath(new URL('../../'+file,import.meta.url)),'utf8');
const ci=read('.github/workflows/ci.yml'), workflow=read('.github/workflows/pr357-catalog-validation.yml');
const caller=ci.split('  supabase-lint:\n')[1].split('  dependency-contracts:\n')[0];
const final=workflow.split('  composite-gate:\n')[1];

test('stacked PRs reach the composite caller and detector failure cannot skip it',()=>{
  assert.doesNotMatch(ci.split('  pull_request:\n')[1].split('  push:\n')[0],/branches:/);
  assert.match(caller,/if: always\(\).*needs\.changes\.result != 'success'/);
  assert.match(caller,/uses: \.\/\.github\/workflows\/pr357-catalog-validation.yml/);
  assert.match(caller,/expected_sha: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
  assert.match(caller,/changes_result: \$\{\{ needs.changes.result \}\}/);
  const migrationPaths=ci.split('            migrations:\n')[1].split('            dependencies:\n')[0];
  for(const path of ['scripts/ci-pr357-*.mjs','scripts/ci-drizzle-*.mjs','scripts/tests/pr357-*','scripts/tests/ci-drizzle-pr357-*.test.mjs','.github/workflows/pr357-catalog-validation.yml']) assert.ok(migrationPaths.includes(path),path);
});

test('reusable workflow binds every checkout and preserves raw lint before replay',()=>{
  assert.match(workflow,/  workflow_call:/); assert.doesNotMatch(workflow,/  pull_request:/);
  assert.match(workflow,/  workflow_dispatch:/);
  assert.equal([...workflow.matchAll(/ref: \$\{\{ inputs.expected_sha \}\}/g)].length,5);
  assert.match(workflow,/node scripts\/ci-pr357-composite.mjs static/);
  assert.match(workflow,/node scripts\/tests\/pr357-supabase-catalog.mjs verify-baseline/);
  assert.ok(workflow.indexOf('verify-baseline')<workflow.indexOf('    - name: Start Supabase'));
  assert.doesNotMatch(workflow,/continue-on-error: true/);
});

test('final gate is unconditional and accepts only exact producer artifact IDs',()=>{
  assert.match(final,/if: always\(\)/);
  assert.match(final,/needs: \[contracts, gitleaks, native-catalog, supabase-replay\]/);
  assert.equal([...final.matchAll(/artifact-ids: \$\{\{ needs\.[\w-]+\.outputs\.artifact_id \}\}/g)].length,3);
  assert.doesNotMatch(final,/\n\s+name: pr357-composite-/);
  assert.match(final,/PR357_ARTIFACT_IDS:/); assert.match(final,/PR357_DIGESTS:/);
  assert.match(final,/assert.equal\(result,'success'/);
  assert.match(final,/node scripts\/ci-pr357-composite.mjs gate/);
});

test('cleanup executes on failure and sealing cannot precede verified cleanup',()=>{
  const native=workflow.split('  native-catalog:\n')[1].split('  supabase-replay:\n')[0];
  const replay=workflow.split('  supabase-replay:\n')[1].split('  composite-gate:\n')[0];
  assert.match(native,/if: always\(\) && steps.deps.outcome == 'success'/);
  assert.match(replay,/if: always\(\) && steps.ownership.outcome == 'success'/);
  assert.ok(native.indexOf('pr357-native-catalog.mjs cleanup')<native.indexOf('composite.mjs seal native'));
  assert.ok(replay.indexOf('pr357-supabase-catalog.mjs cleanup')<replay.indexOf('composite.mjs seal supabase'));
  for(const role of ['contracts','native','supabase']) assert.match(workflow,new RegExp('path: reports/composite-'+role+'\\.json\\n[\\s\\S]*?if-no-files-found: error'));
});
