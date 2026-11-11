// Runs only against a temporary PostgreSQL cluster on loopback.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";

const bin = process.env.PG_BIN;
assert(bin && path.isAbsolute(bin), "Set PG_BIN to an installed PostgreSQL bin directory");
const prefix = path.join(os.tmpdir(), "liftgo-dashboard-search-");
const dir = mkdtempSync(prefix);
const dataDir = path.join(dir, "data");
const pg = (name, args) => execFileSync(path.join(bin, name), args, {
  stdio: ["ignore", "inherit", "inherit"], timeout: 45000, windowsHide: true,
});
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const actor = "20000000-0000-4000-8000-000000000001";
const allSections = ["invoices", "quotes", "customers", "bookings", "deliveries", "returns"];

let sql;
try {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  pg("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale", "--no-sync"]);
  pg("pg_ctl", ["-D", dataDir, "-l", path.join(dir, "server.log"), "-o", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, "start", "-w"]);
  sql = postgres({ host: "127.0.0.1", port, username: "postgres", database: "postgres", max: 1, prepare: false, onnotice: () => {} });
  await sql.unsafe(read("./dashboard-search.fixture.sql"));
  await sql.unsafe(read("../../drizzle/migrations/0072_dashboard_fleet_counts_unbounded.sql"));
  await sql.unsafe(read("../../drizzle/migrations/0136_dashboard_search_performance.sql"));

  await sql`INSERT INTO user_roles VALUES (${actor}, 'auditor'), (${actor}, 'dispatcher')`;
  for (const module of ["Facturas", "Cotizaciones", "Clientes", "Reservas", "Entregas"]) {
    await sql`INSERT INTO role_permissions VALUES ('auditor', ${module}, 'read'), ('dispatcher', ${module}, 'read')`;
  }
  const [customer] = await sql`INSERT INTO customers(name, rfc) VALUES ('ACME 445', 'AAA010101AAA') RETURNING id`;
  const [hidden] = await sql`INSERT INTO customers(name) VALUES ('ACME 445 Foreign') RETURNING id`;
  await sql`INSERT INTO organization_customers VALUES (${orgA}, ${customer.id}), (${orgB}, ${hidden.id})`;
  await sql`INSERT INTO invoices(organization_id, invoice_number, customer_name, status, total)
    VALUES (${orgA}, 'FAC-445', 'ACME 445', 'draft', 100), (${orgA}, 'FAC-445-cancelled', 'ACME 445', 'cancelled', 100),
           (${orgB}, 'FAC-445-foreign', 'ACME 445', 'draft', 100)`;
  await sql`INSERT INTO quotes(organization_id, quote_number, customer_name, created_at, is_e2e)
    VALUES (${orgA}, 'COT-0445', 'Exacta antigua', '2020-01-01', false),
           (${orgB}, 'COT-0445', 'Exacta ajena', '2026-01-01', false),
           (${orgA}, 'COT-04451', 'Prueba E2E', '2026-01-01', true),
           (${orgA}, 'COT-90071992547409934567', 'Folio largo', '2020-01-01', false),
           (${orgA}, 'COT-0900', 'ACME*50%_ (literal)', '2020-01-01', false),
           (${orgA}, 'COT-0901', 'ACMEa50zz (otro)', '2020-01-01', false)`;
  await sql`INSERT INTO quotes(organization_id, quote_number, customer_name)
    SELECT ${orgA}, 'COT-1445' || i, 'Coincidencia 445' FROM generate_series(1, 6) i`;
  await sql`INSERT INTO quotes(organization_id, quote_number, customer_name)
    SELECT ${orgA}, 'COT-bench-' || i, 'Cliente sintético ' || i FROM generate_series(1, 20000) i`;
  await sql`INSERT INTO forklifts(organization_id, name, status)
    SELECT ${orgA}, 'Equipo ' || i, 'available' FROM generate_series(1, 610) i`;
  const [unit] = await sql`SELECT id FROM forklifts ORDER BY id LIMIT 1`;
  const [booking] = await sql`INSERT INTO bookings(organization_id, booking_number, customer_name, forklift_id, status, start_date, end_date)
    VALUES (${orgA}, 'RES-445', 'ACME 445', ${unit.id}, 'confirmed', '2026-11-10', '2026-11-11') RETURNING id`;
  await sql`INSERT INTO return_inspections(organization_id, booking_id, inspection_number) VALUES (${orgA}, ${booking.id}, 'RET-445')`;
  await sql`INSERT INTO deliveries(organization_id, delivery_number, scheduled_date, status, signature_base64)
    SELECT ${orgA}, 'DEL-445-' || i, '2026-11-09', CASE WHEN i % 2 = 0 THEN 'scheduled' ELSE 'in_transit' END,
      repeat('a', 2048) FROM generate_series(1, 603) i`;
  await sql`INSERT INTO deliveries(organization_id, delivery_number, scheduled_date, status)
    VALUES (${orgA}, 'DEL-445-today', '2026-11-10', 'scheduled'), (${orgA}, 'DEL-445-completed', '2026-11-09', 'completed'),
           (${orgB}, 'DEL-445-foreign', '2026-11-09', 'scheduled')`;
  await sql`INSERT INTO delivery_historical_reconciliations(delivery_id, organization_id, revoked_at)
    SELECT id, organization_id, CASE WHEN delivery_number = 'DEL-445-2' THEN now() ELSE NULL END
    FROM deliveries WHERE delivery_number IN ('DEL-445-1','DEL-445-2','DEL-445-3')`;
  await sql`ANALYZE quotes`;

  const search = async (term, sections = allSections, organization = orgA) => {
    const [row] = await sql`SELECT public.get_global_search(${organization}::uuid, ${term}, ${sections}::text[]) AS result`;
    return row.result;
  };
  await sql`SELECT set_config('fixture.user_id', ${actor}, false), set_config('fixture.organization_id', ${orgA}, false)`;
  await sql`SET ROLE authenticated`;
  const [summary] = await sql`SELECT public.get_dashboard_stats() AS data`;
  assert.deepEqual(summary.data.fleet_counts, { total: 610, available: 609, rented: 1, maintenance: 0, retired: 0, sold: 0 });
  assert.equal(summary.data.pending_deliveries_count, 601, "count all overdue and unreconciled rows across the old list cap");
  for (const term of ["445", "0445", "COT-0445", "cot-445", "000445"]) {
    const hits = await search(term, ["quotes"]);
    assert.equal(hits.quotes[0].sub, "Exacta antigua", term);
    assert.ok(hits.quotes.length <= 5, term);
    assert.equal(hits.quotes.some((row) => row.sub === "Exacta ajena" || row.sub === "Prueba E2E"), false, term);
  }
  assert.equal((await search("00090071992547409934567", ["quotes"])).quotes[0].sub, "Folio largo");
  assert.deepEqual((await search("*50%_ (literal)", ["quotes"])).quotes.map((row) => row.label), ["COT-0900"]);
  const all = await search("445");
  assert.deepEqual(all.invoices.map((row) => row.label), ["FAC-445"]);
  assert.deepEqual(all.customers.map((row) => row.id), [customer.id]);
  assert.deepEqual(all.bookings.map((row) => row.label), ["RES-445"]);
  assert.deepEqual(all.returns.map((row) => row.sub), ["ACME 445"]);
  assert.equal(all.deliveries.length, 5);
  await assert.rejects(search("445", allSections, orgB), { code: "42501" });

  const [planRow] = await sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT q.id FROM quotes q WHERE q.organization_id = ${orgA}::uuid AND q.is_e2e IS NOT TRUE
      AND (q.quote_number = 'COT-0445' OR q.quote_number ILIKE '%445%' OR q.customer_name ILIKE '%445%')
    ORDER BY CASE WHEN q.quote_number = 'COT-0445' THEN 0 ELSE 1 END, q.created_at DESC, q.id DESC LIMIT 5`;
  const [plan] = planRow["QUERY PLAN"];
  console.log(`Synthetic 20,000-row quote plan: ${plan["Execution Time"]} ms, ${plan.Plan["Shared Hit Blocks"]} buffer hits.`);

  await sql`RESET ROLE`;
  await sql`REVOKE SELECT ON quotes FROM authenticated`;
  await sql`SET ROLE authenticated`;
  const partial = await search("445", ["quotes", "customers"]);
  assert.equal(partial.customers.length, 1);
  assert.deepEqual(partial.errors, { quotes: "No se pudo completar la búsqueda." });
  await assert.rejects(search("445", ["quotes"]), { code: "55000" });
  await sql`RESET ROLE`;
  await sql`DELETE FROM user_roles WHERE role = 'auditor'`;
  await sql`UPDATE role_permissions SET access_level = 'none' WHERE role = 'dispatcher' AND module = 'Clientes'`;
  await sql`SET ROLE authenticated`;
  const restricted = await search("445", ["invoices", "customers", "bookings"]);
  assert.deepEqual(restricted.invoices, [], "dispatcher financial exclusion overrides the role matrix");
  assert.deepEqual(restricted.customers, [], "missing module grant hides the section");
  assert.equal(restricted.bookings.length, 1);
  await sql`RESET ROLE`;
  await sql`SET ROLE anon`;
  await assert.rejects(search("445"), { code: "42501" });
  console.log("PASS: complete fleet and overdue counts, exact folios, literal search, tenant and module isolation, partial failures and anonymous denial.");
} finally {
  if (sql) await sql.end();
  if (existsSync(path.join(dataDir, "postmaster.pid"))) pg("pg_ctl", ["-D", dataDir, "-m", "fast", "stop", "-w"]);
  assert(dir.startsWith(prefix));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}
