// Opt-in only: owns a fresh PostgreSQL cluster, never accepts a database URL.
if (process.env.RUN_LOCAL_RECURRING_TESTS !== "1") {
  console.log(
    "SKIP: set RUN_LOCAL_RECURRING_TESTS=1 and PG_BIN for disposable PostgreSQL tests",
  );
  process.exit(0);
}
// Use the repository's frozen postgres dependency, not an untracked pg install.
const postgres = require("../lib/postgres-factory.cjs")(require("postgres"));
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recurring-0125-"));
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
  const sql = postgres({
    ...config,
    password: "",
    ssl: false,
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 0,
    connection: { statement_timeout: config.statement_timeout },
    onnotice: () => {},
  });
  // Reserve a physical session: BEGIN/COMMIT and pg_stat_activity must observe
  // the same backend throughout each concurrent scenario.
  const session = await sql.reserve();
  const [{ pid }] = await session.unsafe("SELECT pg_backend_pid() AS pid");
  const c = {
    processID: pid,
    async query(text, parameters = []) {
      return { rows: await session.unsafe(text, parameters) };
    },
    async end() {
      session.release();
      await sql.end({ timeout: 1 });
    },
  };
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
  await c.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{"role":"service_role"}'::jsonb$$; CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$; CREATE FUNCTION current_internal_organization_id() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$; CREATE FUNCTION is_internal_member(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$; CREATE FUNCTION fx_is_missing(text,numeric) RETURNS boolean LANGUAGE sql AS $$SELECT false$$; CREATE SEQUENCE invoice_seq; CREATE FUNCTION next_draft_invoice_number() RETURNS text LANGUAGE sql AS $$SELECT 'QA-'||nextval('invoice_seq')$$;
CREATE TABLE bookings(id uuid PRIMARY KEY,organization_id uuid,customer_id uuid,booking_number text,status text,recurring_billing boolean,start_date date,end_date date,last_billed_date date, forklift_id uuid, customer_name text, monthly_rate numeric, currency text, tipo_cambio numeric);
CREATE TABLE invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,invoice_number text,booking_id uuid,customer_id uuid,customer_name text,line_items jsonb,subtotal numeric,tax_rate numeric,tax_amount numeric,total numeric,status text,due_date date,billing_period_start date,billing_period_end date,receptor_rfc text,receptor_razon_social text,receptor_regimen_fiscal text,receptor_domicilio_fiscal_cp text,uso_cfdi text,forma_pago text,metodo_pago text,moneda text,tipo_cambio numeric,cfdi_status text,cfdi_uuid uuid,cancellation_status text);
CREATE TABLE forklifts(id uuid PRIMARY KEY, monthly_rate numeric); CREATE TABLE customers(id uuid PRIMARY KEY,tax_rate numeric); CREATE TABLE invoice_bookings(invoice_id uuid,booking_id uuid,organization_id uuid,PRIMARY KEY(invoice_id,booking_id));`);
  const sql = fs.readFileSync(
    path.join(root, "drizzle/migrations/0107_quote_charge_tracking.sql"),
    "utf8",
  );
  await c.query(
    sql.match(
      /CREATE FUNCTION public.quote_charge_invoice_active[\s\S]*?\$\$;/,
    )[0],
  );
  // Match 0107's actual ACL, not merely its function body. Invoker consumers
  // must not rely on this private helper's default PUBLIC execute permission.
  await c.query(sql.match(/REVOKE ALL ON FUNCTION public.quote_charge_invoice_active\(public.invoices\) FROM PUBLIC, anon, authenticated, service_role;/)[0]);
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
  // Install the existing cash-flow contract first, including its ACL, so
  // replacement can be checked for accidental security/permission expansion.
  const cashBaseline = fs.readFileSync(path.join(root,
    "supabase/migrations/20260910023525_733a1316-2678-4bb0-87af-ee46e60d0666.sql"), "utf8");
  await c.query(cashBaseline.match(/CREATE OR REPLACE FUNCTION public.get_cash_flow_recurring_bookings[\s\S]*?\$function\$;/)[0]);
  await c.query("REVOKE ALL ON FUNCTION get_cash_flow_recurring_bookings() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION get_cash_flow_recurring_bookings() TO authenticated,service_role;");
  const cashAcl = (await c.query("SELECT proacl::text acl FROM pg_proc WHERE oid='get_cash_flow_recurring_bookings()'::regprocedure")).rows[0].acl;
  if (process.env.RECURRING_COVERAGE_BASELINE !== "1") await c.query(
    fs.readFileSync(path.join(root, "drizzle/migrations/0125_recurring_future_coverage.sql"), "utf8"));
  async function reset() {
    await c.query("TRUNCATE invoice_bookings,invoices,bookings");
    for (const n of [10, 11, 12])
      await c.query(
        `INSERT INTO bookings(id,organization_id,customer_id,booking_number,status,recurring_billing,start_date,end_date,last_billed_date) VALUES('${uid(n)}','${uid(1)}','${uid(2)}','B${n}','confirmed',true,'2026-01-01','2026-12-31',null)`,
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
  // New coverage regression cases, all synthetic and contained in this cluster.
  const manual = (n, start, end, id = uid(1000), extra = "") =>
    `INSERT INTO invoices(id,organization_id,invoice_number,booking_id,status,billing_period_start,billing_period_end ${extra ? "," + extra.split("=")[0] : ""}) VALUES('${id}','${uid(1)}','MANUAL','${uid(n)}','draft',${start ? `'${start}'` : 'NULL'},${end ? `'${end}'` : 'NULL'} ${extra ? "," + extra.split("=").slice(1).join("=") : ""})`;
  const cursor = async (n) => (await c.query(`SELECT last_billed_date::text value FROM bookings WHERE id='${uid(n)}'`)).rows[0].value;
  const coverage = async (n) => (await c.query(`SELECT x FROM get_cash_flow_recurring_bookings() x WHERE x->>'id'='${uid(n)}'`)).rows[0].x;
  const count = async () => (await c.query("SELECT count(*)::int n FROM invoices")).rows[0].n;
  async function legacy(start, end) {
    // Seed pre-migration history only in our disposable fixture.
    await c.query("ALTER TABLE invoices DISABLE TRIGGER trg_confirmed_recurring_invoice_coverage");
    await c.query(manual(10, start, end));
    await c.query("ALTER TABLE invoices ENABLE TRIGGER trg_confirmed_recurring_invoice_coverage");
  }

  await reset();
  await c.query(manual(10,"2026-01-01","2026-01-15"));
  await assert.rejects(c.query(call([10])), {code:"23505"});
  assert.equal(await count(),1);
  console.log("PASS partial direct historical coverage blocks full-month RPC");

  await reset();
  await c.query(call([10]));
  await assert.rejects(c.query(manual(10,"2026-01-15","2026-02-15")), {code:"23505"});
  assert.equal(await count(),1);
  console.log("PASS direct manual insert cannot overlap recurring invoice");

  await reset();
  await c.query(call([10]));
  await c.query(`INSERT INTO invoices(id,organization_id,invoice_number,status,billing_period_start,billing_period_end) VALUES('${uid(1000)}','${uid(1)}','GROUP','draft','2026-01-15','2026-02-15')`);
  await assert.rejects(c.query(`INSERT INTO invoice_bookings VALUES('${uid(1000)}','${uid(10)}','${uid(1)}')`), {code:"23505"});
  assert.equal((await c.query(`SELECT count(*)::int n FROM invoice_bookings WHERE invoice_id='${uid(1000)}'`)).rows[0].n,0);
  console.log("PASS manual grouped pivot cannot overlap recurring invoice");

  for(const [start,end] of [[null,null],["2026-02-01","2026-01-01"],["2026-01-01","infinity"]]) {
    await reset();
    if(process.env.RECURRING_COVERAGE_BASELINE === "1") await c.query(manual(10,start,end));
    else await legacy(start,end);
    await assert.rejects(c.query(call([10],"2026-05-01","2026-05-31")), {code:"23505"});
    assert.equal(await count(),1);
    console.log(`PASS unknown/invalid legacy coverage fails closed: ${start}/${end}`);
  }

  await reset();
  await c.query(call([10],"2026-03-01","2026-03-31"));
  await c.query(call([10],"2026-01-01","2026-01-31"));
  assert.equal(await cursor(10),"2026-03-31");
  await c.query(call([10],"2026-01-01","2026-01-31"));
  assert.equal(await cursor(10),"2026-03-31");
  await c.query(call([10],"2026-02-01","2026-02-28"));
  assert.equal(await cursor(10),"2026-03-31");
  console.log("PASS backfilling/reusing older periods cannot regress maximum cursor");

  await c.query("UPDATE invoices SET status='cancelled' WHERE billing_period_start='2026-03-01'");
  await c.query(call([10],"2026-01-01","2026-01-31"));
  assert.equal(await cursor(10),"2026-02-28");
  console.log("PASS cursor recomputes active maximum after latest cancellation");

  await reset();
  await a.query("BEGIN");
  await a.query(manual(10,"2026-01-01","2026-01-15"));
  pending=b.query(call([10])).then(r=>({rows:r.rows})).catch(e=>({code:e.code}));
  await waitBlocked(b);
  await a.query("COMMIT");
  assert.equal((await pending).code,"23505");
  assert.equal(await count(),1);
  console.log("PASS manual writer first: waiting recurring RPC sees committed partial coverage");

  await reset();
  await a.query("BEGIN");
  await a.query(call([10]));
  await assert.rejects(b.query(manual(10,"2026-01-15","2026-02-15")),{code:"55P03"});
  await a.query("COMMIT");
  assert.equal(await count(),1);
  console.log("PASS recurring writer first: manual writer fails retryably without deadlock");

  await reset();
  await a.query("BEGIN");
  await a.query(manual(10,"2026-01-01","2026-01-15"));
  pending=b.query(call([10]));
  await waitBlocked(b);
  await a.query("ROLLBACK");
  assert.equal((await pending).rows[0].already_existed,false);
  assert.equal(await count(),1);
  console.log("PASS rolled-back manual coverage does not block the waiting RPC");

  await reset();
  await c.query(manual(10,"2026-01-01","2026-01-15"));
  await c.query("UPDATE invoices SET cfdi_status='stamped',cfdi_uuid=gen_random_uuid(),status='cancelled',cancellation_status='pending'");
  await assert.rejects(c.query(call([10])),{code:"23505"});
  await c.query("UPDATE invoices SET cancellation_status='accepted'");
  await c.query(call([10]));
  await assert.rejects(c.query("UPDATE invoices SET cancellation_status='pending' WHERE invoice_number='MANUAL'"),{code:"23505"});
  console.log("PASS fiscal cancellation pending blocks; accepted frees; reactivation rechecks coverage");

  await reset();
  await b.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await assert.rejects(b.query(manual(10,"2026-01-01","2026-01-15")),{code:"40001"});
  await b.query("ROLLBACK");
  assert.equal(await count(),0);
  console.log("PASS direct new coverage refuses stronger stale-snapshot isolation");

  await reset();
  await c.query(call([10],"2026-01-01","2026-01-31"));
  await c.query(call([10],"2026-03-01","2026-03-31"));
  let cf=await coverage(10);
  assert.deepEqual(cf.billing_coverage,[{periodStart:"2026-01-01",periodEnd:"2026-01-31"},{periodStart:"2026-03-01",periodEnd:"2026-03-31"}]);
  assert.equal(cf.last_billed_date,"2026-03-31");
  assert.deepEqual((await coverage(11)).billing_coverage,[]);
  console.log("PASS cashflow exposes gaps, includes NULL-CFDI drafts, deduplicates direct+pivot links");

  await c.query("UPDATE invoices SET cfdi_status='stamped',cfdi_uuid=gen_random_uuid(),status='cancelled',cancellation_status='pending' WHERE billing_period_start='2026-01-01'");
  assert.equal((await coverage(10)).billing_coverage.length,2);
  await c.query("UPDATE invoices SET cancellation_status='accepted' WHERE billing_period_start='2026-01-01'");
  assert.deepEqual((await coverage(10)).billing_coverage,[{periodStart:"2026-03-01",periodEnd:"2026-03-31"}]);
  console.log("PASS cashflow preserves pending and excludes accepted fiscal cancellation");

  await reset();
  await legacy(null,null);
  cf=await coverage(10);
  assert.deepEqual(cf.billing_coverage,[{periodStart:null,periodEnd:null}]);
  console.log("PASS cashflow exposes unknown legacy coverage instead of inventing dates");

  // Dates intentionally far in the future; local tests never change server time.
  const futureReset=async()=>{await reset();await c.query("UPDATE bookings SET start_date='2099-01-01',end_date='2099-12-31'");};
  const future=(ids,month)=>call(ids,`2099-${String(month).padStart(2,'0')}-01`,`2099-${String(month).padStart(2,'0')}-${month===2?'28':([4,6,9,11].includes(month)?'30':'31')}`);
  await futureReset();
  await assert.rejects(c.query(future([10],2)),{code:"23514"});
  assert.equal(await count(),0);
  await c.query(future([10],1));
  await assert.rejects(c.query(future([10],3)),{code:"23514"});
  assert.equal(await count(),1);
  console.log("PASS new future periods cannot skip the first or an intermediate month");

  await c.query(future([10],2));
  const march=(await c.query(future([10],3))).rows[0];
  assert.equal(await count(),3);
  await c.query("UPDATE invoices SET status='cancelled' WHERE billing_period_start='2099-02-01'");
  await assert.rejects(c.query(future([10],4)),{code:"23514"});
  assert.equal((await c.query(future([10],3))).rows[0].invoice_id,march.invoice_id);
  await c.query(future([10],2));
  await c.query(future([10],4));
  assert.equal(await cursor(10),"2099-04-30");
  console.log("PASS future cancellation gap blocks later creation but allows reuse and gap repair");

  await futureReset();
  await c.query(future([10],1));
  await assert.rejects(c.query(future([10,11],2)),{code:"23514"});
  assert.equal(await count(),1);
  await c.query(future([11],1));
  await c.query(future([10,11],2));
  assert.equal(await count(),3);
  console.log("PASS every booking in a future group needs its own covered prefix");

  await futureReset();
  await c.query(manual(10,"2099-01-01","2099-01-15"));
  await assert.rejects(c.query(future([10],2)),{code:"23514"});
  await c.query(manual(10,"2099-01-16","2099-01-31",uid(1001)));
  await c.query(future([10],2));
  console.log("PASS prefix uses union of actual days rather than MAX(end)");

  await futureReset();
  await assert.rejects(c.query(manual(10,"2099-02-01","2099-02-28")),{code:"23514"});
  await c.query(`INSERT INTO invoices(id,organization_id,invoice_number,status,billing_period_start,billing_period_end) VALUES('${uid(1000)}','${uid(1)}','GROUP','draft','2099-02-01','2099-02-28')`);
  await assert.rejects(c.query(`INSERT INTO invoice_bookings VALUES('${uid(1000)}','${uid(10)}','${uid(1)}')`),{code:"23514"});
  console.log("PASS direct and grouped manual future coverage cannot bypass sequence");

  for(const commit of [true,false]) {
    await futureReset();
    await c.query(future([10],1));
    await a.query("BEGIN");
    await a.query("UPDATE invoices SET status='cancelled'");
    pending=b.query(future([10],2)).then(r=>({rows:r.rows})).catch(e=>({code:e.code}));
    await waitBlocked(b);
    await a.query(commit?"COMMIT":"ROLLBACK");
    const result=await pending;
    if(commit)assert.equal(result.code,"23514");
    else assert.equal(result.rows[0].already_existed,false);
    console.log(`PASS predecessor cancellation ${commit?'commit':'rollback'} is serialized with future creation`);
  }

  await futureReset();
  await c.query(future([10],1));
  await a.query("BEGIN");
  await a.query(future([10],2));
  await assert.rejects(b.query("UPDATE invoices SET status='cancelled' WHERE billing_period_start='2099-01-01'"),{code:"55P03"});
  await a.query("COMMIT");
  await b.query("UPDATE invoices SET status='cancelled' WHERE billing_period_start='2099-01-01'");
  await assert.rejects(c.query(future([10],3)),{code:"23514"});
  console.log("PASS future writer first serializes predecessor cancellation without deadlock");

  for(const removal of ['invoice','pivot']) {
    await futureReset();
    await c.query(future(removal==='pivot'?[10,11]:[10],1));
    await a.query("BEGIN");
    await a.query(removal==='pivot'?`DELETE FROM invoice_bookings WHERE booking_id='${uid(10)}'`:"DELETE FROM invoices");
    pending=b.query(future([10],2)).then(r=>({rows:r.rows})).catch(e=>({code:e.code}));
    await waitBlocked(b);
    await a.query("COMMIT");
    assert.equal((await pending).code,"23514");
    console.log(`PASS removing predecessor ${removal} is serialized and cannot fake covered prefix`);
  }

  assert.equal((await c.query("SELECT proacl::text acl FROM pg_proc WHERE oid='get_cash_flow_recurring_bookings()'::regprocedure")).rows[0].acl,cashAcl);
  assert.equal((await c.query("SELECT prosecdef value FROM pg_proc WHERE oid='get_cash_flow_recurring_bookings()'::regprocedure")).rows[0].value,false);
  assert.equal((await c.query("SELECT has_function_privilege('authenticated','guard_confirmed_recurring_invoice_coverage()','execute') value")).rows[0].value,false);
  console.log("PASS cashflow invoker/ACL unchanged and trigger function not publicly executable");

  await reset();
  await c.query(`INSERT INTO bookings(id,organization_id,customer_id,booking_number,status,recurring_billing,start_date,end_date) VALUES('${uid(20)}','${uid(99)}','${uid(2)}','FOREIGN','confirmed',true,'2026-01-01','2026-12-31')`);
  await c.query(manual(10,"2026-01-01","2026-01-31"));
  await c.query(`INSERT INTO invoices(id,organization_id,invoice_number,booking_id,status,billing_period_start,billing_period_end) VALUES('${uid(1001)}','${uid(99)}','FOREIGN','${uid(10)}','draft','2026-02-01','2026-02-28')`);
  await c.query(`GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT ON bookings,invoices,invoice_bookings,customers,forklifts TO authenticated;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY; CREATE POLICY own_booking ON bookings FOR SELECT TO authenticated USING(organization_id='${uid(1)}');
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY; CREATE POLICY own_invoice ON invoices FOR SELECT TO authenticated USING(organization_id='${uid(1)}');
ALTER TABLE invoice_bookings ENABLE ROW LEVEL SECURITY; CREATE POLICY own_pivot ON invoice_bookings FOR SELECT TO authenticated USING(organization_id='${uid(1)}');`);
  await c.query("SET ROLE authenticated");
  const visible=(await c.query("SELECT x FROM get_cash_flow_recurring_bookings() x")).rows.map(r=>r.x);
  assert.equal(visible.length,3);
  assert.ok(visible.every(r=>r.booking_number!=="FOREIGN"));
  assert.deepEqual(visible.find(r=>r.id===uid(10)).billing_coverage,[{periodStart:"2026-01-01",periodEnd:"2026-01-31"}]);
  await c.query("RESET ROLE");
  console.log("PASS cashflow respects caller RLS and cannot inherit foreign-organization invoice coverage");

  // Preserve the private helper ACL under both roles that must never call it.
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal((await c.query(`SELECT has_function_privilege('${role}','quote_charge_invoice_active(invoices)','execute') value`)).rows[0].value,false);
  }
  for (const fn of ["guard_confirmed_recurring_invoice_coverage", "lock_confirmed_recurring_coverage_change", "get_cash_flow_recurring_bookings"]) {
    const definition=(await c.query(`SELECT prosecdef,pg_get_functiondef(oid) definition FROM pg_proc WHERE oid='${fn}()'::regprocedure`)).rows[0];
    assert.equal(definition.prosecdef,false);
    assert.ok(!definition.definition.includes("public.quote_charge_invoice_active("));
  }
  console.log("PASS actual private-helper ACL is retained and no INVOKER calls it");

  // Minimal same-tenant mutation grants/policies in this disposable fixture only.
  await c.query(`GRANT INSERT,UPDATE,DELETE ON invoices,invoice_bookings TO authenticated;
CREATE POLICY own_invoice_mutation ON invoices FOR ALL TO authenticated USING(organization_id='${uid(1)}') WITH CHECK(organization_id='${uid(1)}');
CREATE POLICY own_pivot_mutation ON invoice_bookings FOR ALL TO authenticated USING(organization_id='${uid(1)}') WITH CHECK(organization_id='${uid(1)}');`);
  await reset();
  await c.query(`INSERT INTO bookings(id,organization_id,customer_id,booking_number,status,recurring_billing,start_date,end_date) VALUES('${uid(30)}','${uid(1)}','${uid(2)}','NONREC','confirmed',false,'2026-01-01','2026-12-31')`);
  await c.query("SET ROLE authenticated");
  await assert.rejects(c.query("SELECT public.quote_charge_invoice_active(NULL::invoices)"),{code:"42501"});
  await c.query(`INSERT INTO invoices(id,organization_id,invoice_number,status) VALUES('${uid(1100)}','${uid(1)}','UNLINKED','draft')`);
  await c.query(`UPDATE invoices SET status='issued',cfdi_status='stamping' WHERE id='${uid(1100)}'`);
  await c.query(`UPDATE invoices SET cfdi_status='cancelled',status='cancelled' WHERE id='${uid(1100)}'`);
  await c.query(`DELETE FROM invoices WHERE id='${uid(1100)}'`);
  await c.query(manual(30,"2026-01-01","2026-01-31",uid(1101)));
  await c.query(`UPDATE invoices SET status='issued' WHERE id='${uid(1101)}'`);
  await c.query(`UPDATE invoices SET status='cancelled' WHERE id='${uid(1101)}'`);
  await c.query(`DELETE FROM invoices WHERE id='${uid(1101)}'`);
  await c.query("RESET ROLE");
  assert.equal(await count(),0);
  console.log("PASS authenticated unlinked and non-recurring invoice mutations work with helper EXECUTE denied");

  await reset();
  await c.query("SET ROLE authenticated");
  await c.query(manual(10,"2026-01-01","2026-01-31",uid(1100)));
  await assert.rejects(c.query(manual(10,"2026-01-15","2026-02-15",uid(1101))),{code:"23505"});
  await c.query(`UPDATE invoices SET status='issued',cfdi_status='stamped',cfdi_uuid=gen_random_uuid() WHERE id='${uid(1100)}'`);
  await c.query(`UPDATE invoices SET status='cancelled',cancellation_status='pending' WHERE id='${uid(1100)}'`);
  assert.equal((await coverage(10)).billing_coverage.length,1);
  await c.query(`UPDATE invoices SET cancellation_status='accepted' WHERE id='${uid(1100)}'`);
  assert.deepEqual((await coverage(10)).billing_coverage,[]);
  await c.query(manual(10,"2026-01-01","2026-01-31",uid(1101)));
  await assert.rejects(c.query(`UPDATE invoices SET cancellation_status='pending' WHERE id='${uid(1100)}'`),{code:"23505"});
  await c.query(`DELETE FROM invoices WHERE id='${uid(1100)}'`);
  await c.query(`DELETE FROM invoices WHERE id='${uid(1101)}'`);
  await c.query("RESET ROLE");
  console.log("PASS authenticated recurring direct mutations preserve active/cancellation/overlap rules");

  await futureReset();
  await c.query("SET ROLE authenticated");
  await assert.rejects(c.query(manual(10,"2099-02-01","2099-02-28",uid(1100))),{code:"23514"});
  await c.query(manual(10,"2099-01-01","2099-01-15",uid(1100)));
  await c.query(manual(10,"2099-01-16","2099-01-31",uid(1101)));
  await c.query(manual(10,"2099-02-01","2099-02-28",uid(1102)));
  assert.equal((await coverage(10)).billing_coverage.length,3);
  await c.query(`UPDATE invoices SET status='cancelled' WHERE id='${uid(1100)}'`);
  await assert.rejects(c.query(manual(10,"2099-03-01","2099-03-31",uid(1103))),{code:"23514"});
  await c.query("RESET ROLE");
  console.log("PASS authenticated future sequence accepts contiguous union and blocks cancellation gaps");

  await futureReset();
  await c.query("SET ROLE authenticated");
  await c.query(`INSERT INTO invoices(id,organization_id,invoice_number,status,billing_period_start,billing_period_end) VALUES('${uid(1100)}','${uid(1)}','GROUP-AUTH','draft','2099-01-01','2099-01-31')`);
  await c.query(`INSERT INTO invoice_bookings VALUES('${uid(1100)}','${uid(10)}','${uid(1)}')`);
  await c.query(manual(10,"2099-02-01","2099-02-28",uid(1101)));
  await c.query(`DELETE FROM invoice_bookings WHERE invoice_id='${uid(1100)}'`);
  await assert.rejects(c.query(manual(10,"2099-03-01","2099-03-31",uid(1102))),{code:"23514"});
  await c.query(`INSERT INTO invoice_bookings VALUES('${uid(1100)}','${uid(10)}','${uid(1)}')`);
  await c.query(manual(10,"2099-03-01","2099-03-31",uid(1102)));
  await c.query(`UPDATE invoice_bookings SET booking_id='${uid(11)}' WHERE invoice_id='${uid(1100)}'`);
  await assert.rejects(c.query(manual(10,"2099-04-01","2099-04-30",uid(1103))),{code:"23514"});
  await c.query("RESET ROLE");
  console.log("PASS authenticated grouped pivot insert/update/delete retain coverage and sequence protections");

  // Compare the actual invoker cashflow output with the canonical private
  // helper for every combination, invoking the helper only as its owner.
  await reset();
  let parityCases=0;
  for (const status of [null,"draft","cancelled"]) {
    for (const cfdi of [null,"draft","stamping","stamped","cancelled","error"]) {
      for (const cancellation of [null,"pending","accepted"]) {
        for (const uuid of [null,uid(5000)]) {
          await c.query("DELETE FROM invoices");
          await c.query(`INSERT INTO invoices(id,organization_id,invoice_number,booking_id,status,billing_period_start,billing_period_end,cfdi_status,cfdi_uuid,cancellation_status) VALUES('${uid(1100)}','${uid(1)}','PARITY','${uid(10)}',$1,'2026-01-01','2026-01-31',$2,$3,$4)`,[status,cfdi,uuid,cancellation]);
          const expected=(await c.query("SELECT public.quote_charge_invoice_active(i) active FROM invoices i")).rows[0].active;
          await c.query("SET ROLE authenticated");
          assert.equal((await coverage(10)).billing_coverage.length,expected?1:0,JSON.stringify({status,cfdi,uuid,cancellation}));
          await c.query("RESET ROLE");
          parityCases++;
        }
      }
    }
  }
  assert.equal(parityCases,108);
  console.log("PASS authenticated cashflow matches private active-document predicate across 108 fiscal-state combinations");

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
