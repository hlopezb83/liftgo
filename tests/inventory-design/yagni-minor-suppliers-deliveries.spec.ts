import assert from "node:assert/strict";
import { test, expect, type Route } from "@playwright/test";
import { forkliftId, getGroupCTransportLedgers, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const supplierId = id(61), deliveryId = id(601);
const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status,
  contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(value) });

test.afterEach(async ({ context }) => {
  expect(await closeOfflinePages(context)).toEqual([]);
  for (const ledger of getGroupCTransportLedgers(context)) {
    expect(ledger.unexpected).toEqual([]);
    expect(ledger.pageErrors).toEqual([]);
    const allowedBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(ledger.externalBlocked.filter(request => !allowedBlocked.has(request))).toEqual([]);
  }
});

test("proveedor: contactos y bancos distinguen error, reintento y vacío confirmado", async ({ page, context, baseURL }, info) => {
  await installGroupCTransport(context, new URL(baseURL!).origin);
  const failing = { supplier_contacts: true, supplier_bank_accounts: true };
  const reads = { supplier_contacts: 0, supplier_bank_accounts: 0 };
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split("/").pop();
    if (request.method() !== "GET" || (table !== "supplier_contacts" && table !== "supplier_bank_accounts")) return route.fallback();
    assert.equal(url.searchParams.get("supplier_id"), `eq.${supplierId}`);
    reads[table]++;
    return failing[table]
      ? json(route, { code: "FIXTURE_QUERY_ERROR", message: "Fallo ficticio de lectura" }, 500)
      : json(route, []);
  });

  await page.goto(`/suppliers/${supplierId}`);
  const contactsHeading = page.getByRole("heading", { name: /^Contactos(?:\s|$)/ });
  const banksHeading = page.getByRole("heading", { name: /^Cuentas Bancarias(?:\s|$)/ });
  const contacts = contactsHeading.locator("..").locator("..");
  const banks = banksHeading.locator("..").locator("..");
  await expect(contacts.getByText("No se pudo cargar los contactos", { exact: true })).toBeVisible();
  await expect(banks.getByText("No se pudo cargar las cuentas bancarias", { exact: true })).toBeVisible();
  await expect(contactsHeading).not.toContainText("(0)");
  await expect(banksHeading).not.toContainText("(0)");
  await expect(page.getByText("Sin contactos registrados.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sin cuentas bancarias registradas.", { exact: true })).toHaveCount(0);

  const contactAttempts = reads.supplier_contacts, bankAttempts = reads.supplier_bank_accounts;
  failing.supplier_contacts = false;
  await contacts.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(contacts.getByText("Sin contactos registrados.", { exact: true })).toBeVisible();
  await expect(contactsHeading).toContainText("(0)");
  await expect(banksHeading).not.toContainText("(0)");
  expect(reads.supplier_contacts).toBeGreaterThan(contactAttempts);
  expect(reads.supplier_bank_accounts).toBe(bankAttempts);

  failing.supplier_bank_accounts = false;
  await banks.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(banks.getByText("Sin cuentas bancarias registradas.", { exact: true })).toBeVisible();
  await expect(banksHeading).toContainText("(0)");
  expect(reads.supplier_bank_accounts).toBeGreaterThan(bankAttempts);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-minor-supplier-retry.png`, fullPage: true });
});

test("entregas: lista sin firma y detalle con la firma conservada", async ({ page, context, baseURL }, info) => {
  await installGroupCTransport(context, new URL(baseURL!).origin);
  const signature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=";
  const delivery = { id: deliveryId, organization_id: id(2), delivery_number: "ENT-QA-SIN-CARGAR-FIRMA",
    forklift_id: forkliftId, booking_id: null, type: "delivery", status: "completed",
    scheduled_date: "2026-11-01", scheduled_time: "12:00:00", completed_at: "2026-11-01T18:00:00Z",
    created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T18:00:00Z",
    driver_name: "Operador ficticio QA", driver_phone: "0000000000", address: "Dirección ficticia QA",
    hours_reading: 125, transport_cost: 100, charged_to_customer: true, notes: null,
    completed_no_evidence_reason: null, signature_base64: signature,
    forklifts: { name: "Equipo ficticio QA", model: "Modelo QA" }, historical_reconciliation: null };
  const listSelects: string[] = [], detailSelects: string[] = [];
  await context.route(`${backend}/rest/v1/deliveries?**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") return route.fallback();
    const select = url.searchParams.get("select") ?? "";
    if (select === "hours_reading") return json(route, { hours_reading: 125 });
    if (url.searchParams.has("id")) {
      assert.equal(url.searchParams.get("id"), `eq.${deliveryId}`);
      detailSelects.push(select);
      return json(route, delivery);
    }
    listSelects.push(select);
    const rootColumns = select.split(/,\s*forklifts\(/)[0].split(",").map(column => column.trim());
    const projected = Object.fromEntries(Object.entries(delivery).filter(([key]) => rootColumns.includes("*")
      || rootColumns.includes(key) || key === "forklifts" || key === "historical_reconciliation"));
    return json(route, [projected]);
  });

  await page.goto("/deliveries");
  await expect(page.getByText(delivery.delivery_number, { exact: true })).toBeVisible();
  expect(listSelects.length).toBeGreaterThan(0);
  for (const select of listSelects) {
    const rootColumns = select.split(/,\s*forklifts\(/)[0].split(",").map(column => column.trim());
    expect(rootColumns).not.toContain("*");
    expect(rootColumns).not.toContain("signature_base64");
    expect(rootColumns).toEqual(expect.arrayContaining(["hours_reading", "booking_id", "completed_at", "driver_name"]));
  }
  await page.getByText(delivery.delivery_number, { exact: true }).click();
  await expect(page.getByRole("heading", { name: delivery.delivery_number, exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Firma", exact: true })).toHaveAttribute("src", signature);
  await expect(page.getByRole("img", { name: "Firma", exact: true })).toBeVisible();
  expect(detailSelects.some(select => select.startsWith("*,") || select.includes("signature_base64"))).toBe(true);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-minor-delivery-signature.png`, fullPage: true });
});
