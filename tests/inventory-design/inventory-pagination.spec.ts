import { test, expect } from "@playwright/test";
import { installQuoteTransport } from "../quotes-design/fixtures";
import { closeOfflinePages } from "../offlineTeardown";
const org = "00000000-0000-4000-8000-000000000002";
const rows = Array.from({ length: 501 }, (_, i) => ({ id: `13200000-0000-4000-8000-${String(i).padStart(12, "0")}`, organization_id: org, catalog_part_id: null, name: i === 500 ? "Z pieza antigua" : `Pieza ${i}`, sku: i === 500 ? "TARGET-501" : `SKU-${i}`, category: i === 500 ? "Baterías" : "Filtros", stock_quantity: i === 500 ? 0 : 10, min_stock_level: 2, unit_cost: 10, location: null, is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01" }));

test("inventory pages and searches beyond500 with a global low-stock count", async ({ page, context, baseURL }, info) => {
  const transport = await installQuoteTransport(context, new URL(baseURL!).origin, { readOnly: true });
  await context.route("**/rest/v1/role_permissions*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(["Dashboard", "Refacciones"].map((module) => ({ role: "admin", module, access_level: "read" }))) });
  });
  await context.route("**/rest/v1/rpc/get_inventory_page", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    expect(route.request().method()).toBe("POST");
    const args = route.request().postDataJSON();
    expect(args.p_expected_organization_id).toBe(org);
    const filtered = rows.filter((p) => (!args.p_search || `${p.name} ${p.sku}`.toLowerCase().includes(args.p_search.toLowerCase())) && (args.p_category === "all" || p.category === args.p_category));
    const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(filtered.length / args.p_page_size) - 1));
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ items: filtered.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size), pageIndex, totalCount: filtered.length, lowStockCount: 1 }) });
  });
  await page.goto("/inventory?tablePage=20");
  await expect(page.getByText("501–501 de 501", { exact: true })).toBeVisible();
  await expect(page.getByText("TARGET-501", { exact: true })).toBeVisible();
  await expect(page.getByText("Refacciones con stock bajo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Habilitar refacción", exact: true })).toHaveCount(0);
  const previous = page.getByRole("button", { name: "Ir a la página anterior" });
  if (info.project.use.hasTouch) await previous.tap(); else await previous.click();
  await expect(page.getByText("476–500 de 501", { exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Buscar por nombre o SKU…" });
  await search.fill("TARGET-501");
  await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
  await search.fill("absent");
  await expect(page.getByText("No hay resultados con los filtros actuales")).toBeVisible();
  await expect(page.getByText("Refacciones con stock bajo", { exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-inventory501.png`, fullPage: true });
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(transport.unexpected).toEqual([]);
  expect(transport.blockedWrites).toEqual([]);
  // The shared offline transport aborts these known build requests. They are
  // expected blocked traffic, never allowed network or application mutations.
  const knownBlocked = new Set([
    "GET https://fonts.googleapis.com/css2",
    "POST http://127.0.0.1:54322/api/1/envelope/",
  ]);
  expect(transport.externalBlocked.filter((request) => !knownBlocked.has(request))).toEqual([]);
});
