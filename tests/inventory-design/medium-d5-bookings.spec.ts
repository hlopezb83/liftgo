import { expect, test as base, type BrowserContext } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";
import { backend, id, organizationId } from "./yagni-fixtures";

const rows = Array.from({ length: 1001 }, (_, index) => ({
  id: id(10000 + index), organization_id: organizationId, booking_number: `QA-RES-${String(index + 1).padStart(4, "0")}`,
  customer_name: index === 1000 ? "TARGET1001 Cliente remoto" : `Cliente ${String(index).padStart(4, "0")}`,
  customer_id: id(31), forklift_id: id(4), start_date: "2099-10-01", end_date: "2099-10-05",
  status: index % 2 ? "cancelled" : "confirmed", forklifts: { name: `Equipo ${String(index).padStart(4, "0")}`, model: "Modelo QA" },
  recurring_billing: false, is_e2e: false,
}));

async function installTransport(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const state = { fail: false, reads: [] as string[] };
  await context.route(`${backend}/rest/v1/bookings*`, async route => {
    const request = route.request(), params = new URL(request.url()).searchParams;
    const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*",
      "access-control-expose-headers": "content-range", "access-control-allow-methods": "GET, HEAD, OPTIONS" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    state.reads.push(params.toString());
    expect(params.get("organization_id")).toBe(`eq.${organizationId}`);
    const search = params.getAll("or").find(value => value.includes("customer_name.ilike"))?.match(/ilike\."%(.*?)%"/)?.[1]?.toLowerCase();
    const filtered = rows.filter(row => (!search || `${row.customer_name} ${row.booking_number}`.toLowerCase().includes(search))
      && (!params.has("status") || params.get("status") === `eq.${row.status}`));
    const order = (params.get("order") ?? "").split(",");
    filtered.sort((a, b) => {
      for (const term of order) {
        const [column, direction] = term.split(".");
        const value = (row: typeof a) => column === "forklifts(name)" ? row.forklifts.name : String(row[column as keyof typeof row] ?? "");
        const result = value(a).localeCompare(value(b));
        if (result) return direction === "desc" ? -result : result;
      }
      return 0;
    });
    const offset = Number(params.get("offset") ?? 0), limit = Number(params.get("limit") ?? 25);
    const page = filtered.slice(offset, offset + limit);
    return route.fulfill({ status: state.fail ? 500 : 200,
      headers: { ...headers, "content-range": `${offset}-${Math.max(offset, offset + page.length - 1)}/${filtered.length}` },
      json: state.fail ? { message: "Fallo ficticio de reservas" } : page });
  });
  return { audit, state };
}

const test = base.extend<{ transport: Awaited<ReturnType<typeof installTransport>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installTransport(context, new URL(baseURL!).origin);
    try { await use(transport); } finally {
      const teardownErrors = await closeOfflinePages(context);
      await info.attach("bookings-page-network", { contentType: "application/json", body: JSON.stringify({ ...transport, teardownErrors }) });
      expect(transport.audit.unexpected).toEqual([]);
      expect(transport.audit.pageErrors).toEqual([]);
      expect(teardownErrors).toEqual([]);
    }
  }, { auto: true }],
});

test("alcanza la reserva 1001 y busca fuera de las primeras 500 filas", async ({ page, transport }, info) => {
  const prefix = info.project.use.isMobile ? "Reserva" : "Ver reserva";
  await page.goto("/bookings?tablePage=40&tableSize=25");
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-1001`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tablePage=40/);
  await page.getByPlaceholder("Buscar por cliente o folio…").fill("TARGET1001");
  await expect(page).toHaveURL(/q=TARGET1001/);
  await expect(page).not.toHaveURL(/tablePage=40/);
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-1001`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-0001`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Próximas reservas", exact: true }).click();
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-1001`, exact: true })).toBeVisible();
  expect(new URLSearchParams(transport.state.reads.at(-1)).get("status")).toBe("eq.confirmed");
  await page.reload();
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-1001`, exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/medium-d5-bookings-${info.project.name}.png`, fullPage: true });
});

test("el orden global puede traer el último registro a la primera página", async ({ page }, info) => {
  const prefix = info.project.use.isMobile ? "Reserva" : "Ver reserva";
  const sort = encodeURIComponent(JSON.stringify([{ id: "booking_number", desc: true }]));
  await page.goto(`/bookings?tableSort=${sort}`);
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-1001`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-0001`, exact: true })).toHaveCount(0);
});

test("un error conserva la página solicitada y permite reintentar", async ({ page, transport }, info) => {
  transport.state.fail = true;
  await page.goto("/bookings?tablePage=40&tableSize=25");
  await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/tablePage=40/);
  transport.state.fail = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  const prefix = info.project.use.isMobile ? "Reserva" : "Ver reserva";
  await expect(page.getByRole("link", { name: `${prefix} QA-RES-1001`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tablePage=40/);
});
