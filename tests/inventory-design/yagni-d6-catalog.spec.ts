import assert from "node:assert/strict";
import { expect, test as base, type BrowserContext, type Route } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const organizationId = "00000000-0000-4000-8000-000000000002";
const catalog = Array.from({ length: 1001 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  sku: `QA-SKU-${String(index + 1).padStart(5, "0")}`, name: `Refacción catálogo ${index + 1}`, is_active: true,
}));
const lastPart = catalog[1000];

async function installCatalogTransport(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const reads: URL[] = [];
  const writes: Array<Record<string, unknown>> = [];
  const activated = new Set(catalog.slice(0, 550).map((part) => part.id));
  const state = { failInventory: false, catalogSize: catalog.length, recounts: 0 };
  const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS", "access-control-expose-headers": "content-range" };
  const json = (route: Route, value: unknown, count = 0, status = 200) => route.fulfill({ status,
    headers: { ...headers, "content-range": `0-49/${count}` }, contentType: "application/json", body: JSON.stringify(value) });
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split("/").pop();
    const p = url.searchParams;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() === "POST" && table === "get_inventory_page") {
      assert.equal(request.postDataJSON().p_expected_organization_id, organizationId);
      return json(route, { items: [], totalCount: 0, lowStockCount: 0, pageIndex: 0 });
    }
    if (request.method() === "POST" && table === "activate_parts_catalog") {
      const body = request.postDataJSON() as Record<string, unknown>;
      assert.equal(body.p_catalog_part_id, lastPart.id);
      assert.equal(activated.has(String(body.p_catalog_part_id)), false);
      writes.push(body);
      activated.add(String(body.p_catalog_part_id));
      return json(route, "00000000-0000-4000-8000-000000009600");
    }
    if (!["GET", "HEAD"].includes(request.method())) return route.fallback();
    if (table === "role_permissions") return json(route,
      ["Dashboard", "Refacciones", "Flota", "Configuración", "Reservas", "Calendario", "Mantenimiento", "Entregas", "Contratos"]
        .map(module => ({ role: "admin", module, access_level: "full" })));
    if (table === "parts_catalog") {
      reads.push(url);
      assert.equal(p.get("is_active"), "eq.true");
      assert.equal(p.get("select"), "id,sku,name");
      let rows = catalog.slice(0, state.catalogSize).filter((part) => !p.has("id") || p.get("id") === `eq.${part.id}`);
      if (p.has("or")) {
        const pattern = p.get("or")!.slice("(sku.imatch.".length).split(",name.imatch.")[0];
        const regex = new RegExp(JSON.parse(pattern) as string, "i");
        rows = rows.filter((part) => regex.test(part.sku) || regex.test(part.name));
      }
      const count = rows.length;
      if (request.method() === "HEAD") {
        state.recounts++;
        assert.equal(p.has("offset"), false);
        return route.fulfill({ headers: { ...headers, "content-range": `*/${count}` }, body: "" });
      }
      if (!p.has("id")) {
        assert.equal(p.get("limit"), "50");
        assert.equal(p.get("order"), "sku.asc,id.asc");
        const offset = Number(p.get("offset"));
        if (offset > 0 && offset >= count) return json(route, { code: "PGRST103", message: "Requested range not satisfiable" }, count, 416);
        rows = rows.slice(offset, offset + 50);
      }
      return json(route, rows, count);
    }
    if (table === "parts_inventory") {
      reads.push(url);
      assert.equal(p.get("organization_id"), `eq.${organizationId}`);
      assert.equal(p.get("is_active"), "eq.true");
      assert.equal(p.get("select"), "catalog_part_id");
      const ids = p.get("catalog_part_id")!.slice(4, -1).split(",");
      assert.ok(ids.length <= 51);
      if (state.failInventory) return json(route, { code: "42501", message: "Error ficticio de consulta local" }, 0, 403);
      return json(route, ids.filter(id => activated.has(id)).map(catalog_part_id => ({ catalog_part_id })));
    }
    return route.fallback();
  });
  return { audit, reads, writes, state };
}

const test = base.extend<{ transport: Awaited<ReturnType<typeof installCatalogTransport>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installCatalogTransport(context, new URL(baseURL!).origin);
    await use(transport);
    const teardownErrors = await closeOfflinePages(context);
    await info.attach("catalog-offline-network", { contentType: "application/json", body: JSON.stringify({
      ...transport.audit, writes: transport.writes, reads: transport.reads.map(String), teardownErrors,
    }, null, 2) });
    expect(transport.audit.unexpected).toEqual([]);
    expect(transport.audit.pageErrors).toEqual([]);
    const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(transport.audit.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
    expect(teardownErrors).toEqual([]);
  }, { auto: true }],
});

test("catálogo completo: pagina, excluye activados después de 501 y conserva selección al buscar", async ({ page, transport }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Habilitar refacción", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Habilitar refacción", exact: true });
  await expect(dialog.getByText("Página 1 de 21", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Los SKUs de esta página ya están habilitados/)).toBeVisible();
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.getByText("Página 2 de 21", { exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Buscar SKU o nombre", exact: true }).fill(catalog[549].sku);
  await expect(dialog.getByText("Página 1 de 1", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Habilitar", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Buscar SKU o nombre", exact: true }).fill(lastPart.sku);
  await expect(dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true })).toBeEnabled();
  await dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true }).click();
  await page.getByRole("option", { name: `${lastPart.sku} · ${lastPart.name}`, exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Habilitar", exact: true })).toBeEnabled();
  await dialog.getByRole("textbox", { name: "Buscar SKU o nombre", exact: true }).fill("QA-SKU");
  await expect(dialog.getByText("Página 1 de 21", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true })).toHaveText(`${lastPart.sku} · ${lastPart.name}`);
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.getByText("Página 2 de 21", { exact: true })).toBeVisible();
  await dialog.getByLabel("Stock inicial", { exact: true }).fill("12");
  await dialog.getByRole("button", { name: "Habilitar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(transport.writes).toEqual([{ p_catalog_part_id: lastPart.id, p_stock_quantity: 12, p_min_stock_level: 0, p_unit_cost: 0 }]);
  expect(transport.reads.some(url => url.searchParams.get("catalog_part_id")?.includes(catalog[549].id))).toBe(true);
  expect(transport.reads.some(url => url.searchParams.get("id") === `eq.${lastPart.id}`)).toBe(true);
});

test("un fallo al verificar SKUs bloquea el envío y el reintento conserva SKU y cantidades", async ({ page, transport }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Habilitar refacción", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Habilitar refacción", exact: true });
  await expect(dialog.getByText("Página 1 de 21", { exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Buscar SKU o nombre", exact: true }).fill(lastPart.sku);
  await dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true }).click();
  await page.getByRole("option", { name: `${lastPart.sku} · ${lastPart.name}`, exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Habilitar", exact: true })).toBeEnabled();
  await dialog.getByLabel("Stock inicial", { exact: true }).fill("7");
  transport.state.failInventory = true;
  await dialog.getByRole("textbox", { name: "Buscar SKU o nombre", exact: true }).fill(catalog[999].sku);
  await expect(dialog.getByText("No se pudo cargar el catálogo LiftGo", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Habilitar", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true })).toHaveCount(0);
  transport.state.failInventory = false;
  await dialog.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Habilitar", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true })).toHaveText(`${lastPart.sku} · ${lastPart.name}`);
  await expect(dialog.getByLabel("Stock inicial", { exact: true })).toHaveValue("7");
  await dialog.getByRole("combobox", { name: "SKU LiftGo *", exact: true }).click();
  await expect(page.getByRole("option", { name: `${catalog[999].sku} · ${catalog[999].name}`, exact: true })).toBeVisible();
  expect(transport.writes).toEqual([]);
});

test("un catálogo reducido recupera una página inexistente sin fingir una consulta vacía", async ({ page, transport }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Habilitar refacción", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Habilitar refacción", exact: true });
  await expect(dialog.getByText("Página 1 de 21", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.getByText("Página 2 de 21", { exact: true })).toBeVisible();
  transport.state.catalogSize = 10;
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(dialog.getByText("Página 1 de 1", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Anterior", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Siguiente", exact: true })).toBeDisabled();
  await expect(dialog.getByText("No se pudo cargar el catálogo LiftGo", { exact: true })).toHaveCount(0);
  expect(transport.state.recounts).toBe(1);
  expect(transport.writes).toEqual([]);
});
