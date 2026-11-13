import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';

const directory = process.env.DELIVERIES_TEST_CLUSTER, port = Number(process.env.DELIVERIES_TEST_PORT);
assert.ok(directory && path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('liftgo-deliveries-pg-'));
assert.ok(port > 1024 && port < 65536);
globalThis.fetch = () => { throw Error('No external network in fixture'); };
const sql = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', ssl: false, max: 1, onnotice: () => {} });
const id = n => `14400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = id(1), B = id(2), U = id(10), UNIT = id(20);
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
const file = name => readFileSync(name, 'utf8');
const page = async (options = {}) => {
  const p = { org: A, search: null, type: 'all', status: 'all', history: 'all', index: 0, size: 25, sort: [], ...options };
  return (await sql`SELECT get_deliveries_page(${p.org}::uuid, ${p.search}::text, ${p.type}::text, ${p.status}::text, ${p.history}::text, ${p.index}::integer, ${p.size}::integer, ${sql.json(p.sort)}::jsonb) AS v`)[0].v;
};
try {
  assert.equal(path.resolve((await sql`SELECT current_setting('data_directory') v`)[0].v), path.resolve(directory, 'data'));
  assert.equal((await sql`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)[0].n, 0);
  await sql.unsafe(file('scripts/tests/dashboard-search.fixture.sql'));
  await sql`ALTER TABLE deliveries ADD COLUMN forklift_id uuid, ADD COLUMN scheduled_time time, ADD COLUMN driver_name text`;
  await sql`ALTER TABLE forklifts ADD COLUMN model text`;
  await sql.unsafe(file('drizzle/migrations/0072_dashboard_fleet_counts_unbounded.sql'));
  await sql.unsafe(file('drizzle/migrations/0139_dashboard_balance_reads.sql'));
  await sql.unsafe(file('drizzle/migrations/0141_overdue_delivery_page.sql'));
  const before = (await sql`SELECT pg_get_functiondef('get_overdue_deliveries_page(uuid,text,text,text,integer,integer,jsonb)'::regprocedure) AS v`)[0].v;
  await sql.unsafe(file('drizzle/migrations/0144_deliveries_server_page.sql'));
  assert.equal((await sql`SELECT pg_get_functiondef('get_overdue_deliveries_page(uuid,text,text,text,integer,integer,jsonb)'::regprocedure) AS v`)[0].v, before);
  await sql`INSERT INTO user_roles VALUES (${U}, 'dispatcher')`;
  await sql`INSERT INTO role_permissions VALUES ('dispatcher', 'Entregas', 'read')`;
  await sql`INSERT INTO forklifts(id, organization_id, name, model) VALUES (${UNIT}, ${A}, 'Equipo QA', 'FD50')`;
  await sql`INSERT INTO deliveries(id, organization_id, forklift_id, delivery_number, type, status, scheduled_date, signature_base64)
    SELECT ('14400000-0000-4000-8000-' || lpad((10000+n)::text, 12, '0'))::uuid, ${A}, ${UNIT}, 'ENT-' || lpad(n::text, 4, '0'), 'delivery', 'scheduled', '2026-11-09', repeat('x', 16384) FROM generate_series(1,1200)n`;
  await sql`INSERT INTO deliveries(id, organization_id, forklift_id, delivery_number, type, status, scheduled_date, driver_name, address) VALUES
    (${id(2000)}, ${A}, ${UNIT}, 'ENT-target', 'pickup', 'completed', '2026-11-08', 'María objetivo', 'Patio final'),
    (${id(2001)}, ${A}, ${UNIT}, 'ENT-history', 'delivery', 'scheduled', '2026-11-08', NULL, NULL),
    (${id(2002)}, ${A}, ${UNIT}, 'ENT-revoked', 'return', 'in_transit', '2026-11-08', NULL, NULL),
    (${id(2003)}, ${A}, ${UNIT}, 'ENT-literal%_', 'pickup', 'scheduled', '2026-11-08', NULL, 'Literal %_'),
    (${id(2004)}, ${A}, ${UNIT}, 'ENT-future', 'delivery', 'cancelled', '2026-12-01', NULL, NULL),
    (${id(3000)}, ${B}, ${UNIT}, 'ENT-other', 'pickup', 'scheduled', '2026-11-08', NULL, NULL)`;
  await sql`INSERT INTO delivery_historical_reconciliations VALUES (${id(2001)}, ${A}, NULL), (${id(2002)}, ${A}, now())`;
  await sql`SELECT set_config('fixture.user_id', ${U}, false), set_config('fixture.organization_id', ${A}, false)`;
  await sql`SET ROLE authenticated`;
  await test('exact total, global overdue count, bounded pages and no signatures beyond 1001', async () => {
    const first = await page();
    assert.equal(first.totalCount, 1204); assert.equal(first.overdueCount, 1202); assert.equal(first.items.length, 25);
    const last = await page({ index: 9999 });
    assert.equal(last.pageIndex, 48); assert.equal(last.items.length, 4);
    for (const row of [...first.items, ...last.items]) assert.equal('signature_base64' in row, false);
    assert.equal(first.items[0].forklifts.name, 'Equipo QA');
  });
  await test('status/type/accent-insensitive search filter before count and range', async () => {
    const result = await page({ search: 'MARIA', status: 'completed', type: 'pickup', index: 10 });
    assert.equal(result.totalCount, 1); assert.equal(result.pageIndex, 0); assert.equal(result.items[0].id, id(2000));
    assert.equal(result.overdueCount, 1202);
  });
  await test('literal percent/underscore stay literal, not SQL wildcards', async () => {
    const result = await page({ search: '%_' });
    assert.equal(result.totalCount, 1); assert.equal(result.items[0].id, id(2003));
  });
  await test('active history exclusion, complete history, reconciled filter and revoked inclusion', async () => {
    assert.equal((await page({ history: 'history' })).totalCount, 1205);
    const reconciled = await page({ history: 'reconciled', index: 30 });
    assert.equal(reconciled.totalCount, 1); assert.equal(reconciled.pageIndex, 0); assert.equal(reconciled.items[0].id, id(2001));
    assert.equal((await page({ search: 'revoked' })).totalCount, 1);
    assert.equal((await page({ history: 'reconciled', search: 'revoked' })).totalCount, 0);
  });
  await test('stable tie ordering across pages has no duplicates or omissions', async () => {
    const ids = [];
    for (let index = 0; index < 12; index++) {
      const result = await page({ status: 'scheduled', type: 'delivery', size: 100, index, sort: [{ id: 'scheduled_date', desc: false }] });
      assert.equal(result.totalCount, 1200); ids.push(...result.items.map(row => row.id));
    }
    assert.deepEqual(ids, Array.from({ length: 1200 }, (_, index) => id(10001+index)));
    const reversed = await page({ status: 'scheduled', type: 'delivery', sort: [{ id: 'delivery_number', desc: true }] });
    assert.equal(reversed.items[0].delivery_number, 'ENT-1200');
  });
  await test('filtered empty results retain coherent pagination and independent global count', async () => {
    assert.deepEqual(await page({ search: 'missing', index: 99 }), { items: [], totalCount: 0, pageIndex: 0, overdueCount: 1202, today: '2026-11-10' });
  });
  await test('invalid paging, filter and SQL sort injection fail closed', async () => {
    for (const input of [{ index: -1 }, { size: 101 }, { history: 'wrong' }, { status: 'wrong' }, { type: 'wrong' }, { sort: [{ id: 'id; DROP TABLE deliveries', desc: false }] }, { sort: [{ id: 'type', desc: true }, { id: 'type', desc: false }] }]) {
      await assert.rejects(page(input), { code: '22023' });
    }
  });
  await test('tenant assertion and joins never expose another organization', async () => {
    await assert.rejects(page({ org: B }), { code: '42501' });
    await sql`SELECT set_config('fixture.organization_id', ${B}, false)`;
    const result = await page({ org: B });
    assert.equal(result.totalCount, 1); assert.equal(result.items[0].forklifts, null);
    await sql`SELECT set_config('fixture.organization_id', ${A}, false)`;
  });
  await test('base table RLS, module access, session and anonymous ACLs stay enforced', async () => {
    await sql`RESET ROLE`;
    await sql`CREATE POLICY fixture_hidden ON deliveries AS RESTRICTIVE FOR SELECT TO authenticated USING (delivery_number <> 'ENT-target')`;
    await sql`SET ROLE authenticated`;
    assert.equal((await page({ search: 'target' })).totalCount, 0);
    await sql`RESET ROLE`;
    await sql`UPDATE role_permissions SET access_level='none' WHERE module='Entregas'`;
    await sql`SET ROLE authenticated`;
    await assert.rejects(page(), { code: '42501' });
    await sql`SELECT set_config('fixture.user_id', '', false)`;
    await assert.rejects(page(), { code: '42501' });
    await sql`RESET ROLE`;
    const [security] = await sql`SELECT prosecdef, provolatile, proconfig, has_function_privilege('anon', oid, 'EXECUTE') anon, has_function_privilege('service_role', oid, 'EXECUTE') service FROM pg_proc WHERE oid='get_deliveries_page(uuid,text,text,text,text,integer,integer,jsonb)'::regprocedure`;
    assert.deepEqual(security, { prosecdef: false, provolatile: 's', proconfig: ['search_path=pg_catalog, public'], anon: false, service: false });
  });
  console.log(`${passed}/${passed} focused general-deliveries SQL scenarios passed; not a full schema replay.`);
} finally { await sql.end(); }
