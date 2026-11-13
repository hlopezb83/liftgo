import assert from "node:assert/strict";
import { test, expect, type Route } from "@playwright/test";
import { forkliftId, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";
import type { DeliveriesPageRpcArgs, DeliveryPageItem } from "../../src/features/deliveries/lib/deliveriesPageRpc";

const backend = "http://127.0.0.1:54321";
const organizationId = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `14400000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows: DeliveryPageItem[] = Array.from({ length: 1202 }, (_, index) => ({
  id: id(index + 1), organization_id: organizationId, booking_id: null, forklift_id: forkliftId,
  delivery_number: `QA-ENT-${String(index + 1).padStart(4, "0")}`,
  type: index === 1201 ? "pickup" : "delivery", status: index === 1201 ? "completed" : "scheduled",
  scheduled_date: "2026-11-09", scheduled_time: null, address: "Patio ficticio",
  driver_name: index === 1201 ? "Operador final" : "Operador QA",
  forklifts: { name: "Equipo de la página", model: "QA modelo" },
  historical_reconciliation: index === 1200 ? {
    delivery_id: id(1201), organization_id: organizationId, classification: "closed_rental",
    reference_date: "2026-11-09", date_basis: "booking_start_authorized", evidence: {},
    reason: "Fixture histórico autorizado", authorization_source: "QA local",
    reconciled_at: "2026-11-10T12:00:00Z", revoked_at: null, revocation_reason: null,
  } : null,
}));
const json = (route: Route, value: unknown, status = 200) => route.fulfill({
  status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(value),
});

test("entregas: total mayor de 1001, página, búsqueda, historial y regreso al contexto sin lista truncada", async ({ page, context, baseURL }, info) => {
  const ledger = await installGroupCTransport(context, new URL(baseURL!).origin);
  const calls: DeliveriesPageRpcArgs[] = [];
  const details: string[] = [];
  let fail = false;
  let detailVisited = false;
  await context.route(`${backend}/**`, route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/rest/v1/rpc/get_deliveries_page" && request.method() === "POST") {
      const args = request.postDataJSON() as DeliveriesPageRpcArgs;
      assert.equal(args.p_expected_organization_id, organizationId);
      assert.ok(args.p_page_size > 0 && args.p_page_size <= 100);
      calls.push(args);
      if (fail) return json(route, { code: "QA_READ_FAILED", message: "Fallo ficticio" }, 500);
      const filtered = rows.filter(row =>
        (args.p_type === "all" || row.type === args.p_type) &&
        (args.p_status === "all" || row.status === args.p_status) &&
        (args.p_history === "history" || (args.p_history === "reconciled" ? row.historical_reconciliation !== null : row.historical_reconciliation === null)) &&
        (!args.p_search || `${row.delivery_number} ${row.driver_name} ${row.address}`.toLowerCase().includes(args.p_search.toLowerCase())));
      if (args.p_sort.some(sort => sort.id === "delivery_number" && sort.desc)) filtered.reverse();
      const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(filtered.length / args.p_page_size) - 1));
      const items = filtered.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size);
      return json(route, { items, pageIndex, totalCount: filtered.length, overdueCount: 1200, today: "2026-11-10" });
    }
    if (url.pathname === "/rest/v1/deliveries" && request.method() === "GET") {
      if (url.searchParams.has("id")) {
        assert.equal(url.searchParams.get("id"), `eq.${id(1202)}`);
        detailVisited = true;
        details.push(url.searchParams.get("select")!);
        return json(route, { ...rows[1201], completed_at: "2026-11-09T12:00:00Z", hours_reading: null,
          transport_cost: null, charged_to_customer: false, notes: null, driver_phone: null,
          signature_base64: null, completed_no_evidence_reason: null,
          created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z" });
      }
      // Existing detail still loads siblings; it must not be used for the general list.
      assert.equal(detailVisited, true);
      assert.ok(!url.searchParams.get("select")?.includes("signature_base64"));
      return json(route, []);
    }
    return route.fallback();
  });
  try {
    await page.goto("/deliveries");
    await expect(page.getByText("1–25 de 1201", { exact: true })).toBeVisible();
    await expect(page.getByText(/Hay 1200 transportes atrasados/)).toBeVisible();
    expect(ledger.observed).not.toContain("GET forklifts");
    const mobile = info.project.name.startsWith("mobile-");
    await page.getByRole("button", { name: mobile ? "Ir a la página siguiente" : "Ir a la página 49", exact: true }).click();
    await expect(page.getByText(mobile ? "26–50 de 1201" : "1201–1201 de 1201", { exact: true })).toBeVisible();
    if (mobile) await page.goto("/deliveries?tablePage=48");
    await expect(page.getByText("1201–1201 de 1201", { exact: true })).toBeVisible();
    await expect(page.getByText("QA-ENT-1202", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("1201–1201 de 1201", { exact: true })).toBeVisible();
    await page.getByText("QA-ENT-1202", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "QA-ENT-1202", exact: true })).toBeVisible();
    expect(details).not.toHaveLength(0);
    expect(details[0]).toContain("*");
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await expect(page.getByText("1201–1201 de 1201", { exact: true })).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Buscar entregas…" });
    await search.fill("final");
    await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
    expect(calls.at(-1)).toMatchObject({ p_search: "final", p_page: 0 });
    await page.reload();
    await expect(search).toHaveValue("final");
    await expect(page.getByText("QA-ENT-1202", { exact: true })).toBeVisible();
    await page.goto("/deliveries?q=final&status=completed&type=pickup&tablePage=99");
    await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("tablePage")).toBe("0");
    expect(calls.at(-1)).toMatchObject({ p_status: "completed", p_type: "pickup" });
    await page.goto("/deliveries?history=reconciled");
    await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
    await expect(page.getByText("QA-ENT-1201", { exact: true })).toBeVisible();
    await expect(page.getByText("Conciliada históricamente", { exact: true })).toBeVisible();
    const sort = encodeURIComponent(JSON.stringify([{ id: "delivery_number", desc: true }]));
    await page.goto(`/deliveries?history=history&tableSort=${sort}`);
    await expect(page.getByText("1–25 de 1202", { exact: true })).toBeVisible();
    await expect(page.getByText("QA-ENT-1202", { exact: true })).toBeVisible();
    expect(calls.at(-1)?.p_sort).toEqual([{ id: "delivery_number", desc: true }]);
    await page.reload();
    await expect(page.getByText("QA-ENT-1202", { exact: true })).toBeVisible();
    fail = true;
    await page.goto("/deliveries?q=failure");
    await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toBeVisible();
    await expect(page.getByText("No hay resultados con los filtros actuales", { exact: true })).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(page.getByText("No hay resultados con los filtros actuales", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-d5-deliveries.png`, fullPage: true });
  } finally {
    expect(await closeOfflinePages(context)).toEqual([]);
    expect(ledger.unexpected).toEqual([]);
    expect(ledger.pageErrors).toEqual([]);
    const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(ledger.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
  }
});
