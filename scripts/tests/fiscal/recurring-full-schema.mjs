import assert from "node:assert/strict";
import postgres from "postgres";
import { ciDatabaseUrl, verifyReplay } from "../../ci-drizzle-replay.mjs";

// This is the last business-data test in the existing disposable CI DB job.
// It must never accept a developer/remote/shared connection or skip on CI.
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Full-schema concurrency requires the disposable GitHub Actions database.");
const databaseUrl = ciDatabaseUrl();
const replay = await verifyReplay();
console.log(`Canonical full-schema replay verified (${replay.count} Drizzle entries; pinned target-bound receipts remain excluded).`);
const sql = postgres(databaseUrl, { max: 3, connection: { statement_timeout: 15_000 }, onnotice: () => {} });
const sessions = [];
const uid = (n) => `11910000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = uid(1), CUSTOMER = uid(2);
async function session() {
  const client = await sql.reserve();
  const [{ pid }] = await client`SELECT pg_backend_pid() AS pid`;
  const value = { client, pid };
  sessions.push(value);
  return value;
}
const c = await session(), a = await session(), b = await session();
async function begin(client, service = true) {
  await client`BEGIN`;
  await client`SELECT set_config('app.organization_id',${ORG},true)`;
  if (service) {
    await client.unsafe("SET LOCAL ROLE service_role");
    await client.unsafe(`SET LOCAL request.jwt.claims='{"role":"service_role"}'`);
  }
}
const settle = (promise) => promise.then((rows) => ({ rows }), (error) => ({ error }));
async function waitBlocked(pid, expected) {
  for (let i = 0; i < 250; i++) {
    const [row] = await c.client`SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid=${pid}`;
    if (row?.wait_event_type === "Lock" && (expected === undefined || row.wait_event === expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Concurrent session ${pid} never reached the expected PostgreSQL lock wait (${expected ?? "any"})`);
}
async function seed(numbers) {
  await begin(c.client, false);
  try {
    for (const n of numbers) {
      await c.client`INSERT INTO public.forklifts(id,name,model,status,organization_id)
        VALUES (${uid(n + 1000)},${`CI-FISCAL-${n}`},'Synthetic','available',${ORG})`;
      await c.client`INSERT INTO public.bookings(id,booking_number,forklift_id,customer_id,start_date,end_date,status,recurring_billing,organization_id)
        VALUES (${uid(n)},${`CI-FISCAL-${n}`},${uid(n + 1000)},${CUSTOMER},current_date-30,current_date+30,'confirmed',true,${ORG})`;
    }
    await c.client`COMMIT`;
  } catch (error) { await c.client`ROLLBACK`; throw error; }
}
async function invoice(client, numbers) {
  return client`SELECT * FROM public.create_recurring_invoice(
    ${numbers.map(uid)}::uuid[], ${CUSTOMER}::uuid, 'Synthetic CI fiscal customer',
    '[{"description":"Renta","line_kind":"rental","quantity":1,"unit_price":100,"total":100}]'::jsonb,
    100,16,16,116,current_date-30,current_date,NULL,NULL,NULL,NULL,'G03','MXN',1)`;
}
async function countFor(numbers) {
  const [row] = await c.client`SELECT count(DISTINCT i.id)::integer AS count FROM public.invoices i
    LEFT JOIN public.invoice_bookings ib ON ib.invoice_id=i.id
    WHERE i.organization_id=${ORG} AND (i.booking_id=ANY(${numbers.map(uid)}::uuid[]) OR ib.booking_id=ANY(${numbers.map(uid)}::uuid[]))`;
  return row.count;
}
async function race(first, second, rollback = false) {
  await begin(a.client);
  const firstResult = await invoice(a.client, first);
  await begin(b.client);
  const waiting = settle(invoice(b.client, second));
  await waitBlocked(b.pid, "advisory");
  await a.client.unsafe(rollback ? "ROLLBACK" : "COMMIT");
  const secondResult = await waiting;
  await b.client.unsafe(secondResult.error ? "ROLLBACK" : "COMMIT");
  return { firstResult, secondResult };
}
try {
  assert.equal((await c.client`SELECT count(*)::integer AS count FROM organizations WHERE id=${ORG}`)[0].count, 0, "Fixture organization must not exist");
  await begin(c.client, false);
  await c.client`INSERT INTO public.organizations(id,name,slug) VALUES (${ORG},'Synthetic fiscal concurrency CI','fiscal-concurrency-ci-1191')`;
  await c.client`INSERT INTO public.customers(id,name,created_by_organization_id) VALUES (${CUSTOMER},'Synthetic CI fiscal customer',${ORG})`;
  await c.client`INSERT INTO public.organization_customers(organization_id,customer_id) VALUES (${ORG},${CUSTOMER})`;
  await c.client`COMMIT`;

  await seed([10]);
  {
    const { firstResult, secondResult } = await race([10], [10]);
    assert.ifError(secondResult.error);
    assert.equal(secondResult.rows[0].invoice_id, firstResult[0].invoice_id);
    assert.equal(secondResult.rows[0].already_existed, true);
    assert.equal(await countFor([10]), 1);
    console.log("PASS full-schema same booking: one invoice, second caller reuses");
  }
  await seed([20, 21]);
  {
    const { firstResult, secondResult } = await race([20, 21], [21, 20]);
    assert.ifError(secondResult.error);
    assert.equal(secondResult.rows[0].invoice_id, firstResult[0].invoice_id);
    assert.equal(secondResult.rows[0].already_existed, true);
    assert.equal(await countFor([20, 21]), 1);
    console.log("PASS full-schema reversed group: no deadlock, one invoice");
  }
  await seed([30]);
  {
    const { secondResult } = await race([30], [30], true);
    assert.ifError(secondResult.error);
    assert.equal(secondResult.rows[0].already_existed, false);
    assert.equal(await countFor([30]), 1);
    console.log("PASS full-schema rollback: waiter creates exactly one invoice");
  }
  await seed([40]);
  {
    await begin(a.client, false);
    await a.client`UPDATE public.bookings SET status='cancelled' WHERE id=${uid(40)}`;
    await begin(b.client);
    const waiting = settle(invoice(b.client, [40]));
    await waitBlocked(b.pid); // Actual row/transaction lock, not a synthetic sleep.
    await a.client`COMMIT`;
    const result = await waiting;
    await b.client`ROLLBACK`;
    assert.equal(result.error?.code, "23514");
    assert.match(result.error.message, /cancelada|completada/);
    assert.equal(await countFor([40]), 0);
    assert.equal((await c.client`SELECT last_billed_date FROM bookings WHERE id=${uid(40)}`)[0].last_billed_date, null);
    console.log("PASS full-schema row-writer cancellation: stale eligibility rejected without invoice");
  }
  await seed([50, 51, 52]);
  {
    const { secondResult } = await race([50, 51], [51, 52]);
    assert.equal(secondResult.error?.code, "23514");
    assert.match(secondResult.error.message, /grupo de reservas cambió/);
    assert.equal(await countFor([50, 51, 52]), 1);
    assert.equal((await c.client`SELECT last_billed_date FROM bookings WHERE id=${uid(52)}`)[0].last_billed_date, null);
    console.log("PASS full-schema partial collision: whole request rejected, third booking untouched");
  }
  console.log("Full-schema fiscal concurrency: 5/5. Real service_role, triggers, constraints and replayed functions; no PAC. Fixture remains only in this disposable CI database until supabase stop --no-backup.");
} finally {
  // Do not let a failed/aborted connection prevent release of the other sessions.
  await Promise.allSettled(sessions.map(async ({ client }) => {
    try { await client`ROLLBACK`; } finally { client.release(); }
  }));
  await sql.end({ timeout: 5 });
}
