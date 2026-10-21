import { describe, expect, it } from "vitest";
import { buildAccountantSheets } from "../buildSheets";
import { assertOptions } from "../model";
import { collectPages } from "../pagination";
import { createAccountantWorkbook } from "../writeWorkbook";
import type { ExportData, ExportOptions, Invoice, Payment } from "../model";

const org = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const permissions = { sales: true, purchases: true, expenses: true };
const options: ExportOptions = { organizationId: org, start: "2026-10-01", end: "2026-10-31", sections: permissions, includeDrafts: false, includeTest: false };
const company = { razon_social: "QA Empresa", rfc: "AAA010101AAA" };
const blank = (): ExportData => ({ invoices: [], credits: [], payments: [], bills: [], supplierPayments: [], expenses: [], invoiceReferences: [], billReferences: [], startedAt: "2026-11-01T01:00:00Z", finishedAt: "2026-11-01T01:01:00Z" });
const invoice = (patch: Partial<Invoice> = {}): Invoice => ({ id: "i1", organization_id: org, invoice_number: "F-001", issued_at: "2026-10-01", due_date: null, customer_name: "QA", receptor_razon_social: null, receptor_rfc: "XAXX010101000", cfdi_uuid: null, serie: null, folio: null, moneda: "MXN", tipo_cambio: 1, subtotal: 100, tax_amount: 16, tax_rate: 16, total: 116, status: "issued", cfdi_status: "stamped", cancellation_status: "none", cancelled_at: null, substitution_uuid: null, facturapi_env: "live", is_e2e: false, metodo_pago: "PPD", forma_pago: null, uso_cfdi: null, billing_period_start: null, billing_period_end: null, updated_at: "2026-10-01T00:00:00Z", ...patch });
const payment = (patch: Partial<Payment> = {}): Payment => ({ id: "p1", organization_id: org, invoice_id: "i1", payment_date: "2026-10-31", amount: 116, currency: "MXN", exchange_rate: 1, amount_mxn: 116, payment_method: "transfer", payment_form_sat: null, reference_number: null, installment_number: 1, prior_balance: 116, is_e2e: false, rep_number: "REP-001", rep_folio: "1", rep_cfdi_uuid: "uuid-rep", rep_cfdi_status: "cancelled", rep_cancellation_status: "accepted", rep_cancelled_at: null, rep_substitution_uuid: null, ...patch });

it("keeps invoices and collections as separate facts, never income232; REP cancellation does not remove money", () => {
  const data = blank(); data.invoices = [invoice()]; data.payments = [payment()];
  const sheets = buildAccountantSheets(options, data, company, permissions);
  const totals = sheets.find((sheet) => sheet.name === "Resumen por moneda")?.rows ?? [];
  expect(totals).toHaveLength(2); expect(totals.map((row) => row["Total original"])).toEqual([116, 116]);
  expect(sheets.find((sheet) => sheet.name === "Cobros")?.rows[0].Estado).toBe("Cobro registrado");
  expect(sheets.find((sheet) => sheet.name === "REP asociados a cobros")?.rows[0].Estado).toBe("cancelled");
});
it("includes outside-period parents only as non-summable references", () => {
  const data = blank(); data.invoiceReferences = [invoice({ issued_at: "2026-09-01" })]; data.payments = [payment()];
  const sheets = buildAccountantSheets(options, data, company, permissions);
  expect(sheets.find((sheet) => sheet.name === "Ventas")?.rows).toEqual([]);
  expect(sheets.find((sheet) => sheet.name === "Referencias")?.rows[0].Alcance).toContain("no sumable");
  expect(sheets.find((sheet) => sheet.name === "Resumen por moneda")?.rows).toHaveLength(1);
});
it("separates canceled, test and unknown environment without asserting unknown means live", () => {
  const data = blank(); data.invoices = [invoice(), invoice({ id: "test", facturapi_env: "test" }), invoice({ id: "unknown", facturapi_env: null }), invoice({ id: "cancel", cancellation_status: "accepted" }), invoice({ id: "draft", status: "draft" })];
  const sheets = buildAccountantSheets(options, data, company, permissions);
  const sales = sheets.find((sheet) => sheet.name === "Ventas")?.rows ?? [];
  expect(sales).toHaveLength(3); expect(sales.map((row) => row.Ambiente)).toContain("Desconocido");
  expect(sales.find((row) => row.ID === "cancel")?.Estado).toBe("Cancelado");
  expect(buildAccountantSheets({ ...options, includeTest: true, includeDrafts: true }, data, company, permissions).find((sheet) => sheet.name === "Ventas")?.rows).toHaveLength(5);
});
it("never fabricates missing FX or NC fiscal FX", () => {
  const data = blank(); data.invoices = [invoice({ moneda: "USD", tipo_cambio: null })];
  data.credits = [{ id: "nc", organization_id: org, invoice_id: "i1", credit_note_number: "NC1", issued_at: "2026-10-10", currency: "USD", subtotal: 10, tax_amount: 1.6, tax_rate: 16, total: 11.6, cfdi_uuid: null, status: "issued", cfdi_status: "stamped", cancellation_status: "none", cancelled_at: null, substitution_uuid: null, motive: "01", updated_at: "2026-10-10" }];
  const sheets = buildAccountantSheets(options, data, company, permissions);
  expect(sheets.find((sheet) => sheet.name === "Ventas")?.rows[0]["Total MXN calculado"]).toBeNull();
  expect(sheets.find((sheet) => sheet.name === "Notas de crédito")?.rows[0]["TC propio"]).toContain("No disponible");
});
it("fails closed on permission requests and invalid civil dates", () => {
  expect(() => assertOptions(options, { ...permissions, sales: false })).toThrow(/permiso/);
  expect(() => assertOptions({ ...options, end: "2026-09-30" }, permissions)).toThrow(/rango/);
  expect(() => assertOptions({ ...options, start: "2026-02-30" }, permissions)).toThrow(/rango/);
  expect(() => buildAccountantSheets(options, blank(), company, { ...permissions, purchases: false })).toThrow(/permiso/);
});
it("exports text explicitly, never formulas, keeps leading zeros and long identifiers", async () => {
  const wb = await createAccountantWorkbook([{ name: "Prueba", rows: [{ ID: "00012345678901234567890", Texto: '=HYPERLINK("https://bad")', Mas: "+1+1", Menos: "-cmd", Arroba: "@SUM(A1)", Importe: 1.25 }] }]);
  const XLSX = await import("@e965/xlsx");
  const roundtrip = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { type: "array" });
  const ws = roundtrip.Sheets.Prueba;
  expect(ws.A2).toMatchObject({ t: "s", v: "00012345678901234567890" });
  for (const cell of [ws.B2, ws.C2, ws.D2, ws.E2]) { expect(cell.t).toBe("s"); expect(cell.f).toBeUndefined(); }
  expect(ws.F2).toMatchObject({ t: "n", v: 1.25 });
});
describe("complete cancellable keyset pagination", () => {
  it("reads more than10000 exactly once", async () => {
    const all = Array.from({ length: 11001 }, (_, i) => ({ id: String(i).padStart(8, "0") }));
    const result = await collectPages(async (after, limit) => ({ data: all.filter((row) => !after || row.id > after).slice(0, limit), error: null }), new AbortController().signal);
    expect(result).toEqual(all);
  });
  it("rejects repeated or unordered records and transport errors", async () => {
    await expect(collectPages(async () => ({ data: [{ id: "b" }, { id: "a" }], error: null }), new AbortController().signal, 2)).rejects.toThrow(/estable/);
    await expect(collectPages(async () => ({ data: null, error: new Error("denied") }), new AbortController().signal)).rejects.toThrow("denied");
  });
  it("discards a late response after cancellation", async () => {
    const abort = new AbortController();
    await expect(collectPages(async () => { abort.abort(); return { data: [{ id: "a" }], error: null }; }, abort.signal)).rejects.toThrow();
  });
});

it("rejects TC1 for foreign currencies and preserves separate effective legacy payment currencies", () => {
  const data = blank(); data.invoices = [invoice({ id: "usd", moneda: "USD", tipo_cambio: 1 }), invoice({ id: "mxn", moneda: "MXN" })];
  data.payments = [payment({ id: "p-usd", invoice_id: "usd", currency: null as unknown as string, amount: 100 }), payment({ id: "p-mxn", invoice_id: "mxn", currency: null as unknown as string, amount: 100 })];
  const sheets = buildAccountantSheets(options, data, company, permissions);
  expect(sheets.find((sheet) => sheet.name === "Ventas")?.rows.find((row) => row.ID === "usd")?.["Total MXN calculado"]).toBeNull();
  const totals = sheets.find((sheet) => sheet.name === "Resumen por moneda")?.rows.filter((row) => row.Hoja === "Cobros") ?? [];
  expect(totals.map((row) => [row.Moneda, row["Total original"]])).toEqual([["USD", 100], ["MXN", 100]]);
  expect(sheets.find((sheet) => sheet.name === "Control")?.rows).toContainEqual({ Concepto: "Conversión MXN no disponible: Ventas", Valor: 1 });
});

it("fails closed on malformed monetary values rather than exporting zero", () => {
  const data = blank(); data.invoices = [invoice({ total: Number.NaN })];
  expect(() => buildAccountantSheets(options, data, company, permissions)).toThrow(/Importe no válido/);
});
it("preserves unknown currency rows without aggregating unidentified units", () => {
  const data = blank(); data.invoices = [invoice({ moneda: "", total: 100 }), invoice({ id: "i2", moneda: "No registrada", total: 200 })];
  const sheets = buildAccountantSheets(options, data, company, permissions);
  expect(sheets.find((sheet) => sheet.name === "Ventas")?.rows).toHaveLength(2);
  expect(sheets.find((sheet) => sheet.name === "Ventas")?.rows.every((row) => row["Total MXN calculado"] === null && row["Advertencia moneda"])).toBe(true);
  expect(sheets.find((sheet) => sheet.name === "Resumen por moneda")?.rows).toEqual([]);
  expect(sheets[0].rows.find((row) => row.Concepto === "Importes no sumables por moneda no verificable: Ventas")?.Valor).toBe(2);
});
