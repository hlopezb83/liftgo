// Real PostgreSQL RPC -> production trigger regression. The local schema is
// deliberately focused; the companion SQL is also discovered by full-schema CI.
// No remote URL, existing cluster, network service, PAC, or .env is accepted.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const postgres = require('postgres');
if (process.env.RUN_LOCAL_RECURRING_LIFECYCLE_TESTS !== '1') {
  throw Error('Explicit RUN_LOCAL_RECURRING_LIFECYCLE_TESTS=1 opt-in required.');
}
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw Error('PG_BIN must identify trusted PostgreSQL binaries.');
const root = path.resolve(__dirname, '../../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recurring-lifecycle-0122-'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function extract(file, name) {
  const source = read(file);
  const start = source.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\s*\\(`, 'i'));
  assert.ok(start >= 0, `Missing repository function ${name}`);
  const body = source.slice(start);
  const delimiter = body.match(/\bAS\s+(\$[a-zA-Z_]*\$)/i);
  assert.ok(delimiter, `Missing function delimiter ${name}`);
  const end = body.indexOf(delimiter[1], delimiter.index + delimiter[0].length);
  assert.ok(end >= 0, `Unclosed function ${name}`);
  return body.slice(0, end + delimiter[1].length + 1);
}
const run = (name, args) => execFileSync(path.join(bin, name), args, { encoding: 'utf8', timeout: 30_000 });
let sql, started = false;
async function main() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  run('initdb', ['-D', `${dir}/data`, '-U', 'postgres', '--auth=trust']);
  run('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/server.log`, '-o',
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start']);
  started = true;
  sql = postgres({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres',
    password: '', ssl: false, max: 1, prepare: false, connection: { statement_timeout: 15_000 },
    onnotice: (notice) => { if (notice.message.startsWith('PASS 0122:')) console.log(notice.message); } });
  const query = (statement) => sql.unsafe(statement).simple();
  assert.equal((await query('SHOW data_directory'))[0].data_directory, `${dir}/data`);
  await query(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
    CREATE TYPE app_role AS ENUM('admin','administrativo','dispatcher','mechanic');
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz,updated_at timestamptz);
    CREATE TABLE organizations(id uuid PRIMARY KEY,name text,slug text,is_active boolean DEFAULT true);
    CREATE TABLE profiles(user_id uuid PRIMARY KEY REFERENCES auth.users,full_name text,email text,is_active boolean DEFAULT true);
    CREATE TABLE user_roles(user_id uuid PRIMARY KEY REFERENCES auth.users,role app_role);
    CREATE TABLE organization_memberships(organization_id uuid REFERENCES organizations,auth_user_id uuid UNIQUE REFERENCES auth.users,member_type text);
    CREATE TABLE forklifts(id uuid PRIMARY KEY,name text,model text,organization_id uuid REFERENCES organizations,status text DEFAULT 'available',updated_at timestamptz DEFAULT now());
    CREATE TABLE bookings(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations,forklift_id uuid REFERENCES forklifts,booking_number text,
      status text,return_status text,recurring_billing boolean,last_billed_date date,updated_at timestamptz DEFAULT now(),customer_id uuid,start_date date,end_date date,daily_rate numeric,monthly_rate numeric);
    CREATE TABLE return_inspections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,booking_id uuid REFERENCES bookings,forklift_id uuid REFERENCES forklifts,
      condition text,damage_notes text,damage_cost numeric,hours_used numeric,fuel_level text,inspected_at timestamptz,extra_hours numeric,suggested_extra_hour_charge numeric,inspected_by text,late_days numeric,suggested_late_charge numeric);
    CREATE TABLE deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations,booking_id uuid REFERENCES bookings,forklift_id uuid REFERENCES forklifts,
      type text,status text,scheduled_date date,scheduled_time time,driver_name text,completed_at timestamptz,hours_reading numeric,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid REFERENCES bookings,organization_id uuid,status text,created_at timestamptz DEFAULT now(),max_hours_per_month numeric,extra_hour_rate numeric);
    CREATE TABLE damage_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inspection_id uuid REFERENCES return_inspections,booking_id uuid REFERENCES bookings,forklift_id uuid REFERENCES forklifts,
      customer_id uuid,organization_id uuid,description text,estimated_cost numeric,status text,previous_forklift_status text,deleted_at timestamptz,repaired_at timestamptz);
    CREATE TABLE maintenance_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,forklift_id uuid REFERENCES forklifts,deleted_at timestamptz,work_status text);
    CREATE TABLE status_logs(forklift_id uuid REFERENCES forklifts,organization_id uuid,from_status text,to_status text,note text,changed_by uuid);
    CREATE TABLE invoices(id uuid PRIMARY KEY,organization_id uuid,booking_id uuid REFERENCES bookings,status text,cfdi_status text,cancellation_status text);
    CREATE TABLE invoice_bookings(invoice_id uuid REFERENCES invoices,booking_id uuid REFERENCES bookings,organization_id uuid);
  `);
  for (const [file, name] of [
    ['supabase/migrations/20260826064202_ef2522e8-eca3-44b8-a9b3-e81a9f3a7767.sql', 'is_active_user'],
    ['supabase/migrations/20260826064202_ef2522e8-eca3-44b8-a9b3-e81a9f3a7767.sql', 'has_role'],
    ['drizzle/migrations/0031_multi_org_audit_hardening.sql', 'current_internal_organization_id'],
    ['drizzle/migrations/0039_multi_org_rpc_helper_invoker_scope.sql', 'is_internal_member'],
    ['supabase/migrations/20260731235443_7b2ca674-f6e0-4b98-95b9-1039fa28abfb.sql', 'today_mty'],
    ['supabase/migrations/20260831214332_ff2f6533-2d50-48f3-bd46-1355a6ba5e7c.sql', 'booking_is_returned'],
    ['supabase/migrations/20260909101000_lifecycle_integrity.sql', 'reconcile_expired_bookings'],
    ['supabase/migrations/20260910024217_6e0dff35-78d9-4351-b7a7-ad3e86e1dae9.sql', 'cancel_booking'],
    ['supabase/migrations/20260729204615_2743fd43-3b15-4e1c-90f3-811c034021bd.sql', 'guard_booking_completion'],
    ['supabase/migrations/20260910063341_fc71dfd9-ffed-424a-9694-257acbf42358.sql', 'clear_recurring_billing_on_cancel'],
    ['drizzle/migrations/0081_operational_lifecycle_guards.sql', 'complete_return_inspection'],
    ['drizzle/migrations/0106_booking_invoice_cancellation_guards.sql', 'guard_booking_cancellation_invoices'],
  ]) await query(extract(file, name));
  // Replay the effective INVOKER changes from 0014/0015, not rewritten bodies.
  await query(`
    ALTER FUNCTION public.cancel_booking(uuid,text) SECURITY INVOKER;
    ALTER FUNCTION public.booking_is_returned(uuid) SECURITY INVOKER;
    ALTER FUNCTION public.reconcile_expired_bookings() SECURITY INVOKER;
    CREATE TRIGGER trg_guard_booking_completion BEFORE UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION guard_booking_completion();
    CREATE TRIGGER trg_bookings_clear_recurring_on_cancel BEFORE UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION clear_recurring_billing_on_cancel();
    CREATE TRIGGER trg_booking_cancel_invoices BEFORE UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION guard_booking_cancellation_invoices();
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    REVOKE ALL ON FUNCTION public.reconcile_expired_bookings() FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.reconcile_expired_bookings() TO authenticated,service_role;
    REVOKE ALL ON FUNCTION public.clear_recurring_billing_on_cancel() FROM PUBLIC,anon,authenticated;
    ALTER TABLE deliveries ALTER organization_id SET DEFAULT public.current_internal_organization_id();
  `);
  for (const table of ['bookings','forklifts','deliveries','return_inspections','contracts','damage_records','maintenance_logs','invoices','invoice_bookings','status_logs']) {
    await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON ${table} TO authenticated USING(organization_id=public.current_internal_organization_id()) WITH CHECK(organization_id=public.current_internal_organization_id());`);
  }
  const suite = read('supabase/tests/rls/completed_recurring_lifecycle_0122.sql').replace(/^\\set.*$/gm, '');
  await assert.rejects(query(suite), /0122: real return RPC preserves recurring modality/);
  await query('ROLLBACK; RESET ROLE');
  console.log('RED confirmed: unmodified 0081 return RPC fires historical trigger and loses recurring=true');

  // A second independent baseline exposes the historical completion provenance
  // blocker. Keep the real trigger enabled; never forge app.booking_rpc in a test.
  const seed = suite.slice(0, suite.indexOf('-- The real 0081 RPC'));
  await query(seed);
  await query(`RESET ROLE;
    INSERT INTO return_inspections(booking_id,forklift_id,organization_id,condition,fuel_level,inspected_at)
    SELECT id,forklift_id,organization_id,'good','Full',now()-interval '1 day' FROM bookings WHERE id='12200000-0000-4000-8000-000000000204';
    SET LOCAL ROLE authenticated;`);
  await assert.rejects(query('SELECT * FROM reconcile_expired_bookings()'), (error) => error.code === '23514' && /flujo de devolucion/.test(error.message));
  await query('ROLLBACK; RESET ROLE');
  console.log('RED confirmed: historical reconciliation is rejected by the real completion-provenance trigger');

  const catalog = () => query(`SELECT p.oid,p.proowner,p.proacl::text,p.prosecdef,p.proconfig FROM pg_proc p
    WHERE p.oid IN ('public.clear_recurring_billing_on_cancel()'::regprocedure,'public.reconcile_expired_bookings()'::regprocedure) ORDER BY p.oid`);
  const triggers = () => query(`SELECT oid,tgfoid,tgenabled,pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='public.bookings'::regclass ORDER BY oid`);
  const before = await catalog(), beforeTriggers = await triggers();
  await query(`INSERT INTO organizations(id,name,slug) VALUES('12200000-0000-4000-8000-000000009001','Historical fixture','historical-fixture-0122');
    INSERT INTO forklifts(id,organization_id) VALUES('12200000-0000-4000-8000-000000009101','12200000-0000-4000-8000-000000009001');
    INSERT INTO bookings(id,forklift_id,organization_id,status,recurring_billing,start_date,end_date) VALUES
    ('12200000-0000-4000-8000-000000009201','12200000-0000-4000-8000-000000009101','12200000-0000-4000-8000-000000009001','completed',false,current_date-60,current_date-10);`);
  const historic = await query('SELECT to_jsonb(b) AS row FROM bookings b ORDER BY id');
  const migration = read('drizzle/migrations/0122_preserve_completed_recurring_billing.sql');
  await query(`BEGIN; ${migration} COMMIT;`);
  assert.deepEqual(await query('SELECT to_jsonb(b) AS row FROM bookings b ORDER BY id'), historic, '0122 cannot backfill or modify existing business rows');
  assert.deepEqual(await catalog(), before, '0122 must preserve identity, ownership, ACLs, INVOKER and search path');
  assert.deepEqual(await triggers(), beforeTriggers, '0122 must retain all original triggers enabled');
  console.log('PASS 0122: unchanged function ACL/ownership/security, trigger identity and historical business rows');
  await query(suite);

  // Bind the SQL predicate exercised above to the actual Edge planner's filters.
  // This proves the selection contract, not a full Edge/PAC execution.
  const edge = read('supabase/functions/generate-recurring-invoices/handler.ts');
  const plan = edge.slice(edge.indexOf('let bookingsQuery ='), edge.indexOf('if (organizationId)', edge.indexOf('let bookingsQuery =')));
  assert.match(plan, /\.eq\("recurring_billing", true\)/);
  assert.match(plan, /\.eq\("status", "confirmed"\)/);
  assert.doesNotMatch(plan, /\.in\("status"/);
  console.log('PASS 0122: actual automatic Edge planner still selects recurring=true and status=confirmed only');
  console.log('GREEN: real lifecycle RPCs and original triggers passed. Local tables/auth transport are focused fixtures; full-schema Supabase CI remains a separate gate.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (sql) await sql.end({ timeout: 5 });
  if (started) run('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', 'stop']);
  console.log(`Disposable local diagnostics: ${dir}`);
});
