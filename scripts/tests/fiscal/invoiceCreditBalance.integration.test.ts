import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invoiceCreditBalanceCases } from "../../../tests/fixtures/invoiceCreditBalance";

// Only the existing launcher-owned local cluster is accepted, never a URL.
const port = Number(process.env.FISCAL_TEST_PORT);
if (process.env.RUN_LOCAL_FISCAL_TESTS !== "1" || !process.env.FISCAL_TEST_CLUSTER || !Number.isSafeInteger(port) || port < 1) {
  throw new Error("Run through scripts/tests/fiscal/run-rep-postgres.mjs, never against an existing database.");
}
const connection = { host: "127.0.0.1", port, database: "postgres", username: "postgres", password: "", max: 1,
  connect_timeout: 5, connection: { statement_timeout: 10_000 }, onnotice: () => {} };
const admin = postgres(connection);
const sql = postgres({ ...connection, database: "credit_balance_reference" });
const sources = ["supabase/migrations", "drizzle/migrations"].flatMap((directory) =>
  readdirSync(new URL(`../../../${directory}/`, import.meta.url)).filter((name) => name.endsWith(".sql")).sort()
    .map((name) => ({ name: `${directory}/${name}`, source: readFileSync(new URL(`../../../${directory}/${name}`, import.meta.url), "utf8") })));
function productFunction(filename: string, name: string) {
  const definitions = sources.filter(({ source }) => new RegExp(`CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+public\\.${name}\\s*\\(`, "i").test(source));
  expect(definitions.at(-1)?.name).toBe(`supabase/migrations/${filename}`);
  const source = definitions.at(-1)!.source;
  const body = source.slice(source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
  const delimiter = /\bAS\s+(\$[a-zA-Z_]*\$)/i.exec(body);
  if (!delimiter) throw new Error(`Missing product function body: ${name}`);
  const end = body.indexOf(`${delimiter[1]};`, delimiter.index + delimiter[0].length);
  if (end < 0) throw new Error(`Unterminated product function: ${name}`);
  return body.slice(0, end + delimiter[1].length + 1);
}
beforeAll(async () => {
  const [{ data_directory: directory }] = await admin`SHOW data_directory`;
  expect(directory).toBe(path.join(process.env.FISCAL_TEST_CLUSTER!, "data"));
  await admin.unsafe("CREATE DATABASE credit_balance_reference");
  expect(await sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`).toHaveLength(0);
  await sql.unsafe(productFunction("20260901080020_f395aa5e-1e0c-4dd0-a311-4ff8b1b5ed60.sql", "fx_is_missing"));
  await sql.unsafe(productFunction("20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql", "fx_convert_amount"));
});
afterAll(async () => { await sql.end({ timeout: 1 }); await admin.end({ timeout: 1 }); });

describe("MEJ008 read-only excess decimal reference (not an allocation ledger)", () => {
  it.each(invoiceCreditBalanceCases)("$id", async (control) => {
    // Product FX, explicit SQL numeric reference for the new read projection.
    // No assertion that an available ledger or the complete DB schema exists.
    const [row] = await sql`
      WITH payments AS (
        SELECT public.fx_convert_amount((p->>'amount')::numeric, p->>'currency', ${control.currency},
          (p->>'rate')::numeric, ${control.rate}::numeric) AS amount
        FROM jsonb_array_elements(${sql.json(control.payments)}::jsonb) AS p
      ), paid AS (
        SELECT coalesce(sum(amount),0) AS amount, coalesce(bool_or(amount IS NULL),false) AS missing_fx FROM payments
      )
      SELECT CASE WHEN missing_fx THEN NULL ELSE greatest(round(amount-(${control.total}::numeric-${control.credit}::numeric),2),0) END AS excess
      FROM paid`;
    expect(row.excess === null ? null : Number(row.excess)).toBe(control.expected);
  });
  it("documents the legacy NULL cancellation predicate difference without changing production SQL", async () => {
    const [row] = await sql`SELECT NULL::text <> 'accepted' AS old_view,
      NULL::text IS DISTINCT FROM 'accepted' AS canonical_guard`;
    expect(row).toMatchObject({ old_view: null, canonical_guard: true });
  });
});
