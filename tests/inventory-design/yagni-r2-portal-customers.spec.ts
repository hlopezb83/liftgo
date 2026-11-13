import { test, expect } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { installOfflineDispatcher } from "../mobile/offlineDispatcher";
import { closeOfflinePages } from "../offlineTeardown";
import { backend, id, json } from "./yagni-fixtures";

test("estado de cuenta conserva la página dos durante una lectura lenta", async ({ page, context, baseURL }, info) => {
  const ledger = await installOfflineDispatcher(context, new URL(baseURL!).origin, true, "portal");
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const invoices = Array.from({ length: 26 }, (_, index) => ({
    id: id(8000 + index), invoice_number: `QA-ESTADO-${String(index + 1).padStart(3, "0")}`,
    total: 100, paid_amount: 0, balance: 100, moneda: "MXN", status: "sent",
    issued_at: "2026-11-01", due_date: "2026-12-01",
  }));
  const offsets: number[] = [];
  await context.route(`${backend}/rest/v1/customers*`, route => json(route, { id: id(10), name: "Cliente ficticio portal" }));
  await context.route(`${backend}/rest/v1/rpc/get_customer_summary`, route => json(route, {
    bookings: [], invoices, totals: { total_invoiced: 2600, total_paid: 0, outstanding_revenue: 2600, fx_missing_count: 0 },
  }));
  await context.route(`${backend}/rest/v1/rpc/get_portal_invoices_page`, async route => {
    const args = route.request().postDataJSON();
    expect(args).toMatchObject({ p_page_size: 25, p_only_balance: false });
    offsets.push(args.p_offset);
    // Demora de transporte deliberada: expone el ajuste prematuro de página.
    if (args.p_offset === 25) await new Promise(resolve => setTimeout(resolve, 250));
    return json(route, { rows: invoices.slice(args.p_offset, args.p_offset + 25), total_count: invoices.length });
  });
  await page.goto("/portal/estado-cuenta");
  await expect(page.getByText("QA-ESTADO-001", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ir a la página siguiente" }).click();
  await expect(page.getByText("QA-ESTADO-026", { exact: true })).toBeVisible();
  await expect(page.getByText("QA-ESTADO-001", { exact: true })).toHaveCount(0);
  expect(offsets).toEqual([0, 25]);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-r2-portal-page2.png`, fullPage: true });
  await page.getByRole("button", { name: "Ir a la página anterior" }).click();
  await expect(page.getByText("QA-ESTADO-001", { exact: true })).toBeVisible();
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(ledger.unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("alta de cliente funciona con acceso a localStorage bloqueado", async ({ page, context, baseURL }, info) => {
  const ledger = await installGroupCTransport(context, new URL(baseURL!).origin);
  const inserts: Record<string, unknown>[] = [];
  await context.route(`${backend}/rest/v1/customers*`, route => {
    if (route.request().method() !== "POST") return route.fallback();
    const input = route.request().postDataJSON();
    inserts.push(input);
    return json(route, { ...input, id: id(8900) });
  });
  await page.goto("/customers");
  await page.getByRole("button", { name: "Agregar cliente", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo cliente", exact: true });
  await dialog.getByRole("textbox", { name: "Nombre / Razón Social", exact: true }).fill("Cliente QA almacenamiento bloqueado");
  await page.evaluate(() => {
    Object.defineProperty(window, "localStorage", { configurable: true, get() {
      throw new DOMException("Almacenamiento bloqueado para esta prueba", "SecurityError");
    } });
  });
  await dialog.getByRole("button", { name: "Agregar cliente", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Cliente agregado", { exact: true })).toBeVisible();
  expect(inserts).toHaveLength(1);
  expect(inserts[0]).toMatchObject({ name: "Cliente QA almacenamiento bloqueado" });
  expect(inserts[0]).not.toHaveProperty("is_e2e");
  expect(inserts[0]).not.toHaveProperty("e2e_scope");
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-r2-customer-created.png`, fullPage: true });
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(ledger.unexpected).toEqual([]);
  expect(ledger.pageErrors).toEqual([]);
  const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
  expect(ledger.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
});
