import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";
import type { OverdueDeliveriesPageRpcArgs } from "../../src/features/deliveries/lib/overdueDeliveriesPageRpc";

const backend = "http://127.0.0.1:54321";
const organizationId = "00000000-0000-4000-8000-000000000002";
// PostgreSQL accepts these synthetic identifiers without RFC version/variant bits.
const row = {
  id: "14400000-0000-e000-7000-000000000901", organization_id: organizationId,
  booking_id: "14400000-0000-f000-6000-000000000902", forklift_id: "14400000-0000-d000-5000-000000000903",
  delivery_number: "QA-ATR-HIST", type: "delivery", status: "scheduled",
  address: "Patio ficticio", driver_name: "Operador QA", scheduled_date: "2026-11-09", scheduled_time: null,
  forklifts: { name: "QA Equipo con ID legado", model: null },
};

test("atrasados acepta identificadores PostgreSQL históricos sin bits RFC", async ({ page, context, baseURL }, info) => {
  const audit = await installGroupCTransport(context, new URL(baseURL!).origin);
  const calls: OverdueDeliveriesPageRpcArgs[] = [];
  await context.route(`${backend}/rest/v1/rpc/get_overdue_deliveries_page`, async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const args = route.request().postDataJSON() as OverdueDeliveriesPageRpcArgs;
    assert.equal(args.p_expected_organization_id, organizationId);
    assert.equal(args.p_type, "all");
    assert.equal(args.p_status, "all");
    calls.push(args);
    return route.fulfill({ status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      json: { items: [row], totalCount: 1, pageIndex: 0, today: "2026-11-10" } });
  });
  try {
    await page.goto("/deliveries?view=overdue");
    await expect(page.getByRole("heading", { name: "Transportes atrasados", exact: true })).toBeVisible();
    await expect(page.getByText(row.delivery_number, { exact: true })).toBeVisible();
    await expect(page.getByText(row.forklifts.name, { exact: true })).toBeVisible();
    await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
    const label = `${info.project.use.isMobile ? "Ver entrega" : "Ver transporte"} ${row.delivery_number}`;
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", `/deliveries/${row.id}`);
    await expect(page.getByRole("button", { name: "Reintentar", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(row.delivery_number, { exact: true })).toBeVisible();
    expect(calls.length).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath("overdue-postgres-identifiers.png"), fullPage: true });
  } finally {
    expect(await closeOfflinePages(context)).toEqual([]);
    expect(audit.unexpected).toEqual([]);
    expect(audit.pageErrors).toEqual([]);
    const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(audit.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
  }
});
