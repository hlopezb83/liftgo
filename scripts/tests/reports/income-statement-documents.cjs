// Disposable local PostgreSQL only; no remote URL or production data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const postgres = require('postgres');
const root = path.resolve(__dirname, '../../..');
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw new Error('Set PG_BIN to installed trusted PostgreSQL binaries');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liftgo-mej001-'));
const pg = (name, args) => execFileSync(path.join(bin, name), args, { encoding: 'utf8', timeout: 30000 });
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let db; let started = false;
const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const documentSignature = 'public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)';
const inheritedRoles = ['service_role', 'sandbox_exec_zxefrzfaynnfwazqhwxp'];
const snapshots = async () => (await db.unsafe(`SELECT
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p
    WHERE p.pronamespace IN ('public'::regnamespace,'auth'::regnamespace)
      AND p.oid IS DISTINCT FROM to_regprocedure('${documentSignature}')) AS functions,
  (SELECT jsonb_agg(jsonb_build_object('id',oid,'acl',relacl::text,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY oid)
    FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v')) AS tables,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname) FROM pg_policies p) AS policies,
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY role::text,module) FROM role_permissions r) AS permissions,
  (SELECT jsonb_agg(to_jsonb(d) ORDER BY oid) FROM pg_default_acl d) AS defaults,
  (SELECT jsonb_agg(to_jsonb(r) ORDER BY oid) FROM pg_roles r) AS roles,
  (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m) AS memberships`))[0];
const assertDocumentAcl = async (extraRoles) => {
  const acl = await db.unsafe(`SELECT a.grantee=p.proowner AS owner,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type,a.is_grantable
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid='${documentSignature}'::regprocedure ORDER BY grantee`);
  assert.deepEqual(Array.from(acl),[
    {owner:false,grantee:'authenticated',privilege_type:'EXECUTE',is_grantable:false},
    {owner:true,grantee:'postgres',privilege_type:'EXECUTE',is_grantable:false},
  ],'exact ACL contains only owner and authenticated EXECUTE, without explicit grant option');
  const [security] = await db.unsafe(`SELECT prosecdef,provolatile,proconfig FROM pg_proc
    WHERE oid='${documentSignature}'::regprocedure`);
  assert.deepEqual(security,{prosecdef:false,provolatile:'s',proconfig:['search_path=public']});
  for (const role of ['authenticated','anon',...extraRoles]) {
    const [access] = await db`SELECT
      has_function_privilege(${role},${documentSignature},'EXECUTE') AS execute,
      has_function_privilege(${role},${documentSignature},'EXECUTE WITH GRANT OPTION') AS grant_option`;
    assert.deepEqual(access,{execute:role==='authenticated',grant_option:false},`${role} execution and grant option`);
    if (role === 'authenticated') continue;
    // Role names in this local fixture, like the migration, are quoted as identifiers.
    await db.unsafe(`SET ROLE "${role.replaceAll('"','""')}";`);
    try {
      await assert.rejects(db.unsafe("SELECT public.get_income_statement_documents('2026-09-01','2026-10-31','cash','other_services',NULL,ARRAY['2026-10']);"),/permission denied for function get_income_statement_documents/);
    } finally { await db.unsafe('RESET ROLE;'); }
  }
};
(async () => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0,'127.0.0.1',resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  pg('initdb',['-D',`${dir}/data`,'-U','postgres','--auth=trust']);
  pg('pg_ctl',['-D',`${dir}/data`,'-l',`${dir}/server.log`,'-o',`-h 127.0.0.1 -p ${port} -c unix_socket_directories=`,'start']);
  started = true;
  db = postgres({ host:'127.0.0.1',port,username:'postgres',database:'postgres',max:1,prepare:false,onnotice:()=>{} });
  await db.unsafe(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${id(1)}'::uuid $$;
    CREATE TYPE app_role AS ENUM ('admin','administrativo','auditor','dispatcher');
    CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $2::text = current_setting('test.role',true) $$;
    CREATE TABLE role_permissions(role app_role,module text,access_level text,PRIMARY KEY(role,module));
    CREATE VIEW user_roles AS SELECT auth.uid() AS user_id, current_setting('test.role',true)::app_role AS role;
    INSERT INTO role_permissions SELECT role::app_role,module,'read'
      FROM unnest(ARRAY['admin','administrativo','auditor','dispatcher']) role
      CROSS JOIN unnest(ARRAY['Facturas','Reportes','Facturas de Proveedor','Gastos']) module;
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE TABLE invoices(id uuid PRIMARY KEY, subtotal numeric,total numeric,tipo_cambio numeric,moneda text,invoice_type text,customer_name text,booking_id uuid,quote_id uuid,billing_period_start date,billing_period_end date,line_items jsonb,issued_at date,paid_at date,is_e2e boolean,status text,invoice_number text);
    CREATE TABLE payments(id uuid PRIMARY KEY,invoice_id uuid,amount numeric,exchange_rate numeric,payment_date date);
    CREATE TABLE quotes(id uuid PRIMARY KEY,quote_type text,is_e2e boolean);
    CREATE TABLE invoice_bookings(invoice_id uuid);
    CREATE TABLE credit_notes(id uuid PRIMARY KEY,subtotal numeric,invoice_id uuid,issued_at date,status text,cfdi_status text,cancellation_status text,credit_note_number text,currency text);
    CREATE TABLE suppliers(id uuid PRIMARY KEY,name text);
    CREATE TABLE supplier_bills(id uuid PRIMARY KEY,subtotal numeric,total numeric,exchange_rate numeric,category text,description text,issue_date date,coverage_start date,coverage_end date,supplier_id uuid,status text,approval_status text,currency text,bill_number text);
    CREATE TABLE supplier_payments(id uuid PRIMARY KEY,bill_id uuid,amount numeric,payment_date date);
    CREATE TABLE operating_expenses(id uuid PRIMARY KEY,expense_date date,category text,description text,amount numeric,supplier_bill_id uuid);
    CREATE TABLE maintenance_logs(performed_at date,cost numeric,work_status text,deleted_at timestamptz);
    CREATE TABLE damage_records(repaired_at timestamptz,created_at timestamptz,actual_cost numeric,estimated_cost numeric,deleted_at timestamptz);
    CREATE TABLE bookings(forklift_id uuid,start_date date,end_date date,is_e2e boolean,status text);
    CREATE TABLE forklifts(id uuid PRIMARY KEY,name text,acquisition_cost numeric,acquisition_date date,created_at timestamptz,sold_at date,is_e2e boolean,deleted_at timestamptz);
    CREATE TABLE quote_assigned_forklifts(quote_id uuid,forklift_id uuid);
  `);
  const tables = await db`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  for (const {tablename} of tables) {
    await db.unsafe(`ALTER TABLE ${tablename} ADD COLUMN organization_id uuid DEFAULT '${orgA}'; ALTER TABLE ${tablename} ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant ON ${tablename} FOR SELECT TO authenticated USING (organization_id = nullif(current_setting('test.org',true),'')::uuid);`);
  }
  // Actual exact-match permissions lookup, with current source modules and no obsolete Pagos row.
  const permissionSource = read('supabase/migrations/20260810184343_aea9a949-c035-4b2c-83c3-9b965c7270ea.sql');
  const permissionFunction = permissionSource.match(/CREATE OR REPLACE FUNCTION public\.has_permission[\s\S]*?\$\$;/)?.[0];
  assert(permissionFunction, 'canonical has_permission fixture source must exist');
  await db.unsafe(permissionFunction);
  await db.unsafe(read('supabase/migrations/20260831184510_1b4d05fe-419b-47ad-b28e-81791f3b6497.sql'));
  await db.unsafe(read('supabase/migrations/20260901015737_5392b1a1-fd02-4797-9b22-0b574cf46594.sql'));
  // Replay only the canonical report rewrites, not unrelated banking migrations.
  for (const migration of [
    'supabase/migrations/20260901182145_26e1f20a-d2b3-404d-a1c6-533a8652d52f.sql',
    'supabase/migrations/20260902004607_e4229dd2-25cf-4702-b625-5c45e1e9e987.sql',
  ]) {
    const reportPatches = (read(migration).match(/DO \$do\$[\s\S]*?\$do\$;/g) || [])
      .filter(block => block.includes("p.proname = 'get_income_statement'"));
    assert.equal(reportPatches.length,1,`${migration} must have exactly one canonical report patch`);
    await db.unsafe(reportPatches[0]);
  }
  await db.unsafe('ALTER FUNCTION get_income_statement(date,date,text) SECURITY INVOKER;');

  // LOCAL FIXTURE ONLY: strengthen observed creator defaults with grant option.
  // First verify installations where neither optional inherited role exists.
  await db.unsafe('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated WITH GRANT OPTION;');
  const absentRoles = await db`SELECT rolname FROM pg_roles WHERE rolname = ANY(${inheritedRoles})`;
  assert.equal(absentRoles.length,0);
  const absentSnapshot = await snapshots();
  await db.unsafe(read('drizzle/migrations/0117_income_statement_documents.sql'));
  await assertDocumentAcl([]);
  assert.deepEqual(await snapshots(),absentSnapshot,'absent-role migration preserves existing functions/ACLs, defaults, roles, tables/RLS and modules');
  console.log('PASS: optional inherited roles absent; owner/authenticated exact ACL without explicit grant option; unrelated catalog unchanged.');

  // LOCAL FIXTURE ONLY: reproduce the two extra defaults verified in preflight.
  // Existing canonical ACLs also retain these roles, so an overbroad revoke fails.
  await db.unsafe(`DROP FUNCTION ${documentSignature};
    CREATE ROLE service_role; CREATE ROLE sandbox_exec_zxefrzfaynnfwazqhwxp;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
      TO service_role, sandbox_exec_zxefrzfaynnfwazqhwxp WITH GRANT OPTION;
    GRANT EXECUTE ON FUNCTION public.get_income_statement(date,date,text)
      TO service_role, sandbox_exec_zxefrzfaynnfwazqhwxp WITH GRANT OPTION;`);
  const presentSnapshot = await snapshots();
  await db.unsafe(read('drizzle/migrations/0117_income_statement_documents.sql'));
  await assertDocumentAcl(inheritedRoles);
  assert.deepEqual(await snapshots(),presentSnapshot,'inherited-role migration preserves existing functions/ACLs, defaults, roles, tables/RLS and modules');
  console.log('PASS: inherited anon/authenticated/service_role/sandbox defaults with grant option removed only from the new RPC; unrelated catalog unchanged.');
  const [executionAccess] = await db`SELECT
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
    EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public
    FROM pg_proc p WHERE p.oid='public.get_income_statement_documents(date,date,text,text,text,text[],integer,integer)'::regprocedure`;
  assert.deepEqual(executionAccess,{authenticated:true,anon:false,public:false},'only the approved authenticated execution is activated');
  const [{tableAccess}] = await db`SELECT has_table_privilege('authenticated','public.invoices','SELECT') AS "tableAccess"`;
  assert.equal(tableAccess,false,'the migration must not add table privileges');
  await db.unsafe('SET ROLE anon;');
  await assert.rejects(db.unsafe("SELECT public.get_income_statement_documents('2026-09-01','2026-10-31','cash','other_services',NULL,ARRAY['2026-10']);"),/permission denied for function get_income_statement_documents/);
  await db.unsafe('RESET ROLE;');
  // LOCAL FIXTURE ONLY: model existing table access; execution comes from 0117 itself.
  await db.unsafe(`GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;`);
  await db.unsafe(`
    INSERT INTO invoices(id,subtotal,total,tipo_cambio,moneda,invoice_type,customer_name,issued_at,status,invoice_number) VALUES
      ('${id(10)}',100,116,20,'USD','standard','Cliente QA','2026-09-15','sent','FAC-USD'),
      ('${id(11)}',50,58,1,'MXN','standard','Cliente QA','2026-10-05','sent','FAC-MXN'),
      ('${id(12)}',999,1158.84,1,'MXN','standard','Cliente QA','2026-10-05','draft','DRAFT'),
      ('${id(13)}',999,1158.84,0,'USD','standard','Cliente QA','2026-10-05','sent','NO-FX');
    INSERT INTO invoices(id,subtotal,total,tipo_cambio,moneda,customer_name,issued_at,status,invoice_number,organization_id)
      VALUES ('${id(14)}',888,888,1,'MXN','Tenant B secret','2026-10-05','sent','OTHER-TENANT','${orgB}');
    INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date) VALUES
      ('${id(20)}','${id(10)}',29,20,'2026-10-03'),('${id(21)}','${id(10)}',29,20,'2026-10-04'),('${id(22)}','${id(10)}',58,20,'2026-11-01');
    INSERT INTO credit_notes(id,subtotal,invoice_id,issued_at,status,cfdi_status,cancellation_status,credit_note_number,currency)
      VALUES ('${id(30)}',10,'${id(10)}','2026-10-06','issued','stamped','none','NC-QA','USD');
    INSERT INTO suppliers(id,name) VALUES ('${id(40)}','Proveedor QA');
    INSERT INTO supplier_bills(id,subtotal,total,exchange_rate,category,description,issue_date,coverage_start,coverage_end,supplier_id,status,currency,bill_number)
      VALUES ('${id(41)}',61,70.76,1,'renta','Cobertura','2026-09-01','2026-09-01','2026-10-31','${id(40)}','pending','MXN','FP-61');
    INSERT INTO supplier_payments(id,bill_id,amount,payment_date) VALUES ('${id(42)}','${id(41)}',35.38,'2026-10-10');
    INSERT INTO operating_expenses(id,expense_date,category,description,amount,supplier_bill_id) VALUES
      ('${id(50)}','2026-10-10','renta','Vinculado',61,'${id(41)}'),
      ('${id(51)}','2026-10-05','renta','Independiente',0.333,NULL),
      ('${id(52)}','2026-10-05','renta','Independiente',0.333,NULL),
      ('${id(53)}','2026-10-05','renta','Independiente',0.333,NULL);
    SET ROLE authenticated; SET test.role='admin'; SET test.org='${orgA}';
  `);
  const docs = async (basis,kind,label=null,months=['2026-09','2026-10'],limit=25,offset=0) => (await db`SELECT get_income_statement_documents('2026-09-01','2026-10-31',${basis},${kind},${label},${months},${limit},${offset}) result`)[0].result;
  const aggregate = async basis => (await db`SELECT get_income_statement('2026-09-01','2026-10-31',${basis}) result`)[0].result;
  const [moduleAccess] = await db`SELECT has_permission('Facturas','read') invoices, has_permission('Pagos','read') payments,
    (SELECT count(*)::int FROM role_permissions WHERE module='Pagos') obsolete_rows`;
  assert.equal(moduleAccess.invoices,true); assert.equal(moduleAccess.payments,false); assert.equal(moduleAccess.obsolete_rows,0);
  for (const role of ['admin','administrativo','auditor']) {
    await db.unsafe(`SET test.role='${role}';`);
    assert.equal((await docs('cash','other_services')).total_amount,1000,'cash is readable through Facturas/read without Pagos');
  }
  await db.unsafe("SET test.role='admin';");
  for (const basis of ['accrual','cash']) {
    const detail = await docs(basis,'other_services');
    const report = await aggregate(basis);
    assert.equal(detail.total_amount,report.months.reduce((s,m)=>s+m.revenue_other_services,0));
    assert.equal(new Set(detail.items.map(i=>i.row_key)).size,detail.items.length);
    assert(!JSON.stringify(detail).includes('OTHER-TENANT'));
    assert(!JSON.stringify(detail).includes('NO-FX'));
    const expense = await docs(basis,'exp:renta');
    assert.equal(expense.total_count,basis==='cash'?4:5,'coverage has separate month contributions; linked OE not duplicated');
    assert.equal(expense.total_amount,Math.round(report.months.reduce((s,m)=>s+(m.expenses.renta||0),0)*100)/100);
    assert.equal(expense.rounding_adjustment,0.01,'explicit rounding reconciles displayed cents');
    const credit = await docs(basis,'credit_notes','Cliente QA — FAC-USD');
    assert.equal(credit.total_amount,200);
    assert.equal(credit.items[0].event_date,'2026-10-06','credit note retains issue date in cash');
  }
  const cash = await docs('cash','other_services','Cliente QA',['2026-10']);
  assert.equal(cash.total_amount,1000); assert.equal(cash.total_count,2);
  assert.equal(cash.items[0].document_date,'2026-09-15'); assert.equal(cash.items[0].event_date,'2026-10-04');
  assert.equal(cash.items[0].currency,'USD'); assert.equal(cash.currency,'MXN');
  const page1=await docs('cash','other_services',null,['2026-10'],1,0),page2=await docs('cash','other_services',null,['2026-10'],1,1);
  assert.equal(page1.total_amount,page2.total_amount); assert.equal(page1.items.length,1);
  assert.notEqual(page1.items[0].row_key,page2.items[0].row_key);
  assert.equal((await docs('cash','other_services',null,['2026-10'],1,2)).items.length,0);
  await assert.rejects(docs('cash','other_services',null,['2026-10'],101),/Invalid document scope/);
  await assert.rejects(docs('invalid','other_services'),/Invalid document scope/);
  // Even a malformed visible credit note must not disclose an RLS-hidden parent invoice ID.
  await db.unsafe(`RESET ROLE; INSERT INTO credit_notes(id,subtotal,invoice_id,issued_at,status,cfdi_status,cancellation_status,credit_note_number,currency) VALUES ('${id(31)}',99,'${id(14)}','2026-10-06','issued','stamped','none','NC-HIDDEN-PARENT','MXN'); SET ROLE authenticated;`);
  const safeCredits = await docs('accrual','credit_notes');
  assert.equal(safeCredits.total_count,1); assert(!JSON.stringify(safeCredits).includes(id(14)));
  for (const module of ['Facturas','Reportes','Facturas de Proveedor','Gastos']) {
    await db.unsafe(`RESET ROLE; UPDATE role_permissions SET access_level='none' WHERE module='${module}'; SET ROLE authenticated;`);
    for (const basis of ['accrual','cash']) {
      await assert.rejects(docs(basis,['Facturas de Proveedor','Gastos'].includes(module)?'exp:renta':'other_services'),/Forbidden/);
    }
    await db.unsafe(`RESET ROLE; UPDATE role_permissions SET access_level='read' WHERE module='${module}'; SET ROLE authenticated;`);
  }
  await db.unsafe("SET test.role='dispatcher';");
  for (const basis of ['accrual','cash']) await assert.rejects(docs(basis,'other_services'),/Forbidden/);
  await db.unsafe(`SET test.role='auditor'; SET test.org='${orgB}';`);
  const other=await docs('accrual','other_services');assert.equal(other.total_amount,888);assert.equal(other.items[0].folio,'OTHER-TENANT');
  await db.unsafe('RESET ROLE; ALTER FUNCTION get_income_statement(date,date,text) SECURITY DEFINER; SET ROLE authenticated;');
  await assert.rejects(docs('accrual','other_services'),/source version changed/);
  console.log('PASS: authenticated execution, anon/PUBLIC denied, no table grant, canonical totals, FX, cash dates, credit notes, coverage, linked expense dedup, rounding, pagination, tenant RLS, actual module matrix without Pagos, module/role denial, source drift.');
})().catch(error=>{console.error(error.message, error.position, error.internal_position); if (error.internal_query) { fs.writeFileSync(path.join(dir,'failed-query.sql'),error.internal_query); console.error(error.internal_query.slice(Math.max(0,Number(error.internal_position)-100),Number(error.internal_position)+100)); } console.error('Evidence:',dir); process.exitCode=1;}).finally(async()=>{
  if(db)await db.end();if(started)pg('pg_ctl',['-D',`${dir}/data`,'-m','immediate','stop']);
});
