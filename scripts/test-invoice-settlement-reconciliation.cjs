// BF03/BF04 regression runner. Starts and stops its own disposable PostgreSQL.
// No database URL, credentials, real identifiers, remote migration, or provider.
// Executes the actual migration and existing trigger wrappers on a minimal schema.
// This is function/trigger coverage, NOT a replay of the full schema or RLS suite.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const postgres = require('./lib/postgres-factory.cjs')(require('postgres'));

const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw new Error('Set PG_BIN to installed PostgreSQL binaries');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'liftgo-settlement-test-'));
const dataDir = path.join(dir, 'data');
const root = path.resolve(__dirname, '..');
const pg = (command, args) => execFileSync(path.join(bin, command), args, { encoding: 'utf8', timeout: 30000 });
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function fn(source, name, delimiter = '$function$') {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf(delimiter, start);
  const end = source.indexOf(`${delimiter};`, bodyStart + delimiter.length);
  assert.notEqual(end, -1, `Missing end of function ${name}`);
  return source.slice(start, end + delimiter.length + 1);
}
let db;
let started = false;

(async () => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  pg('initdb', ['-D', dataDir, '-U', 'postgres', '--auth=trust']);
  pg('pg_ctl', ['-D', dataDir, '-l', path.join(dir, 'server.log'), '-o',
    `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, 'start']);
  started = true;
  db = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres',
    password: '', ssl: false, max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
  await db.unsafe(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.uid', true),'')::uuid$$;
    CREATE FUNCTION public.is_internal_member(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1 IS NOT NULL$$;
    CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('test.org', true),'')::uuid$$;
    CREATE FUNCTION public.today_mty() RETURNS date LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('test.today', true),''),'2026-10-20')::date$$;
    CREATE TABLE public.invoices(id uuid PRIMARY KEY, organization_id uuid, total numeric, status text,
      due_date date, paid_at date, moneda text, tipo_cambio numeric);
    CREATE TABLE public.payments(id uuid PRIMARY KEY, invoice_id uuid, organization_id uuid, amount numeric,
      currency text, exchange_rate numeric, payment_date date);
    CREATE TABLE public.credit_notes(id uuid PRIMARY KEY, invoice_id uuid, organization_id uuid, total numeric,
      cfdi_status text, status text, cancellation_status text);
    CREATE TABLE public.invoice_updates(invoice_id uuid);
    CREATE FUNCTION public.count_invoice_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO public.invoice_updates VALUES (NEW.id); RETURN NEW; END; $$;
    CREATE TRIGGER count_invoice_update AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.count_invoice_update();
    CREATE ROLE qa_internal;
    CREATE ROLE qa_anonymous;
  `);
  await db.unsafe(fn(read('supabase/migrations/20260901080020_f395aa5e-1e0c-4dd0-a311-4ff8b1b5ed60.sql'), 'fx_is_missing', '$$'));
  await db.unsafe(fn(read('supabase/migrations/20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql'), 'fx_convert_amount'));
  await db.unsafe(fn(read('drizzle/migrations/0103_canonical_payment_invoice_currency.sql'), 'sync_invoice_status'));
  // A pre-existing function ACL must survive CREATE OR REPLACE unchanged.
  await db.unsafe(`REVOKE ALL ON FUNCTION public.sync_invoice_status(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.sync_invoice_status(uuid) TO qa_internal;`);
  const metadata = () => db.unsafe(`SELECT proowner, proacl::text, prosecdef, proconfig::text
    FROM pg_proc WHERE oid='public.sync_invoice_status(uuid)'::regprocedure`);
  const [beforeMetadata] = await metadata();
  const migration = read('drizzle/migrations/0116_invoice_settlement_reconciliation.sql');
  await db.unsafe(migration);
  assert.deepEqual([...(await metadata())], [beforeMetadata]);
  await db.unsafe(migration);
  assert.deepEqual([...(await metadata())], [beforeMetadata]);
  const [access] = await db.unsafe(`SELECT has_function_privilege('qa_anonymous','public.sync_invoice_status(uuid)','EXECUTE') AS anonymous,
    has_function_privilege('qa_internal','public.sync_invoice_status(uuid)','EXECUTE') AS internal`);
  assert.deepEqual({ ...access }, { anonymous: false, internal: true });
  console.log('PASS ACL: owner, execution privileges, SECURITY DEFINER and search_path unchanged after applying twice.');

  const wrapperSource = read('supabase/migrations/20260828003501_74cee74b-b737-4869-866b-ebba4e5a57ef.sql');
  await db.unsafe(fn(wrapperSource, 'sync_invoice_status_from_payments'));
  await db.unsafe(fn(wrapperSource, 'sync_invoice_status_from_credit_notes'));
  await db.unsafe(wrapperSource.match(/CREATE TRIGGER trg_sync_invoice_from_credit_notes[\s\S]*?;/)[0]);
  await db.unsafe(`CREATE TRIGGER sync_invoice_status_from_payments_trg AFTER INSERT OR UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_status_from_payments();`);
  const org = randomUUID();
  const otherOrg = randomUUID();
  async function invoice({ total = 100, status = 'sent', due = '2026-10-31', paidAt = null, currency = 'MXN', rate = 1, organization = org } = {}) {
    const id = randomUUID();
    await db`INSERT INTO invoices VALUES (${id},${organization},${total},${status},${due},${paidAt},${currency},${rate})`;
    return id;
  }
  async function payment(invoiceId, amount, date, { currency = 'MXN', rate = 1, organization = org } = {}) {
    const id = randomUUID();
    await db`INSERT INTO payments VALUES (${id},${invoiceId},${organization},${amount},${currency},${rate},${date})`;
    return id;
  }
  async function note(invoiceId, total, { organization = org, status = 'issued', cfdi = 'stamped', cancellation = null } = {}) {
    const id = randomUUID();
    await db`INSERT INTO credit_notes VALUES (${id},${invoiceId},${organization},${total},${cfdi},${status},${cancellation})`;
    return id;
  }
  const state = async (id) => ({ ...(await db`SELECT status, paid_at::text FROM invoices WHERE id=${id}`)[0] });
  const reconcile = (id) => db`SELECT public.sync_invoice_status(${id}::uuid)`;
  const updates = async (id) => Number((await db`SELECT count(*) AS n FROM invoice_updates WHERE invoice_id=${id}`)[0].n);
  async function stable(id, expected) {
    assert.deepEqual(await state(id), expected);
    const count = await updates(id);
    await reconcile(id); await reconcile(id);
    assert.deepEqual(await state(id), expected);
    assert.equal(await updates(id), count, 'No redundant invoice UPDATE on identical financial state');
  }

  const inv = await invoice();
  const pay = await payment(inv, 100, '2026-09-10');
  await stable(inv, { status: 'paid', paid_at: '2026-09-10' });
  await db`UPDATE payments SET payment_date='2026-09-12' WHERE id=${pay}`;
  await stable(inv, { status: 'paid', paid_at: '2026-09-12' });
  await db`UPDATE payments SET payment_date='2026-09-07' WHERE id=${pay}`;
  await stable(inv, { status: 'paid', paid_at: '2026-09-07' });
  await db`UPDATE payments SET amount=60 WHERE id=${pay}`;
  await stable(inv, { status: 'partial', paid_at: null });
  const pay2 = await payment(inv, 40, '2026-09-20');
  await stable(inv, { status: 'paid', paid_at: '2026-09-20' });
  await db`UPDATE payments SET payment_date='2026-09-01' WHERE id=${pay2}`;
  await stable(inv, { status: 'paid', paid_at: '2026-09-07' });
  await db`DELETE FROM payments WHERE invoice_id=${inv}`;
  await stable(inv, { status: 'sent', paid_at: null });
  console.log('PASS BF03: payment date edits forward/backward, latest of split payments, amount reduction and deletion.');

  const creditInvoice = await invoice();
  await note(creditInvoice, 40);
  await stable(creditInvoice, { status: 'partial', paid_at: null });
  const secondCredit = await note(creditInvoice, 60);
  await stable(creditInvoice, { status: 'paid', paid_at: '2026-10-20' });
  await db`SELECT set_config('test.today','2026-10-21',false)`;
  await stable(creditInvoice, { status: 'paid', paid_at: '2026-10-20' });
  await db`SELECT set_config('test.today','2026-10-20',false)`;
  await db`UPDATE credit_notes SET status='cancelled', cfdi_status='cancelled', cancellation_status='accepted' WHERE id=${secondCredit}`;
  await stable(creditInvoice, { status: 'partial', paid_at: null });
  const [balance] = await db`SELECT total-(SELECT sum(total) FROM credit_notes WHERE invoice_id=${creditInvoice} AND status='issued') AS amount FROM invoices WHERE id=${creditInvoice}`;
  assert.equal(Number(balance.amount), 60);
  // Same partial credit state must not depend on any previous operational status.
  for (const oldStatus of ['sent', 'overdue', 'partial', 'paid']) {
    await db`UPDATE invoices SET status=${oldStatus}, paid_at='2026-09-01' WHERE id=${creditInvoice}`;
    await reconcile(creditInvoice);
    await stable(creditInvoice, { status: 'partial', paid_at: null });
  }
  await db`DELETE FROM credit_notes WHERE invoice_id=${creditInvoice}`;
  await stable(creditInvoice, { status: 'sent', paid_at: null });
  const overdue = await invoice({ due: '2026-09-30', status: 'paid', paidAt: '2026-09-01' });
  await reconcile(overdue);
  await stable(overdue, { status: 'overdue', paid_at: null });
  await note(overdue, 40);
  await stable(overdue, { status: 'partial', paid_at: null });
  console.log('PASS BF04: cancel NC60 after NC40+60, balance60 preserved; repeated sync no-op; all prior statuses converge.');

  const controls = await invoice();
  await note(controls, 100, { status: 'draft', cfdi: 'draft' });
  await note(controls, 100, { cancellation: 'accepted' });
  await note(controls, 100, { organization: otherOrg });
  await payment(controls, 100, '2026-09-10', { organization: otherOrg });
  await stable(controls, { status: 'sent', paid_at: null });
  for (const status of ['draft', 'cancelled']) {
    const id = await invoice({ status });
    await payment(id, 100, '2026-09-10');
    await stable(id, { status, paid_at: null });
  }
  const fx = await invoice({ total: 1000 });
  const fxPay = await payment(fx, 50, '2026-09-10', { currency: 'USD', rate: 20 });
  await stable(fx, { status: 'paid', paid_at: '2026-09-10' });
  await db`UPDATE payments SET exchange_rate=NULL, payment_date='2026-09-12' WHERE id=${fxPay}`;
  await stable(fx, { status: 'paid', paid_at: '2026-09-10' });
  await db`UPDATE payments SET exchange_rate=20 WHERE id=${fxPay}`;
  await stable(fx, { status: 'paid', paid_at: '2026-09-12' });
  const invalid = await invoice({ total: 'NaN' });
  await reconcile(invalid);
  await stable(invalid, { status: 'sent', paid_at: null });
  console.log('PASS controls: draft/cancelled excluded, active NC predicate, cross-organization money excluded, actual FX conversion and missing-FX/NaN guards.');

  await db`SELECT set_config('test.uid',${randomUUID()},false), set_config('test.org',${otherOrg},false)`;
  await assert.rejects(() => reconcile(controls), error => error.code === '42501');
  await db`SELECT set_config('test.org','',false)`;
  await assert.rejects(() => reconcile(controls), error => error.code === '42501');
  await db`SELECT set_config('test.org',${org},false)`;
  await stable(controls, { status: 'sent', paid_at: null });
  console.log('PASS organization guard: internal wrong/missing organization denied; matching organization allowed.');
  console.log('PASS: BF03/BF04 migration and exact existing trigger wrappers; disposable minimal-schema integration, no shared DB/provider.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (db) await db.end({ timeout: 1 });
  if (started) pg('pg_ctl', ['-D', dataDir, '-m', 'immediate', 'stop']);
  console.log('Disposable cluster stopped:', dir);
});
