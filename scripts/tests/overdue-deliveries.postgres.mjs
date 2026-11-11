// Read contracts run only in a fresh, local PostgreSQL cluster with synthetic rows.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";

const bin = process.env.PG_BIN;
assert(bin && path.isAbsolute(bin), "Set PG_BIN to an installed PostgreSQL bin directory");
const prefix = path.join(os.tmpdir(), "liftgo-overdue-deliveries-");
const dir = mkdtempSync(prefix);
const dataDir = path.join(dir, "data");
const pg = (name, args) => execFileSync(path.join(bin, name), args, {
  stdio: ["ignore", "inherit", "inherit"], timeout: 45000, windowsHide: true,
});
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const orgA = "10000000-0000-4000-8000-000000000001";
const orgB = "10000000-0000-4000-8000-000000000002";
const actor = "20000000-0000-4000-8000-000000000001";
let sql;
let cases = 0;
const check = (name, test) => { test(); cases++; console.log(`PASS ${cases}: ${name}`); };
try {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  pg("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--encoding=UTF8", "--no-locale", "--no-sync"]);
  pg("pg_ctl", ["-D", dataDir, "-l", path.join(dir, "server.log"), "-o", `-h 127.0.0.1 -p ${port} -c unix_socket_directories=`, "start", "-w"]);
  sql = postgres({ host: "127.0.0.1", port, username: "postgres", database: "postgres", max: 1, prepare: false, onnotice: () => {} });
  const [version] = await sql`SHOW server_version_num`;
  assert.equal(Math.floor(Number(version.server_version_num) / 10000), 17, "contract runs on PostgreSQL 17");
  await sql.unsafe(read("./dashboard-search.fixture.sql"));
  await sql`ALTER TABLE deliveries ADD COLUMN forklift_id uuid, ADD COLUMN scheduled_time time, ADD COLUMN driver_name text`;
  await sql`ALTER TABLE forklifts ADD COLUMN model text`;
  await sql.unsafe(read("../../drizzle/migrations/0072_dashboard_fleet_counts_unbounded.sql"));
  await sql.unsafe(read("../../drizzle/migrations/0139_dashboard_balance_reads.sql"));
  await sql`INSERT INTO user_roles VALUES (${actor}, 'dispatcher')`;
  await sql`INSERT INTO role_permissions VALUES ('dispatcher', 'Entregas', 'read')`;
  const [unit] = await sql`INSERT INTO forklifts(organization_id, name, model, status)
    VALUES (${orgA}, 'Equipo A', 'FD50', 'rented') RETURNING id`;
  await sql`INSERT INTO deliveries(organization_id, forklift_id, delivery_number, type, scheduled_date, status, signature_base64)
    SELECT ${orgA}, ${unit.id}, 'ENT-' || lpad(i::text, 4, '0'),
      CASE i % 3 WHEN 0 THEN 'delivery' WHEN 1 THEN 'pickup' ELSE 'return' END,
      '2026-11-09', CASE WHEN i % 2 = 0 THEN 'scheduled' ELSE 'in_transit' END,
      repeat('x', 16384) FROM generate_series(1, 600) i`;
  await sql`INSERT INTO deliveries(organization_id, forklift_id, delivery_number, type, scheduled_date, status, driver_name, address)
    VALUES (${orgA}, ${unit.id}, 'ENT-*50%_', 'pickup', '2026-11-01', 'scheduled', 'María', 'Patio %_'),
           (${orgA}, ${unit.id}, 'ENT-oldest', 'delivery', '2026-10-01', 'in_transit', 'Pedro', 'Patio norte'),
           (${orgA}, ${unit.id}, 'ENT-another', 'return', '2026-11-02', 'scheduled', 'LUIS', NULL),
           (${orgA}, ${unit.id}, 'ENT-today', 'delivery', '2026-11-10', 'scheduled', NULL, NULL),
           (${orgA}, ${unit.id}, 'ENT-future', 'delivery', '2026-11-20', 'scheduled', NULL, NULL),
           (${orgA}, ${unit.id}, 'ENT-completed', 'delivery', '2026-11-01', 'completed', NULL, NULL),
           (${orgA}, ${unit.id}, 'ENT-cancelled', 'pickup', '2026-11-01', 'cancelled', NULL, NULL),
           (${orgA}, ${unit.id}, 'ENT-no-date', 'delivery', NULL, 'scheduled', NULL, NULL),
           (${orgB}, ${unit.id}, 'ENT-foreign', 'pickup', '2026-10-01', 'scheduled', NULL, NULL)`;
  await sql`INSERT INTO delivery_historical_reconciliations(delivery_id, organization_id, revoked_at)
    SELECT id, organization_id, CASE WHEN delivery_number = 'ENT-0002' THEN now() ELSE NULL END
    FROM deliveries WHERE delivery_number IN ('ENT-0001', 'ENT-0002')`;
  await sql`SELECT set_config('fixture.user_id', ${actor}, false), set_config('fixture.organization_id', ${orgA}, false)`;
  await sql`SET ROLE authenticated`;
  const [before] = await sql`SELECT get_dashboard_stats()::jsonb AS data`;
  await sql`RESET ROLE`;
  await sql.unsafe(read("../../drizzle/migrations/0141_overdue_delivery_page.sql"));
  const [security] = await sql`SELECT
    (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'v_overdue_deliveries'::regclass) AS view_invoker,
    (SELECT NOT prosecdef FROM pg_proc WHERE oid = 'get_overdue_deliveries_page(uuid,text,text,text,integer,integer,jsonb)'::regprocedure) AS rpc_invoker,
    (SELECT NOT prosecdef FROM pg_proc WHERE oid = 'get_dashboard_stats()'::regprocedure) AS dashboard_invoker,
    has_table_privilege('anon', 'v_overdue_deliveries', 'SELECT') AS anon_view,
    has_function_privilege('anon', 'get_overdue_deliveries_page(uuid,text,text,text,integer,integer,jsonb)', 'EXECUTE') AS anon_rpc`;
  check("invoker views/functions and closed anonymous ACLs", () => assert.deepEqual(security, {
    view_invoker: true, rpc_invoker: true, dashboard_invoker: true, anon_view: false, anon_rpc: false,
  }));
  await sql`SET ROLE authenticated`;
  const page = async ({ organization = orgA, search = null, type = "all", status = "all", index = 0, size = 25, sort = [] } = {}) => {
    const [row] = await sql`SELECT public.get_overdue_deliveries_page(${organization}::uuid, ${search}, ${type}, ${status}, ${index}, ${size}, ${sql.json(sort)}::jsonb) AS data`;
    return row.data;
  };
  const [after] = await sql`SELECT get_dashboard_stats()::jsonb AS data`;
  const first = await page();
  check("unchanged dashboard contract and exact count above 500", () => {
    assert.deepEqual(after.data, before.data);
    assert.equal(first.totalCount, 602);
    assert.equal(first.totalCount, after.data.pending_deliveries_count);
    assert.equal(first.items.length, 25);
    assert.equal(first.items[0].delivery_number, "ENT-oldest");
    assert.equal(first.today, "2026-11-10");
    assert.equal(first.items.some((row) => "signature_base64" in row), false);
  });
  const allRows = [];
  for (let index = 0; index < Math.ceil(first.totalCount / 100); index++) allRows.push(...(await page({ index, size: 100 })).items);
  check("all pages reachable without duplicates, no foreign/terminal/current-day/history rows", () => {
    assert.equal(allRows.length, 602);
    assert.equal(new Set(allRows.map((row) => row.id)).size, 602);
    assert.equal(allRows.some((row) => row.delivery_number === "ENT-0001"), false);
    assert.equal(allRows.some((row) => row.delivery_number === "ENT-0002"), true);
    assert.ok(allRows.every((row) => row.organization_id === orgA && row.scheduled_date < first.today));
    assert.ok(allRows.every((row) => ["scheduled", "in_transit"].includes(row.status)));
    assert.deepEqual([...new Set(allRows.map((row) => row.type))].sort(), ["delivery", "pickup", "return"]);
  });
  const clamped = await page({ index: 100000, size: 25 });
  check("stale page links clamp to the final page", () => {
    assert.equal(clamped.pageIndex, 24); assert.equal(clamped.items.length, 2);
  });
  const exact = await page({ search: "*50%_" });
  const operator = await page({ search: "luis" });
  const address = await page({ search: "Patio %_" });
  check("literal case-insensitive search includes addresses and operators", () => {
    assert.deepEqual(exact.items.map((row) => row.delivery_number), ["ENT-*50%_"]);
    assert.deepEqual(operator.items.map((row) => row.delivery_number), ["ENT-another"]);
    assert.deepEqual(address.items.map((row) => row.delivery_number), ["ENT-*50%_"]);
  });
  const pickups = await page({ type: "pickup", status: "scheduled", size: 100 });
  check("filters apply before paging and total", () => {
    assert.equal(pickups.totalCount, allRows.filter((row) => row.type === "pickup" && row.status === "scheduled").length);
    assert.ok(pickups.items.every((row) => row.type === "pickup" && row.status === "scheduled"));
  });
  const reversed = await page({ size: 100, sort: [{ id: "scheduled_date", desc: true }] });
  check("sorting happens on the server over the entire queue", () => assert.equal(reversed.items[0].scheduled_date, "2026-11-09"));
  const empty = await page({ search: "nonexistent", index: 100 });
  check("empty filters keep a coherent zero total and first page", () => assert.deepEqual(empty, { items: [], totalCount: 0, pageIndex: 0, today: "2026-11-10" }));
  await assert.rejects(page({ organization: orgB }), { code: "42501" });
  await sql`SELECT set_config('fixture.organization_id', ${orgB}, false)`;
  const foreign = await page({ organization: orgB });
  check("tenant is asserted, never selected by the caller", () => {
    assert.equal(foreign.totalCount, 1); assert.equal(foreign.items[0].forklifts, null);
  });
  await sql`SELECT set_config('fixture.organization_id', ${orgA}, false)`;
  for (const bad of [{ index: -1 }, { size: 101 }, { type: "anything" }, { status: "completed" }, { sort: [{ id: "id; DROP TABLE deliveries", desc: true }] }, { sort: [{ id: "status", desc: false }, { id: "status", desc: true }] }]) {
    await assert.rejects(page(bad), { code: "22023" });
  }
  check("invalid paging/filter/sort inputs fail closed", () => {});
  await sql`RESET ROLE`;
  await sql`UPDATE deliveries SET scheduled_date = '2026-11-10' WHERE delivery_number = 'ENT-oldest'`;
  await sql`UPDATE deliveries SET status = 'completed' WHERE delivery_number = 'ENT-another'`;
  await sql`SET ROLE authenticated`;
  const updated = await page();
  const [updatedStats] = await sql`SELECT get_dashboard_stats()::jsonb AS data`;
  check("reprogramming/completion update the queue and the shared count", () => {
    assert.equal(updated.totalCount, 600); assert.equal(updatedStats.data.pending_deliveries_count, 600);
  });
  await sql`SET TIME ZONE 'Pacific/Kiritimati'`;
  check("session time zone does not change the business-day boundary", () => assert.equal(updated.today, "2026-11-10"));
  const zoned = await page();
  assert.equal(zoned.totalCount, updated.totalCount);
  await sql`RESET ROLE`;
  await sql`CREATE OR REPLACE FUNCTION today_mty() RETURNS date LANGUAGE sql STABLE AS 'SELECT DATE ''2026-11-11'''`;
  await sql`SET ROLE authenticated`;
  const nextDay = await page();
  check("the new business day includes yesterday's still-open transports", () => assert.equal(nextDay.totalCount, 602));
  await sql`RESET ROLE`;
  await sql`CREATE POLICY fixture_hidden ON deliveries AS RESTRICTIVE FOR SELECT TO authenticated USING (delivery_number <> 'ENT-*50%_')`;
  await sql`SET ROLE authenticated`;
  const limited = await page({ search: "*50%_" });
  check("base-table RLS still applies through view and RPC", () => assert.equal(limited.totalCount, 0));
  await sql`RESET ROLE`;
  await sql`UPDATE role_permissions SET access_level = 'none' WHERE module = 'Entregas'`;
  await sql`SET ROLE authenticated`;
  await assert.rejects(page(), { code: "42501" });
  await sql`SELECT set_config('fixture.user_id', '', false)`;
  await assert.rejects(page(), { code: "42501" });
  await sql`RESET ROLE`;
  await sql`SET ROLE anon`;
  await assert.rejects(page(), { code: "42501" });
  check("missing module access, session and anonymous calls are rejected", () => {});
  console.log(`PASS: ${cases} overdue transport PostgreSQL 17 contract cases.`);
} finally {
  if (sql) await sql.end();
  if (existsSync(path.join(dataDir, "postmaster.pid"))) pg("pg_ctl", ["-D", dataDir, "-m", "fast", "stop", "-w"]);
  assert(dir.startsWith(prefix));
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
}
