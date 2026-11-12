import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
const directory=process.env.INVENTORY_TEST_CLUSTER, port=Number(process.env.INVENTORY_TEST_PORT);
assert.ok(directory && path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('liftgo-inventory-pg-')); assert.ok(port>1024&&port<65536);
globalThis.fetch=()=>{throw Error('No external network in fixture');};
const sql=postgres({host:'127.0.0.1',port,username:'postgres',database:'postgres',ssl:false,onnotice:()=>{}});
const id=n=>`13200000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A=id(1),B=id(2),U=id(11),V=id(12),DENIED=id(13);let passed=0;
async function session(user,run){const c=await sql.reserve();try{await c`BEGIN`;await c`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:user})},true)`;await c`SET LOCAL ROLE authenticated`;assert.equal((await c`SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user`)[0].rolbypassrls,false);return await run(c);}finally{await c`ROLLBACK`;c.release();}}
async function page(c,o={}){
  const p={org:A,search:null,category:'all',page:0,size:25,sort:[],...o};
  if (p.lowStockOnly !== undefined) return (await c`SELECT get_inventory_page(${p.lowStockOnly}::boolean,${p.org}::uuid,${p.search}::text,${p.category}::text,${p.page}::int,${p.size}::int,${c.json(p.sort)}::jsonb) v`)[0].v;
  return(await c`SELECT get_inventory_page(${p.org}::uuid,${p.search}::text,${p.category}::text,${p.page}::int,${p.size}::int,${c.json(p.sort)}::jsonb) v`)[0].v;
}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
try{
assert.equal(path.resolve((await sql`SELECT current_setting('data_directory') v`)[0].v),path.resolve(directory,'data'));
assert.equal((await sql`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)[0].n,0);
await sql.unsafe(readFileSync('scripts/tests/quotes/fixture.sql','utf8'));
const helper=readFileSync('drizzle/migrations/0031_multi_org_audit_hardening.sql','utf8').match(/CREATE OR REPLACE FUNCTION public\.current_internal_organization_id\(\)[\s\S]*?\$\$;/)[0];await sql.unsafe(helper);
await sql.unsafe(readFileSync('drizzle/migrations/0129_quotes_server_page.sql','utf8'));
await sql.unsafe(`CREATE TABLE parts_inventory(id uuid PRIMARY KEY,organization_id uuid NOT NULL,catalog_part_id uuid,name text,sku text,category text,stock_quantity integer,min_stock_level integer,unit_cost numeric,location text,is_active boolean,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()); ALTER TABLE parts_inventory ENABLE ROW LEVEL SECURITY; CREATE POLICY fixture_tenant ON parts_inventory FOR SELECT TO authenticated USING(organization_id=current_internal_organization_id() AND location IS DISTINCT FROM 'hidden'); GRANT SELECT ON parts_inventory TO authenticated;`);
await sql`INSERT INTO organizations VALUES(${A},true),(${B},true)`;
await sql`INSERT INTO organization_memberships VALUES(${A},${U},'internal'),(${B},${V},'internal'),(${A},${DENIED},'internal')`;
await sql`INSERT INTO user_roles VALUES(${U},'admin'),(${V},'auditor'),(${DENIED},'mechanic')`;
await sql`INSERT INTO role_permissions VALUES('admin','Refacciones','full'),('auditor','Refacciones','read'),('mechanic','Refacciones','none')`;
await sql`INSERT INTO parts_inventory(id,organization_id,name,sku,category,stock_quantity,min_stock_level,unit_cost,is_active) SELECT ('13200000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,${A},'A'||lpad(n::text,4,'0'),'SKU-'||n,'Filtros',10,2,100,true FROM generate_series(1,500)n`;
await sql`INSERT INTO parts_inventory(id,organization_id,name,sku,category,stock_quantity,min_stock_level,unit_cost,is_active,location) VALUES(${id(2000)},${A},'Z pieza','TARGET-501','Baterías',0,2,100,true,null),(${id(2001)},${B},'Otra empresa','TARGET-501','Baterías',0,2,100,true,null),(${id(2002)},${A},'Inactiva','INACTIVE','Baterías',0,2,100,false,null),(${id(2003)},${A},'Oculta RLS','HIDDEN','Baterías',0,2,100,true,'hidden')`;
await sql.unsafe(readFileSync('drizzle/migrations/0132_inventory_server_page.sql','utf8'));
await sql.unsafe(readFileSync('drizzle/migrations/0142_0142_inventory_low_stock_filter.sql','utf8'));
await test('501 rows, global KPI, final page clamp',()=>session(U,async c=>{const p=await page(c,{page:100});assert.equal(p.totalCount,501);assert.equal(p.lowStockCount,1);assert.equal(p.pageIndex,20);assert.equal(p.items.length,1);assert.equal(p.items[0].sku,'TARGET-501');}));
await test('search SKU and category before range',()=>session(U,async c=>{for(const o of [{search:'target-501'},{category:'Baterías'}]){const p=await page(c,o);assert.equal(p.totalCount,1);assert.equal(p.items[0].id,id(2000));}}));
await test('KPI independent of filtered empty results',()=>session(U,async c=>{const p=await page(c,{search:'not-found'});assert.equal(p.totalCount,0);assert.equal(p.lowStockCount,1);assert.equal(p.items.length,0);}));
await test('tenant B RLS and read role',()=>session(V,async c=>{const p=await page(c,{org:B});assert.equal(p.totalCount,1);assert.equal(p.items[0].organization_id,B);}));
await test('wrong tenant rejected',async()=>{await assert.rejects(()=>session(U,c=>page(c,{org:B})),{code:'42501'});});
await test('module none rejected',async()=>{await assert.rejects(()=>session(DENIED,c=>page(c)),{code:'42501'});});
await test('invalid input and injected order rejected',async()=>{for(const o of [{page:-1},{size:101},{sort:[{id:'name; DROP TABLE parts_inventory',desc:false}]}])await assert.rejects(()=>session(U,c=>page(c,o)),{code:'22023'});});
await test('literal wildcards and multiple terms',()=>session(U,async c=>{assert.equal((await page(c,{search:'%_'})).totalCount,0);assert.equal((await page(c,{search:'Z pieza'})).totalCount,1);}));
await test('natural SKU ordering across pages',()=>session(U,async c=>{const p=await page(c,{sort:[{id:'sku',desc:false}],size:100});assert.equal(p.items[1].sku,'SKU-2');assert.equal(p.items[99].sku,'SKU-100');}));
await test('ACL and invoker',async()=>{const [p]=await sql`SELECT prosecdef,has_function_privilege('anon','get_inventory_page(uuid,text,text,integer,integer,jsonb)','EXECUTE') anon,has_function_privilege('service_role','get_inventory_page(uuid,text,text,integer,integer,jsonb)','EXECUTE') service FROM pg_proc WHERE oid='get_inventory_page(uuid,text,text,integer,integer,jsonb)'::regprocedure`;assert.equal(p.prosecdef,false);assert.equal(p.anon,false);assert.equal(p.service,false);});
await sql`UPDATE parts_inventory SET stock_quantity=min_stock_level WHERE id=${id(1001)}`;
await test('low stock includes equality, filters before paging and clamps stale page',()=>session(U,async c=>{
  const p=await page(c,{lowStockOnly:true,page:20,size:1});
  assert.equal(p.totalCount,2);assert.equal(p.lowStockCount,2);assert.equal(p.pageIndex,1);assert.equal(p.items[0].id,id(2000));
  const equality=await page(c,{lowStockOnly:true,category:'Filtros',search:'SKU-1'});
  assert.equal(equality.totalCount,1);assert.equal(equality.items[0].id,id(1001));assert.equal(equality.lowStockCount,2);
}));
await test('low stock combines search/category and keeps a global indicator for empty results',()=>session(U,async c=>{
  const p=await page(c,{lowStockOnly:true,category:'Baterías',search:'not-found'});
  assert.equal(p.totalCount,0);assert.equal(p.pageIndex,0);assert.equal(p.items.length,0);assert.equal(p.lowStockCount,2);
  assert.deepEqual(await page(c,{lowStockOnly:false}),await page(c));
}));
await test('low stock preserves tenant, role and invoker-RLS restrictions',async()=>{
  const p=await session(V,c=>page(c,{org:B,lowStockOnly:true}));assert.equal(p.totalCount,1);assert.equal(p.items[0].organization_id,B);
  await assert.rejects(()=>session(U,c=>page(c,{org:B,lowStockOnly:true})),{code:'42501'});
  await assert.rejects(()=>session(DENIED,c=>page(c,{lowStockOnly:true})),{code:'42501'});
  await assert.rejects(()=>session(U,c=>page(c,{lowStockOnly:null})),{code:'22023'});
});
await test('low-stock overload is invoker-only with a required boolean and no public execution',async()=>{
  const [p]=await sql`SELECT prosecdef,pronargs,pronargdefaults,has_function_privilege('anon','get_inventory_page(boolean,uuid,text,text,integer,integer,jsonb)','EXECUTE') anon,has_function_privilege('service_role','get_inventory_page(boolean,uuid,text,text,integer,integer,jsonb)','EXECUTE') service FROM pg_proc WHERE oid='get_inventory_page(boolean,uuid,text,text,integer,integer,jsonb)'::regprocedure`;
  assert.equal(p.prosecdef,false);assert.equal(p.pronargs,7);assert.equal(p.pronargdefaults,5);assert.equal(p.anon,false);assert.equal(p.service,false);
});
console.log(`${passed}/${passed} focused inventory SQL scenarios passed; not a full schema replay.`);
}finally{await sql.end();}
