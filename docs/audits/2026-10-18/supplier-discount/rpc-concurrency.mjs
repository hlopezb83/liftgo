import assert from "node:assert/strict";
import postgres from "postgres";

// Fixed disposable target. No environment configuration, secrets or remote URL.
const sql=postgres({host:"127.0.0.1",port:55438,database:"liftgo_k1_fixture_v3",username:"postgres",max:3,prepare:false,connect_timeout:5});
const bill="00000000-0000-4000-8000-000000000201";
const payment="00000000-0000-4000-8000-000000000401";
const claims=JSON.stringify({sub:"00000000-0000-4000-8000-000000000001",role:"authenticated"});
const defer=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
async function context(tx,authenticated=false){
  if(authenticated) await tx`SET LOCAL ROLE authenticated`;
  await tx`SELECT set_config('request.jwt.claims',${claims},true)`;
}
async function contend(label,firstOperation,secondOperation){
  const firstReady=defer(),secondReady=defer(),release=defer();
  let firstPid,secondPid;
  const first=sql.begin(async(tx)=>{
    [{pid:firstPid}]=await tx`SELECT pg_backend_pid() AS pid`;
    await firstOperation(tx);
    firstReady.resolve();
    await release.promise;
  });
  first.catch(firstReady.reject);
  let second;
  try{
    await firstReady.promise;
    second=sql.begin(async(tx)=>{
      [{pid:secondPid}]=await tx`SELECT pg_backend_pid() AS pid`;
      secondReady.resolve();
      await secondOperation(tx);
    }).then(()=>({success:true}),(error)=>{secondReady.reject(error);return {error};});
    await secondReady.promise;
    let blocked=false;
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){
      const [{blockers}]=await sql`SELECT pg_blocking_pids(${secondPid}::integer) AS blockers`;
      if(blockers.includes(firstPid)){blocked=true;break;}
      await sleep(40);
    }
    assert.equal(blocked,true,`${label}: second transaction must wait on first bill lock`);
    release.resolve();
    await first;
    const result=await second;
    assert.equal(result.error?.code,"23514",`${label}: waiter must reject after re-reading committed state`);
    console.log(`PASS ${label}: actual pg_blocking_pids confirms waiting; waiter rejects SQLSTATE 23514 after commit`);
  }finally{
    release.resolve();
    await Promise.allSettled([first,second]);
  }
}
async function reset(){
  await sql.begin(async(tx)=>{
    await context(tx);
    await tx`DELETE FROM public.supplier_payments WHERE id=${payment}::uuid`;
  });
  await sql.begin(async(tx)=>{
    await context(tx,true);
    await tx`SELECT public.update_supplier_bill_details(${bill}::uuid,'{"subtotal":100,"discount":0,"total":100}'::jsonb)`;
  });
}
let verified=false;
try{
  const [target]=await sql`SELECT current_database() AS database,host(inet_server_addr()) AS host,inet_server_port() AS port`;
  assert.deepEqual(target,{database:"liftgo_k1_fixture_v3",host:"127.0.0.1",port:55438});
  verified=true;
  await reset();
  await contend("payment first -> RPC waits, then rejects any payment",async(tx)=>{
    // Synthetic privileged writer exercises the exact real BEFORE/AFTER payment
    // triggers. This is not the full register_supplier_payment RPC or API.
    await context(tx);
    await tx`INSERT INTO public.supplier_payments(id,bill_id,amount,organization_id) VALUES(${payment}::uuid,${bill}::uuid,10,'00000000-0000-4000-8000-000000000101'::uuid)`;
  },async(tx)=>{
    await context(tx,true);
    await tx`SELECT public.update_supplier_bill_details(${bill}::uuid,'{"discount":10,"total":90}'::jsonb)`;
  });
  const [paid]=await sql`SELECT discount,total,balance,status FROM public.supplier_bills WHERE id=${bill}::uuid`;
  assert.equal(Number(paid.discount),0);assert.equal(Number(paid.total),100);assert.equal(Number(paid.balance),90);assert.equal(paid.status,"partial");
  console.log("PASS payment-first persistence: discount=0 total=100 paid=10 balance=90 status=partial");
  await reset();
  await contend("RPC first -> payment guard waits, then rejects overpayment",async(tx)=>{
    await context(tx,true);
    await tx`SELECT public.update_supplier_bill_details(${bill}::uuid,'{"discount":10,"total":90}'::jsonb)`;
  },async(tx)=>{
    await context(tx);
    await tx`INSERT INTO public.supplier_payments(id,bill_id,amount,organization_id) VALUES(${payment}::uuid,${bill}::uuid,95,'00000000-0000-4000-8000-000000000101'::uuid)`;
  });
  const [edited]=await sql`SELECT discount,total,balance FROM public.supplier_bills WHERE id=${bill}::uuid`;
  assert.equal(Number(edited.discount),10);assert.equal(Number(edited.total),90);assert.equal(Number(edited.balance),90);
  const [{count}]=await sql`SELECT count(*)::integer AS count FROM public.supplier_payments WHERE id=${payment}::uuid`;
  assert.equal(count,0);
  console.log("PASS RPC-first persistence: discount=10 total=90 balance=90; rejected payment absent");
}finally{
  try{if(verified){await reset();console.log("PASS cleanup: synthetic main bill restored through RPC; test payment removed");}}
  finally{await sql.end({timeout:2});}
}
