import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const postgres=(await import('postgres')).default;
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw Error('Usage: concurrency.mjs before|after; run corresponding matrix first');
const dir=resolve('docs/audits/2026-10-18/payment-server-policy/guard-tests');
const options={host:'127.0.0.1',port:55441,database:'liftgo_payment_guard_policy_fixture',username:'postgres',max:1,prepare:false,onnotice:()=>{}};
const admin=postgres(options),a=postgres(options),b=postgres(options);
const invoice=n=>`'20000000-0000-0000-0000-${String(n).padStart(12,'0')}'::uuid`;
const payment=n=>`'30000000-0000-0000-0000-${String(n).padStart(12,'0')}'::uuid`;
const insert=(n,amount)=>`INSERT INTO payments(invoice_id,amount,currency,exchange_rate,payment_date,organization_id) VALUES(${invoice(n)},${amount},'USD',1,'2026-09-01','10000000-0000-0000-0000-000000000002')`;
const update=(id,amount)=>`UPDATE payments SET amount=${amount} WHERE id=${payment(id)}`;
const cases=[
 {name:'insert-insert',invoice:900,a:insert(900,60),b:insert(900,60),count:1,total:60,amounts:['60']},
 {name:'update-update',invoice:901,a:update(9011,50),b:update(9012,60),count:2,total:90,amounts:['40','50']},
 {name:'insert-update',invoice:902,a:insert(902,50),b:update(9021,60),count:2,total:90,amounts:['40','50']},
 {name:'update-insert',invoice:903,a:update(9031,60),b:insert(903,50),count:1,total:60,amounts:['60']}
];
const results=[];
const assert=(ok,message)=>{if(!ok)throw Error(message);};
try{
 const matrix=JSON.parse(readFileSync(resolve(dir,'results',`${phase}.json`),'utf8'));
 const [target]=await admin`SELECT current_database() AS database,inet_server_addr()::text AS host,inet_server_port() AS port`;
 assert(target.database===options.database&&target.host==='127.0.0.1/32'&&target.port===55441,'Unexpected local target');
 const liveDefinitions=await admin`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname`;
 assert(JSON.stringify(liveDefinitions)===JSON.stringify(matrix.definitions),'Live function definitions differ from the corresponding matrix evidence');
 for(const connection of [a,b])await connection.unsafe(`SET ROLE authenticated; SELECT set_config('fixture.user_id','10000000-0000-0000-0000-000000000001',false),set_config('fixture.organization_id','10000000-0000-0000-0000-000000000002',false); SET statement_timeout='20s'; SET lock_timeout='15s';`);
 const [aPid]=await a`SELECT pg_backend_pid() AS pid`;
 const [bPid]=await b`SELECT pg_backend_pid() AS pid`;
 for(const test of cases){
  let inA=false,inB=false;
  try{
   await a.unsafe('BEGIN');inA=true;
   await b.unsafe('BEGIN');inB=true;
   const aResult=await a.unsafe(test.a);
   assert(aResult.count===1,`${test.name}: first mutation must affect 1 row`);
   const started=Date.now();
   const pending=b.unsafe(test.b).then(r=>({state:'00000',count:r.count,message:''}),e=>({state:e.code,message:e.message}));
   let blocking;
   do{
    [blocking]=await admin`SELECT pg_blocking_pids(${bPid.pid}) AS pids,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=${bPid.pid}`;
    if(blocking?.pids.includes(aPid.pid))break;
    await new Promise(resolve=>setTimeout(resolve,40));
   }while(Date.now()-started<5000);
   assert(blocking?.pids.includes(aPid.pid),`${test.name}: second session did not block behind first invoice mutation`);
   await a.unsafe('COMMIT');inA=false;
   const rejected=await pending;
   await b.unsafe('ROLLBACK');inB=false;
   assert(rejected.state==='23514'&&/Sobrepago rechazado/.test(rejected.message),`${test.name}: expected overpayment rejection; got ${JSON.stringify(rejected)}`);
   const [stored]=await admin.unsafe(`SELECT count(*)::int AS count,sum(amount)::text AS total,array_agg(amount::text ORDER BY amount) AS amounts FROM payments WHERE invoice_id=${invoice(test.invoice)}`);
   const [status]=await admin.unsafe(`SELECT status,paid_at FROM invoices WHERE id=${invoice(test.invoice)}`);
   assert(stored.count===test.count&&Number(stored.total)===test.total&&JSON.stringify(stored.amounts.map(Number))===JSON.stringify(test.amounts.map(Number)),`${test.name}: unexpected persisted rows ${JSON.stringify(stored)}`);
   assert(status.status==='partial'&&status.paid_at===null,`${test.name}: incorrect invoice status ${JSON.stringify(status)}`);
   results.push({name:test.name,passed:true,blocking,first_pid:aPid.pid,second_pid:bPid.pid,second:rejected,stored,status});
   console.log(`PASS ${test.name}: second session blocked, then 23514; persisted ${stored.total}/100, ${stored.count} row(s)`);
  }finally{
   if(inA)await a.unsafe('ROLLBACK');
   if(inB)await b.unsafe('ROLLBACK');
  }
 }
 const [functionText]=await admin`SELECT pg_get_functiondef('public.enforce_payment_within_invoice_total()'::regprocedure) AS definition`;
 const result={phase,target,matrix_candidate:matrix.summary.candidate,guard_definition_sha256:createHash('sha256').update(functionText.definition).digest('hex'),total:results.length,passed:results.filter(r=>r.passed).length,cases:results};
 writeFileSync(resolve(dir,'results',`${phase}-concurrency.json`),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({phase,total:result.total,passed:result.passed,target},null,2));
}finally{await Promise.all([admin.end({timeout:5}),a.end({timeout:5}),b.end({timeout:5})]);}
