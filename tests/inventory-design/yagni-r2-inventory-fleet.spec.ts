import assert from "node:assert/strict";
import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import { forkliftId, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const organizationId = "00000000-0000-4000-8000-000000000002";
const modelId = "00000000-0000-4000-8000-000000000041";
const part = {
  id: "00000000-0000-4000-8000-000000003001", organization_id: organizationId,
  catalog_part_id: null, name: "QA Refacción que sigue activa", sku: "QA-SKU-001", category: "Filtros",
  stock_quantity: 10, min_stock_level: 2, unit_cost: 50, location: "QA Almacén",
  is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};
const model = { id: modelId, organization_id: organizationId, manufacturer: "QA Fabricante", model: "QA Modelo",
  is_active: true, default_daily_rate: 500, default_weekly_rate: 3000, default_monthly_rate: 10000 };
const initialForklift = {
  id: forkliftId, organization_id: organizationId, equipment_model_id: modelId,
  name: "QA Equipo con captura protegida", model: model.model, manufacturer: model.manufacturer,
  serial_number: "QA-SERIE-001", status: "available", fuel_type: "Diesel", year: 2026,
  capacity_kg: 2500, mast_height_m: 4, daily_rate: 500, weekly_rate: 3000, monthly_rate: 10000,
  acquisition_cost: 100000, notes: "Nota inicial", insurance_provider: null, insurance_policy_number: null,
  insurance_expiry: null, insurance_cost: null, deleted_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

async function installTransport(context: BrowserContext, origin: string, allowFleetSave = false) {
  const transport = await installGroupCTransport(context, origin);
  const writes: Array<{ table: string; body: Record<string, unknown> }> = [];
  let forklift = { ...initialForklift };
  const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, PATCH, OPTIONS" };
  const json = (route: Route, value: unknown) => route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(value) });
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split("/").pop()!;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "POST" && table === "get_inventory_page") {
      assert.equal(request.postDataJSON().p_expected_organization_id, organizationId);
      return json(route, { items: [part], totalCount: 1, lowStockCount: 0, pageIndex: 0 });
    }
    if (request.method() === "PATCH" && table === "parts_inventory") {
      assert.equal(url.searchParams.get("id"), `eq.${part.id}`);
      assert.equal(url.searchParams.get("select"), "id");
      assert.deepEqual(request.postDataJSON(), { is_active: false });
      writes.push({ table, body: request.postDataJSON() });
      // Same HTTP success as a row filtered by RLS or no longer present.
      return json(route, []);
    }
    if (request.method() === "PATCH" && table === "forklifts" && allowFleetSave) {
      assert.equal(url.searchParams.get("id"), `eq.${forkliftId}`);
      assert.equal(url.searchParams.get("updated_at"), `eq.${initialForklift.updated_at}`);
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ table, body });
      forklift = { ...forklift, ...body, updated_at: "2026-11-12T12:00:00Z" };
      return json(route, forklift);
    }
    if (request.method() !== "GET") return route.fallback();
    if (table === "role_permissions") return json(route,
      ["Dashboard", "Refacciones", "Flota", "Configuración", "Reservas", "Calendario", "Mantenimiento", "Entregas", "Contratos"]
        .map(module => ({ role: "admin", module, access_level: "full" })));
    if (table === "parts_catalog") return json(route, []);
    if (table === "equipment_models") return json(route, [model]);
    if (table === "parts_inventory" || table === "forklifts") {
      const row = table === "parts_inventory" ? part : forklift;
      return json(route, request.headers().accept?.includes("vnd.pgrst.object") ? row : [row]);
    }
    return route.fallback();
  });
  return { ...transport, writes };
}

async function finish(context: BrowserContext, transport: Awaited<ReturnType<typeof installTransport>>) {
  expect(await closeOfflinePages(context)).toEqual([]);
  expect(transport.unexpected).toEqual([]);
  expect(transport.pageErrors).toEqual([]);
  const knownBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
  expect(transport.externalBlocked.filter(request => !knownBlocked.has(request))).toEqual([]);
}

test("desactivar sin filas afectadas muestra error y conserva la ficha de la refacción", async ({ page, context, baseURL }, info) => {
  const transport = await installTransport(context, new URL(baseURL!).origin);
  await page.goto("/inventory");
  if (info.project.use.isMobile) await page.getByRole("button", { name: new RegExp(part.name) }).click();
  else await page.getByRole("button", { name: `Ver refacción ${part.name}`, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: part.name, exact: true });
  await sheet.getByRole("button", { name: "Desactivar", exact: true }).click();
  await page.getByRole("alertdialog", { name: "¿Desactivar refacción?", exact: true })
    .getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(page.getByText("Error al desactivar refacción", { exact: true })).toBeVisible();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(part.sku, { exact: true })).toBeVisible();
  expect(transport.writes).toEqual([{ table: "parts_inventory", body: { is_active: false } }]);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-r2-part-empty-update.png`, fullPage: true });
  await finish(context, transport);
});

for (const action of ["Cancelar", "Volver"]) {
  test(`Flota ${action}: rechazar conserva captura y confirmar vuelve sin guardar`, async ({ page, context, baseURL }, info) => {
    const transport = await installTransport(context, new URL(baseURL!).origin);
    await page.goto(`/fleet/${forkliftId}`);
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    const notes = page.getByRole("textbox", { name: "Notas", exact: true });
    await expect(notes).toHaveValue("Nota inicial");
    await notes.fill("Captura pendiente que debe conservarse");
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "¿Descartar cambios?", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Seguir editando", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/fleet/${forkliftId}/edit$`));
    await expect(notes).toHaveValue("Captura pendiente que debe conservarse");
    await page.getByRole("button", { name: action, exact: true }).click();
    await dialog.getByRole("button", { name: "Descartar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/fleet/${forkliftId}$`));
    await expect(page.getByRole("heading", { name: initialForklift.name, exact: true })).toBeVisible();
    expect(transport.writes).toEqual([]);
    await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-r2-fleet-${action.toLowerCase()}.png`, fullPage: true });
    await finish(context, transport);
  });
}

test("Flota guarda una vez y vuelve a la ficha sin pedir descartar lo guardado", async ({ page, context, baseURL }, info) => {
  const transport = await installTransport(context, new URL(baseURL!).origin, true);
  await page.goto(`/fleet/${forkliftId}`);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const notes = page.getByRole("textbox", { name: "Notas", exact: true });
  await expect(notes).toHaveValue("Nota inicial");
  await notes.fill("Captura guardada en backend ficticio");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/fleet/${forkliftId}$`));
  await expect(page.getByText("Montacargas actualizado", { exact: true })).toBeVisible();
  await expect(page.getByText("Captura guardada en backend ficticio", { exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog", { name: "¿Descartar cambios?", exact: true })).toHaveCount(0);
  expect(transport.writes).toHaveLength(1);
  expect(transport.writes[0]).toMatchObject({ table: "forklifts", body: { notes: "Captura guardada en backend ficticio" } });
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-r2-fleet-save.png`, fullPage: true });
  await finish(context, transport);
});
