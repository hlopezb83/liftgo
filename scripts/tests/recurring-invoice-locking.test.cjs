// Opt-in only: owns a fresh PostgreSQL cluster, never accepts a database URL.
if (process.env.RUN_LOCAL_RECURRING_TESTS !== "1") {
  console.log(
    "SKIP: set RUN_LOCAL_RECURRING_TESTS=1 and PG_BIN for disposable PostgreSQL tests",
  );
  process.exit(0);
}
const { Client } = require(process.env.PG_MODULE || "pg");
const fs = require("fs"),
  assert = require("assert/strict");
const path = require("path"),
  os = require("os"),
  net = require("net");
const { execFileSync } = require("child_process");
const config = {
  host: "127.0.0.1",
  user: "postgres",
  database: "postgres",
  statement_timeout: 10000,
};
const root = path.resolve(__dirname, "../..");
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin))
  throw Error(
    "PG_BIN must be an absolute directory of trusted PostgreSQL binaries",
  );
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recurring-0114-"));
const clients = [];
function pg(cmd, args) {
  return execFileSync(path.join(bin, cmd), args, {
    encoding: "utf8",
    timeout: 30000,
  });
}
async function start() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  config.port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  pg("initdb", [
    "-D",
    path.join(dir, "data"),
    "-U",
    "postgres",
    "--auth=trust",
  ]);
  // No socket directory, no external listener, no previously initialized database.
  pg("pg_ctl", [
    "-D",
    path.join(dir, "data"),
    "-l",
    path.join(dir, "server.log"),
    "-o",
    `-h 127.0.0.1 -p ${config.port} -c unix_socket_directories=`,
    "start",
  ]);
}

const uid = (n) => `10900000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function conn() {
  const c = new Client(config);
  await c.connect();
  clients.push(c);
  return c;
}
const ids = (ns) => `ARRAY[${ns.map((n) => `'${uid(n)}'::uuid`).join(",")}]`;
const call = (ns, start = "2026-01-01", end = "2026-01-31") =>
  `SELECT * FROM create_recurring_invoice(${ids(ns)}, '${uid(2)}','QA','[]',100,16,16,116,'${start}','${end}','XAXX010101000','QA','601','01000','G03')`;
const lock = (n) =>
  `pg_advisory_xact_lock(('x'||substr(md5('${uid(n)}'),1,15))::bit(60)::bigint)`;
(async () => {
  await start();
  const c = await conn();
  await c.query(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{"role":"service_role"}'::jsonb$$; CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$; CREATE FUNCTION current_internal_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$; CREATE FUNCTION is_internal_member(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$; CREATE FUNCTION fx_is_missing(text,numeric) RETURNS boolean LANGUAGE sql AS $$SELECT false$$; CREATE SEQUENCE invoice_seq; CREATE FUNCTION next_draft_invoice_number() RETURNS text LANGUAGE sql AS $$SELECT 'QA-'||nextval('invoice_seq')$$;
CREATE TABLE bookings(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,booking_number text,status text,recurring_billing boolean,start_date date,end_date date,last_billed_date date);
CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,invoice_number text,booking_id uuid,customer_id uuid,customer_name text,line_items jsonb,subtotal numeric,tax_rate numeric,tax_amount numeric,total numeric,status text,due_date date,billing_period_start date,billing_period_end date,receptor_rfc text,receptor_razon_social text,receptor_regimen_fiscal text,receptor_domicilio_fiscal_cp text,uso_cfdi text,forma_pago text,metodo_pago text,moneda text,tipo_cambio numeric,cfdi_status text,cfdi_uuid uuid,cancellation_status text);
CREATE TABLE invoice_bookings(invoice_id uuid,booking_id uuid,organization_id uuid,PRIMARY KEY(invoice_id,booking_id));`);
  const sql = fs.readFileSync(
    path.join(root, "drizzle/migrations/0107_quote_charge_tracking.sql"),
    "utf8",
  );
  await c.query(
    sql.match(
      /CREATE FUNCTION public.quote_charge_invoice_active[\s\S]*?\$\$;/,
    )[0],
  );
  await c.query(
    sql.match(
      /CREATE OR REPLACE FUNCTION public.create_recurring_invoice[\s\S]*?\$function\$;/,
    )[0],
  );
  if (process.env.RECURRING_BASELINE !== "1")
    await c.query(
      fs.readFileSync(
        path.join(
          root,
          "drizzle/migrations/0114_recurring_invoice_booking_lock.sql",
        ),
        "utf8",
      ),
    );
  async function reset() {
    await c.query("TRUNCATE invoice_bookings,invoices,bookings");
    for (const n of [10, 11, 12])
      await c.query(
        `INSERT INTO bookings VALUES('${uid(n)}','${uid(1)}','${uid(2)}','B${n}','active',true,'2026-01-01','2026-12-31',null)`,
      );
  }
  const a = await conn(),
    b = await conn();
  async function waitBlocked(client, event = "advisory") {
    for (let i = 0; i < 100; i++) {
      let r = await c.query(
        "SELECT wait_event FROM pg_stat_activity WHERE pid=$1",
        [client.processID],
      );
      if (r.rows[0]?.wait_event === event) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("not blocked");
  }
  async function concurrent(first, second) {
    await a.query("BEGIN");
    let r1 = await a.query(call(first));
    let pending = b
      .query(call(second))
      .then((r) => ({ rows: r.rows }))
      .catch((e) => ({ code: e.code, message: e.message }));
    await waitBlocked(b);
    await a.query("COMMIT");
    return [r1.rows[0], await pending];
  }
  await reset();
  let [one, two] = await concurrent([10], [10]);
  assert.equal(two.rows[0].invoice_id, one.invoice_id);
  assert.equal(two.rows[0].already_existed, true);
  console.log(
    "PASS same booking+period concurrent: one invoice, second reuses",
  );
  await reset();
  [one, two] = await concurrent([10, 11], [11, 10]);
  assert.equal(two.rows[0].invoice_id, one.invoice_id);
  assert.equal(two.rows[0].already_existed, true);
  console.log("PASS reversed grouped ids: no deadlock, one invoice");
  await reset();
  [one, two] = await concurrent([10, 11], [11, 12]);
  assert.equal(two.code, "23514");
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
    1,
  );
  assert.equal(
    (
      await c.query(
        `SELECT last_billed_date FROM bookings WHERE id='${uid(12)}'`,
      )
    ).rows[0].last_billed_date,
    null,
  );
  console.log("PASS partial group collision:23514, third booking untouched");
  await reset();
  await a.query("BEGIN");
  await a.query(call([10]));
  let p = b.query(call([10]));
  await waitBlocked(b);
  await a.query("ROLLBACK");
  two = (await p).rows[0];
  assert.equal(two.already_existed, false);
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
    1,
  );
  console.log("PASS first transaction rollback: waiter creates exactly one");

  // Each mutation happens only after the observer confirms that the invoice
  // request is waiting. This is a functional regression, not a sleep-based race.
  for (const mutation of [
    "status='cancelled'",
    "status='completed'",
    "recurring_billing=false",
    `customer_id='${uid(99)}'`,
    "start_date='2026-02-01'",
    "end_date='2026-01-15'",
    `organization_id='${uid(99)}'`,
    "DELETE",
  ]) {
    await reset();
    await a.query("BEGIN");
    await a.query(`SELECT ${lock(10)}`);
    const pending = b
      .query(call([10]))
      .then((r) => ({ rows: r.rows }))
      .catch((e) => ({ code: e.code }));
    await waitBlocked(b);
    await a.query(
      mutation === "DELETE"
        ? `DELETE FROM bookings WHERE id='${uid(10)}'`
        : `UPDATE bookings SET ${mutation} WHERE id='${uid(10)}'`,
    );
    await a.query("COMMIT");
    const outcome = await pending;
    assert.equal(
      outcome.code,
      "23514",
      `must reject changed booking: ${mutation}`,
    );
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
      0,
    );
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM invoice_bookings")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await c.query(
          "SELECT count(*)::int n FROM bookings WHERE last_billed_date IS NOT NULL",
        )
      ).rows[0].n,
      0,
    );
    console.log(`PASS revalidate after advisory wait: ${mutation}`);
  }
  // A normal booking writer does not have to participate in advisory locking.
  await reset();
  await a.query("BEGIN");
  await a.query(`UPDATE bookings SET status='cancelled' WHERE id='${uid(10)}'`);
  let pending = b
    .query(call([10]))
    .then((r) => ({ rows: r.rows }))
    .catch((e) => ({ code: e.code }));
  await waitBlocked(b, "transactionid");
  await a.query("COMMIT");
  assert.equal((await pending).code, "23514");
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
    0,
  );
  console.log("PASS cancelled while waiting on booking row lock: no invoice");
  // Row protection lasts until transaction completion, including after the RPC.
  await reset();
  await a.query("BEGIN");
  await a.query(call([10]));
  pending = b.query(
    `UPDATE bookings SET status='cancelled' WHERE id='${uid(10)}'`,
  );
  await waitBlocked(b, "transactionid");
  await a.query("ROLLBACK");
  await pending;
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
    0,
  );
  console.log("PASS booking update waits for invoice transaction completion");
  // At stronger isolation, PostgreSQL must reject stale versions rather than
  // quietly billing against the transaction's older eligibility snapshot.
  for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"]) {
    await reset();
    await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    await b.query("SELECT count(*) FROM bookings");
    await a.query("BEGIN");
    await a.query(
      `UPDATE bookings SET status='cancelled' WHERE id='${uid(10)}'`,
    );
    pending = b
      .query(call([10]))
      .then((r) => ({ rows: r.rows }))
      .catch((e) => ({ code: e.code }));
    await waitBlocked(b, "transactionid");
    await a.query("COMMIT");
    assert.equal((await pending).code, "40001");
    await b.query("ROLLBACK");
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
      0,
    );
    console.log(`PASS ${isolation}: stale eligibility aborts with 40001`);
  }
  await reset();
  await c.query(
    `UPDATE bookings SET organization_id='${uid(99)}' WHERE id='${uid(11)}'`,
  );
  await assert.rejects(c.query(call([10, 11])), { code: "23514" });
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n,
    0,
  );
  console.log("PASS mixed organization group rejected without invoice");
  // Preserve 0107 active-document semantics: pending cancellation is not reusable
  // capacity, accepted cancellation is. This fixture has no external provider.
  await reset();
  const original = (await c.query(call([10]))).rows[0];
  await c.query(
    `UPDATE invoices SET cfdi_status='stamped', cfdi_uuid=gen_random_uuid(), status='cancelled', cancellation_status='pending'`,
  );
  assert.equal(
    (await c.query(call([10]))).rows[0].invoice_id,
    original.invoice_id,
  );
  await c.query("UPDATE invoices SET cancellation_status='accepted'");
  assert.notEqual(
    (await c.query(call([10]))).rows[0].invoice_id,
    original.invoice_id,
  );
  console.log("PASS current active-invoice predicate preserved");
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(clients.map((c) => c.end().catch(() => {})));
    if (fs.existsSync(path.join(dir, "data/postmaster.pid")))
      pg("pg_ctl", ["-D", path.join(dir, "data"), "stop", "-m", "fast"]);
    console.log(`Disposable cluster stopped; diagnostics: ${dir}`);
  });
