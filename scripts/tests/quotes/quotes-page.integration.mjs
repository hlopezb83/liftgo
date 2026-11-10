import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const directory = process.env.QUOTES_TEST_CLUSTER;
const port = Number(process.env.QUOTES_TEST_PORT);
assert.ok(directory?.startsWith(path.join('/tmp', 'liftgo-quotes-pg-')));
assert.ok(Number.isInteger(port) && port > 1024 && port <= 65535);
globalThis.fetch = () => { throw new Error('Network is forbidden in quote SQL tests'); };
const sql = postgres({ host: '127.0.0.1', port, username: 'postgres', password: '', database: 'postgres', ssl: false, max: 6, onnotice: () => {} });
const uid = n => `12900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG = uid(1), OTHER = uid(2), INACTIVE = uid(3), USER = uid(11), USER_B = uid(12), NONE = uid(13), PORTAL = uid(14), SUSPENDED = uid(15), AMBIGUOUS = uid(16), NO_MEMBER = uid(17), MIXED = uid(18), NO_ROLE = uid(19), OLD = uid(1000);
const reports = [];
const migration = readFileSync('drizzle/migrations/0129_quotes_server_page.sql', 'utf8');
const projection = ['id','quote_number','customer_id','customer_name','forklift_id','start_date','end_date','subtotal','tax_rate','tax_amount','total','status','valid_until','quote_type','currency','tipo_cambio'].sort();
async function test(name, run) { const start=Date.now(); await run(); reports.push({name, passed:true,ms:Date.now()-start}); console.log(`PASS ${name}`); }
async function session(user, run, role='authenticated') {
  const c = await sql.reserve();
  try {
    await c`BEGIN`;
    await c`SELECT set_config('request.jwt.claims', ${JSON.stringify({sub:user, role})}, true)`;
    await c.unsafe(`SET LOCAL ROLE ${role}`);
    const [identity] = await c`SELECT current_user AS role,current_setting('row_security') AS rls,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass`;
    assert.equal(identity.role,role); assert.equal(identity.rls,'on'); assert.equal(identity.bypass,false);
    return await run(c);
  } finally { await c`ROLLBACK`; c.release(); }
}
async function page(c, options={}) {
  const o={org:ORG,search:null,status:'all',page:0,size:25,sort:[],...options};
  const [result]=await c`SELECT public.get_quotes_page(${o.org}::uuid,${o.search}::text,${o.status}::text,${o.page}::integer,${o.size}::integer,${c.json(o.sort)}::jsonb) AS value`;
  return result.value;
}
async function error(c, run, code) {
  await c`SAVEPOINT expected_failure`;
  let caught;
  try { await run(); } catch(e) { caught=e; }
  await c`ROLLBACK TO SAVEPOINT expected_failure`;
  await c`RELEASE SAVEPOINT expected_failure`;
  assert.equal(caught?.code,code,caught?.message ?? 'Expected SQL failure');
}
async function seed() {
  await sql.unsafe(readFileSync('scripts/tests/quotes/fixture.sql','utf8'));
  // Execute the actual existing helper definition, not a JS organization stub.
  const source=readFileSync('drizzle/migrations/0031_multi_org_audit_hardening.sql','utf8');
  const helper=source.match(/CREATE OR REPLACE FUNCTION public\.current_internal_organization_id\(\)[\s\S]*?\$\$;/)?.[0];
  assert.ok(helper); await sql.unsafe(helper);
  await sql.unsafe(`REVOKE ALL ON FUNCTION public.current_internal_organization_id() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.current_internal_organization_id() TO authenticated;
    CREATE POLICY fixture_org ON public.quotes AS RESTRICTIVE FOR SELECT TO authenticated USING(organization_id=(SELECT public.current_internal_organization_id()));
    CREATE POLICY fixture_hidden ON public.quotes AS RESTRICTIVE FOR SELECT TO authenticated USING(notes IS DISTINCT FROM 'hidden-by-policy');`);
  await sql`INSERT INTO organizations VALUES(${ORG},true),(${OTHER},true),(${INACTIVE},false)`;
  for(const [user,org,type] of [[USER,ORG,'internal'],[USER_B,OTHER,'internal'],[NONE,ORG,'internal'],[PORTAL,ORG,'portal'],[SUSPENDED,INACTIVE,'internal'],[AMBIGUOUS,ORG,'internal'],[AMBIGUOUS,OTHER,'internal'],[MIXED,ORG,'internal'],[MIXED,ORG,'portal'],[NO_ROLE,ORG,'internal']])
    await sql`INSERT INTO organization_memberships VALUES(${org},${user},${type})`;
  for(const [user,role] of [[USER,'admin'],[USER_B,'admin'],[NONE,'mechanic'],[PORTAL,'admin'],[SUSPENDED,'admin'],[AMBIGUOUS,'admin'],[NO_MEMBER,'admin'],[MIXED,'admin']]) await sql`INSERT INTO user_roles VALUES(${user},${role})`;
  await sql`INSERT INTO role_permissions VALUES('admin','Cotizaciones','full'),('mechanic','Cotizaciones','none'),('ventas','Cotizaciones','read')`;
  await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name,status,is_e2e)
    SELECT ('12900000-0000-4000-8000-' || lpad((2000+n)::text,12,'0'))::uuid,${ORG},'COT-'||(1000+n)::text,'QA reciente','draft',false FROM generate_series(1,500) n`;
  await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name,status,created_at,is_e2e) VALUES(${OLD},${ORG},'COT-0445','Antiguo José Muñoz','accepted','2020-01-01Z',NULL),(${uid(1001)},${OTHER},'COT-0445','Otro tenant','accepted','2020-01-01Z',false)`;
  await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name,is_e2e,notes) VALUES(${uid(1002)},${ORG},'COT-E2E','E2E',true,NULL),(${uid(1003)},${ORG},'COT-HIDDEN','Oculta',false,'hidden-by-policy')`;
  await sql.unsafe(migration);
}
try {
  const [identity]=await sql`SELECT current_setting('data_directory') AS directory,version() AS version`;
  assert.equal(identity.directory,path.join(directory,'data'));
  assert.equal((await sql`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)[0].n,0);
  console.log(identity.version);
  await seed();
  await test('INVOKER, safe search_path and exact ACL including inherited service grants',async()=>{
    for(const signature of ['public.get_quotes_page(uuid,text,text,integer,integer,jsonb)','public.normalize_quote_search(text)']) {
      const [r]=await sql`SELECT prosecdef,proconfig,has_function_privilege('authenticated',${signature},'EXECUTE') AS auth,has_function_privilege('anon',${signature},'EXECUTE') AS anon,has_function_privilege('service_role',${signature},'EXECUTE') AS service FROM pg_proc WHERE oid=${signature}::regprocedure`;
      assert.equal(r.prosecdef,false); assert.deepEqual(r.proconfig,['search_path=pg_catalog, public']); assert.equal(r.auth,true);assert.equal(r.anon,false);assert.equal(r.service,false);
    }
    await session(undefined,c=>error(c,()=>page(c),'42501'),'anon');
  });
  await test('501 rows, exact projection, no other tenant/E2E/extra RLS-hidden row',()=>session(USER,async c=>{
    const ids=[];
    for(let n=0;n<6;n++) {const p=await page(c,{page:n,size:100});assert.equal(p.totalCount,501);assert.equal(p.pageIndex,n);ids.push(...p.items.map(q=>q.id));for(const q of p.items) assert.deepEqual(Object.keys(q).sort(),projection);}
    assert.equal(new Set(ids).size,501);assert.equal(ids.length,501);assert.equal(ids.at(-1),OLD);
    assert.ok(!ids.includes(uid(1001))&&!ids.includes(uid(1002))&&!ids.includes(uid(1003)));
  }));
  await test('tenant B sees only its own row and A expectation cannot choose B',()=>session(USER_B,async c=>{
    await error(c,()=>page(c),'42501');const p=await page(c,{org:OTHER});assert.equal(p.totalCount,1);assert.equal(p.items[0].id,uid(1001));
  }));
  await test('missing session/org, portal, inactive, ambiguous, mixed, missing role fail closed',async()=>{
    for(const user of [undefined,PORTAL,SUSPENDED,AMBIGUOUS,NO_MEMBER,MIXED,NO_ROLE]) await session(user,c=>error(c,()=>page(c),'42501'));
    await session(USER,async c=>{await error(c,()=>page(c,{org:null}),'42501');await error(c,()=>page(c,{org:OTHER}),'42501');});
  });
  await test('module none denied even where role RLS can SELECT rows',()=>session(NONE,async c=>{
    assert.equal((await c`SELECT count(*)::int n FROM quotes WHERE is_e2e IS DISTINCT FROM true`)[0].n,501); await error(c,()=>page(c),'42501');
  }));
  await test('effective role priority does not let subordinate read bypass admin none',async()=>{
    await sql`INSERT INTO user_roles VALUES(${USER},'ventas')`;await sql`UPDATE role_permissions SET access_level='none' WHERE role='admin'`;
    try {await session(USER,c=>error(c,()=>page(c),'42501'));} finally {await sql`UPDATE role_permissions SET access_level='full' WHERE role='admin'`;await sql`DELETE FROM user_roles WHERE user_id=${USER} AND role='ventas'`;}
  });
  await test('old folio variants, substring plus status and empty result',()=>session(USER,async c=>{
    for(const search of ['445','0445','COT-0445','cot-445','000445']) {const p=await page(c,{search});assert.ok(p.items.some(q=>q.id===OLD));}
    assert.equal((await page(c,{search:'jose munoz',status:'accepted'})).items[0].id,OLD);
    assert.deepEqual(await page(c,{search:'jose',status:'draft',page:99}),{items:[],totalCount:0,pageIndex:0});
    assert.deepEqual((await page(c,{status:'accepted',page:99})).pageIndex,0);
  }));
  await test('invalid pagination/status/sort and injection fail with 22023',()=>session(USER,async c=>{
    for(const opts of [{page:null},{page:-1},{page:100001},{size:null},{size:0},{size:101},{status:null},{status:'drop table quotes'},{sort:null},{sort:{}},{sort:[null]},{sort:[[]]},{sort:[{id:'total'}]},{sort:[{id:'total',desc:'false'}]},{sort:[{id:'total',desc:false,x:1}]},{sort:[{id:'quote_number); DROP TABLE quotes;--',desc:false}]},{sort:[{id:'total',desc:false},{id:'total',desc:true}]},{sort:Array.from({length:6},()=>({id:'total',desc:false}))},{search:'x'.repeat(257)}]) await error(c,()=>page(c,opts),'22023');
    await error(c,()=>c`SELECT public.get_quotes_page(${ORG}::uuid,NULL,'all',0,25,NULL)`,'22023');
    assert.equal((await c`SELECT count(*)::int n FROM quotes WHERE is_e2e IS DISTINCT FROM true`)[0].n,501);
  }));
  await test('literal SQL metacharacters, Unicode NFC/NFD and large folio stay exact',async()=>{
    const texts=['QA %_*\\, ("x") | .* [a-z] $', 'Jose\u0301 Mun\u0303oz', 'MÜLLER NIÑO', 'Ægir Øresund Łódź Þór Ĳssel Œuvre'];
    for(let i=0;i<texts.length;i++) await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name) VALUES(${uid(3001+i)},${ORG},${`LITERAL-${i}`},${texts[i]})`;
    await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name) VALUES(${uid(3010)},${ORG},'COT-900719925474099312345','Large folio')`;
    await session(USER,async c=>{
      assert.equal((await page(c,{search:texts[0]})).items[0].id,uid(3001));
      assert.equal((await page(c,{search:'muller nino'})).items[0].id,uid(3003));
      assert.equal((await page(c,{search:'AEgir Oresund Lodz Thor IJssel OEuvre'})).items[0].id,uid(3004));
      assert.ok((await page(c,{search:'jose munoz'})).items.some(q=>q.id===uid(3002)));
      assert.equal((await page(c,{search:'000900719925474099312345'})).items[0].quote_number,'COT-900719925474099312345');
    });
  });
  await test('natural order across page boundaries matches legacy comparator in both directions',async()=>{
    const folios=['COT-9999','COT-10000','COT-0009','COT-0010','COT-900719925474099312345','COT-900719925474099312346','QA-2','QA-10','QA-a2','QA-a10'];
    for(let i=0;i<folios.length;i++) await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name) VALUES(${uid(4000+i)},${ORG},${folios[i]},'NATURAL-CORPUS')`;
    await session(USER,async c=>{
      for(const desc of [false,true]) {
        const actual=[];for(let n=0;n<5;n++){const p=await page(c,{search:'NATURAL-CORPUS',sort:[{id:'quote_number',desc}],size:2,page:n});assert.equal(p.totalCount,10);actual.push(...p.items.map(q=>q.quote_number));}
        assert.equal((await page(c,{search:'00010000'})).items[0].quote_number,'COT-10000');
        const expected=[...folios].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true})*(desc?-1:1));assert.deepEqual(actual,expected);
      }
    });
  });
  await test('case/accent/numeric customer order, multi-sort, nulls last and stable tie-break',async()=>{
    const names=['Jose 10','José 2','Alvaro 10','Álvaro 2',null];
    for(let i=0;i<names.length;i++) await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name,total,valid_until) VALUES(${uid(5000+i)},${ORG},${`CUSTOMER-CORPUS-${i}`},${names[i]},${i===4?null:10},${i===4?null:'2026-11-08'})`;
    await session(USER,async c=>{
      for(const desc of [false,true]) {
        const p=await page(c,{search:'CUSTOMER-CORPUS',sort:[{id:'customer_name',desc}],size:100});
        const expected=names.filter(x=>x!==null).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true})*(desc?-1:1));expected.push(null);assert.deepEqual(p.items.map(q=>q.customer_name),expected);
        for(const id of ['total','valid_until']) assert.equal((await page(c,{search:'CUSTOMER-CORPUS',sort:[{id,desc}],size:100})).items.at(-1).id,uid(5004));
      }
      const p=await page(c,{search:'CUSTOMER-CORPUS',sort:[{id:'total',desc:false},{id:'quote_number',desc:false}],size:100});assert.deepEqual(p.items.map(q=>q.id),names.map((_,i)=>uid(5000+i)));
      const ties=await page(c,{search:'CUSTOMER-CORPUS',sort:[{id:'total',desc:false}],size:100});assert.deepEqual(ties.items.slice(0,4).map(q=>q.id),[3,2,1,0].map(i=>uid(5000+i)));
    });
  });
  await test('migration refuses an existing collation with the same name but different semantics',async()=>{
    const c=await sql.reserve();await c`BEGIN`;try{await c.unsafe('DROP COLLATION public.quotes_natural_order; CREATE COLLATION public.quotes_natural_order (provider=icu,locale=\'und\',deterministic=true)');let caught;try{await c.unsafe(migration);}catch(e){caught=e;}assert.equal(caught?.code,'55000');}finally{await c`ROLLBACK`;c.release();}
  });
  await test('count and page share one snapshot while a concurrent writer commits',async()=>{
    await sql.unsafe(`CREATE FUNCTION public.fixture_pause_quote(p_id uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER AS $$
      BEGIN IF current_setting('test.pause_quotes',true)='on' AND p_id='${OLD}'::uuid THEN PERFORM pg_advisory_xact_lock(129129); END IF; RETURN true; END; $$;
      GRANT EXECUTE ON FUNCTION public.fixture_pause_quote(uuid) TO authenticated;
      CREATE POLICY fixture_pause ON public.quotes AS RESTRICTIVE FOR SELECT TO authenticated USING(public.fixture_pause_quote(id));`);
    const blocker=await sql.reserve(), reader=await sql.reserve();
    try {
      await blocker`BEGIN`;await blocker`SELECT pg_advisory_xact_lock(129129)`;
      await reader`BEGIN`;await reader`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:USER,role:'authenticated'})},true)`;
      await reader.unsafe('SET LOCAL ROLE authenticated');await reader`SELECT set_config('test.pause_quotes','on',true)`;
      const [{pid}]=await reader`SELECT pg_backend_pid() AS pid`;
      const waiting=page(reader,{search:'Antiguo',size:100});
      let blocked=false;
      for(let n=0;n<200;n++) {const [r]=await sql`SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=${pid}`;if(r?.wait_event_type==='Lock'&&r.blockers.length){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
      assert.ok(blocked,'Reader must demonstrably block before writer commit');
      await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name,created_at) VALUES(${uid(7000)},${ORG},'COT-NEW-SNAPSHOT','Antiguo agregado','2027-01-01Z')`;
      await blocker`COMMIT`;
      const before=await waiting;assert.equal(before.totalCount,1);assert.deepEqual(before.items.map(q=>q.id),[OLD]);
      await reader`SELECT set_config('test.pause_quotes','off',true)`;
      const after=await page(reader,{search:'Antiguo',size:100});assert.equal(after.totalCount,2);assert.equal(after.items.length,2);
    } finally {await blocker`ROLLBACK`;await reader`ROLLBACK`;blocker.release();reader.release();}
  });
  await test('bounded page remains correct for a larger synthetic organization',async()=>{
    await sql`INSERT INTO quotes(id,organization_id,quote_number,customer_name)
      SELECT ('12900000-0000-4000-8000-'||lpad((100000+n)::text,12,'0'))::uuid,${ORG},'PERF-'||n::text,'PERF-CORPUS' FROM generate_series(1,10000) n`;
    await session(USER,async c=>{const start=Date.now();const result=await page(c,{search:'PERF-CORPUS',sort:[{id:'quote_number',desc:false}],page:99,size:100});assert.equal(result.totalCount,10000);assert.equal(result.items.length,100);assert.equal(result.items[0].quote_number,'PERF-9901');assert.equal(result.items.at(-1).quote_number,'PERF-10000');console.log(`Synthetic10k natural-search page wall time: ${Date.now()-start}ms`);});
  });
  const [collation]=await sql`SELECT collversion,pg_collation_actual_version(oid) AS actual FROM pg_collation WHERE oid='public.quotes_natural_order'::regcollation`;
  mkdirSync('reports/quotes-rpc',{recursive:true});writeFileSync('reports/quotes-rpc/sql-integration.json',JSON.stringify({version:identity.version,collation,scope:'Focused synthetic schema with actual existing organization helper and real PostgreSQL RLS; not full product replay',reports},null,2));
  console.log(`${reports.length}/${reports.length} SQL integration scenarios passed`);
} finally { await sql.end({timeout:5}); }
