// Exercises the actual migration in a disposable loopback PostgreSQL cluster.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { checkAtomicQuoteConversion } from "./quotes/atomic-conversion.mjs";

const bin = process.env.PG_BIN;
assert(bin && path.isAbsolute(bin), "Set PG_BIN to trusted installed PostgreSQL binaries");
const tempRoot = realpathSync(os.tmpdir());
const prefix = path.join(tempRoot, "liftgo-invoice-booking-reads-");
const dir = mkdtempSync(prefix);
const dataDir = path.join(dir, "data");
const pg = (name, args) => execFileSync(path.join(bin, name), args, {
  stdio: ["ignore", "inherit", "inherit"], timeout: 45000, windowsHide: true,
});
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const id = (n) => `13500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1), foreignOrg = id(2), actor = id(3), deniedActor = id(4), salesActor = id(5);
const unit = id(6), foreignUnit = id(7), selected = id(8), sibling = id(9), unrelated = id(10), foreign = id(11);
const archived = id(12), hidden = id(13), demo = id(14), firstInvoice = id(15), pivotInvoice = id(16), customer = id(17);
const lineItems = [{ line_kind: "rental", quantity: 1, total: 1234.56, description: "Renta sintética" }];

let sql;
try {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  pg("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--no-locale", "--encoding=UTF8", "--no-sync"]);
  pg("pg_ctl", ["-D", dataDir, "-l", path.join(dir, "server.log"), "-o", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, "start", "-w"]);
  sql = postgres({ host: "127.0.0.1", port, username: "postgres", database: "postgres", max: 1, prepare: false, onnotice: () => {} });
  await sql.unsafe(read("./quotes/fixture.sql"));
  const helper = read("../../drizzle/migrations/0031_multi_org_audit_hardening.sql")
    .match(/CREATE OR REPLACE FUNCTION public\.current_internal_organization_id\(\)[\s\S]*?\$\$;/)?.[0];
  assert(helper);
  await sql.unsafe(helper);
  await sql.unsafe(read("./invoice-booking-reads.fixture.sql"));
  await sql.unsafe(read("../../drizzle/migrations/0135_invoice_billing_read_models.sql"));
  await sql.unsafe(read("../../drizzle/migrations/0138_unify_invoice_period_coverage.sql"));
  await sql`INSERT INTO organizations VALUES (${org}, true), (${foreignOrg}, true)`;
  await sql`INSERT INTO organization_memberships VALUES (${org}, ${actor}, 'internal'), (${org}, ${deniedActor}, 'internal'), (${org}, ${salesActor}, 'internal')`;
  await sql`INSERT INTO user_roles VALUES (${actor}, 'admin'), (${deniedActor}, 'auditor'), (${salesActor}, 'ventas')`;
  await sql`INSERT INTO role_permissions VALUES ('admin','Facturas','full'), ('auditor','Facturas','none'), ('ventas','Facturas','read')`;
  await sql`INSERT INTO forklifts VALUES (${unit}, ${org}, 'Equipo Único', 'Modelo A'), (${foreignUnit}, ${foreignOrg}, 'Equipo Ajeno', 'Modelo B')`;
  await sql`INSERT INTO bookings VALUES
    (${selected}, ${org}, ${unit}, '2026-01-01', '2026-01-31', ${customer}, 'Cliente Selección', 'confirmed', 'RES-SELECCION', false),
    (${sibling}, ${org}, ${unit}, '2026-01-01', '2026-01-31', ${customer}, 'Cliente Hermano', 'completed', 'RES-HERMANA', false),
    (${unrelated}, ${org}, ${unit}, '2026-01-01', '2026-01-31', NULL, 'Cliente Independiente', 'confirmed', 'RES-INDEPENDIENTE', false),
    (${archived}, ${org}, ${unit}, '2025-01-01', '2025-01-31', NULL, 'Cliente Histórico', 'cancelled', 'RES-HISTORICA', false),
    (${hidden}, ${org}, ${unit}, '2027-01-01', '2027-01-31', NULL, 'Cliente Oculto', 'confirmed', 'HIDDEN', false),
    (${demo}, ${org}, ${unit}, '2027-02-01', '2027-02-28', NULL, 'Cliente Demo', 'confirmed', 'DEMO', true),
    (${foreign}, ${foreignOrg}, ${foreignUnit}, '2027-02-01', '2027-02-28', NULL, 'Cliente Ajeno', 'confirmed', 'RES-SELECCION', false)`;
  await sql`INSERT INTO bookings(id, organization_id, forklift_id, start_date, end_date, status, booking_number)
    SELECT gen_random_uuid(), ${org}, ${unit}, '2026-02-01', '2026-02-28', 'confirmed', 'BULK-' || n FROM generate_series(1, 1200) n`;
  await sql`INSERT INTO invoices VALUES
    (${firstInvoice}, ${org}, ${selected}, 'draft', ${sql.json(lineItems)}, 'MXN', '2026-01-01', '2026-01-15'),
    (${pivotInvoice}, ${org}, ${sibling}, 'draft', ${sql.json(lineItems)}, 'MXN', '2026-01-16', '2026-01-31')`;
  await sql`INSERT INTO invoice_bookings VALUES (${firstInvoice}, ${sibling}), (${pivotInvoice}, ${selected})`;
  await sql`INSERT INTO invoices(organization_id, booking_id, status, line_items, moneda, billing_period_start, billing_period_end)
    SELECT ${org}, ${unrelated}, 'draft', ${sql.json(lineItems)}::jsonb, 'MXN', '2026-01-01', '2026-01-31' FROM generate_series(1, 1300)`;
  await sql`INSERT INTO invoices(organization_id, booking_id, status, line_items) VALUES (${org}, ${selected}, 'cancelled', '[]')`;
  await sql`INSERT INTO booking_extensions(organization_id, booking_id, original_end_date, new_end_date)
    VALUES (${org}, ${selected}, '2026-01-31', '2026-02-01'), (${org}, ${unrelated}, '2026-01-31', '2026-02-01')`;
  await sql`INSERT INTO return_inspections(organization_id, booking_id, forklift_id, inspected_at)
    VALUES (${org}, ${selected}, ${unit}, '2026-02-01Z'), (${org}, ${unrelated}, ${unit}, '2026-02-01Z')`;

  const session = async (user) => {
    await sql`RESET ROLE`;
    await sql`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: user })}, false)`;
    await sql`SET ROLE authenticated`;
  };
  const page = async ({ search = "", pageIndex = 0, size = 50, linked = [], customerId = null, includeE2e = false, expected = org } = {}) =>
    (await sql`SELECT public.get_invoice_booking_candidate_page(${expected}::uuid, ${search}::text, ${customerId}::uuid,
      ${pageIndex}::int, ${size}::int, ${linked}::uuid[], ${includeE2e}) AS value`)[0].value;
  const evidence = async (bookingIds, expected = org) =>
    (await sql`SELECT public.get_invoice_booking_billing_evidence_v2(${expected}::uuid, ${bookingIds}::uuid[]) AS value`)[0].value;

  await session(actor);
  const first = await page({ linked: [archived, foreign, hidden] });
  assert.equal(first.rows.length, 50);
  assert.equal(first.hasMore, true);
  assert.deepEqual(first.linked.map((row) => row.id), [archived]);
  const second = await page({ pageIndex: 1 });
  assert.equal(second.pageIndex, 1);
  assert.equal(second.rows.some((row) => first.rows.some((item) => item.id === row.id)), false);
  assert.deepEqual((await page({ search: "res-seleccion equipo" })).rows.map((row) => row.id), [selected]);
  assert.deepEqual((await page({ customerId: customer })).rows.map((row) => row.id), [selected, sibling]);
  assert.deepEqual((await page({ size: 0, linked: [archived] })).rows, []);
  const historicalLinks = (await sql`SELECT id FROM bookings WHERE booking_number LIKE 'BULK-%' ORDER BY id LIMIT 450`).map(({ id }) => id);
  assert.equal((await page({ size: 0, linked: historicalLinks })).linked.length, 450);
  assert.deepEqual((await evidence(historicalLinks)).bookingIds, historicalLinks);
  assert.deepEqual((await page({ search: "DEMO", includeE2e: true })).rows.map((row) => row.id), [demo]);
  assert.deepEqual((await page({ search: "DEMO" })).rows, []);

  const scoped = await evidence([selected, selected]);
  assert.deepEqual(scoped.bookingIds, [selected]);
  assert.deepEqual(scoped.invoices.map((invoice) => invoice.id), [firstInvoice, pivotInvoice]);
  assert.deepEqual(scoped.claims, [firstInvoice, pivotInvoice].flatMap((invoice_id) => [selected, sibling].map((booking_id) => ({ invoice_id, booking_id }))));
  assert.deepEqual(scoped.invoices[0].line_items, lineItems);
  assert.deepEqual(scoped.extensions.map((row) => row.booking_id), [selected]);
  assert.deepEqual(scoped.returns.map((row) => row.booking_id), [selected]);
  assert.equal((await evidence([unrelated])).claims.length, 1300);
  const [{ bytes: allInvoiceBytes }] = await sql`SELECT octet_length(json_agg(i)::text) AS bytes FROM invoices i WHERE status <> 'cancelled'`;
  assert.ok(Buffer.byteLength(JSON.stringify(scoped)) < allInvoiceBytes / 10);
  await assert.rejects(evidence([foreign]), { code: "42501" });
  await assert.rejects(evidence([hidden]), { code: "42501" });
  await assert.rejects(evidence([selected], foreignOrg), { code: "42501" });
  await assert.rejects(page({ size: 101 }), { code: "22023" });

  for (const denied of [deniedActor, salesActor]) {
    await session(denied);
    await assert.rejects(page(), { code: "42501" });
    await assert.rejects(evidence([selected]), { code: "42501" });
  }
  await sql`RESET ROLE`;
  const pending = id(18), accepted = id(19);
  await sql`INSERT INTO invoices(id,organization_id,booking_id,status,line_items,billing_period_start,billing_period_end,cfdi_status,cancellation_status)
    VALUES (${pending}, ${org}, ${selected}, 'cancelled', '[]', '2026-02-01', '2026-02-15', 'stamped', 'pending'),
           (${accepted}, ${org}, ${selected}, 'sent', '[]', '2026-02-16', '2026-02-28', 'stamped', 'accepted')`;
  await sql`UPDATE bookings SET recurring_billing=true WHERE id=${selected}`;
  await session(actor);
  const classified = await sql`SELECT id, public.invoice_occupies_booking_period(i) AS occupies FROM invoices i
    WHERE id IN (${pending}, ${accepted}) ORDER BY id`;
  assert.deepEqual([...classified], [{ id: pending, occupies: true }, { id: accepted, occupies: false }]);
  const updated = await evidence([selected]);
  assert.equal(updated.invoices.find((invoice) => invoice.id === pending)?.occupies_booking_period, true);
  assert.equal(updated.invoices.some((invoice) => invoice.id === accepted), false);
  const [{ value: projected }] = await sql`SELECT value FROM public.get_cash_flow_recurring_bookings() AS value WHERE value->>'id'=${selected}`;
  assert.equal(projected.last_billed_date, "2026-02-15");
  await sql`RESET ROLE`;
  const acl = await sql`SELECT prosecdef, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
    has_function_privilege('service_role', oid, 'EXECUTE') AS service_role FROM pg_proc
    WHERE proname IN ('get_invoice_booking_candidate_page','get_invoice_booking_billing_evidence','get_invoice_booking_billing_evidence_v2')`;
  assert.equal(acl.length, 3);
  assert.ok(acl.every((row) => !row.prosecdef && !row.anon && !row.service_role));
  console.log(`Invoice booking reads passed. Scoped evidence ${Buffer.byteLength(JSON.stringify(scoped))} bytes against ${allInvoiceBytes} bytes of visible invoices alone.`);
  await checkAtomicQuoteConversion(sql, { org, foreignOrg, actor, unit, session });
} finally {
  await sql?.end();
  if (existsSync(path.join(dataDir, "postmaster.pid"))) pg("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop", "-w"]);
  const resolved = realpathSync(dir);
  if (path.dirname(resolved) === tempRoot && resolved.startsWith(prefix)) rmSync(resolved, { recursive: true, force: true });
}
