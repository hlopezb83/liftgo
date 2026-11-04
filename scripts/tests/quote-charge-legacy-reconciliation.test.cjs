// Focused integration: exact 0107 + 0123 SQL on a reduced synthetic schema.
// Owns a NEW PostgreSQL cluster. Never accepts an existing URL, port or data dir.
// This does not replace full-schema SQL/RLS or Auth/PostgREST acceptance.
if (process.env.RUN_LOCAL_QUOTE_CHARGE_TESTS !== "1") {
  throw new Error("Set RUN_LOCAL_QUOTE_CHARGE_TESTS=1 and PG_BIN to run a new disposable cluster.");
}
if (process.env.QUOTE_CHARGE_TEST_DB_URL || process.env.QUOTE_CHARGE_TEST_PORT || process.env.QUOTE_CHARGE_TEST_CLUSTER) {
  throw new Error("Existing quote charge database/port/cluster inputs are forbidden.");
}
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { execFileSync } = require("node:child_process");
// Canonical upstream import: supports v3 CommonJS and v4 ESM and satisfies
// scripts/tests/postgres-import-guard.test.mjs on current main.
const postgres = require('../lib/postgres-factory.cjs')(require('postgres'));
const root = path.resolve(__dirname, "../..");
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw new Error("PG_BIN must be an absolute trusted PostgreSQL binary directory.");
// Keep data in the task's workspace: Windows may redirect os.tmpdir() to an
// AppContainer directory that does not grant PostgreSQL WAL rename rights.
const clusterParent = path.resolve(root, "../.quote-charge-test-clusters");
fs.mkdirSync(clusterParent, { recursive: true });
const directory = fs.mkdtempSync(path.join(clusterParent, "run-"));
const clients = [];
const config = { host: "127.0.0.1", user: "postgres", database: "postgres", password: "", ssl: false };
const uid = (n) => `12300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = uid(1), OTHER_ORG = uid(2), CUSTOMER = uid(3), OTHER_CUSTOMER = uid(4);
const ADMIN = uid(10), OTHER_ADMIN = uid(11), FINANCE = uid(12), AUDITOR = uid(13), SALES = uid(14), PORTAL = uid(15);
const Q = uid(100), Q2 = uid(101), RENT = uid(102), FOREIGN = uid(103), L = uid(110), L2 = uid(111);
const expectedRaceIds = Object.freeze([
  "historical-line-cross-quote", "same-request-idempotency", "multi-quote-lock-order",
  "reconcile-versus-native-invoice", "reversal-versus-native-invoice",
  "cancellation-versus-native-invoice", "reconcile-versus-quote-edit",
  "reactivation-after-new-invoice", "new-invoice-after-reactivation",
]);
const completedRaceIds = new Set();
function markRace(id) {
  assert.ok(expectedRaceIds.includes(id), `Unexpected race: ${id}`);
  assert.ok(!completedRaceIds.has(id), `Duplicate race: ${id}`);
  completedRaceIds.add(id);
  console.log(`PASS quote-charge-race ${id}`);
}
let started = false;
const pg = (name, args) => execFileSync(path.join(bin, name), args, {
  encoding: "utf8", timeout: 30_000, windowsHide: true,
  // A background Windows postgres inherits pipe handles from pg_ctl. Ignoring
  // its stdio lets the successful launcher exit; diagnostics use postgres.log.
  stdio: name === "pg_ctl" ? "ignore" : ["ignore", "pipe", "pipe"],
});
async function connection() {
  const pool = postgres({ ...config, max: 1, prepare: false, connect_timeout: 5, idle_timeout: 0,
    connection: { statement_timeout: 12_000 }, onnotice: () => {} });
  const sql = await pool.reserve();
  const [{ pid }] = await sql.unsafe("SELECT pg_backend_pid() AS pid");
  const client = { sql, pid, end: async () => { sql.release(); await pool.end({ timeout: 1 }); } };
  clients.push(client);
  return client;
}
async function start() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  config.port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  pg("initdb", ["-D", path.join(directory, "data"), "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  pg("pg_ctl", ["-D", path.join(directory, "data"), "-l", path.join(directory, "postgres.log"),
    "-o", `-h 127.0.0.1 -p ${config.port} -c unix_socket_directories=`, "start"]);
  started = true;
}
const ambiguous = (quantity = 1, description = "Synthetic delivery") => ({ description, quantity, unit_price: 100, total: quantity * 100 });
const native = (quantity = 1, quote = Q, line = L) => ({ ...ambiguous(quantity), line_kind: "charge", source_quote_id: quote, source_quote_line_id: line });
const rental = { description: "Synthetic equipment", line_kind: "rental", quantity: 1, unit_price: 100, total: 100 };
const charge = (line = L, quantity = 3) => ({ ...ambiguous(quantity), quote_line_id: line, line_kind: "charge" });
const history = (id = 300, lines = [ambiguous()], extras = {}) => ({ id: uid(id), quote_id: Q, booking_id: uid(200),
  customer_id: CUSTOMER, organization_id: ORG, invoice_number: `LEGACY-${id}`, line_items: lines,
  subtotal: lines.reduce((total, line) => total + line.total, 0), status: "draft", moneda: "MXN", ...extras });
const q = (client, text, values = []) => client.sql.unsafe(text, values);
async function begin(client, actor = ADMIN, role = "authenticated") {
  await q(client, "BEGIN ISOLATION LEVEL READ COMMITTED");
  await q(client, `SET LOCAL ROLE ${role}`);
  await q(client, "SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role })]);
}
async function as(client, actor, text, values = [], role = "authenticated") {
  await begin(client, actor, role);
  try { const result = await q(client, text, values); await q(client, "COMMIT"); return result; }
  catch (error) { await q(client, "ROLLBACK"); throw error; }
}
async function reset(c, histories = [history()]) {
  // Each fixture is created before the exact 0107 migration, so NULL markers are
  // genuine pre-migration state; no production guard is disabled to fabricate it.
  await q(c, `DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,slug text);
    CREATE TABLE public.customers(id uuid PRIMARY KEY,name text,created_by_organization_id uuid);
    CREATE TABLE public.organization_customers(organization_id uuid,customer_id uuid);
    CREATE TABLE public.organization_memberships(organization_id uuid,auth_user_id uuid UNIQUE,member_type text DEFAULT 'internal');
    CREATE TABLE public.user_roles(user_id uuid,role text);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(auth.jwt()->>'sub','')::uuid$$;
    CREATE FUNCTION public.has_role(p_id uuid,p_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_id AND role=p_role)$$;
    CREATE FUNCTION public.current_internal_organization_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT organization_id FROM organization_memberships WHERE auth_user_id=auth.uid() AND member_type='internal'$$;
    CREATE FUNCTION public.is_internal_member(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT EXISTS(SELECT 1 FROM organization_memberships WHERE auth_user_id=p_id AND member_type='internal')$$;
    CREATE FUNCTION public.fx_is_missing(text,numeric) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE SEQUENCE public.invoice_seq;
    CREATE FUNCTION public.next_draft_invoice_number() RETURNS text LANGUAGE sql AS $$SELECT 'SYNTHETIC-'||nextval('invoice_seq')$$;
    CREATE TABLE public.quotes(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,quote_number text,start_date date,end_date date,line_items jsonb DEFAULT '[]',subtotal numeric DEFAULT 0,tax_rate numeric DEFAULT 0,tax_amount numeric DEFAULT 0,total numeric DEFAULT 0,currency text DEFAULT 'MXN');
    CREATE TABLE public.bookings(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,quote_id uuid,booking_number text,status text,recurring_billing boolean,start_date date,end_date date,last_billed_date date);
    CREATE TABLE public.invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,invoice_number text,booking_id uuid,quote_id uuid,customer_id uuid,customer_name text,notes text,line_items jsonb DEFAULT '[]',subtotal numeric DEFAULT 0,tax_rate numeric DEFAULT 0,tax_amount numeric DEFAULT 0,total numeric DEFAULT 0,status text DEFAULT 'draft',due_date date,billing_period_start date,billing_period_end date,receptor_rfc text,receptor_razon_social text,receptor_regimen_fiscal text,receptor_domicilio_fiscal_cp text,uso_cfdi text,forma_pago text,metodo_pago text,moneda text DEFAULT 'MXN',tipo_cambio numeric DEFAULT 1,cfdi_status text,cfdi_uuid uuid,cancellation_status text);
    CREATE TABLE public.invoice_bookings(invoice_id uuid,booking_id uuid,organization_id uuid,line_index integer,PRIMARY KEY(invoice_id,booking_id));
    CREATE TABLE public.credit_notes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid,amount numeric);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated,service_role;
    INSERT INTO organizations VALUES('${ORG}','Synthetic A','synthetic-a'),('${OTHER_ORG}','Synthetic B','synthetic-b');
    INSERT INTO customers VALUES('${CUSTOMER}','Synthetic customer A','${ORG}'),('${OTHER_CUSTOMER}','Synthetic customer B','${OTHER_ORG}');
    INSERT INTO organization_customers VALUES('${ORG}','${CUSTOMER}'),('${OTHER_ORG}','${OTHER_CUSTOMER}');
    INSERT INTO auth.users VALUES('${ADMIN}','admin-a@synthetic.invalid'),('${OTHER_ADMIN}','admin-b@synthetic.invalid'),('${FINANCE}','finance@synthetic.invalid'),('${AUDITOR}','auditor@synthetic.invalid'),('${SALES}','sales@synthetic.invalid'),('${PORTAL}','portal@synthetic.invalid');
    INSERT INTO organization_memberships VALUES('${ORG}','${ADMIN}','internal'),('${OTHER_ORG}','${OTHER_ADMIN}','internal'),('${ORG}','${FINANCE}','internal'),('${ORG}','${AUDITOR}','internal'),('${ORG}','${SALES}','internal'),('${ORG}','${PORTAL}','portal');
    INSERT INTO user_roles VALUES('${ADMIN}','admin'),('${OTHER_ADMIN}','admin'),('${FINANCE}','administrativo'),('${AUDITOR}','auditor'),('${SALES}','ventas'),('${PORTAL}','customer');`);
  for (const [id, line, org, customer] of [[Q, charge(), ORG, CUSTOMER], [Q2, charge(L2), ORG, CUSTOMER], [RENT, rental, ORG, CUSTOMER], [FOREIGN, charge(uid(112)), OTHER_ORG, OTHER_CUSTOMER]]) {
    await q(c, "INSERT INTO quotes(id,organization_id,customer_id,quote_number,start_date,end_date,line_items,currency) VALUES($1,$2,$3,$4,current_date,current_date+30,$5::jsonb,'MXN')", [id, org, customer, `QUOTE-${id}`, JSON.stringify([line])]);
  }
  for (const [id, quote] of [[200, Q], [201, Q2], [202, RENT]]) {
    await q(c, "INSERT INTO bookings(id,organization_id,customer_id,quote_id,booking_number,status,recurring_billing,start_date,end_date) VALUES($1,$2,$3,$4,$5,'confirmed',true,current_date,current_date+30)", [uid(id), ORG, CUSTOMER, quote, `BOOK-${id}`]);
  }
  for (const invoice of histories) {
    const { pivots = [], ...row } = invoice;
    await q(c, "INSERT INTO invoices(id,organization_id,customer_id,invoice_number,quote_id,booking_id,line_items,subtotal,total,status,moneda,cfdi_status,cfdi_uuid,cancellation_status) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8,$9,$10,$11,$12,$13)",
      [row.id, row.organization_id, row.customer_id, row.invoice_number, row.quote_id, row.booking_id, JSON.stringify(row.line_items), row.subtotal, row.status, row.moneda, row.cfdi_status ?? null, row.cfdi_uuid ?? null, row.cancellation_status ?? null]);
    for (const bid of pivots) await q(c, "INSERT INTO invoice_bookings(invoice_id,booking_id,organization_id) VALUES($1,$2,$3)", [row.id, uid(bid), ORG]);
  }
  await q(c, fs.readFileSync(path.join(root, "drizzle/migrations/0107_quote_charge_tracking.sql"), "utf8"));
  await q(c, fs.readFileSync(path.join(root, "drizzle/migrations/0123_quote_charge_legacy_reconciliation.sql"), "utf8"));
}
const settle = (promise) => promise.then((rows) => ({ rows }), (error) => ({ error }));
async function waitBlocked(observer, client, blocker) {
  for (let i = 0; i < 200; i++) {
    const [state] = await q(observer, "SELECT wait_event_type,wait_event,$2::integer=ANY(pg_blocking_pids(pid)) AS expected_blocker FROM pg_stat_activity WHERE pid=$1", [client.pid, blocker.pid]);
    if (state?.wait_event_type === "Lock" && state.expected_blocker === true) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`Session ${client.pid} never reached a PostgreSQL lock wait behind session ${blocker.pid}`);
}
async function review(c, quote = Q, actor = ADMIN) {
  return (await as(c, actor, "SELECT public.get_quote_charge_legacy_review($1) AS value", [quote]))[0].value;
}
async function available(c, quote = Q) {
  return (await as(c, ADMIN, "SELECT public.get_quote_charge_availability(ARRAY[$1::uuid]) AS value", [quote]))[0].value.quotes[0];
}
async function args(c, { quote = Q, invoice = uid(300), index = 0, classification = "charge", line = L, quantity = 1, key = uid(900), hash } = {}) {
  const view = await review(c, quote);
  const source = view.invoices.find((item) => item.invoice_id === invoice)?.lines.find((item) => item.line_index === index);
  assert.ok(source, "Historical line is visible in scoped review");
  return [quote, invoice, index, hash ?? source.line_hash, classification, classification === "charge" ? line : null,
    classification === "charge" ? quantity : null, "Synthetic manual evidence review", "Synthetic immutable test fixture", key];
}
const reconcileSql = "SELECT public.reconcile_quote_charge_history($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS value";
const reverseSql = "SELECT public.reverse_quote_charge_history($1,$2,$3,$4) AS value";
async function reconcile(c, options = {}) { return (await as(c, ADMIN, reconcileSql, await args(c, options)))[0].value; }
async function invoice(c, quantity, id = 400, quote = Q, line = L) {
  return q(c, "INSERT INTO invoices(id,organization_id,customer_id,invoice_number,quote_id,line_items,subtotal,total,moneda) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$7,'MXN')",
    [uid(id), ORG, CUSTOMER, `NEW-${id}`, quote, JSON.stringify([native(quantity, quote, line)]), quantity * 100]);
}
async function expectCode(promise, code = "23514") { await assert.rejects(promise, (error) => error.code === code); }
async function race(observer, a, b, first, second) {
  await begin(a);
  const firstResult = await first();
  await begin(b);
  const waiting = settle(second());
  await waitBlocked(observer, b, a);
  await q(a, "COMMIT");
  const result = await waiting;
  await q(b, result.error ? "ROLLBACK" : "COMMIT");
  return { firstResult, ...result };
}
async function run() {
  await start();
  const c = await connection(), a = await connection(), b = await connection();
  await q(c, "CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");

  await reset(c);
  // Refuse standalone/superuser bypass as evidence of role security. SET ROLE
  // must really enable RLS before any suite completion marker can be emitted.
  await begin(c);
  const [security] = await q(c, "SELECT current_user AS role,row_security_active('public.quote_charge_legacy_reviews'::regclass) AS active");
  assert.equal(security.role, "authenticated");
  assert.equal(security.active, true, "Real RLS enforcement is required; standalone/bypass runs are not accepted");
  await q(c, "ROLLBACK");
  console.log("PASS quote-charge-rls ACTIVE");
  assert.equal((await available(c)).legacy_review_required, true);
  const before = (await q(c, "SELECT line_items,quote_charge_tracking_version FROM invoices WHERE id=$1", [uid(300)]))[0];
  const response = await reconcile(c);
  assert.equal(response.complete, true);
  assert.equal((await available(c)).legacy_review_required, false);
  assert.equal((await available(c)).lines[0].consumed_quantity, 1);
  assert.deepEqual((await q(c, "SELECT line_items,quote_charge_tracking_version FROM invoices WHERE id=$1", [uid(300)]))[0], before);
  assert.equal((await reconcile(c)).already_existed, true);
  await expectCode(reconcile(c, { quantity: 2 }));
  console.log("PASS audited linkage consumes history without modifying invoice JSON or NULL tracking; retry is idempotent");

  for (const [name, update] of [
    ["original line", "line_items=jsonb_set(line_items,'{0,description}','\"Changed\"')"],
    ["client", `customer_id='${OTHER_CUSTOMER}'`], ["currency", "moneda='USD'"],
    ["direct quote", "quote_id=NULL"], ["direct booking", "booking_id=NULL"],
    ["tenant", `organization_id='${OTHER_ORG}'`],
  ]) { await expectCode(q(c, `UPDATE invoices SET ${update} WHERE id='${uid(300)}'`)); console.log(`PASS reviewed invoice preserves ${name}`); }
  await expectCode(q(c, "UPDATE quotes SET line_items='[]' WHERE id=$1", [Q]));
  await expectCode(q(c, "DELETE FROM invoices WHERE id=$1", [uid(300)]));
  await expectCode(q(c, "UPDATE quotes SET customer_id=$1 WHERE id=$2", [OTHER_CUSTOMER,Q]));
  await expectCode(q(c, "UPDATE quotes SET currency='USD' WHERE id=$1", [Q]));
  await expectCode(q(c, "UPDATE bookings SET quote_id=$1 WHERE id=$2", [Q2,uid(200)]));
  await expectCode(q(c, "INSERT INTO invoice_bookings(invoice_id,booking_id,organization_id) VALUES($1,$2,$3)", [uid(300),uid(201),ORG]));
  await q(c, "UPDATE invoices SET notes='Synthetic notes-only edit' WHERE id=$1", [uid(300)]);
  console.log("PASS reviewed source identity and audit foreign keys resist deletion");

  await reset(c, [history(300, [native(), ambiguous()])]);
  await expectCode(reconcile(c, { index: 0 }));
  await reconcile(c, { index: 1 });
  assert.equal((await available(c)).lines[0].consumed_quantity, 2);
  await q(c, "UPDATE invoices SET status='cancelled' WHERE id=$1", [uid(300)]);
  await invoice(c, 2);
  await expectCode(q(c, "UPDATE invoices SET status='draft' WHERE id=$1", [uid(300)]));
  console.log("PASS native and historical consumption are counted per line; native line cannot be assigned twice");

  await reset(c, [history(300, [{ ...ambiguous(), source_quote_id: Q }])]);
  assert.equal((await available(c)).legacy_review_required, true);
  await expectCode(reconcile(c));
  console.log("PASS partially populated native origin remains pending and is never reconciled over");

  for (const provenance of [
    { source_quote_id: null, source_quote_line_id: null },
    { source_quote_id: "", source_quote_line_id: "" },
    { source_quote_id: Q, source_quote_line_id: uid(9999) },
  ]) {
    await reset(c, [history(300, [{ ...ambiguous(), ...provenance }])]);
    assert.equal((await available(c)).legacy_review_required, true);
    await expectCode(reconcile(c));
  }
  console.log("PASS null, blank and nonexistent native source references remain fail-closed");

  await reset(c, [history(300, [ambiguous(), ambiguous(1, "Other extra")], { quote_id: null, booking_id: null, pivots: [200, 201] })]);
  await reconcile(c);
  await reconcile(c, { index: 1, classification: "not_quote_charge", key: uid(901) });
  assert.equal((await available(c, Q)).legacy_review_required, false);
  assert.equal((await available(c, Q2)).legacy_review_required, true);
  await reconcile(c, { quote: Q2, classification: "not_quote_charge", key: uid(902) });
  await reconcile(c, { quote: Q2, line: L2, index: 1, key: uid(903) });
  assert.equal((await available(c, Q2)).legacy_review_required, false);
  assert.equal((await available(c, Q)).lines[0].consumed_quantity, 1);
  assert.equal((await available(c, Q2)).lines[0].consumed_quantity, 1);
  await q(c, "BEGIN");
  await q(c, "DELETE FROM invoice_bookings WHERE invoice_id=$1", [uid(300)]);
  await q(c, "INSERT INTO invoice_bookings(invoice_id,booking_id,organization_id) VALUES($1,$2,$4),($1,$3,$4)", [uid(300),uid(200),uid(201),ORG]);
  await q(c, "UPDATE invoices SET notes='Synthetic identical pivot save' WHERE id=$1", [uid(300)]);
  await q(c, "COMMIT");
  console.log("PASS review scope covers every ambiguous line of each related quote independently");

  await reset(c, [history(300, [ambiguous()], { quote_id: RENT, booking_id: uid(202) })]);
  assert.equal((await available(c, RENT)).legacy_review_required, false);
  await q(c, "INSERT INTO invoices(id,organization_id,customer_id,invoice_number,quote_id,line_items,subtotal,total) VALUES($1,$2,$3,'RENT-ONLY',$4,$5::jsonb,100,100)", [uid(401), ORG, CUSTOMER, RENT, JSON.stringify([rental])]);
  await q(c, "UPDATE quotes SET line_items=line_items||$1::jsonb WHERE id=$2", [JSON.stringify([charge(uid(114))]), RENT]);
  assert.equal((await available(c, RENT)).legacy_review_required, true);
  console.log("PASS quote without extras allows rental; adding an extra restores unresolved history review");

  await reset(c, [history(300, [], { subtotal: 100 })]);
  assert.equal((await available(c)).legacy_review_required, true);
  assert.equal((await review(c)).invoices[0].empty_positive, true);
  await expectCode(as(c, ADMIN, reconcileSql, [Q,uid(300),0,"0".repeat(64),"rental",null,null,"Synthetic","Synthetic",uid(999)]));
  console.log("PASS positive subtotal with empty historical array remains unresolved; no line is invented");

  await reset(c);
  const linked = await reconcile(c);
  const reversal = (await as(c, ADMIN, reverseSql, [linked.review_id,"Synthetic correction","Synthetic contrary evidence",uid(910)]))[0].value;
  assert.equal(reversal.complete, true);
  assert.equal((await available(c)).legacy_review_required, true);
  assert.equal((await available(c)).lines[0].consumed_quantity, 0);
  assert.equal((await as(c, ADMIN, reverseSql, [linked.review_id,"Synthetic correction","Synthetic contrary evidence",uid(910)]))[0].value.already_existed, true);
  await expectCode(q(c, "UPDATE invoices SET line_items='[]' WHERE id=$1", [uid(300)]));
  assert.equal((await q(c, "SELECT count(*)::int AS count FROM quote_charge_legacy_reviews"))[0].count, 1);
  assert.equal((await q(c, "SELECT count(*)::int AS count FROM quote_charge_legacy_reversals"))[0].count, 1);
  console.log("PASS audited reversal retains history and immutable source, restores pending state and is idempotent");

  await reset(c);
  const inactiveReview = await reconcile(c);
  await q(c, "UPDATE invoices SET status='cancelled' WHERE id=$1", [uid(300)]);
  await as(c, ADMIN, reverseSql, [inactiveReview.review_id,"Synthetic correction","Synthetic contrary evidence",uid(911)]);
  await invoice(c, 3);
  await expectCode(q(c, "UPDATE invoices SET status='draft' WHERE id=$1", [uid(300)]));
  console.log("PASS cancelled history with a reversed review cannot reactivate with unresolved scope");

  await reset(c);
  await reconcile(c);
  await q(c, "UPDATE invoices SET status='cancelled',cfdi_status='stamped',cfdi_uuid=gen_random_uuid(),cancellation_status='pending' WHERE id=$1", [uid(300)]);
  assert.equal((await available(c)).lines[0].consumed_quantity, 1);
  await q(c, "INSERT INTO credit_notes(invoice_id,amount) VALUES($1,100)", [uid(300)]);
  assert.equal((await available(c)).lines[0].consumed_quantity, 1);
  await q(c, "UPDATE invoices SET cancellation_status='accepted' WHERE id=$1", [uid(300)]);
  assert.equal((await available(c)).lines[0].consumed_quantity, 0);
  await q(c, "UPDATE invoices SET cfdi_status='stamping' WHERE id=$1", [uid(300)]);
  assert.equal((await available(c)).lines[0].consumed_quantity, 1);
  console.log("PASS stamping and pending fiscal cancellation reserve; accepted releases; credit note does not release");

  await reset(c, [history(300, [ambiguous()], { quote_id: null, booking_id: null, pivots: [200,201] })]);
  const firstArgs = await args(c), secondArgs = await args(c, { quote: Q2, line: L2, key: uid(920) });
  const sameLineRace = await race(c, a, b, () => q(a, reconcileSql, firstArgs), () => q(b, reconcileSql, secondArgs));
  assert.equal(sameLineRace.error?.code, "23514");
  assert.equal((await q(c, "SELECT count(*)::int AS count FROM quote_charge_legacy_reviews WHERE classification='charge'"))[0].count, 1);
  markRace("historical-line-cross-quote");

  await reset(c);
  const sameRequest = await args(c);
  const repeatRace = await race(c, a, b, () => q(a, reconcileSql, sameRequest), () => q(b, reconcileSql, sameRequest));
  assert.ifError(repeatRace.error);
  assert.equal(repeatRace.rows[0].value.already_existed, true);
  markRace("same-request-idempotency");

  await reset(c, [
    history(300, [ambiguous()], { quote_id: null, booking_id: null, pivots: [200,201] }),
    history(301, [ambiguous()], { quote_id: null, booking_id: null, pivots: [201,200] }),
  ]);
  const orderedA = await args(c, { classification: "rental" });
  const orderedB = await args(c, { quote: Q2, invoice: uid(301), classification: "rental", key: uid(921) });
  const orderedRace = await race(c, a, b, () => q(a, reconcileSql, orderedA), () => q(b, reconcileSql, orderedB));
  assert.ifError(orderedRace.error);
  markRace("multi-quote-lock-order");

  await reset(c, [history(300, [ambiguous(3)])]);
  const allArgs = await args(c, { quantity: 3 });
  const newInvoiceRace = await race(c, a, b, () => q(a, reconcileSql, allArgs), () => invoice(b, 1));
  assert.equal(newInvoiceRace.error?.code, "23514");
  assert.equal((await available(c)).lines[0].consumed_quantity, 3);
  markRace("reconcile-versus-native-invoice");

  await reset(c);
  const toReverse = await reconcile(c);
  const reverseRace = await race(c, a, b,
    () => q(a, reverseSql, [toReverse.review_id,"Synthetic correction","Synthetic contrary evidence",uid(922)]),
    () => invoice(b, 1));
  assert.equal(reverseRace.error?.code, "23514");
  assert.equal((await available(c)).legacy_review_required, true);
  markRace("reversal-versus-native-invoice");

  await reset(c);
  await reconcile(c);
  const cancelledRace = await race(c, a, b,
    () => q(a, "UPDATE invoices SET status='cancelled' WHERE id=$1", [uid(300)]), () => invoice(b, 3));
  assert.ifError(cancelledRace.error);
  await expectCode(q(c, "UPDATE invoices SET status='draft' WHERE id=$1", [uid(300)]));
  assert.equal((await available(c)).lines[0].consumed_quantity, 3);
  markRace("cancellation-versus-native-invoice");

  await reset(c);
  await reconcile(c);
  await q(c, "UPDATE invoices SET status='cancelled' WHERE id=$1", [uid(300)]);
  const reactivationAfterNewInvoice = await race(c, a, b,
    () => invoice(a, 3),
    () => q(b, "UPDATE invoices SET status='draft' WHERE id=$1", [uid(300)]));
  assert.equal(reactivationAfterNewInvoice.error?.code, "23514");
  assert.equal((await available(c)).lines[0].consumed_quantity, 3);
  assert.equal((await q(c, "SELECT status FROM invoices WHERE id=$1", [uid(300)]))[0].status, "cancelled");
  assert.equal((await q(c, "SELECT count(*)::int AS count FROM invoices WHERE id=$1", [uid(400)]))[0].count, 1);
  markRace("reactivation-after-new-invoice");

  await reset(c);
  await reconcile(c);
  await q(c, "UPDATE invoices SET status='cancelled' WHERE id=$1", [uid(300)]);
  const newInvoiceAfterReactivation = await race(c, a, b,
    () => q(a, "UPDATE invoices SET status='draft' WHERE id=$1", [uid(300)]),
    () => invoice(b, 3));
  assert.equal(newInvoiceAfterReactivation.error?.code, "23514");
  assert.equal((await available(c)).lines[0].consumed_quantity, 1);
  assert.equal((await q(c, "SELECT status FROM invoices WHERE id=$1", [uid(300)]))[0].status, "draft");
  assert.equal((await q(c, "SELECT count(*)::int AS count FROM invoices WHERE id=$1", [uid(400)]))[0].count, 0);
  markRace("new-invoice-after-reactivation");

  await reset(c, [history(300, [ambiguous(3)])]);
  const editArgs = await args(c, { quantity: 3 });
  const quoteEditRace = await race(c, a, b, () => q(a, reconcileSql, editArgs),
    () => q(b, "UPDATE quotes SET line_items=jsonb_set(line_items,'{0,quantity}','2') WHERE id=$1", [Q]));
  assert.equal(quoteEditRace.error?.code, "23514");
  markRace("reconcile-versus-quote-edit");

  await reset(c);
  const stale = await args(c);
  await q(c, "UPDATE invoices SET line_items=jsonb_set(line_items,'{0,description}','\"Changed before review\"') WHERE id=$1", [uid(300)]);
  await expectCode(as(c, ADMIN, reconcileSql, stale));
  for (const invalidQuantity of [0, -1, "NaN", "Infinity", "-Infinity"]) {
    await expectCode(reconcile(c, { quantity: invalidQuantity }));
  }
  for (const actor of [OTHER_ADMIN, FINANCE, AUDITOR, SALES, PORTAL]) {
    await expectCode(as(c, actor, reconcileSql, await args(c)), "42501");
  }
  for (const actor of [FINANCE, AUDITOR]) assert.equal((await review(c, Q, actor)).can_reconcile, false);
  for (const actor of [OTHER_ADMIN, SALES, PORTAL]) await expectCode(review(c, Q, actor), "42501");
  console.log("PASS hash freshness, finite positive quantities, tenant and existing write-role boundaries");

  const valid = await args(c);
  for (const index of [7,8]) { const empty = [...valid]; empty[index] = " "; await expectCode(as(c, ADMIN, reconcileSql, empty), "22023"); }
  await q(a, "BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE authenticated");
  await q(a, "SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
  await expectCode(q(a, reconcileSql, valid), "25001");
  await q(a, "ROLLBACK");
  console.log("PASS evidence/reason required and non-READ-COMMITTED writes fail closed");

  await reset(c, [history(300, [ambiguous()], { quote_id: null, booking_id: null, pivots: [200,201] })]);
  await reconcile(c);
  for (const statement of [
    `UPDATE invoices SET notes='Synthetic RR edit' WHERE id='${uid(300)}'`,
    `DELETE FROM invoices WHERE id='${uid(300)}'`,
    `UPDATE quotes SET line_items=line_items WHERE id='${Q}'`,
    `UPDATE quotes SET currency=currency WHERE id='${Q}'`,
    `DELETE FROM quotes WHERE id='${Q}'`,
    `UPDATE bookings SET quote_id='${Q2}' WHERE id='${uid(200)}'`,
    `INSERT INTO invoice_bookings(invoice_id,booking_id,organization_id) VALUES('${uid(300)}','${uid(202)}','${ORG}')`,
    `UPDATE invoice_bookings SET line_index=1 WHERE invoice_id='${uid(300)}' AND booking_id='${uid(200)}'`,
    `DELETE FROM invoice_bookings WHERE invoice_id='${uid(300)}' AND booking_id='${uid(200)}'`,
  ]) {
    await q(a, "BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE authenticated");
    await q(a, "SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
    await expectCode(q(a, statement), "25001");
    await q(a, "ROLLBACK");
  }
  console.log("PASS REPEATABLE READ mutations reject before stale audit snapshots can bypass guards");

  await reset(c, []);
  await q(c, fs.readFileSync(path.join(root, "supabase/tests/rls/quote_charge_legacy_reconciliation.sql"), "utf8"));
  console.log("PASS rollback SQL/RLS suite on reduced synthetic schema (full Supabase replay remains separate)");
  assert.deepEqual([...completedRaceIds].sort(), [...expectedRaceIds].sort(), "Every real two-session race must execute exactly once");
  console.log("PASS quote-charge-suite COMPLETE races=9 rls=1");
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
  if (started || fs.existsSync(path.join(directory, "data", "postmaster.pid"))) {
    pg("pg_ctl", ["-D", path.join(directory, "data"), "stop", "-m", "immediate"]);
  }
  console.log(`Disposable quote charge cluster stopped; diagnostics: ${directory}`);
});
