import assert from 'node:assert/strict';
// Deliberately fail before importing drivers or connecting outside the existing
// disposable CI lane. Never set GITHUB_ACTIONS to bypass this check locally.
if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Requires disposable GitHub Actions full-schema database');
const { ciDatabaseUrl, verifyReplay } = await import('../../ci-drizzle-replay.mjs');
const databaseUrl = ciDatabaseUrl();
const replay = await verifyReplay();
const { default: postgres } = await import('postgres');
const sql = postgres(databaseUrl, { max: 3, connection: { statement_timeout: 15000, lock_timeout: 10000 }, onnotice: () => {} });
const sessions = [];
const uid = n => `12720000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ORG=uid(1), CUSTOMER=uid(2), USER=uid(3);
async function reserve() { const client=await sql.reserve(); const [{pid}]=await client`SELECT pg_backend_pid() AS pid`; const s={client,pid}; sessions.push(s); return s; }
const c=await reserve(), a=await reserve(), b=await reserve();
async function begin(client, role='owner') {
  await client`BEGIN`;
  await client`SELECT set_config('app.organization_id',${ORG},true)`;
  if(role==='authenticated') {
    await client.unsafe('SET LOCAL ROLE authenticated');
    await client`SELECT set_config('request.jwt.claims',${JSON.stringify({role:'authenticated',sub:USER})},true)`;
  } else if(role==='service_role') {
    await client.unsafe('SET LOCAL ROLE service_role');
    await client`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`;
  }
  if(role!=='owner') assert.equal((await client`SELECT current_user AS role`)[0].role,role);
}
const settle=p=>p.then(rows=>({rows}),error=>({error}));
async function blockedBy(waiter, blocker) {
  for(let i=0;i<250;i++) {
    const [r]=await c.client`SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${waiter}`;
    if(r?.wait_event_type==='Lock' && r.blockers.includes(blocker)) return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw new Error('Second backend did not demonstrably wait for the first backend');
}
async function snapshot() {
  const result={};
  for(const table of ['invoices','invoice_bookings','booking_extensions','quotes','damage_records'])
    result[table]=await c.client.unsafe(`SELECT to_jsonb(t) AS row FROM public.${table} t WHERE organization_id=$1 ORDER BY to_jsonb(t)::text`,[ORG]);
  result.assignments=await c.client`SELECT to_jsonb(t) AS row FROM public.quote_assigned_forklifts t JOIN public.quotes q ON q.id=t.quote_id WHERE q.organization_id=${ORG} ORDER BY to_jsonb(t)::text`;
  result.forklifts=await c.client`SELECT to_jsonb(t) AS row FROM public.forklifts t WHERE organization_id=${ORG} ORDER BY to_jsonb(t)::text`;
  return result;
}
async function seed(n) {
  await begin(c.client);
  await c.client`INSERT INTO public.forklifts(id,name,model,status,organization_id) VALUES (${uid(n+1000)},${`SOURCE-CI-${n}`},'Synthetic','available',${ORG})`;
  await c.client`INSERT INTO public.bookings(id,booking_number,forklift_id,customer_id,start_date,end_date,status,recurring_billing,organization_id)
    VALUES (${uid(n)},${`SOURCE-CI-${n}`},${uid(n+1000)},${CUSTOMER},public.today_mty()-10,public.today_mty()+10,'confirmed',false,${ORG})`;
  await c.client`COMMIT`;
}
async function save(client,n,{extension=null,quote=null,version=null}={}) {
  const [{start,end}]=await client`SELECT (public.today_mty()+1)::text AS start,(public.today_mty()+10)::text AS end`;
  const payload={booking_id:uid(n),customer_id:CUSTOMER,customer_name:'Synthetic source CI',quote_id:quote,
    line_items:[{description:'Synthetic rent',line_kind:'rental',quantity:10,unit_price:10,total:100,objeto_imp:'02'}],
    subtotal:100,tax_rate:16,tax_amount:16,total:116,moneda:'MXN',tipo_cambio:1,billing_period_start:start,billing_period_end:end};
  return client`SELECT * FROM public.save_invoice_with_sources(${client.json(payload)}::jsonb,${[uid(n)]}::uuid[],NULL,NULL,NULL,${extension}::uuid,${quote}::uuid,${version}::integer)`;
}
const saleLine={description:'Synthetic lift - Venta de equipo',quantity:1,unit_price:100,total:100,objeto_imp:'02'};
async function seedSale(n) {
  const quote=uid(n),forklift=uid(n+1);
  await begin(c.client);
  await c.client`INSERT INTO public.forklifts(id,name,model,status,organization_id) VALUES (${forklift},${`SOURCE-SALE-${n}`},'Synthetic','available',${ORG})`;
  await c.client`INSERT INTO public.quotes(id,quote_number,customer_id,customer_name,quote_type,status,line_items,subtotal,tax_amount,total,organization_id,valid_until)
    VALUES (${quote},${`SOURCE-SALE-Q-${n}`},${CUSTOMER},'Synthetic source CI','sale','draft',${c.client.json([saleLine])}::jsonb,100,16,116,${ORG},public.today_mty()+30)`;
  await c.client`UPDATE public.quotes SET status='sent' WHERE id=${quote}`;
  await c.client`COMMIT`;
  await begin(c.client,'authenticated');
  await c.client`UPDATE public.quotes SET status='accepted',accepted_at=now(),accepted_by_user_id=${USER} WHERE id=${quote}`;
  await c.client`SELECT public.assign_forklift_to_sale_quote(${quote}::uuid,${[forklift]}::uuid[],ARRAY[0])`;
  await c.client`COMMIT`;
  const [{version}]=await c.client`SELECT version FROM public.quotes WHERE id=${quote}`;
  return {quote,version};
}
async function saveSale(client,{quote,version}) {
  const payload={customer_id:CUSTOMER,customer_name:'Synthetic source CI',quote_id:quote,
    line_items:[saleLine],subtotal:100,tax_rate:16,tax_amount:16,total:116,moneda:'MXN',tipo_cambio:1};
  return client`SELECT * FROM public.save_invoice_with_sources(${client.json(payload)}::jsonb,ARRAY[]::uuid[],NULL,NULL,NULL,NULL,${quote}::uuid,${version}::integer)`;
}

try {
  assert.equal((await c.client`SELECT count(*)::int AS n FROM public.organizations WHERE id=${ORG}`)[0].n,0,'Fixture must not preexist');
  assert.equal((await c.client`SELECT count(*)::int AS n FROM auth.users WHERE id=${USER}`)[0].n,0,'Fixture user must not preexist');
  await begin(c.client);
  await c.client`INSERT INTO public.organizations(id,name,slug) VALUES (${ORG},'Synthetic source concurrency','source-concurrency-ci-1272')`;
  await c.client`INSERT INTO auth.users(id,email,created_at,updated_at) VALUES (${USER},'source-concurrency-ci@example.invalid',now(),now())`;
  await c.client`INSERT INTO public.user_roles(user_id,role) VALUES (${USER},'admin') ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role`;
  await c.client`INSERT INTO public.organization_memberships(organization_id,auth_user_id,member_type) VALUES (${ORG},${USER},'internal')`;
  await c.client`INSERT INTO public.customers(id,name,created_by_organization_id) VALUES (${CUSTOMER},'Synthetic source CI',${ORG})`;
  await c.client`INSERT INTO public.organization_customers(organization_id,customer_id) VALUES (${ORG},${CUSTOMER})`;
  await c.client`COMMIT`;
  let index=0;
  for(const role of ['authenticated','service_role']) {
    const n=10+index++*100, ext=uid(n+1), quote=uid(n+2);
    await seed(n);
    await begin(c.client);
    await c.client`INSERT INTO public.booking_extensions(id,booking_id,original_end_date,new_end_date,organization_id)
      VALUES (${ext},${uid(n)},public.today_mty(),public.today_mty()+10,${ORG})`;
    await c.client`COMMIT`;
    await begin(a.client,role);
    const winner=await save(a.client,n,{extension:ext});
    assert.equal(winner.length,1);
    await begin(b.client,role);
    const waiting=settle(save(b.client,n,{extension:ext}));
    await blockedBy(b.pid,a.pid);
    await a.client`COMMIT`;
    const winnerState=await snapshot();
    const loser=await waiting;
    assert.ok(loser.error,'Second extension claimant must fail');
    assert.equal(loser.error.code,'23505');
    if (loser.error.constraint_name !== 'invoices_booking_period_uniq') {
      assert.match(loser.error.message,/cobertura|superpuest|superpon|extensión ya está reservada/i);
    }
    await b.client`ROLLBACK`;
    assert.deepEqual(await snapshot(),winnerState,'Losing extension call must leave no business row changes');
    const invoices=await c.client`SELECT id FROM public.invoices WHERE organization_id=${ORG} AND booking_id=${uid(n)}`;
    assert.deepEqual(invoices.map(r=>r.id),[winner[0].id]);
    const pivots=await c.client`SELECT invoice_id FROM public.invoice_bookings WHERE organization_id=${ORG} AND booking_id=${uid(n)}`;
    assert.deepEqual(pivots.map(r=>r.invoice_id),[winner[0].id]);
    const [extension]=await c.client`SELECT pending_invoice_id,invoice_id,billed_at FROM public.booking_extensions WHERE id=${ext}`;
    assert.deepEqual(extension,{pending_invoice_id:winner[0].id,invoice_id:null,billed_at:null});
    console.log(`PASS full-schema source ${role}: competing extension, one winner and no loser invoice/pivot`);

    await seed(n+10);
    await begin(c.client);
    await c.client`INSERT INTO public.quotes(id,quote_number,customer_id,customer_name,status,subtotal,tax_amount,total,organization_id,valid_until)
      VALUES (${quote},${`SOURCE-CI-Q-${n}`},${CUSTOMER},'Synthetic source CI','draft',100,16,116,${ORG},public.today_mty()+30)`;
    await c.client`UPDATE public.quotes SET status='sent' WHERE id=${quote}`;
    await c.client`COMMIT`;
    const [{version}]=await c.client`SELECT version FROM public.quotes WHERE id=${quote}`;
    const before=await snapshot();
    await begin(a.client,role);
    await a.client`UPDATE public.quotes SET notes='Synthetic concurrent edit' WHERE id=${quote}`;
    const [updatedQuote]=await a.client`SELECT to_jsonb(q) AS row FROM public.quotes q WHERE id=${quote}`;
    assert.ok(updatedQuote.row.version>version);
    await begin(b.client,role);
    const staleWaiting=settle(save(b.client,n+10,{quote,version}));
    await blockedBy(b.pid,a.pid);
    await a.client`COMMIT`;
    const stale=await staleWaiting;
    assert.equal(stale.error?.code,'55000',stale.error?.message);
    assert.match(stale.error.message,/stale_write/);
    await b.client`ROLLBACK`;
    const after=await snapshot();
    before.quotes=before.quotes.map(r=>r.row.id===quote?updatedQuote:r);
    // Ordering is stable by JSON text; sort explicitly after the expected edit.
    const ordered=rows=>rows.map(r=>JSON.stringify(r)).sort();
    for(const table of Object.keys(before)) assert.deepEqual(ordered(after[table]),ordered(before[table]),`Unexpected persisted ${table} after stale rejection`);
    console.log(`PASS full-schema source ${role}: concurrent quote edit yields stale_write with no save residue`);
  }
  // Two forms capture the same accepted sale/version before either save.
  // No booking or billing period: cannot pass via the extension uniqueness guard.
  for(const [index,role] of ['authenticated','service_role'].entries()) {
    const source=await seedSale(500+index*100);
    await begin(a.client,role);
    const winner=await saveSale(a.client,source);
    assert.equal(winner.length,1);
    assert.equal(winner[0].status,'draft');
    assert.equal(Number(winner[0].total),116);
    await a.client`COMMIT`;
    const winnerState=await snapshot();
    await begin(b.client,role);
    const loser=await settle(saveSale(b.client,source));
    // Always roll back the probe, even while the production defect still exists.
    await b.client`ROLLBACK`;
    assert.ok(loser.error,'Duplicate accepted sale must be rejected; second form unexpectedly saved a draft');
    assert.equal(loser.error.code,'23505',loser.error.message);
    assert.equal(loser.error.constraint_name,'sale_quote_active_invoice_unique');
    assert.deepEqual(await snapshot(),winnerState,'Rejected duplicate sale must preserve all business rows');
    const invoices=await c.client`SELECT id FROM public.invoices WHERE organization_id=${ORG} AND quote_id=${source.quote}`;
    assert.deepEqual(invoices.map(r=>r.id),[winner[0].id]);
    assert.equal((await c.client`SELECT count(*)::int AS n FROM public.invoice_bookings WHERE invoice_id=${winner[0].id}`)[0].n,0);
    console.log(`PASS full-schema source ${role}: accepted sale rejects second prefilled form without residue`);
  }
  for(const [index,role] of ['authenticated','service_role'].entries()) {
    const source=await seedSale(800+index*100);
    await begin(a.client,role);
    const winner=await saveSale(a.client,source);
    assert.equal(winner.length,1);
    await begin(b.client,role);
    const waiting=settle(saveSale(b.client,source));
    await blockedBy(b.pid,a.pid);
    await a.client`COMMIT`;
    const winnerState=await snapshot();
    const loser=await waiting;
    await b.client`ROLLBACK`;
    assert.ok(loser.error,'Concurrent sale claimant must fail');
    assert.equal(loser.error.code,'23505',loser.error.message);
    assert.equal(loser.error.constraint_name,'sale_quote_active_invoice_unique');
    assert.deepEqual(await snapshot(),winnerState,'Concurrent losing sale must leave no business changes');
    const invoices=await c.client`SELECT id FROM public.invoices WHERE organization_id=${ORG} AND quote_id=${source.quote}`;
    assert.deepEqual(invoices.map(r=>r.id),[winner[0].id]);
    console.log(`PASS full-schema source ${role}: competing accepted sale, one winner and no loser residue`);
  }
  console.log(`Source concurrency: 8/8, replay ${replay.count}; real roles and all replayed guards. No PAC.`);
} finally {
  await Promise.allSettled(sessions.map(async({client})=>{try{await client`ROLLBACK`;}finally{client.release();}}));
  await sql.end({timeout:5});
}
