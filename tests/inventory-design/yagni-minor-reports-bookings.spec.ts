import { readFile } from "node:fs/promises";
import { test, expect, type BrowserContext } from "@playwright/test";
import Papa from "papaparse";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";
import { backend, id, json } from "./yagni-fixtures";

async function finish(context: BrowserContext, ledger: Awaited<ReturnType<typeof installGroupCTransport>>) {
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(ledger.unexpected).toEqual([]);
  expect(ledger.pageErrors).toEqual([]);
  const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
  expect(ledger.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
}

const reportCases = [
  {
    type: "revenue", rpc: "report_revenue_by_month", filename: "reporte-ingresos.csv",
    rows: [{ month_key: "2026-10", invoiced: 1234.56, paid: 100, invoice_count: 2, fx_missing_count: 0 }],
    expected: { Periodo: "2026-10", Mes: "Oct 26", "Facturado MXN": "1234.56", "Pagado MXN": "100", Facturas: "2" },
  },
  {
    type: "maintenance", rpc: "report_maintenance_cost_by_unit", filename: "costos-mantenimiento.csv",
    rows: [{ name: "Equipo QA", total_cost: 250.75, work_count: 2 }],
    expected: { Montacargas: "Equipo QA", "Costo total MXN": "250.75", Trabajos: "2" },
  },
  {
    type: "utilization", rpc: "report_utilization_by_unit", filename: "reporte-utilizacion.csv",
    rows: [{ forklift_id: id(4), name: "Equipo QA", booked_days: 5, total_days: 10, utilization: 50 }],
    expected: { ID: id(4), Montacargas: "Equipo QA", "Días reservados": "5", "Días totales": "10", "Ocupación reservada %": "50" },
  },
];

async function installReportTransport(context: BrowserContext, origin: string) {
  const ledger = await installGroupCTransport(context, origin);
  await context.route(`${backend}/rest/v1/role_permissions*`, route => {
    if (route.request().method() !== "GET") return route.fallback();
    return json(route, ["Dashboard", "Reportes", "Flota", "Reservas", "Facturas"].map(module => ({
      role: "admin", module, access_level: "full",
    })));
  });
  return ledger;
}

for (const report of reportCases) {
  test(`CSV ${report.type} conserva importes y usa encabezados en español`, async ({ page, context, baseURL }) => {
    const ledger = await installReportTransport(context, new URL(baseURL!).origin);
    await context.route(`${backend}/rest/v1/rpc/${report.rpc}`, route => json(route, report.rows));
    await page.goto(`/reports?type=${report.type}&from=2026-10-01&to=2026-10-31`);
    const exportButton = page.getByRole("button", { name: "Exportar CSV", exact: true });
    await expect(exportButton).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(report.filename);
    const csv = await readFile((await download.path())!, "utf8");
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toEqual([report.expected]);
    await finish(context, ledger);
  });
}

test("ingresos sin datos desactiva el botón de exportación", async ({ page, context, baseURL }, info) => {
  const ledger = await installReportTransport(context, new URL(baseURL!).origin);
  await context.route(`${backend}/rest/v1/rpc/report_revenue_by_month`, route => json(route, []));
  await page.goto("/reports?type=revenue&from=2000-01-01&to=2000-01-31");
  await expect(page.getByText("Sin facturas en el rango", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar CSV", exact: true })).toBeDisabled();
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-minor-report-empty.png`, fullPage: true });
  await finish(context, ledger);
});

test("próximas reservas limpia estados incompatibles y muestra las confirmadas", async ({ page, context, baseURL }, info) => {
  const ledger = await installGroupCTransport(context, new URL(baseURL!).origin);
  const requests: URLSearchParams[] = [];
  const rows = ["confirmed", "cancelled", "completed"].map((status, index) => ({
    id: id(700 + index), organization_id: id(2), booking_number: `QA-RES-${status}`,
    customer_name: "Cliente QA", customer_id: id(31), forklift_id: id(4),
    start_date: "2099-10-01", end_date: "2099-10-05", status,
    forklifts: { name: "Equipo QA", model: "Modelo QA" }, is_e2e: false,
  }));
  await context.route(`${backend}/rest/v1/bookings*`, route => {
    if (route.request().method() !== "GET") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const statuses = params.getAll("status");
    return json(route, rows.filter(row => statuses.every(value => value === `eq.${row.status}` || value === `in.(${row.status})`)));
  });
  const bookingLinkPrefix = info.project.use.isMobile ? "Reserva" : "Ver reserva";
  await page.goto("/bookings?status=cancelled");
  await expect(page.getByRole("link", { name: `${bookingLinkPrefix} QA-RES-cancelled`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próximas reservas", exact: true }).click();
  await expect(page).toHaveURL(/view=upcoming/);
  await expect(page).not.toHaveURL(/status=cancelled/);
  await expect(page.getByRole("link", { name: `${bookingLinkPrefix} QA-RES-confirmed`, exact: true })).toBeVisible();
  expect(requests.at(-1)?.getAll("status")).toEqual(["in.(confirmed)"]);
  if (info.project.use.isMobile) await page.getByRole("button", { name: "Filtros activos", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Cancelado", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Completado", exact: true })).toHaveCount(0);
  if (info.project.use.isMobile) await page.getByRole("dialog", { name: "Filtros", exact: true }).getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("link", { name: `${bookingLinkPrefix} QA-RES-confirmed`, exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-minor-bookings.png`, fullPage: true });
  await finish(context, ledger);
});
