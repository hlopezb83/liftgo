import { beforeEach, expect, it, vi } from "vitest";
import { fetchAccountantData } from "../fetchData";
import type { ExportOptions } from "../model";
const state = vi.hoisted(() => ({ calls: [] as { table: string; clauses: [string, ...unknown[]][] }[], rows: {} as Record<string, unknown[]> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call = { table, clauses: [] as [string, ...unknown[]][] }; state.calls.push(call);
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "gte", "lte", "order", "limit", "abortSignal", "eq", "or", "gt", "in"]) builder[method] = (...args) => { call.clauses.push([method, ...args]); return builder; };
  builder.returns = async () => {
    const cursor = call.clauses.find(([method]) => method === "gt")?.[2] as string | undefined;
    const ids = call.clauses.find(([method]) => method === "in")?.[2] as string[] | undefined;
    const limit = call.clauses.find(([method]) => method === "limit")?.[1] as number | undefined;
    const rows = (state.rows[table] ?? []) as { id: string }[];
    return { data: rows.filter((row) => (!cursor || row.id > cursor) && (!ids || ids.includes(row.id))).slice(0, limit), error: null };
  };
  return builder;
} } }));
const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const sales = { sales: true, purchases: false, expenses: false };
const options: ExportOptions = { organizationId: org, start: "2026-10-01", end: "2026-10-31", sections: sales, includeDrafts: false, includeTest: false };
beforeEach(() => { state.calls = []; state.rows = {}; });
it("scopes every query and never queries denied modules or sensitive fields", async () => {
  await fetchAccountantData(options, sales, new AbortController().signal);
  expect(state.calls.map((call) => call.table)).toEqual(["invoices", "credit_notes", "payments"]);
  for (const call of state.calls) {
    const select = String(call.clauses.find(([method]) => method === "select")?.[1]);
    expect(select).not.toContain("*"); expect(select).not.toMatch(/notes|bank_account|cfdi_xml/);
    expect(call.clauses).toContainEqual(["gte", call.table === "payments" ? "payment_date" : "issued_at", options.start]);
    expect(call.clauses).toContainEqual(["lte", call.table === "payments" ? "payment_date" : "issued_at", options.end]);
    expect(call.clauses).toContainEqual(["eq", call.table === "payments" ? "scope.organization_id" : "organization_id", org]);
  }
});
it("denies unauthorized section before any query", async () => {
  await expect(fetchAccountantData(options, { ...sales, sales: false }, new AbortController().signal)).rejects.toThrow(/permiso/);
  expect(state.calls).toEqual([]);
});
it("rejects a cross-tenant response despite RLS expectation", async () => {
  state.rows.invoices = [{ id: "a", organization_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }];
  await expect(fetchAccountantData(options, sales, new AbortController().signal)).rejects.toThrow(/empresa/);
});
it("accepts legacy nullable payment only with verified same-company parent", async () => {
  state.rows.invoices = [{ id: "i", organization_id: org }];
  state.rows.payments = [{ id: "p", invoice_id: "i", organization_id: null, scope: { organization_id: org } }];
  const result = await fetchAccountantData(options, sales, new AbortController().signal);
  expect(result.payments).toHaveLength(1); expect(result.payments[0]).not.toHaveProperty("scope");
  state.rows.payments = [{ id: "p", invoice_id: "i", organization_id: null }];
  await expect(fetchAccountantData(options, sales, new AbortController().signal)).rejects.toThrow(/empresa/);
});
it("cannot export a child with an inaccessible reference", async () => {
  state.rows.credit_notes = [{ id: "c", invoice_id: "missing", organization_id: org }];
  await expect(fetchAccountantData(options, sales, new AbortController().signal)).rejects.toThrow(/relacionados autorizados/);
});
it("expenses remain company-explicit, never inferred from a supplier", async () => {
  const expenses = { sales: false, purchases: false, expenses: true };
  await fetchAccountantData({ ...options, sections: expenses }, expenses, new AbortController().signal);
  expect(state.calls).toHaveLength(1); expect(state.calls[0].table).toBe("operating_expenses");
  expect(state.calls[0].clauses).toContainEqual(["eq", "organization_id", org]);
  expect(state.calls[0].clauses.some(([method]) => method === "or")).toBe(false);
});

it("selects document fields only when ZIP requested without changing query scope", async () => {
  await fetchAccountantData(options, sales, new AbortController().signal);
  const plain = state.calls.map((call) => JSON.stringify(call.clauses));
  expect(plain.join()).not.toContain("cfdi_xml_url");
  state.calls.length = 0;
  await fetchAccountantData({ ...options, includeDocuments: true }, sales, new AbortController().signal);
  expect(state.calls.map((call) => JSON.stringify(call.clauses)).join()).toContain("cfdi_xml_url");
});
