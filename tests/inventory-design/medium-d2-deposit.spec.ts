import assert from "node:assert/strict";
import { test, expect, type Route } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const id = "00000000-0000-4000-8000-000000000143";
const firstRevision = "2026-11-13T10:00:00.123456+00:00";
const secondRevision = "2026-11-13T10:01:00.654321+00:00";
const json = (route: Route, data: unknown, status = 200) => route.fulfill({
  status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(data),
});

test("depósito: conflicto conserva borrador, recarga fallida conserva formulario y recarga explícita renueva revisión", async ({ page, context, baseURL }, info) => {
  const ledger = await installGroupCTransport(context, new URL(baseURL!).origin);
  let row = { id, contract_number: "CTR-QA-143", organization_id: "00000000-0000-4000-8000-000000000002",
    customer_id: null, forklift_id: null, booking_id: null, status: "active", start_date: null, end_date: null,
    created_at: firstRevision, updated_at: firstRevision, deposit_amount: 10000, deposit_status: "applied",
    deposit_settled_amount: 4000, deposit_settled_at: "2026-11-12T10:00:00+00:00", deposit_notes: "Inicial",
    customers: null, forklifts: null, daily_rate: null, weekly_rate: null, monthly_rate: null,
    signed_at: null, signed_by: null, signed_snapshot: null, notes: null, terms_text: null,
    usage_location: null, max_hours_per_month: null, extra_hour_rate: null, payment_frequency: null,
    late_interest_rate: null, contract_city: null, witness_1: null, witness_2: null, legal_template_version_id: null };
  let failReload = false;
  const saves: Array<Record<string, unknown>> = [];
  await context.route(`${backend}/**`, route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/rest/v1/contracts") {
      assert.equal(url.searchParams.get("id"), `eq.${id}`);
      return failReload ? json(route, { code: "QA_READ_FAILED", message: "Lectura ficticia fallida" }, 500) : json(route, row);
    }
    if (request.method() === "POST" && url.pathname === "/rest/v1/rpc/set_contract_deposit_status_checked") {
      const input = request.postDataJSON() as Record<string, unknown>;
      assert.equal(input.p_contract_id, id);
      saves.push(input);
      if (saves.length === 1) {
        assert.equal(input.p_expected_updated_at, firstRevision);
        row = { ...row, updated_at: secondRevision, deposit_status: "returned", deposit_settled_amount: 5000, deposit_notes: "Cambio concurrente" };
        return json(route, { code: "40001", message: "El contrato cambió" }, 409);
      }
      assert.equal(input.p_expected_updated_at, secondRevision);
      assert.equal(input.p_status, "returned");
      assert.equal(input.p_amount, 5000);
      row = { ...row, updated_at: "2026-11-13T10:02:00.654321+00:00", deposit_notes: String(input.p_notes) };
      return json(route, row);
    }
    return route.fallback();
  });
  try {
    await page.goto(`/contracts/${id}`);
    const card = page.getByText("Depósito en garantía", { exact: true }).locator("..").locator("..");
    await card.getByLabel("Notas", { exact: true }).fill("Mi borrador");
    await card.getByRole("button", { name: "Guardar estado del depósito" }).click();
    await expect(card.getByRole("button", { name: "Recargar depósito" })).toBeVisible();
    await expect(card.getByLabel("Notas", { exact: true })).toHaveValue("Mi borrador");
    expect(saves).toHaveLength(1);
    failReload = true;
    await card.getByRole("button", { name: "Recargar depósito" }).click();
    await expect(card.getByText("No se pudo recargar el depósito. Tus cambios siguen aquí.")).toBeVisible();
    await expect(card.getByLabel("Notas", { exact: true })).toHaveValue("Mi borrador");
    failReload = false;
    await card.getByRole("button", { name: "Recargar depósito" }).click();
    await expect(card.getByLabel("Notas", { exact: true })).toHaveValue("Cambio concurrente");
    await expect(card.getByLabel("Importe devuelto (MXN)")).toHaveValue("5000");
    await card.getByLabel("Notas", { exact: true }).fill("Revisado después de recargar");
    await card.getByRole("button", { name: "Guardar estado del depósito" }).click();
    await expect(card.getByRole("button", { name: "Guardar estado del depósito" })).toBeDisabled();
    await expect.poll(() => saves.length).toBe(2);
    await expect(card.getByText("Revisado después de recargar", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-d2-deposit.png`, fullPage: true });
  } finally {
    expect(await closeOfflinePages(context)).toEqual([]);
    expect(ledger.unexpected).toEqual([]);
    expect(ledger.pageErrors).toEqual([]);
    const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(ledger.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
  }
});
