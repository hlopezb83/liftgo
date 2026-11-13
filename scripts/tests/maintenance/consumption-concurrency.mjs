import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// No connection is opened on import. The caller must own a newly replayed local
// cluster; this test never accepts a URL, session identity or production fixture.
export async function runMaintenanceConsumptionConcurrency(sql, clusterDirectory) {
  assert.ok(path.resolve(clusterDirectory).startsWith(path.resolve(process.cwd(), '.local') + path.sep));
  assert.match(path.basename(clusterDirectory), /^full-replay-\d+$/);
  assert.equal(path.resolve((await sql`SHOW data_directory`)[0].data_directory), path.resolve(clusterDirectory, 'data'));
  assert.equal((await sql`SELECT count(*)::int n FROM organizations WHERE slug='consumption-0146-a'`)[0].n, 0);
  await sql.unsafe(readFileSync('scripts/tests/maintenance/consumption-fixture.sql', 'utf8'));
  const id = n => `14600000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const c=await sql.reserve(), a=await sql.reserve(), b=await sql.reserve();
  const pidA=(await a`SELECT pg_backend_pid() pid`)[0].pid;
  const pidB=(await b`SELECT pg_backend_pid() pid`)[0].pid;
  const begin=async(client,user=11)=>{
    await client`BEGIN`;
    await client`SET LOCAL statement_timeout='10s'`;
    await client`SET LOCAL ROLE authenticated`;
    await client`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:id(user),role:'authenticated'})},true)`;
    assert.equal((await client`SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user`)[0].rolbypassrls,false);
  };
  const add=(client,log=50,quantity=1,part=40)=>client`SELECT public.add_maintenance_part_quantity(${id(log)}::uuid,${id(part)}::uuid,${quantity}::integer) AS result`;
  const settle=promise=>promise.then(rows=>({rows}),error=>({error}));
  const blocked=async()=>{
    for(let i=0;i<250;i++) {
      const [row]=await c`SELECT wait_event_type,pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE pid=${pidB}`;
      if(row?.wait_event_type==='Lock' && row.blockers.includes(pidA))return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    throw new Error('Second real PostgreSQL backend did not wait for the first');
  };
  let passed=0;
  const pass=name=>{passed++;console.log('PASS full-schema concurrency '+name);};
  try {
    await begin(a); await add(a);
    await begin(b); const second=settle(add(b,50,2));
    await blocked(); await a`COMMIT`;
    const result=await second; assert.ifError(result.error); await b`COMMIT`;
    assert.equal(result.rows[0].result.quantity_used,4);
    assert.equal((await c`SELECT count(*)::int n FROM maintenance_parts WHERE maintenance_log_id=${id(50)} AND part_id=${id(40)}`)[0].n,1);
    assert.equal((await c`SELECT stock_quantity FROM parts_inventory WHERE id=${id(40)}`)[0].stock_quantity,6);
    pass('two increments keep one line and both quantities');

    await begin(a); await add(a);
    await begin(b); const afterRollback=settle(add(b));
    await blocked(); await a`ROLLBACK`;
    const rolled=await afterRollback; assert.ifError(rolled.error); await b`COMMIT`;
    assert.equal(rolled.rows[0].result.quantity_used,5);
    assert.equal((await c`SELECT stock_quantity FROM parts_inventory WHERE id=${id(40)}`)[0].stock_quantity,5);
    pass('rolled-back writer does not duplicate quantity or stock');

    await c`BEGIN`;
    await c`SELECT set_config('app.organization_id',${id(1)},true)`;
    await c`INSERT INTO parts_inventory(id,name,sku,stock_quantity,unit_cost) VALUES(${id(46)},'Last item','CONSUMPTION-LAST',1,80)`;
    await c`COMMIT`;
    await begin(a); await add(a,50,1,46);
    await begin(b); const lastItem=settle(add(b,51,1,46));
    await blocked(); await a`COMMIT`;
    const insufficient=await lastItem; await b`ROLLBACK`;
    assert.equal(insufficient.error?.code,'23514');
    assert.match(insufficient.error.message,/Existencias insuficientes/);
    assert.equal((await c`SELECT stock_quantity FROM parts_inventory WHERE id=${id(46)}`)[0].stock_quantity,0);
    assert.equal((await c`SELECT count(*)::int n FROM maintenance_parts WHERE part_id=${id(46)}`)[0].n,1);
    pass('different orders cannot oversell the last item');

    await begin(a,10); await a`SELECT public.soft_delete_maintenance_log(${id(51)}::uuid)`;
    await begin(b); const archived=settle(add(b,51,1,41));
    await blocked(); await a`COMMIT`;
    const rejected=await archived; await b`ROLLBACK`;
    assert.equal(rejected.error?.code,'23514'); assert.match(rejected.error.message,/archivada/);
    assert.equal((await c`SELECT quantity_used FROM maintenance_parts WHERE id=${id(61)}`)[0].quantity_used,1);
    pass('archive committed during wait blocks stale consumption');

    await begin(a); await a`UPDATE maintenance_logs SET work_status='completed',performed_at=public.today_mty() WHERE id=${id(50)}`;
    await begin(b); const closed=settle(add(b));
    await blocked(); await a`COMMIT`;
    const terminal=await closed; await b`ROLLBACK`;
    assert.equal(terminal.error?.code,'23514'); assert.match(terminal.error.message,/completed/);
    assert.equal((await c`SELECT quantity_used FROM maintenance_parts WHERE id=${id(60)}`)[0].quantity_used,5);
    pass('close committed during wait blocks stale consumption');
    console.log(`Maintenance full-schema concurrency: ${passed}/5. Real authenticated roles, RLS, helpers and stock/cost triggers.`);
  } finally {
    await Promise.allSettled([a,b,c].map(async client=>{try{await client`ROLLBACK`;}finally{client.release();}}));
  }
}
