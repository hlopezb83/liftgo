import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { canonicalReplayManifest, assertReplayLedger } from './ci-drizzle-replay.mjs';
import { loadCanonicalContractHistory, evaluateStaticContracts, classifyLegacyDiagnostics } from './ci-pr357-static-contracts.mjs';
import { evaluateCatalog, validateCatalogSnapshot } from './tests/pr357-catalog-audit.mjs';
import { NATIVE_SCENARIOS } from './tests/pr357-native-catalog.mjs';
import { verifySupabaseVersions, verifySnapshotIdentity, requireCiContext, expectedBaselineConfig } from './tests/pr357-supabase-catalog.mjs';

export const SOURCE_GUARD_PATHS = Object.freeze([
  'scripts/lint-migrations.ts','scripts/ci-pr357-static-contracts.mjs','scripts/ci-pr357-composite.mjs',
  'scripts/ci-drizzle-replay.mjs','scripts/ci_database.py','scripts/patch_legacy_migrations.py',
  'scripts/tests/pr357-catalog-audit.mjs','scripts/tests/pr357-native-catalog.mjs','scripts/tests/pr357-supabase-catalog.mjs',
  '.github/workflows/ci.yml','.github/workflows/pr357-catalog-validation.yml',
]);

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const digestEvidence = (value) => hash(JSON.stringify(canonical(value)));
function regular(file) {
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Evidence/source must be a regular file');
  return readFileSync(file);
}
const json = (file) => JSON.parse(regular(file).toString('utf8'));
function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim(); }
function sqlManifest(root, lane) {
  return readdirSync(join(root,lane)).filter(n => n.endsWith('.sql')).sort().map(n => ({path: lane + '/' + n,sha256:hash(regular(join(root,lane,n)))}));
}
export function sourceEvidence(root = process.cwd()) {
  git(root,['ls-files','--error-unmatch','--',...SOURCE_GUARD_PATHS]);
  assert.equal(git(root,['diff','--name-only','HEAD','--',...SOURCE_GUARD_PATHS]),'','Guard code differs from the checked-out commit');
  const history = loadCanonicalContractHistory(root);
  const supabaseSource = sqlManifest(root,'supabase/migrations'), drizzleSource = sqlManifest(root,'drizzle/migrations');
  assert.deepEqual([...supabaseSource,...drizzleSource].map(v=>v.path).sort(), git(root,['ls-tree','-r','--name-only','HEAD','--','supabase/migrations','drizzle/migrations']).split('\n').filter(n=>n.endsWith('.sql')).sort(), 'SQL inventory differs from checkout');
  assert.equal(git(root,['diff','--name-only','HEAD','--','supabase/migrations','drizzle/migrations','supabase/config.toml']), '', 'Source SQL/config differs from checkout');
  const temporary = mkdtempSync(join(tmpdir(),'liftgo-composite-source-'));
  let expectedPatchedSupabase;
  try {
    mkdirSync(join(temporary,'supabase/migrations'),{recursive:true});
    for (const v of supabaseSource) copyFileSync(join(root,v.path),join(temporary,v.path));
    execFileSync('python3',[join(root,'scripts/patch_legacy_migrations.py')],{cwd:temporary,stdio:['ignore','pipe','pipe']});
    expectedPatchedSupabase=sqlManifest(temporary,'supabase/migrations');
  } finally { rmSync(temporary,{recursive:true,force:true}); }
  const config=expectedBaselineConfig(root);
  return {supabaseSource,expectedPatchedSupabase,drizzleSource,manifest:canonicalReplayManifest(root),
    drizzleJournalSha256:hash(regular(join(root,'drizzle/migrations/meta/_journal.json'))),
    patcherSha256:hash(regular(join(root,'scripts/patch_legacy_migrations.py'))),
    replayGuardSha256:hash(regular(join(root,'scripts/ci-drizzle-replay.mjs'))),
    databaseGuardSha256:hash(regular(join(root,'scripts/ci_database.py'))),
    auditGuardSha256:hash(regular(join(root,'scripts/tests/pr357-catalog-audit.mjs'))),
    collectorSha256:hash(regular(join(root,'scripts/tests/pr357-supabase-catalog.mjs'))),
    configSourceSha256:config.sourceSha256,configReplaySha256:config.replaySha256,
    guardHashes:Object.fromEntries(SOURCE_GUARD_PATHS.map(file=>[file,hash(regular(join(root,file)))])),history};
}
function timestamp(value) { assert.ok(Number.isSafeInteger(value) && value > 0,'Missing valid evidence timestamp'); return value; }
function binding(report, context, producer) {
  assert.equal(report?.schema_version,2,'Unsupported evidence schema');
  assert.equal(report.producer,producer,'Wrong producer');
  assert.equal(report.checkout_sha,context.sha,'Evidence checkout SHA mismatch');
  assert.equal(report.run_id,context.runId,'Evidence run mismatch');
  assert.equal(report.run_attempt,context.attempt,'Evidence attempt mismatch');
  assert.match(report.nonce ?? '',/^[0-9a-f-]{36}$/i,'Missing run-owned nonce');
}
function catalog(snapshot, expectedStatus='PASS') {
  validateCatalogSnapshot(snapshot);
  const result=evaluateCatalog(snapshot);
  assert.equal(result.status,expectedStatus,'Effective catalog contract mismatch');
  return result;
}
export function validateCompositeEvidence({root=process.cwd(),context,jobs,staticReport,nativeReport,nativeCleanup,supabaseReport,supabaseCleanup,digests}) {
  assert.match(context?.sha ?? '',/^[0-9a-f]{40}$/);
  assert.match(context.runId ?? '',/^\d+$/); assert.match(context.attempt ?? '',/^\d+$/);
  timestamp(context.startedAt);
  assert.equal(git(root,['rev-parse','HEAD']),context.sha,'Gate checkout mismatch');
  for (const name of ['changes','contracts','gitleaks','native-catalog','supabase-replay']) assert.equal(jobs?.[name],'success','Required job was not successful: '+name);
  assert.equal(digests?.contracts,digestEvidence({staticReport}),'Static evidence modified');
  assert.equal(digests?.native,digestEvidence({nativeReport,nativeCleanup}),'Native evidence modified');
  assert.equal(digests?.supabase,digestEvidence({supabaseReport,supabaseCleanup}),'Replay evidence modified');
  binding(staticReport,context,'pr357-static-contracts');
  assert.equal(staticReport.status,'REPLAY_REQUIRED','Demonstrated static failure cannot be overridden');
  assert.ok(timestamp(staticReport.created_at)>=context.startedAt,'Old static report');
  const source=sourceEvidence(root);
  const assessed=evaluateStaticContracts(source.history.history,{prelude:source.history.prelude});
  assert.deepEqual(staticReport.assessment,assessed,'Static properties were modified or are stale');
  assert.equal(assessed.status,'REPLAY_REQUIRED','Demonstrated contract violation');
  assert.deepEqual(staticReport.source_digest,digestEvidence({...source,history:undefined}),'Static source binding mismatch');
  const disposition=classifyLegacyDiagnostics(staticReport.lint.stderr,assessed);
  assert.deepEqual(staticReport.disposition,disposition,'Legacy diagnostic evidence changed');
  assert.equal(disposition.blocking.length,0,'Other linter diagnostics must block');
  assert.ok([0,1].includes(staticReport.lint.exit),'Linter crashed');
  assert.equal(staticReport.lint.exit===1,disposition.eligible.length>0,'Linter failure was not fully classified');
  const expectedFiles=[...source.history.files,...(context.selectedSupabase ?? [])];
  assert.deepEqual(staticReport.lint.files,expectedFiles,'Linter omitted selected migrations');
  const lint=spawnSync(process.execPath,[join(root,'scripts/lint-migrations.ts'),...expectedFiles],{cwd:root,encoding:'utf8'});
  assert.ifError(lint.error);
  assert.deepEqual({exit:lint.status,stdout:lint.stdout,stderr:lint.stderr},
    {exit:staticReport.lint.exit,stdout:staticReport.lint.stdout,stderr:staticReport.lint.stderr},'Original linter evidence was modified');
  binding(nativeReport,context,'pr357-native-catalog'); binding(nativeCleanup,context,'pr357-native-catalog');
  assert.equal(nativeReport.job,'native-catalog'); assert.equal(nativeCleanup.job,'native-catalog');
  assert.equal(nativeReport.status,'PASS'); assert.equal(nativeCleanup.nonce,nativeReport.nonce);
  assert.match(nativeReport.postgresql_version ?? '',/^postgres \(PostgreSQL\) 17(?:\.|\s|$)/);
  assert.ok(timestamp(nativeReport.started_at)>=staticReport.created_at,'Native controls predate static evidence');
  assert.ok(timestamp(nativeReport.completed_at)>=nativeReport.started_at);
  assert.deepEqual(nativeReport.scenarios.map(v=>v.name),NATIVE_SCENARIOS.map(v=>v.name),'Missing or extra negative controls');
  assert.deepEqual(nativeReport.restored_baselines.map(v=>v.after),NATIVE_SCENARIOS.map(v=>v.name),'Missing restored baseline');
  for (const [i,scenario] of NATIVE_SCENARIOS.entries()) {
    const observed=nativeReport.scenarios[i];
    assert.equal(observed.status,'PASS'); assert.equal(observed.real_postgresql,true);
    const result=catalog(observed.snapshot,scenario.expected.length?'FAIL':'PASS');
    assert.equal(observed.expected_audit_status,scenario.expected.length?'FAIL':'PASS');
    assert.equal(observed.actual_audit_status,result.status);
    assert.deepEqual(observed.detected_codes,[...new Set(result.findings.map(v=>v.code))].sort(),'Negative control metadata mismatch');
    for (const code of scenario.expected) assert.ok(result.findings.some(v=>v.code===code),'Negative control did not detect expected violation');
    const restored=nativeReport.restored_baselines[i];
    assert.equal(restored.status,'PASS'); assert.equal(restored.real_postgresql,true); catalog(restored.snapshot);
  }
  assert.equal(nativeReport.cleanup.status,'PASS'); assert.equal(nativeReport.cleanup.disposition,'owned_cluster_stopped_and_removed');
  assert.equal(nativeReport.cleanup.stopped,true); assert.equal(nativeReport.cleanup.removed,true);
  assert.equal(nativeReport.cleanup.nonce,nativeReport.nonce);
  assert.ok(timestamp(nativeReport.cleanup.verified_at)>=nativeReport.started_at && nativeReport.cleanup.verified_at<=nativeReport.completed_at,'Native cleanup timestamp mismatch');
  assert.equal(nativeCleanup.cleanup.status,'PASS'); assert.equal(nativeCleanup.cleanup.disposition,'no_owned_cluster_state');
  assert.equal(nativeCleanup.cleanup.stopped,true); assert.equal(nativeCleanup.cleanup.removed,true);
  assert.equal(nativeCleanup.cleanup.nonce,nativeReport.nonce);
  assert.ok(timestamp(nativeCleanup.cleanup.verified_at)>=nativeReport.completed_at,'Native cleanup was not verified after execution');
  binding(supabaseReport,context,'pr357-supabase-catalog'); binding(supabaseCleanup,context,'pr357-supabase-catalog');
  assert.equal(supabaseReport.job,'supabase-replay'); assert.equal(supabaseCleanup.job,'supabase-replay');
  assert.equal(supabaseReport.status,'PASS'); assert.equal(supabaseCleanup.nonce,supabaseReport.nonce);
  assert.ok(timestamp(supabaseReport.prepared_at)>=nativeReport.completed_at,'Replay predates controls');
  assert.ok(supabaseReport.prepared_at>=nativeCleanup.cleanup.verified_at,'Replay predates verified native cleanup');
  assert.ok(timestamp(supabaseReport.collected_at)>=supabaseReport.prepared_at);
  for (const key of ['project_resources_absent','tracked_sources_clean','exact_sql_inventory','one_use_marker','config_original_bound','config_seed_disabled']) assert.equal(supabaseReport.baseline?.[key],true,'Unproven canonical baseline: '+key);
  const b=supabaseReport.source_binding;
  assert.deepEqual(b.drizzle_source,source.drizzleSource);
  for (const [key,field] of Object.entries({patcher_sha256:'patcherSha256',replay_guard_sha256:'replayGuardSha256',database_guard_sha256:'databaseGuardSha256',audit_guard_sha256:'auditGuardSha256',collector_sha256:'collectorSha256',drizzle_journal_sha256:'drizzleJournalSha256',config_source_sha256:'configSourceSha256',config_replay_sha256:'configReplaySha256'})) assert.equal(b[key],source[field],'Replay source binding mismatch: '+key);
  assert.deepEqual(supabaseReport.replay.supabase_source,source.supabaseSource);
  assert.deepEqual(supabaseReport.replay.supabase_runner_transformation,source.expectedPatchedSupabase);
  assert.deepEqual(supabaseReport.replay.manifest,source.manifest,'Replay manifest differs from canonical source');
  assert.equal(verifySupabaseVersions(source.supabaseSource,supabaseReport.snapshot.supabase_versions),source.supabaseSource.length);
  assert.equal(assertReplayLedger(supabaseReport.snapshot.drizzle_ledger,source.manifest.migrations),source.manifest.migrations.length);
  assert.equal(supabaseReport.replay.supabase_count,source.supabaseSource.length);
  assert.equal(supabaseReport.replay.drizzle_count,source.manifest.migrations.length);
  const project=/^project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/m.exec(regular(join(root,'supabase/config.toml')).toString('utf8'))?.[1];
  assert.ok(project,'Missing canonical project identity');
  const owned=supabaseReport.owned;
  assert.ok(timestamp(supabaseReport.baseline_verified_at)>=supabaseReport.prepared_at,'Baseline was not verified after ownership');
  assert.match(owned?.id ?? '',/^[0-9a-f]{64}$/);
  assert.equal(owned.name,'supabase_db_'+project); assert.equal(owned.volume,owned.name);
  assert.equal(owned.image,'public.ecr.aws/supabase/postgres:17.4.1.068');
  assert.match(owned.data_mount ?? '',/^\/[A-Za-z0-9_/-]+$/);
  for(const field of ['created_at','started_at']) assert.ok(Number.isFinite(Date.parse(owned[field])) && Date.parse(owned[field])>=supabaseReport.prepared_at,'Pre-existing database container');
  assert.ok(supabaseReport.baseline_verified_at<=Date.parse(owned.created_at),'Baseline was verified after database creation');
  assert.ok(Date.parse(owned.created_at)<=Date.parse(owned.started_at) && Date.parse(owned.started_at)<=supabaseReport.collected_at,'Database chronology mismatch');
  assert.ok(Number.isFinite(Date.parse(owned.volume_created_at)) && Date.parse(owned.volume_created_at)>=Math.floor(supabaseReport.prepared_at/1000)*1000,'Pre-existing database volume');
  assert.ok(Date.parse(owned.volume_created_at)<=supabaseReport.collected_at,'Future database volume');
  verifySnapshotIdentity(supabaseReport.snapshot.identity,supabaseReport.owned);
  assert.equal(supabaseReport.snapshot.auth_schema?.users_present,true); assert.equal(supabaseReport.snapshot.auth_schema?.uid_present,true);
  catalog(supabaseReport.snapshot);
  assert.equal(supabaseCleanup.status,'PASS'); assert.equal(supabaseCleanup.ownership_verified,true);
  assert.equal(supabaseCleanup.stop_attempted,true); assert.equal(supabaseCleanup.stop_command_failed,false);
  assert.equal(supabaseCleanup.project_resources_remaining,false);
  for (const key of ['containers','volumes','networks']) assert.ok(Number.isInteger(supabaseCleanup.verified_owned_resources?.[key]) && supabaseCleanup.verified_owned_resources[key]>0,'Missing owned cleanup resource: '+key);
  assert.equal(supabaseCleanup.prepared_at,supabaseReport.prepared_at);
  assert.ok(timestamp(supabaseCleanup.verified_at)>=supabaseReport.collected_at,'Cleanup predates catalog');
  assert.ok(supabaseCleanup.verified_at<=Date.now()+60_000,'Future evidence timestamp');
  return {status:'PASS',checkout_sha:context.sha,run_id:context.runId,run_attempt:context.attempt,native_scenarios:NATIVE_SCENARIOS.length,
    scope:'Current canonical ephemeral replay and three effective catalog contracts; not production or RPC certification'};
}
function write(file,value) { mkdirSync(join(file,'..'),{recursive:true}); writeFileSync(file,JSON.stringify(value,null,2)+'\n'); }
function output(key,value) { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n'); }
function selectedSupabase(root,context) {
  let additional=[];
  const event=process.env.GITHUB_EVENT_NAME;
  if (event==='pull_request') {
    assert.ok(process.env.GITHUB_BASE_REF,'Missing PR base');
    execFileSync('git',['fetch','origin',process.env.GITHUB_BASE_REF,'--depth=1'],{cwd:root,stdio:['ignore','pipe','pipe']});
    additional=git(root,['diff','--name-only','--diff-filter=AM','origin/'+process.env.GITHUB_BASE_REF+'...HEAD','--','supabase/migrations/*.sql']).split('\n').filter(Boolean);
  } else if (event==='push') {
    const payload=json(process.env.GITHUB_EVENT_PATH); assert.match(payload.before,/^[0-9a-f]{40}$/);
    additional=git(root,['diff','--name-only','--diff-filter=AM',payload.before,context.sha,'--','supabase/migrations/*.sql']).split('\n').filter(Boolean);
  }
  return additional;
}
function ciContext() {
  const c=requireCiContext();
  const context={sha:c.sha,runId:c.runId,attempt:c.attempt,startedAt:Number(process.env.PR357_STARTED_AT)};
  context.selectedSupabase=selectedSupabase(process.cwd(),context);
  return context;
}
export function runStatic({root=process.cwd(),context,runtime=process.execPath}={}) {
  const started=Date.now(),source=sourceEvidence(root);
  const history=source.history;
  const additional=context.selectedSupabase ?? [];
  const files=[...history.files,...additional];
  const lint=spawnSync(runtime,[join(root,'scripts/lint-migrations.ts'),...files],{cwd:root,encoding:'utf8'});
  assert.ifError(lint.error);
  const assessment=evaluateStaticContracts(history.history,{prelude:history.prelude});
  const disposition=classifyLegacyDiagnostics(lint.stderr,assessment);
  const status=assessment.status==='FAIL'||disposition.blocking.length||![0,1].includes(lint.status)||(lint.status===1)!==(disposition.eligible.length>0)?'FAIL':'REPLAY_REQUIRED';
  const report={schema_version:2,producer:'pr357-static-contracts',checkout_sha:context.sha,run_id:context.runId,run_attempt:context.attempt,nonce:randomUUID(),created_at:started,status,
    source_digest:digestEvidence({...source,history:undefined}),assessment,disposition,lint:{exit:lint.status,files,stdout:lint.stdout,stderr:lint.stderr}};
  return report;
}
async function main(operation,role) {
  if (operation==='static') {
    const context=ciContext(); const report=runStatic({context});
    write('reports/pr357-static-contracts.json',report); output('started_at',report.created_at);
    console.log('Original linter exit='+report.lint.exit+', eligible='+report.disposition.eligible.length+', blocking='+report.disposition.blocking.length+'; composite='+report.status);
    if(report.status==='FAIL') process.exitCode=1;
  } else if(operation==='seal') {
    const files={contracts:{staticReport:'pr357-static-contracts.json'},native:{nativeReport:'pr357-native-catalog.json',nativeCleanup:'pr357-native-catalog-cleanup.json'},supabase:{supabaseReport:'pr357-supabase-catalog.json',supabaseCleanup:'pr357-supabase-cleanup.json'}}[role];
    assert.ok(files,'Unknown evidence role');
    const bundle=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,json(join('reports',file))]));
    write('reports/composite-'+role+'.json',bundle); output('digest',digestEvidence(bundle));
  } else if(operation==='gate') {
    const context=ciContext();
    const read=(role)=>json(join('evidence',role,'composite-'+role+'.json'));
    const bundle={...read('contracts'),...read('native'),...read('supabase')};
    const result=validateCompositeEvidence({root:process.cwd(),context,...bundle,jobs:JSON.parse(process.env.PR357_JOBS),digests:JSON.parse(process.env.PR357_DIGESTS)});
    write('reports/pr357-composite-result.json',result); console.log(JSON.stringify(result)); output('status','PASS');
  } else throw new Error('Usage: static | seal contracts|native|supabase | gate');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main(process.argv[2],process.argv[3]).catch(()=>{console.error('Composite migration validation FAIL; no replay/evidence omission is accepted.');process.exitCode=1;});
