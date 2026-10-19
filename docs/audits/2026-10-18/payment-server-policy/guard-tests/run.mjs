import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const postgres=(await import('postgres')).default;
const dir=resolve('docs/audits/2026-10-18/payment-server-policy/guard-tests');
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw Error('Usage: node run.mjs before|after [candidate.sql]');
const candidate=phase==='after'?resolve(process.argv[3]??'drizzle/migrations/0103_canonical_payment_invoice_currency.sql'):null;
const candidateBytes=candidate?readFileSync(candidate):null;
const caseBytes=readFileSync(resolve(dir,'cases.sql'));
const notices=[];
const sql=postgres({host:'127.0.0.1',port:55441,database:'liftgo_payment_guard_policy_fixture',username:'postgres',max:1,prepare:false,onnotice:n=>{notices.push(n.message);if(/^(PASS|FAIL) /.test(n.message))console.log(n.message);}});
const read=f=>readFileSync(resolve(dir,f),'utf8').replace(/^\\.*$/gm,'');
const hash=s=>createHash('sha256').update(s).digest('hex');
mkdirSync(resolve(dir,'results'),{recursive:true});
try{
 const [target]=await sql`SELECT current_database() AS database,inet_server_addr()::text AS host,inet_server_port() AS port,version() AS version`;
 if(target.database!=='liftgo_payment_guard_policy_fixture'||target.host!=='127.0.0.1/32'||target.port!==55441)throw Error(`Unexpected local target ${JSON.stringify(target)}`);
 console.log(JSON.stringify({phase,target,candidate}));
 await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public;');
 for(const file of ['baseline/fixture-schema.sql','fixture-additions.sql','baseline/extracted-functions.sql','baseline/current-catalog-functions.sql','baseline/installed-triggers.sql','baseline/invoice-integrity-trigger.sql','baseline/projected-balance-view.sql'])await sql.unsafe(read(file));
 await sql.unsafe('GRANT SELECT ON public.fixture_invoice_balance TO authenticated'); // Fixture projection only; not product ACL.
 const beforeDefinitions=await sql`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname`;
 if(candidateBytes)await sql.unsafe(candidateBytes.toString('utf8'));
 await sql.unsafe(caseBytes.toString('utf8').replace(/^\\.*$/gm,''));
 const attempts=await sql`SELECT * FROM fixture_attempts ORDER BY case_id`;
 const observations=await sql`SELECT * FROM fixture_observations ORDER BY case_id`;
 const installed=await sql`SELECT tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`;
 const definitions=await sql`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname`;
 const unchanged=['prevent_payment_delete_when_rep_stamped','prevent_payment_mutation_when_rep_stamped','round_payment_amount','trg_payment_date_window','trg_guard_payment_fiscal_period','guard_fiscal_period_open'];
 const preserved=unchanged.map(name=>{const before=beforeDefinitions.find(f=>f.proname===name),after=definitions.find(f=>f.proname===name);return {name,unchanged:!!before&&!!after&&before.definition===after.definition};});
 const expectedIds=[...caseBytes.toString('utf8').matchAll(/^SELECT guard_expect\('([^']+)'/gm)].map(m=>m[1]).sort();
 if(expectedIds.length!==69||new Set(expectedIds).size!==69||JSON.stringify(expectedIds)!==JSON.stringify(attempts.map(t=>t.case_id)))throw Error('Expected all 69 unique matrix case IDs');
 if(phase==='after'){
  const before=JSON.parse(readFileSync(resolve(dir,'results','before.json'),'utf8'));
  if(before.summary.cases_sha256!==hash(caseBytes)||JSON.stringify(before.attempts.map(t=>t.case_id))!==JSON.stringify(expectedIds))throw Error('Before/after matrices differ');
 }
 const summary={phase,total:attempts.length,passed:attempts.filter(x=>x.passed).length,failed:attempts.filter(x=>!x.passed).length,target,cases_sha256:hash(caseBytes),candidate:candidateBytes?{path:candidate,sha256:hash(candidateBytes)}:null,preserved};
 writeFileSync(resolve(dir,'results',`${phase}.json`),JSON.stringify({summary,attempts,observations,installed,definitions},null,2)+'\n');
 writeFileSync(resolve(dir,'results',`${phase}-notices.txt`),notices.join('\n')+'\n');
 console.log(JSON.stringify(summary,null,2));
 if(summary.failed||preserved.some(f=>!f.unchanged))process.exitCode=1;
}finally{await sql.end({timeout:5});}
