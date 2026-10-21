import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { documentCases, creditCases, conversionCases, missingRateCases, mixedPayments, fractionalTaxDiscrepancy, percentageCases } from "../../../tests/fixtures/monetaryEquivalence";

// Reuse the existing cluster-owning launcher. Never load .env or accept a URL.
const port = Number(process.env.FISCAL_TEST_PORT);
if (process.env.RUN_LOCAL_FISCAL_TESTS !== "1" || !process.env.FISCAL_TEST_CLUSTER || !Number.isSafeInteger(port) || port < 1) {
  throw new Error("Run through scripts/tests/fiscal/run-rep-postgres.mjs, never against an existing database.");
}
const connection = { host: "127.0.0.1", port, database: "postgres", username: "postgres", password: "", max: 1,
  connect_timeout: 5, connection: { statement_timeout: 10_000 }, onnotice: () => {} };
const admin = postgres(connection);
const sql = postgres({ ...connection, database: "monetary_parity" });

// Fail closed if a later migration replaces a pinned product function. This
// focused fixture must be reviewed rather than silently testing obsolete SQL.
const migrationSources = ["supabase/migrations", "drizzle/migrations"].flatMap((directory) =>
  readdirSync(new URL(`../../../${directory}/`, import.meta.url)).filter((file) => file.endsWith(".sql")).sort()
    .map((file) => ({ name: `${directory}/${file}`, sql: readFileSync(new URL(`../../../${directory}/${file}`, import.meta.url), "utf8") })));

// Load the actual function body, not a retyped mirror that can drift. Historical
// migrations remain canonical for these five functions; no migrations applied.
function productFunction(filename: string, name: string, directory = "supabase/migrations") {
  const declarations = migrationSources.filter((entry) => new RegExp(`CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+public\\.${name}\\s*\\(`, "i").test(entry.sql));
  expect(declarations.at(-1)?.name, `Latest product definition for ${name}`).toBe(`${directory}/${filename}`);
  const source = readFileSync(new URL(`../../../${directory}/${filename}`, import.meta.url), "utf8");
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing product function: ${name}`);
  const body = source.slice(start);
  const delimiter = /\bAS\s+(\$[a-zA-Z_]*\$)/i.exec(body);
  if (!delimiter) throw new Error(`Missing function body: ${name}`);
  const end = body.indexOf(delimiter[1] + ";", delimiter.index + delimiter[0].length);
  if (end < 0) throw new Error(`Unterminated function: ${name}`);
  return body.slice(0, end + delimiter[1].length + 1);
}
beforeAll(async () => {
  const [{ data_directory: dataDirectory }] = await admin`SHOW data_directory`;
  expect(dataDirectory).toBe(path.join(process.env.FISCAL_TEST_CLUSTER!, "data"));
  await admin.unsafe("CREATE DATABASE monetary_parity");
  expect(await sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`).toHaveLength(0);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No HTTP/provider traffic in monetary fixtures"); }));
  for (const [file, name] of [
    ["20260729082148_e016fda1-0ba4-429d-a432-b59d50eaf54b.sql", "validate_invoice_totals"],
    ["20260729210845_47fc07f4-6d77-483d-a8c7-cb816c0ff0ce.sql", "validate_credit_note_totals"],
    ["20260901080020_f395aa5e-1e0c-4dd0-a311-4ff8b1b5ed60.sql", "fx_is_missing"],
    ["20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql", "fx_to_mxn"],
    ["20260901181755_c5d18503-1938-4abb-a1d1-3bf9e8ac896d.sql", "fx_convert_amount"],
  ]) await sql.unsafe(productFunction(file, name));
  await sql.unsafe(productFunction("0103_canonical_payment_invoice_currency.sql",
    "enforce_payment_matches_invoice_currency", "drizzle/migrations"));
  // A separate database inside the launcher-owned cluster leaves REP untouched.
  // Minimal tables do NOT claim a full replay of tables, permissions or RLS.
  await sql.unsafe(`
    CREATE TABLE public.invoices (id integer PRIMARY KEY, moneda text, tipo_cambio numeric);
    INSERT INTO public.invoices VALUES (1,'MXN',1);
    CREATE TEMP TABLE parity_payments (amount numeric, currency text, exchange_rate numeric, invoice_id integer);
    CREATE TRIGGER check_currency BEFORE INSERT ON parity_payments
      FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_matches_invoice_currency();
    CREATE TEMP TABLE parity_invoices (subtotal numeric, tax_amount numeric, total numeric);
    CREATE TEMP TABLE parity_notes (subtotal numeric, tax_amount numeric, total numeric);
    CREATE TRIGGER validate_totals BEFORE INSERT ON parity_invoices
      FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_totals();
    CREATE TRIGGER validate_totals BEFORE INSERT ON parity_notes
      FOR EACH ROW EXECUTE FUNCTION public.validate_credit_note_totals();
  `);
});
afterAll(async () => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  await sql.end({ timeout: 1 });
  await admin.end({ timeout: 1 });
});
const numericTotals = (r: Record<string, unknown>) => ({ subtotal: Number(r.subtotal), taxAmount: Number(r.tax_amount), total: Number(r.total) });

describe("MEJ-005 disposable PostgreSQL decimal reference and product persistence", () => {
  it.each(documentCases)("$id: SQL decimal reference and actual invoice invariant", async (c) => {
    // Explicit decimal reference for the approved per-line order, NOT claimed
    // to be a product line-item calculator (the DB guard checks header sums).
    const [reference] = await sql`
      WITH lines AS (SELECT value AS l FROM jsonb_array_elements(${sql.json(c.lines)}::jsonb)),
      gross AS (SELECT l, round(round((l->>'unit_price')::numeric,2)*(l->>'quantity')::numeric,2) AS amount FROM lines),
      net AS (SELECT l, greatest(0,amount-CASE WHEN l->>'discount_type'='$' THEN round(coalesce((l->>'discount')::numeric,0),2)
        ELSE round(amount*coalesce((l->>'discount')::numeric,0)/100,2) END) AS amount FROM gross),
      amounts AS (SELECT amount, CASE WHEN l->>'objeto_imp'='01' THEN 0
        ELSE round(amount*coalesce((l->>'tax_rate')::numeric,${c.taxRate})/100,2) END AS tax FROM net)
      SELECT sum(amount) AS subtotal, sum(tax) AS tax_amount, sum(amount+tax) AS total FROM amounts`;
    expect(numericTotals(reference)).toEqual(c.expected);
    const [stored] = await sql`INSERT INTO parity_invoices VALUES (${reference.subtotal},${reference.tax_amount},${reference.total}) RETURNING *`;
    expect(numericTotals(stored)).toEqual(c.expected);
    await expect(sql`INSERT INTO parity_invoices VALUES (${c.expected.subtotal},${c.expected.taxAmount},${c.expected.total + 0.01})`)
      .rejects.toMatchObject({ code: "23514" });
  });
  it.each(creditCases)("$id: proportional decimal reference and actual NC invariant", async (c) => {
    const [row] = await sql`SELECT CASE WHEN ${c.source.discount_type ?? "%"}='$'
      THEN round(round(${c.source.discount ?? 0}::numeric,2)*round(round(${c.source.unit_price}::numeric,2)*${c.selectedQuantity},2)
        /round(round(${c.source.unit_price}::numeric,2)*${c.source.quantity},2),2)
      ELSE ${c.source.discount ?? 0}::numeric END AS discount`;
    expect(Number(row.discount)).toBe(c.allocatedDiscount);
    const [stored] = await sql`INSERT INTO parity_notes VALUES (${c.expected.subtotal},${c.expected.taxAmount},${c.expected.total}) RETURNING *`;
    expect(numericTotals(stored)).toEqual(c.expected);
    // Existing SQL NC invariant allows 0.01; Edge source validation is stricter.
    // Preserve and state that boundary, do not silently rewrite its tolerance.
    await expect(sql`INSERT INTO parity_notes VALUES (${c.expected.subtotal},${c.expected.taxAmount},${c.expected.total + 0.02})`)
      .rejects.toMatchObject({ code: "23514" });
  });
  it.each(conversionCases)("$id: actual fx_convert_amount", async (c) => {
    const [row] = await sql`SELECT public.fx_convert_amount(${c.amount},${c.from},${c.to},${c.fromRate},${c.toRate}) AS converted`;
    expect(Number(row.converted)).toBe(c.expected);
  });
  it("mixed-currency payments round independently before summing", async () => {
    const [row] = await sql`SELECT sum(public.fx_convert_amount((value->>'amount')::numeric,value->>'currency',${mixedPayments.currency},
      (value->>'exchange_rate')::numeric,${mixedPayments.rate})) AS total
      FROM jsonb_array_elements(${sql.json(mixedPayments.payments)}::jsonb)`;
    expect(Number(row.total)).toBe(mixedPayments.expected);
  });
  it.each(missingRateCases)("missing USD rate %s stays observable, never a fabricated conversion", async (rate) => {
    const [row] = await sql`SELECT public.fx_is_missing('USD',${rate}) AS missing,
      public.fx_convert_amount(10,'USD','MXN',${rate},1) AS converted, public.fx_to_mxn(10,'USD',${rate}) AS mxn`;
    expect(row).toEqual({ missing: true, converted: null, mxn: null });
    await expect(sql`INSERT INTO parity_payments VALUES (10,'USD',${rate},1)`)
      .rejects.toMatchObject({ code: "23514", message: expect.stringContaining("no hay tipo de cambio") });
    expect(await sql`SELECT * FROM parity_payments`).toHaveLength(0);
  });
  it.each(percentageCases)("decimal percentage %s × %s = %s with retained UI sign rule", async (amount, rate, expected) => {
    // PostgreSQL numeric is an independent exact reference. The UI preserves
    // Math.round/currency.js ties toward +infinity for negative inputs; it does
    // not adopt FX's separate half-away-from-zero contract.
    const [row] = await sql`SELECT floor(${amount}::numeric*${rate}::numeric+0.5)/100 AS tax`;
    expect(Number(row.tax)).toBe(expected);
  });
  it("MEJ005-D1: SQL numeric confirms one-round decimal result; UI acceptance retained", async () => {
    const c = fractionalTaxDiscrepancy;
    const [row] = await sql`SELECT round(${c.line.unit_price}::numeric*${c.taxRate}/100,2) AS tax`;
    expect(Number(row.tax)).toBe(c.expected.taxAmount);
  });
});
