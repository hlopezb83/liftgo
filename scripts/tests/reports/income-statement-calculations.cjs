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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liftgo-er-calculations-'));
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
      AND p.oid IS DISTINCT FROM to_regprocedure('${documentSignature}')
      AND p.oid IS DISTINCT FROM 'get_income_statement(date,date,text)'::regprocedure) AS functions,
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
    CREATE TABLE payments(id uuid PRIMARY KEY,invoice_id uuid,amount numeric,exchange_rate numeric,payment_date date,currency text);
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


  const [{source_md5}] = await db`SELECT md5(prosrc) AS source_md5 FROM pg_proc WHERE oid='get_income_statement(date,date,text)'::regprocedure`;
  assert.equal(source_md5,'9e833c1cbcbeeae5459baf2a127cfa45','exact canonical function body');
  await db.unsafe(read('drizzle/migrations/0117_income_statement_documents.sql'));
  const missingFxSource=read('supabase/migrations/20260901080020_f395aa5e-1e0c-4dd0-a311-4ff8b1b5ed60.sql');
  await db.unsafe(missingFxSource.match(/CREATE OR REPLACE FUNCTION public\.fx_is_missing[\s\S]*?\$\$;/)[0]);
  const convertFxSource=read('supabase/migrations/20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql');
  await db.unsafe(convertFxSource.match(/CREATE OR REPLACE FUNCTION public\.fx_convert_amount[\s\S]*?\$function\$;/)[0]);
  const beforeScope = await snapshots();
  await assertDocumentAcl([]);
  const beforeAcl=await db`SELECT oid,proacl::text FROM pg_proc WHERE proname IN ('get_income_statement','get_income_statement_documents') ORDER BY oid`;
  const migration118=read('drizzle/migrations/0118_income_statement_calculation_corrections.sql');
  // Refuse both canonical and document drift before any replacement occurs.
  for (const signature of ['public.get_income_statement(date,date,text)',documentSignature]) {
    await db.unsafe('BEGIN');
    const [{definition}]=await db`SELECT pg_get_functiondef(${signature}::regprocedure) definition`;
    await db.unsafe(definition.replace('BEGIN','BEGIN -- fixture preflight drift'));
    await assert.rejects(db.unsafe(migration118),/unexpected (canonical|document) source/);
    await db.unsafe('ROLLBACK');
  }
  await db.unsafe(migration118);
  await assert.rejects(db.unsafe(migration118),/unexpected canonical source/);

  const afterAcl=await db`SELECT oid,proacl::text FROM pg_proc WHERE proname IN ('get_income_statement','get_income_statement_documents') ORDER BY oid`;
  assert.deepEqual(afterAcl,beforeAcl,'RPC ACLs preserved');
  assert.deepEqual(await snapshots(), beforeScope, 'Unrelated functions, table ACLs, RLS policies, module permissions, defaults, roles and memberships unchanged');
  await assertDocumentAcl([]);
  // Fixture-only isolated database, canonical SQL and known fabricated values.
  await db.unsafe("SET test.role='admin';");
  const results=[];
  const report=async(start,end,basis='accrual')=>(await db`SELECT get_income_statement(${start}::date,${end}::date,${basis}) AS result`)[0].result;
  const clean=async()=>db.unsafe('TRUNCATE invoices,payments,quotes,invoice_bookings,credit_notes,suppliers,supplier_bills,supplier_payments,operating_expenses,maintenance_logs,damage_records,bookings,forklifts,quote_assigned_forklifts');
  const record=(name,actual,expected,explanation)=>{results.push({name,actual,expected,explanation}); console.log(name,JSON.stringify(actual),'expected',JSON.stringify(expected));};

  await clean();
  await db.unsafe(`INSERT INTO invoices(id,subtotal,total,tipo_cambio,moneda,invoice_type,customer_name,issued_at,status,invoice_number) VALUES ('${id(10)}',100,116,20,'USD','standard','QA FX','2026-10-01','sent','QA-USD');
    INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES ('${id(20)}','${id(10)}',58,20,'2026-10-02','USD');
    INSERT INTO credit_notes(id,subtotal,invoice_id,issued_at,status,cfdi_status,cancellation_status,credit_note_number,currency) VALUES ('${id(30)}',20,'${id(10)}','2026-10-03','issued','stamped','none','QA-NC','USD');`);
  const fxUsd=(await report('2026-10-01','2026-10-31','cash')).months[0];
  await db.unsafe(`UPDATE payments SET amount=1160,currency='MXN',exchange_rate=20`);
  const fxMxn=(await report('2026-10-01','2026-10-31','cash')).months[0];
  record('FX economic equivalent half-payment', {usd:{gross:fxUsd.revenue_other_services,credit:fxUsd.credit_notes_total,net:fxUsd.revenue},mxn:{gross:fxMxn.revenue_other_services,credit:fxMxn.credit_notes_total,net:fxMxn.revenue}}, {both:{gross:1000,credit:200,net:800}}, 'USD58 or MXN1160 @20 is the same half of invoice USD116; NC USD20 weighted by 50%.');
  assert.equal(fxUsd.revenue,800); assert.equal(fxMxn.revenue,800);
  const [canonicalPayment]=await db`SELECT fx_convert_amount(1160,'MXN','USD',20,20) AS invoice_amount`;
  assert.equal(Number(canonicalPayment.invoice_amount),58);
  const [docsFx]=await db`SELECT get_income_statement_documents('2026-10-01','2026-10-31','cash','other_services',NULL,ARRAY['2026-10'],25,0) AS detail`;
  assert.equal(docsFx.detail.total_amount,fxMxn.revenue_other_services);
  record('0117 corrected FX parity',{aggregateGross:fxMxn.revenue_other_services,documentGross:docsFx.detail.total_amount,canonicalPaymentUSD:Number(canonicalPayment.invoice_amount)},{aggregateEqualsDetail:true,economicGross:1000},'Aggregate and refreshed drilldown both use the canonical normalized payment.');
  await db.unsafe('UPDATE payments SET exchange_rate=1');
  const fxMxnOne=(await report('2026-10-01','2026-10-31','cash')).months[0];
  record('MXN own rate 1 weights NC correctly',{gross:fxMxnOne.revenue_other_services,credit:fxMxnOne.credit_notes_total,net:fxMxnOne.revenue},{gross:1000,credit:200,net:800},'Both revenue and credit weighting use normalized invoice currency.');
  assert.equal(fxMxnOne.revenue,800);


  // Legacy NULL currency inherits invoice denomination; canonical same-currency
  // conversion does not need a separate payment FX rate.
  await db.unsafe("UPDATE payments SET amount=58,currency=NULL,exchange_rate=NULL");
  const legacy=(await report('2026-10-01','2026-10-31','cash')).months[0];
  assert.equal(legacy.revenue,800);
  // Two half-payments with distinct currency representations still equal the invoice.
  await db.unsafe(`INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES ('${id(21)}','${id(10)}',1160,1,'2026-10-04','MXN')`);
  const mixed=(await report('2026-10-01','2026-10-31','cash')).months[0];
  assert.equal(mixed.revenue_other_services,2000); assert.equal(mixed.credit_notes_total,400);
  const [cnDocs]=await db`SELECT get_income_statement_documents('2026-10-01','2026-10-31','cash','credit_notes',NULL,ARRAY['2026-10'],25,0) AS detail`;
  assert.equal(cnDocs.detail.total_amount,400);

  // Non-convertible cross-currency payment is excluded and observable, counted once
  // even when it affects revenue and credit weighting together.
  await db.unsafe("UPDATE payments SET currency='EUR',exchange_rate=NULL");
  const invalidFx=await report('2026-10-01','2026-10-31','cash');
  assert.equal(invalidFx.fx_missing.payments,2); assert.equal(invalidFx.months[0].revenue,0);
  const invalidDocs=async()=> (await db`SELECT get_income_statement_documents('2026-10-01','2026-10-31','cash','other_services',NULL,ARRAY['2026-10'],25,0) AS detail`)[0].detail;
  assert.equal((await invalidDocs()).total_count,0);
  await db.unsafe(`UPDATE payments SET currency='USD',amount=58 WHERE id='${id(20)}'`);
  assert.equal((await invalidDocs()).total_count,1);
  assert.equal((await invalidDocs()).total_amount,1000);
  assert.equal((await report('2026-10-01','2026-10-31','cash')).fx_missing.payments,1);
  await db.unsafe("UPDATE payments SET currency='EUR',exchange_rate=NULL");
  assert.equal((await report('2026-10-01','2026-10-31','accrual')).fx_missing.payments,0);
  await db.unsafe("UPDATE payments SET payment_date='2026-09-01'");
  assert.equal((await report('2026-10-01','2026-10-31','cash')).fx_missing.payments,2);
  await db.unsafe("UPDATE invoices SET tipo_cambio=NULL");
  const invoiceMissing=await report('2026-10-01','2026-10-31','cash');
  assert.equal(invoiceMissing.fx_missing.payments,0); assert.equal(invoiceMissing.fx_missing.invoices,1);

  await clean();
  await db.unsafe(`INSERT INTO quotes(id,quote_type) VALUES ('${id(40)}','sale');
    INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at,sold_at) VALUES ('${id(50)}','QA Venta',4800,'2026-01-01','2026-01-01','2026-10-01');
    INSERT INTO quote_assigned_forklifts(quote_id,forklift_id) VALUES ('${id(40)}','${id(50)}');
    INSERT INTO invoices(id,subtotal,total,tipo_cambio,moneda,invoice_type,customer_name,issued_at,status,invoice_number,quote_id) VALUES ('${id(10)}',10000,11600,1,'MXN','standard','QA Sale','2026-10-01','sent','QA-SALE','${id(40)}');
    INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES ('${id(20)}','${id(10)}',11600,1,'2026-10-20','MXN');`);
  const single=(await report('2026-10-01','2026-10-31','cash')).months[0];
  await db.unsafe(`UPDATE payments SET amount=5800; INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES ('${id(21)}','${id(10)}',5800,1,'2026-10-20','MXN');`);
  const split=(await report('2026-10-01','2026-10-31','cash')).months[0];
  record('COGS payment partition invariance' ,{single:{revenue:single.revenue,cogs:single.cogs_forklift_sales,detail:single.cogs_by_forklift},split:{revenue:split.revenue,cogs:split.cogs_forklift_sales,detail:split.cogs_by_forklift}},{revenue:10000,cogs:3900},'Same total paid on same day, one row vs two rows; COGS must not duplicate and detail must reconcile.');
  assert.equal(single.cogs_forklift_sales,3900); assert.equal(split.cogs_forklift_sales,3900);

  assert.equal(Object.values(split.cogs_by_forklift).reduce((a,b)=>a+b,0),3900);
  await db.unsafe(`UPDATE payments SET payment_date='2026-11-20' WHERE id='${id(21)}'`);
  const octCogs=(await report('2026-10-01','2026-10-31','cash')).months[0];
  const novCogs=(await report('2026-11-01','2026-11-30','cash')).months[0];
  const bothCogs=await report('2026-10-01','2026-11-30','cash');
  assert.equal(octCogs.cogs_forklift_sales,1950); assert.equal(novCogs.cogs_forklift_sales,1950);
  assert.equal(bothCogs.months[0].cogs_forklift_sales,1950); assert.equal(bothCogs.months[1].cogs_forklift_sales,1950);
  // The November payment must not revalue cost at November's lower book value.
  await db.unsafe(`UPDATE payments SET amount=11600 WHERE id='${id(21)}';
    INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES ('${id(22)}','${id(10)}',11600,1,'2026-12-01','MXN');`);
  assert.equal((await report('2026-11-01','2026-11-30','cash')).months[0].cogs_forklift_sales,1950);
  assert.equal((await report('2026-12-01','2026-12-31','cash')).months[0].cogs_forklift_sales,0);
  // Credit notes do not invent inventory returns or consume the cash allocation.
  await db.unsafe(`INSERT INTO credit_notes(id,subtotal,invoice_id,issued_at,status,cfdi_status,cancellation_status,credit_note_number,currency) VALUES ('${id(30)}',5000,'${id(10)}','2026-10-25','issued','stamped','none','QA-SALE-NC','MXN')`);
  assert.equal((await report('2026-10-01','2026-10-31','cash')).months[0].cogs_forklift_sales,1950);
  await db.unsafe('DELETE FROM credit_notes; DELETE FROM payments');
  assert.equal((await report('2026-10-01','2026-10-31','cash')).months[0].cogs_forklift_sales,0);
  assert.equal((await report('2026-10-01','2026-10-31','accrual')).months[0].cogs_forklift_sales,3900);
  await db.unsafe(`UPDATE invoices SET subtotal=100,total=116,moneda='USD',tipo_cambio=20;
    INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES
      ('${id(19)}','${id(10)}',116,NULL,'2026-09-01','EUR'),
      ('${id(20)}','${id(10)}',1160,1,'2026-10-20','MXN'),
      ('${id(21)}','${id(10)}',58,20,'2026-11-20','USD');`);
  assert.equal((await report('2026-10-01','2026-10-31','cash')).months[0].cogs_forklift_sales,1950);
  assert.equal((await report('2026-11-01','2026-11-30','cash')).months[0].cogs_forklift_sales,1950);
  assert.equal((await report('2026-10-01','2026-10-31','cash')).fx_missing.payments,1);
  assert.equal((await report('2026-11-01','2026-11-30','cash')).fx_missing.payments,1);
  await db.unsafe(`INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency)
    VALUES ('${id(23)}','${id(10)}',116,NULL,'2026-12-01','EUR')`);
  assert.equal((await report('2026-10-01','2026-10-31','cash')).fx_missing.payments,1,'Future invalid FX does not affect current COGS allocation');
  // Invalid earlier FX must not consume allocation. Same-name distinct equipment
  // contributions are added; a duplicate assignment of the same unit is not doubled.
  await db.unsafe(`INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at,sold_at) VALUES ('${id(51)}','QA Venta',4800,'2026-01-01','2026-01-01','2026-10-01');
    INSERT INTO quote_assigned_forklifts(quote_id,forklift_id) VALUES ('${id(40)}','${id(51)}'),('${id(40)}','${id(50)}');`);
  const duplicateNames=(await report('2026-10-01','2026-10-31','cash')).months[0];
  assert.equal(duplicateNames.cogs_forklift_sales,3900);
  assert.equal(Object.values(duplicateNames.cogs_by_forklift).reduce((a,b)=>a+b,0),3900);
  await db.unsafe("UPDATE forklifts SET sold_at='2026-09-01'");
  assert.equal((await report('2026-10-01','2026-10-31','accrual')).months[0].cogs_forklift_sales,8000);
  await db.unsafe("UPDATE forklifts SET sold_at=NULL");
  assert.equal((await report('2026-10-01','2026-10-31','accrual')).months[0].cogs_forklift_sales,7800);
  for (const status of ['cancelled','draft']) {
    await db.unsafe(`UPDATE invoices SET status='${status}'`);
    assert.equal((await report('2026-10-01','2026-11-30','cash')).months.reduce((a,m)=>a+m.cogs_forklift_sales,0),0);
    assert.equal((await report('2026-10-01','2026-10-31','accrual')).months[0].cogs_forklift_sales,0);
  }

  // Distinct client/equipment pairs may form the same display label. Group the
  // resulting label, not just its component fields, before object aggregation.
  await db.unsafe(`DELETE FROM payments; DELETE FROM quote_assigned_forklifts;
    UPDATE invoices SET customer_name='A — B',subtotal=100,total=100,moneda='MXN',tipo_cambio=1,status='sent';
    UPDATE forklifts SET name=CASE WHEN id='${id(50)}' THEN 'C' ELSE 'B — C' END;
    INSERT INTO quotes(id,quote_type) VALUES ('${id(41)}','sale');
    INSERT INTO invoices(id,subtotal,total,tipo_cambio,moneda,invoice_type,customer_name,issued_at,status,invoice_number,quote_id)
      VALUES ('${id(11)}',100,100,1,'MXN','standard','A','2026-10-01','sent','QA-SALE2','${id(41)}');
    INSERT INTO quote_assigned_forklifts(quote_id,forklift_id) VALUES ('${id(40)}','${id(50)}'),('${id(41)}','${id(51)}');
    INSERT INTO payments(id,invoice_id,amount,exchange_rate,payment_date,currency) VALUES
      ('${id(20)}','${id(10)}',50,1,'2026-10-20','MXN'),('${id(21)}','${id(11)}',100,1,'2026-10-20','MXN');`);
  const labelCollision=(await report('2026-10-01','2026-10-31','cash')).months[0];
  assert.equal(labelCollision.cogs_forklift_sales,5850);
  assert.equal(labelCollision.cogs_by_forklift['A — B — C'],5850);

  await clean();
  await db.unsafe(`INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at) VALUES ('${id(50)}','QA Life',48000,'2022-01-16','2022-01-16');`);
  const life=await report('2022-01-01','2026-02-28');
  record('Depreciation terminal stub',{sum:life.months.reduce((s,m)=>s+m.depreciation,0),jan2026:life.months.find(m=>m.month_key==='2026-01').depreciation},{sum:48000,jan2026:15000/31},'48-month useful life from Jan16 2022 ends Jan15 2026; calendar-month filter cuts off the final 15/31 stub.');
  assert.ok(Math.abs(life.months.find(m=>m.month_key==='2026-01').depreciation-15000/31)<1e-8); assert.ok(Math.abs(life.months.reduce((s,m)=>s+m.depreciation,0)-48000)<1e-8);

  await clean();
  await db.unsafe(`INSERT INTO suppliers(id,name) VALUES ('${id(40)}','QA Supplier');
    INSERT INTO supplier_bills(id,subtotal,total,exchange_rate,category,description,issue_date,coverage_start,coverage_end,supplier_id,status,currency,bill_number) VALUES ('${id(41)}',300,348,1,'renta','QA recurring','2026-09-01','2026-09-01','2026-11-30','${id(40)}','pending','MXN','QA-COVER');
    INSERT INTO operating_expenses(id,expense_date,category,description,amount,supplier_bill_id) VALUES ('${id(51)}','2026-10-05','renta','Independent genuine expense',300,'${id(41)}');
    INSERT INTO supplier_payments(id,bill_id,amount,payment_date) VALUES ('${id(42)}','${id(41)}',348,'2026-11-10');`);
  const narrow=await report('2026-10-01','2026-10-31','cash');
  const wide=await report('2026-10-01','2026-11-30','cash');
  record('Linked supplier source is stable across query ranges',{octStandalone:narrow.months[0].expenses.renta,octWide:wide.months[0].expenses.renta??0,novWide:wide.months[1].expenses.renta},{octConsistent:true},'Eligible linked bill governs its own recognition date independently of query range; unpaid mirrors do not become cash expenses.');
  assert.equal(narrow.months[0].expenses.renta??0,0); assert.equal(wide.months[0].expenses.renta??0,0);

  await clean();
  await db.unsafe(`INSERT INTO suppliers(id,name) VALUES ('${id(40)}','QA Supplier');
    INSERT INTO supplier_bills(id,subtotal,total,exchange_rate,category,description,issue_date,supplier_id,status,currency,bill_number) VALUES ('${id(41)}',100,116,1,'renta','Servicios','2026-10-05','${id(40)}','pending','MXN','QA-DUP');
    INSERT INTO operating_expenses(id,expense_date,category,description,amount,supplier_bill_id) VALUES ('${id(51)}','2026-10-05','publicidad','Servicios',100,NULL);`);
  const dedup=(await report('2026-10-01','2026-10-31')).months[0];
  record('Unlinked equal-text expenses remain independent',{expenses:dedup.expenses},{renta:100,publicidad:100},'Equal date, amount and description never erase an unlinked expense.');
  assert.equal(dedup.expenses.publicidad,100);

  // Durable identity governs linked source eligibility, including fallback states.
  await db.unsafe(`UPDATE operating_expenses SET supplier_bill_id='${id(41)}'`);
  assert.equal((await report('2026-10-01','2026-10-31')).months[0].expenses.publicidad??0,0);
  for (const status of ['draft','cancelled']) {
    await db.unsafe(`UPDATE supplier_bills SET status='${status}'`);
    const fallback=(await report('2026-10-01','2026-10-31')).months[0];
    assert.equal(fallback.expenses.publicidad,100); assert.equal(fallback.expenses.renta??0,0);
    const [docs]=await db`SELECT get_income_statement_documents('2026-10-01','2026-10-31','accrual','exp:publicidad',NULL,ARRAY['2026-10'],25,0) AS detail`;
    assert.equal(docs.detail.total_amount,100);
  }
  await db.unsafe("UPDATE supplier_bills SET status='pending',approval_status='rejected'");
  assert.equal((await report('2026-10-01','2026-10-31')).months[0].expenses.publicidad,100);
  await db.unsafe("UPDATE supplier_bills SET approval_status=NULL,category='software'");
  assert.equal((await report('2026-10-01','2026-10-31')).months[0].expenses.publicidad,100);

  await clean();
  await db.unsafe(`INSERT INTO supplier_bills(id,subtotal,total,exchange_rate,category,description,issue_date,status,currency,bill_number) VALUES ('${id(41)}',100,116,1,'software','QA software subscription','2026-10-05','pending','MXN','QA-SOFTWARE');
    INSERT INTO supplier_payments(id,bill_id,amount,payment_date) VALUES ('${id(42)}','${id(41)}',116,'2026-10-06');`);
  const softwareAccrual=(await report('2026-10-01','2026-10-31')).months[0];
  const softwareCash=(await report('2026-10-01','2026-10-31','cash')).months[0];
  record('Software scope omission',{accrual:softwareAccrual.expenses,cash:softwareCash.expenses},{},'Explicit SQL exclusion even though supplier bill form exposes software; classify as product/accounting scope decision, not accidental formula regression.');
  assert.deepEqual(softwareAccrual.expenses,{}); assert.deepEqual(softwareCash.expenses,{});

  await clean();
  await db.unsafe(`INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at) VALUES ('${id(50)}','QA Full life control',48000,'2022-01-01','2022-01-01');`);
  const lifeControl=await report('2022-01-01','2026-02-28');
  assert.equal(lifeControl.months.reduce((s,m)=>s+m.depreciation,0),48000);
  record('Depreciation first-of-month control',48000,48000,'Only mid-month activation leaves a missing terminal stub.');
  await db.unsafe(`INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at) VALUES ('${id(51)}','QA Full life control',48000,'2022-01-01','2022-01-01');`);
  const sameNames=(await report('2022-02-01','2022-02-28')).months[0];
  assert.equal(sameNames.depreciation,2000);
  assert.equal(sameNames.depreciation_by_forklift['QA Full life control'],2000);
  assert.equal(Object.values(sameNames.depreciation_by_forklift).reduce((a,b)=>a+b,0),sameNames.depreciation);

  // Preserve the existing monthly disposal/archive eligibility convention.
  for (const endField of ['sold_at','deleted_at']) {
    await clean();
    await db.unsafe(`INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at,${endField}) VALUES ('${id(50)}','QA disposed',48000,'2022-01-16','2022-01-16','2022-02-15');`);
    const disposed=await report('2022-01-01','2026-02-28');
    assert.ok(disposed.months[0].depreciation>0);
    assert.equal(disposed.months[2].depreciation,0);
    assert.equal(disposed.months.find(m=>m.month_key==='2026-01').depreciation,0);
  }
  await clean();
  await db.unsafe(`INSERT INTO forklifts(id,name,acquisition_cost,acquisition_date,created_at,is_e2e)
    VALUES ('${id(50)}','QA zero',0,'2022-01-16','2022-01-16',false),
      ('${id(51)}','QA null',NULL,'2022-01-16','2022-01-16',false),
      ('${id(52)}','QA test',48000,'2022-01-16','2022-01-16',true);`);
  assert.equal((await report('2022-01-01','2026-02-28')).months.reduce((a,m)=>a+m.depreciation,0),0);

  // Canonical RPC and refreshed document RPC retain tenant and role boundaries.
  await clean();
  await db.unsafe(`INSERT INTO invoices(id,subtotal,total,tipo_cambio,moneda,issued_at,status,organization_id)
    VALUES ('${id(10)}',100,100,1,'MXN','2026-10-01','sent','${orgA}'),
      ('${id(11)}',900,900,1,'MXN','2026-10-01','sent','${orgB}');
    GRANT USAGE ON SCHEMA public,auth TO authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    SET ROLE authenticated; SET test.role='admin'; SET test.org='${orgA}';`);
  assert.equal((await report('2026-10-01','2026-10-31')).months[0].revenue,100);
  const getDocs=async()=> (await db`SELECT get_income_statement_documents('2026-10-01','2026-10-31','accrual','other_services',NULL,ARRAY['2026-10'],25,0) AS detail`)[0].detail;
  assert.equal((await getDocs()).total_amount,100);
  await db.unsafe(`SET test.org='${orgB}'`);
  assert.equal((await getDocs()).total_amount,900);
  await db.unsafe("SET test.role='dispatcher'");
  await assert.rejects(report('2026-10-01','2026-10-31'),/denied|forbidden|permission/i);
  await assert.rejects(getDocs(),/denied|forbidden|permission/i);
  await db.unsafe("RESET ROLE; SET test.role='admin'; UPDATE role_permissions SET access_level='none' WHERE module='Facturas'; SET ROLE authenticated");
  await assert.rejects(getDocs(),/Forbidden document access/);
  await db.unsafe("RESET ROLE; UPDATE role_permissions SET access_level='read' WHERE module='Facturas';");
  // A future source modification must fail closed, not silently show stale details.
  await db.unsafe("DO $x$ BEGIN EXECUTE replace(pg_get_functiondef('get_income_statement(date,date,text)'::regprocedure),'BEGIN','BEGIN -- deliberate fixture drift'); END $x$;");
  await assert.rejects(getDocs(),/source version changed/);
  console.log('PASS: FX, proportional COGS, depreciation, approved stable dedup, document parity, ACL, RLS and drift guard.');
  console.log(JSON.stringify({results}, null, 2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(db)await db.end();if(started)pg('pg_ctl',['-D',`${dir}/data`,'-m','immediate','stop']); fs.rmSync(dir,{recursive:true,force:true});});
