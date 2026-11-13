import { expect, test } from "@playwright/test";
import { customerId, customerName, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

test("cliente distingue resumen pendiente, error tras éxito y recuperación sin ceros inventados", async ({ page, context, baseURL }, info) => {
  const transport = await installGroupCTransport(context, new URL(baseURL!).origin);
  let release!: () => void;
  const initialRead = new Promise<void>(resolve => { release = resolve; });
  let fail = false;
  const writes: string[] = [];
  context.on("request", request => {
    const url = new URL(request.url());
    if (!["GET", "OPTIONS"].includes(request.method()) && url.pathname.startsWith("/rest/v1/") && !url.pathname.includes("/rpc/")) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  await context.route("http://127.0.0.1:54321/rest/v1/rpc/get_customer_summary*", async route => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    await initialRead;
    return route.fulfill({ status: fail ? 500 : 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(fail ? { message: "Fallo ficticio de resumen", code: "QA_SUMMARY_FAILURE" }
        : { bookings: [], invoices: [], totals: { total_invoiced: 1500, total_paid: 400, outstanding_revenue: 1100 } }) });
  });
  await page.goto(`/customers/${customerId}`);
  await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Cargando resumen del cliente", exact: true })).toBeVisible();
  const pdf = page.getByRole("button", { name: "Estado de Cuenta", exact: true });
  const archive = page.getByRole("button", { name: "Archivar", exact: true });
  await expect(pdf).toBeDisabled();
  await expect(archive).toBeDisabled();
  await expect(page.getByText("Resumen Financiero", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sin reservas aún", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Sin facturas aún", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible();
  await expect(pdf).toBeEnabled();
  await expect(archive).toBeEnabled();

  fail = true;
  await page.clock.install();
  await page.clock.fastForward(61_000);
  await page.evaluate(() => { window.dispatchEvent(new Event("offline")); window.dispatchEvent(new Event("online")); });
  await page.clock.resume();
  const error = page.getByText("No se pudo cargar el resumen del cliente", { exact: true });
  await expect(error).toBeVisible();
  await expect(pdf).toBeDisabled();
  await expect(archive).toBeDisabled();
  await expect(page.getByText("Resumen Financiero", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Historial de Reservas", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: customerName, exact: true })).toBeVisible();

  fail = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(page.getByText("$1,500.00", { exact: true })).toBeVisible();
  await expect(pdf).toBeEnabled();
  await expect(archive).toBeEnabled();
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-medium-customer-summary.png`, fullPage: true });
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(writes).toEqual([]);
  expect(transport.unexpected).toEqual([]);
  expect(transport.pageErrors).toEqual([]);
  const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
  expect(transport.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
});
