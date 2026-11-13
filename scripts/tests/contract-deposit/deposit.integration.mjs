import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';

const directory = process.env.DEPOSIT_TEST_CLUSTER, port = Number(process.env.DEPOSIT_TEST_PORT);
assert.ok(directory && path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('liftgo-deposit-pg-'));
assert.ok(port > 1024 && port < 65536);
globalThis.fetch = () => { throw Error('No external network in fixture'); };
const sql = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', ssl: false, onnotice: () => {} });
const id = n => `14300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = id(1), B = id(2), U = id(10), C = id(100), OTHER = id(101);
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('PASS ' + name); }
async function session(run, { role = 'admin', org = A, commit = false } = {}) {
  const c = await sql.reserve();
  try {
    await c`BEGIN`;
    await c`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: U, org, app_role: role })}, true)`;
    await c`SET LOCAL ROLE authenticated`;
    await c`SET LOCAL statement_timeout='10s'`;
    assert.equal((await c`SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user`)[0].rolbypassrls, false);
    const result = await run(c);
    await c.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } finally { await c`ROLLBACK`; c.release(); }
}
const read = async (c, target = C) => (await c`SELECT to_jsonb(contracts) AS v FROM contracts WHERE id=${target}`)[0]?.v;
const set = async (c, revision, { target = C, status = 'applied', amount = null, notes = 'Aplicado a renta' } = {}) =>
  (await c`SELECT set_contract_deposit_status_checked(${target}::uuid, ${revision}::timestamptz, ${status}::text, ${amount}::numeric, ${notes}::text) AS v`)[0].v;
try {
  assert.equal(path.resolve((await sql`SELECT current_setting('data_directory') v`)[0].v), path.resolve(directory, 'data'));
  assert.equal((await sql`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`)[0].n, 0);
  await sql.unsafe(readFileSync('scripts/tests/contract-deposit/fixture.sql', 'utf8'));
  await sql.unsafe(readFileSync('drizzle/migrations/0070_contract_deposit_idempotence.sql', 'utf8'));
  await sql.unsafe(readFileSync('drizzle/migrations/0143_contract_deposit_concurrency.sql', 'utf8'));
  await sql`INSERT INTO contracts VALUES (${C}, ${A}, 10000, 'applied', '2026-01-02 10:00:00+00', 4000, 'Aplicado a renta', '2026-01-03 10:00:00.123456+00'), (${OTHER}, ${B}, 10000, 'held', NULL, NULL, NULL, '2026-01-03 10:00:00+00')`;

  await test('matching no-op preserves revision, settlement date and partial amount', () => session(async c => {
    const before = await read(c), receipt = await set(c, before.updated_at);
    assert.equal(receipt.updated_at, before.updated_at);
    assert.equal(receipt.deposit_settled_amount, 4000);
    assert.equal(receipt.deposit_settled_at, before.deposit_settled_at);
    assert.deepEqual(await read(c), before);
  }));
  await test('notes and amount edits preserve settlement date; transitions preserve partial amount and held clears it', () => session(async c => {
    const before = await read(c);
    let receipt = await set(c, before.updated_at, { notes: 'Nota revisada' });
    assert.equal(receipt.deposit_settled_amount, 4000);
    assert.equal(receipt.deposit_settled_at, before.deposit_settled_at);
    receipt = await set(c, receipt.updated_at, { amount: 5000, notes: 'Nota revisada' });
    assert.equal(receipt.deposit_settled_amount, 5000);
    assert.equal(receipt.deposit_settled_at, before.deposit_settled_at);
    receipt = await set(c, receipt.updated_at, { status: 'returned' });
    assert.equal(receipt.deposit_settled_amount, 5000);
    assert.notEqual(receipt.deposit_settled_at, before.deposit_settled_at);
    receipt = await set(c, receipt.updated_at, { status: 'held' });
    assert.equal(receipt.deposit_settled_amount, null);
    assert.equal(receipt.deposit_settled_at, null);
  }));
  await test('legitimate zero is retained', () => session(async c => {
    const receipt = await set(c, (await read(c)).updated_at, { amount: 0 });
    assert.equal(receipt.deposit_settled_amount, 0);
  }));
  await test('legacy endpoint rejects before any write', async () => {
    const before = await read(sql);
    await assert.rejects(() => session(c => c`SELECT set_contract_deposit_status(${C}, 'returned', 10000, 'legacy')`), { code: 'P0001', message: /Recarga la aplicación/ });
    assert.deepEqual(await read(sql), before);
  });
  await test('missing revision, invalid state and invalid amounts fail without changing the row', async () => {
    const before = await read(sql);
    await assert.rejects(() => session(c => set(c, null)), { code: '22023' });
    for (const input of [{ status: 'wrong' }, { amount: -1 }, { amount: 10001 }]) {
      await assert.rejects(() => session(c => set(c, before.updated_at, input)), { code: '23514' });
    }
    assert.deepEqual(await read(sql), before);
  });
  await test('role and tenant checks still apply under invoker RLS', async () => {
    const before = await read(sql), other = await read(sql, OTHER);
    await assert.rejects(() => session(c => set(c, before.updated_at), { role: 'dispatcher' }), { code: '42501' });
    await assert.rejects(() => session(c => set(c, other.updated_at, { target: OTHER })), { message: 'Contrato no encontrado' });
    const receipt = await session(c => set(c, before.updated_at, { notes: 'Administración' }), { role: 'administrativo' });
    assert.equal(receipt.deposit_notes, 'Administración');
    assert.deepEqual(await read(sql, OTHER), other);
  });
  await test('two sessions with the same revision serialize: first commits, second conflicts without overwrite', async () => {
    const revision = (await read(sql)).updated_at;
    let unlock, locked;
    const lockHeld = new Promise(resolve => { locked = resolve; });
    const release = new Promise(resolve => { unlock = resolve; });
    const first = session(async c => {
      const receipt = await set(c, revision, { notes: 'Primero' });
      locked();
      await release;
      return receipt;
    }, { commit: true });
    await lockHeld;
    let pid;
    const second = session(async c => {
      pid = (await c`SELECT pg_backend_pid() AS pid`)[0].pid;
      return set(c, revision, { status: 'returned', amount: 9000, notes: 'Segundo obsoleto' });
    }, { commit: true });
    const rejected = assert.rejects(second, { code: '40001' });
    try {
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        if (pid) blocked = (await sql`SELECT cardinality(pg_blocking_pids(${pid})) > 0 AS blocked`)[0].blocked;
        if (blocked) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(blocked, true, 'second writer must actually wait for the first row lock');
    } finally { unlock(); }
    const receipt = await first;
    await rejected;
    const persisted = await read(sql);
    assert.equal(persisted.deposit_notes, 'Primero');
    assert.equal(persisted.deposit_status, 'applied');
    assert.equal(persisted.deposit_settled_amount, 4000);
    assert.equal(receipt.updated_at, persisted.updated_at);
    await assert.rejects(() => session(c => set(c, revision, { notes: 'Primero' })), { code: '40001' });
  });
  await test('reload revision authorizes a reviewed change', async () => {
    const fresh = await read(sql);
    const receipt = await session(c => set(c, fresh.updated_at, { notes: 'Revisado después de recargar' }), { commit: true });
    assert.equal(receipt.deposit_notes, 'Revisado después de recargar');
  });
  await test('both endpoints remain invoker-only with restricted EXECUTE and a mandatory revision', async () => {
    for (const name of ['set_contract_deposit_status_checked(uuid,timestamptz,text,numeric,text)', 'set_contract_deposit_status(uuid,text,numeric,text)']) {
      const [p] = await sql`SELECT prosecdef, proconfig, pronargs, pronargdefaults, has_function_privilege('anon', ${name}, 'EXECUTE') anon, has_function_privilege('service_role', ${name}, 'EXECUTE') service, has_function_privilege('authenticated', ${name}, 'EXECUTE') authenticated FROM pg_proc WHERE oid=${name}::regprocedure`;
      assert.equal(p.prosecdef, false);
      assert.deepEqual(p.proconfig, ['search_path=public']);
      assert.equal(p.anon, false); assert.equal(p.service, false); assert.equal(p.authenticated, true);
      if (name.includes('_checked')) { assert.equal(p.pronargs, 5); assert.equal(p.pronargdefaults, 2); }
    }
  });
  console.log(`${passed}/${passed} focused deposit SQL scenarios passed; not a full schema replay.`);
} finally { await sql.end(); }
